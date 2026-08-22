import { isAddress } from "viem";
import { activeChainId, paymentRecipient } from "@/lib/network-config";
import { newId, readStore, withStore } from "@/lib/store";
import { bothLegsFilled, cycleComplete, occupiesSlot } from "@/network/placement";
import {
  buyerDirectNumber,
  currentPosition,
  DIRECT_REFERRAL_LIMIT_REACHED,
  occupyingPosition,
  placeUser,
  positionsForPlan,
  provisionDirect2SponsorInStore,
  qualifyForReentry,
  reservedPosition,
} from "@/services/users";
import { isPlanUnlocked, qualifiesForPlanGlobal, basePlan } from "@/lib/plan-progress";
import type { NetworkPositionRow, ReferralRow } from "@/types";

export class PlanRoutingError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type RecipientRole = "SPONSOR" | "GLOBAL_UPLINE" | "COMPANY_GENESIS" | "GLOBAL_REENTRY";

export type PlanRecipient = {
  recipient: `0x${string}`;
  recipientUserId: string | null;
  recipientRole: RecipientRole;
  slot: 1 | 2 | null;
  directNumber: 1 | 2 | null;
  globalParentUserId: string | null;
  positionId?: string | null;
  notice: string;
};

export function planDirectSlot(occupiedCount: number): 1 | 2 {
  if (occupiedCount <= 0) return 1;
  if (occupiedCount === 1) return 2;
  throw new PlanRoutingError(
    DIRECT_REFERRAL_LIMIT_REACHED,
    "This sponsor already has two direct referrals. A third is not allowed.",
  );
}

export function globalParentUserId(positions: NetworkPositionRow[], sponsorUserId: string, planId?: string): string | null {
  const self = occupyingPosition(positions, sponsorUserId, planId);
  if (!self?.parent_id) return null;
  const parentPos = positions.find((p) => p.id === self.parent_id);
  return parentPos?.user_id ?? null;
}

async function verifiedWallet(userId: string): Promise<`0x${string}` | null> {
  const store = await readStore();
  const w = store.wallets.find((x) => x.user_id === userId && x.verified && isAddress(x.address));
  return w ? (w.address as `0x${string}`) : null;
}

const COMPANY_USER_ID = "user_company";

/**
 * Company sits as Global root so a human Direct #2 always has an existing ID to sit under
 * when the tree is empty. Direct #2 still pays that upline's wallet immediately — this is not escrow.
 */
export async function ensureCompanyRoot(planId: string) {
  const existing = await readStore();
  const inPlan = existing.network_positions.filter((p) => p.plan_id === planId);
  if (inPlan.some((p) => (p.status ?? "ACTIVE") === "ACTIVE")) {
    return currentPosition(existing.network_positions, COMPANY_USER_ID, planId);
  }

  const recipient = paymentRecipient();
  if (!recipient) {
    throw new PlanRoutingError(
      "GLOBAL_UPLINE_NOT_READY",
      "Global upline is not ready. Set PAYMENT_RECIPIENT_ADDRESS so the network root exists, or wait until an existing Global ID can receive.",
    );
  }
  await withStore((store) => {
    if (!store.users.some((u) => u.id === COMPANY_USER_ID)) {
      store.users.push({
        id: COMPANY_USER_ID,
        referral_code: "GXCOMPANY",
        sponsor_id: null,
        is_demo: true,
        display_name: "GLOBAL X Company",
        created_at: new Date().toISOString(),
      });
    }
    if (!store.wallets.some((w) => w.user_id === COMPANY_USER_ID)) {
      store.wallets.push({
        id: newId("wal"),
        user_id: COMPANY_USER_ID,
        address: recipient.toLowerCase(),
        wallet_type: "injected",
        chain_id: activeChainId(),
        verified: true,
        created_at: new Date().toISOString(),
      });
    } else {
      const w = store.wallets.find((x) => x.user_id === COMPANY_USER_ID)!;
      w.address = recipient.toLowerCase();
      w.verified = true;
    }
  });

  const after = await readStore();
  const existingPos = currentPosition(after.network_positions, COMPANY_USER_ID, planId);
  if (existingPos) return existingPos;
  if (after.network_positions.some((p) => p.plan_id === planId && (p.status ?? "ACTIVE") === "ACTIVE")) return null;
  return await placeUser(COMPANY_USER_ID, planId);
}

async function requireVerifiedWallet(userId: string, code: string, message: string): Promise<`0x${string}`> {
  const addr = await verifiedWallet(userId);
  if (!addr) throw new PlanRoutingError(code, message);
  return addr;
}

export async function resolvePlanRecipient(buyerId: string, planId: string): Promise<PlanRecipient> {
  const store = await readStore();
  const buyer = store.users.find((u) => u.id === buyerId);
  if (!buyer) throw new PlanRoutingError("USER_NOT_FOUND", "User not found.");

  if (!buyer.sponsor_id) {
    if (!isPlanUnlocked(store.plans, store.transactions, buyer.id, planId)) {
      throw new PlanRoutingError(
        "PLAN_LOCKED",
        "This plan is locked until the previous plan in the configured order is ACTIVE.",
      );
    }
    const company = paymentRecipient();
    if (!company) throw new PlanRoutingError("RECIPIENT_NOT_CONFIGURED", "PAYMENT_RECIPIENT_ADDRESS is not set.");
    return {
      recipient: company,
      recipientUserId: null,
      recipientRole: "COMPANY_GENESIS",
      slot: null,
      directNumber: null,
      globalParentUserId: null,
      notice:
        "No sponsor. This genesis plan payment goes to the company address. Direct referrals still pay people, not an escrow.",
    };
  }

  const sponsor = store.users.find((u) => u.id === buyer.sponsor_id);
  if (!sponsor) throw new PlanRoutingError("INVALID_REFERRAL", "Sponsor not found.");

  const sponsorHasPlan = store.transactions.some(
    (t) =>
      t.user_id === sponsor.id &&
      t.plan_id === planId &&
      t.payment_type === "PLAN_PURCHASE" &&
      t.status === "CONFIRMED",
  );
  if (!sponsorHasPlan) {
    throw new PlanRoutingError(
      "SPONSOR_PLAN_INACTIVE",
      "Your sponsor must have this plan ACTIVE before you can pay it.",
    );
  }

  if (!isPlanUnlocked(store.plans, store.transactions, buyer.id, planId)) {
    throw new PlanRoutingError(
      "PLAN_LOCKED",
      "This plan is locked until the previous plan in the configured order is ACTIVE.",
    );
  }

  let slot: 1 | 2;
  try {
    slot = buyerDirectNumber(store.referrals, store.users, buyer.id, sponsor.id);
  } catch {
    throw new PlanRoutingError(
      DIRECT_REFERRAL_LIMIT_REACHED,
      "This sponsor already has two direct referrals. A third is not allowed.",
    );
  }

  if (slot === 1) {
    const recipient = await requireVerifiedWallet(
      sponsor.id,
      "SPONSOR_WALLET_UNVERIFIED",
      "Sponsor wallet is not verified. Pay cannot start. Funds are not sent to the company as a substitute.",
    );
    return {
      recipient,
      recipientUserId: sponsor.id,
      recipientRole: "SPONSOR",
      slot: 1,
      directNumber: 1,
      globalParentUserId: null,
      notice: "Direct #1: this USDT transfer goes to your sponsor’s verified wallet. You confirm it in your wallet. Direct #1 does not place anyone in Global.",
    };
  }

  await ensureCompanyRoot(planId);
  const isBase = basePlan(store.plans)?.id === planId;
  if (!isBase && !qualifiesForPlanGlobal(store, sponsor.id, planId, buyer.id)) {
    throw new PlanRoutingError(
      "WAITING_FOR_DIRECT_UPGRADES",
      "Your sponsor is waiting for both existing directs to activate this plan before Global placement in this plan tree.",
    );
  }
  const placed = await withStore((store) => provisionDirect2SponsorInStore(store, sponsor.id, planId, buyerId));
  const afterPlace = await readStore();
  const reservedForThisEvent = movementReservedByPlacement(
    afterPlace.network_positions,
    afterPlace.referrals,
    placed,
    buyer.id,
  );

  if (reservedForThisEvent) {
    const bound = await snapshotReservedRecipient(reservedForThisEvent.id, buyer.id);
    return {
      recipient: bound.recipientWallet,
      recipientUserId: bound.recipientUserId,
      recipientRole: "GLOBAL_UPLINE",
      slot: 2,
      directNumber: 2,
      globalParentUserId: bound.recipientUserId,
      positionId: reservedForThisEvent.id,
      notice:
        "Direct #2: Global movement is reserved until this transfer is verified. This plan payment goes to the reserved seat’s new Global upline. The sponsor seat stays RESERVED until confirmation.",
    };
  }

  const parentId = globalParentUserId(afterPlace.network_positions, sponsor.id, planId);
  if (!placed.parent_id || !parentId) {
    throw new PlanRoutingError(
      "GLOBAL_UPLINE_NOT_READY",
      "Waiting for Global placement. Direct #2 cannot pay until your sponsor has a Global upline. Nothing is held in escrow.",
    );
  }
  const recipient = await requireVerifiedWallet(
    parentId,
    "GLOBAL_UPLINE_WALLET_UNVERIFIED",
    "Global upline wallet is not verified. Pay is blocked. Funds are not held by GLOBAL X.",
  );
  return {
    recipient,
    recipientUserId: parentId,
    recipientRole: "GLOBAL_UPLINE",
    slot: 2,
    directNumber: 2,
    globalParentUserId: parentId,
    positionId: placed.id,
    notice:
      "Direct #2: your sponsor’s Global seat is reserved until this transfer is verified. This payment goes to their Global upline wallet, not to the sponsor.",
  };
}

/** Child that filled the parent's second live seat (LEFT then RIGHT; later started_at wins on a tie). */
export function completingChildOf(
  positions: NetworkPositionRow[],
  parentPositionId: string,
): NetworkPositionRow | null {
  const kids = positions.filter((p) => p.parent_id === parentPositionId && occupiesSlot(p));
  if (kids.length < 2) return null;
  const ordered = [...kids].sort((a, b) => {
    const ta = a.started_at || "\uffff";
    const tb = b.started_at || "\uffff";
    const t = ta.localeCompare(tb);
    if (t !== 0) return t;
    return (a.position === "LEFT" ? 0 : 1) - (b.position === "LEFT" ? 0 : 1);
  });
  return ordered[ordered.length - 1] ?? null;
}

/**
 * Reserved seat for the cycle this Direct #2 placement completed.
 * Retry of the same buyer keeps that reserved parent; another buyer cannot take it.
 */
export function movementReservedByPlacement(
  positions: NetworkPositionRow[],
  referrals: ReferralRow[],
  placed: NetworkPositionRow,
  buyerId: string,
): NetworkPositionRow | null {
  if (!placed.parent_id) return null;
  const parentPos = positions.find((p) => p.id === placed.parent_id);
  if (!parentPos) return null;
  if (!bothLegsFilled(positionsForPlan(positions, placed.plan_id), parentPos.id)) return null;
  const reserved = reservedPosition(positions, parentPos.user_id, placed.plan_id);
  if (!reserved || reserved.status !== "RESERVED" || reserved.reentry_tx_hash) return null;
  if (reserved.from_position_id && reserved.from_position_id !== parentPos.id) return null;
  if (reserved.funded_by_user_id && reserved.funded_by_user_id !== buyerId) return null;
  if (reserved.funded_by_user_id === buyerId) return reserved;
  const completing = completingChildOf(positions, parentPos.id);
  if (!completing || completing.id !== placed.id) return null;
  const d2 = referrals.find((r) => r.sponsor_id === placed.user_id && r.direct_number === 2);
  if (d2?.user_id !== buyerId) return null;
  return reserved;
}

export function unpaidDirect2Funder(
  store: {
    network_positions: NetworkPositionRow[];
    referrals: ReferralRow[];
    transactions: { user_id: string; plan_id: string | null; payment_type: string; status: string }[];
  },
  reserved: NetworkPositionRow,
): string | null {
  const from = store.network_positions.find((p) => p.id === reserved.from_position_id);
  if (!from) return null;
  const completing = completingChildOf(store.network_positions, from.id);
  if (!completing) return null;
  const d2 = store.referrals.find((r) => r.sponsor_id === completing.user_id && r.direct_number === 2);
  if (!d2) return null;
  const paid = store.transactions.some(
    (t) =>
      t.user_id === d2.user_id &&
      t.plan_id === reserved.plan_id &&
      t.payment_type === "PLAN_PURCHASE" &&
      t.status === "CONFIRMED",
  );
  return paid ? null : d2.user_id;
}

async function snapshotReservedRecipient(reservedId: string, buyerId: string) {
  return withStore((s) => {
    const row = s.network_positions.find((p) => p.id === reservedId);
    if (!row || row.status !== "RESERVED") {
      throw new PlanRoutingError("GLOBAL_UPLINE_NOT_READY", "Reserved Global seat is not ready.");
    }
    if (row.funded_by_user_id && row.funded_by_user_id !== buyerId) {
      throw new PlanRoutingError(
        "REENTRY_RECIPIENT_MISMATCH",
        "This movement is already reserved for another Direct #2 payment.",
      );
    }
    const bound = reentryRecipientFromReserved(s, row);
    row.funded_by_user_id = buyerId;
    row.recipient_user_id = bound.recipientUserId;
    row.recipient_wallet = bound.recipientWallet;
    return bound;
  });
}

export function currentQualifyingPlan(store: { transactions: { user_id: string; payment_type: string; status: string; plan_id: string | null; plan_code: string; created_at: string }[]; plans: { id: string; code: string; amount_usd: number; active?: boolean; enabled?: boolean }[] }, userId: string) {
  const confirmed = store.transactions.filter(
    (t) => t.user_id === userId && t.payment_type === "PLAN_PURCHASE" && t.status === "CONFIRMED",
  );
  let best: (typeof confirmed)[0] | undefined;
  let bestAmount = -1;
  for (const tx of confirmed) {
    const plan = store.plans.find((p) => p.id === tx.plan_id || p.code === tx.plan_code);
    const amount = plan?.amount_usd ?? 0;
    if (amount > bestAmount || (amount === bestAmount && best && tx.created_at > best.created_at)) {
      bestAmount = amount;
      best = tx;
    }
  }
  if (!best) return null;
  return store.plans.find((p) => p.id === best.plan_id || p.code === best.plan_code) ?? null;
}

/** GLOBAL_REENTRY recipient is always the verified wallet of reserved.parent_id. Never payer, treasury, or registration recipient. */
export function reentryRecipientFromReserved(
  store: {
    network_positions: NetworkPositionRow[];
    wallets: { user_id: string; address: string; verified: boolean }[];
  },
  reserved: NetworkPositionRow,
): { recipientUserId: string; recipientWallet: `0x${string}` } {
  if (!reserved.parent_id) {
    throw new PlanRoutingError(
      "GLOBAL_UPLINE_NOT_READY",
      "Re-entry is reserved but the new Global parent is not ready. Pay is blocked. Funds are not held by GLOBAL X.",
    );
  }
  const parentPos = store.network_positions.find((p) => p.id === reserved.parent_id);
  if (!parentPos) {
    throw new PlanRoutingError(
      "GLOBAL_UPLINE_NOT_READY",
      "Re-entry is reserved but the new Global parent is not ready. Pay is blocked. Funds are not held by GLOBAL X.",
    );
  }
  if (parentPos.user_id === reserved.user_id) {
    throw new PlanRoutingError(
      "REENTRY_SELF_PAY",
      "Re-entry cannot pay the moving member. Recipient must be the new Global parent’s verified wallet.",
    );
  }
  const parentWallet = store.wallets.find((w) => w.user_id === parentPos.user_id && w.verified && isAddress(w.address));
  if (!parentWallet) {
    throw new PlanRoutingError(
      "GLOBAL_UPLINE_WALLET_UNVERIFIED",
      "New Global upline wallet is not verified. Re-entry pay is blocked. Funds are not sent to the company as a substitute.",
    );
  }
  const wallet = parentWallet.address.toLowerCase() as `0x${string}`;
  if (reserved.recipient_user_id && reserved.recipient_user_id !== parentPos.user_id) {
    throw new PlanRoutingError(
      "REENTRY_RECIPIENT_MISMATCH",
      "Reserved recipient does not match the new Global parent. Payment is blocked.",
    );
  }
  if (reserved.recipient_wallet && reserved.recipient_wallet.toLowerCase() !== wallet) {
    throw new PlanRoutingError(
      "REENTRY_RECIPIENT_MISMATCH",
      "Reserved recipient does not match the new Global parent. Payment is blocked.",
    );
  }
  return { recipientUserId: parentPos.user_id, recipientWallet: wallet };
}

export async function resolveReentryPayment(userId: string, planId?: string): Promise<PlanRecipient & { planId: string; planCode: string; amountUsd: number }> {
  const store0 = await readStore();
  const inferred = planId ?? reservedPosition(store0.network_positions, userId)?.plan_id ?? currentPosition(store0.network_positions, userId)?.plan_id;
  let reserved = reservedPosition(store0.network_positions, userId, inferred);
  if (!reserved) {
    const current = inferred ? currentPosition(store0.network_positions, userId, inferred) : currentPosition(store0.network_positions, userId);
    const planForCycle = inferred ?? current?.plan_id;
    const complete =
      Boolean(current && planForCycle && cycleComplete(positionsForPlan(store0.network_positions, planForCycle), current.id));
    if (!complete) {
      throw new PlanRoutingError(
        "REENTRY_NOT_REQUIRED",
        current
          ? "This member has not completed both Global legs, so re-entry payment is not required."
          : "Global re-entry is not available.",
      );
    }
    await qualifyForReentry(userId, inferred);
    reserved = reservedPosition((await readStore()).network_positions, userId, inferred);
  }
  const store = await readStore();
  reserved = reservedPosition(store.network_positions, userId, inferred ?? reserved?.plan_id);
  if (!reserved || reserved.status !== "RESERVED") {
    throw new PlanRoutingError(
      "REENTRY_NOT_REQUIRED",
      "This member has not completed both Global legs, so re-entry payment is not required.",
    );
  }
  if (reserved.funded_by_user_id || unpaidDirect2Funder(store, reserved)) {
    throw new PlanRoutingError(
      "REENTRY_FUNDED_BY_DIRECT2",
      "This cycle is funded by the Direct #2 plan payment that completed it. A separate re-entry payment is not required.",
    );
  }
  const bound = reentryRecipientFromReserved(store, reserved);
  if (!reserved.recipient_user_id || !reserved.recipient_wallet) {
    await withStore((s) => {
      const row = reservedPosition(s.network_positions, userId, reserved!.plan_id);
      if (!row) return;
      if (!row.recipient_user_id) row.recipient_user_id = bound.recipientUserId;
      if (!row.recipient_wallet) row.recipient_wallet = bound.recipientWallet;
    });
  }
  const plan = store.plans.find((p) => p.id === reserved.plan_id);
  if (!plan) {
    throw new PlanRoutingError("NO_QUALIFYING_PLAN", "Re-entry requires the plan of this Global position. Amount is not assumed.");
  }
  return {
    recipient: bound.recipientWallet,
    recipientUserId: bound.recipientUserId,
    recipientRole: "GLOBAL_REENTRY",
    slot: null,
    directNumber: null,
    globalParentUserId: bound.recipientUserId,
    positionId: reserved.id,
    planId: plan.id,
    planCode: plan.code,
    amountUsd: plan.amount_usd,
    notice:
      "Global re-entry: this transfer is your plan amount to the new Global upline. The new seat activates only after blockchain verification.",
  };
}
