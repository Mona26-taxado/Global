import { isAddress } from "viem";
import { activeChainId, paymentRecipient } from "@/lib/network-config";
import { newId, readStore, withStore } from "@/lib/store";
import { occupiesSlot } from "@/network/placement";
import {
  buyerDirectNumber,
  currentPosition,
  DIRECT_REFERRAL_LIMIT_REACHED,
  occupyingPosition,
  placeUser,
} from "@/services/users";
import {
  intentPayee,
  PlacementError,
  quoteDirect2InStore,
  quoteReentryInStore,
} from "@/services/placement-intent";
import { isPlanUnlocked, qualifiesForPlanGlobal } from "@/lib/plan-progress";
import type { NetworkPositionRow, PaymentIntentRow } from "@/types";

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
  intentId?: string | null;
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
  if (!qualifiesForPlanGlobal(store, sponsor.id, planId, buyer.id)) {
    throw new PlanRoutingError(
      "WAITING_FOR_DIRECT_UPGRADES",
      "Your sponsor is waiting for both existing directs to activate this plan before Global placement in this plan tree.",
    );
  }
  const placedCountBefore = (await readStore()).network_positions.length;
  let intent: PaymentIntentRow;
  try {
    intent = await withStore((s) => quoteDirect2InStore(s, sponsor.id, planId, buyer.id));
  } catch (error) {
    if (error instanceof PlacementError) throw new PlanRoutingError(error.code, error.message);
    throw error;
  }
  const after = await readStore();
  if (after.network_positions.length !== placedCountBefore) {
    throw new PlanRoutingError("PREPARE_MUTATED_TREE", "Direct #2 prepare must not create Global positions.");
  }
  const payeeUserId = intent.movement_recipient_user_id ?? intent.candidate_recipient_user_id;
  return {
    recipient: intentPayee(intent),
    recipientUserId: payeeUserId,
    recipientRole: "GLOBAL_UPLINE",
    slot: 2,
    directNumber: 2,
    globalParentUserId: payeeUserId,
    positionId: null,
    intentId: intent.id,
    notice: intent.movement_user_id
      ? "Direct #2: this quote pays the cycle-movement Global upline. Seats activate only after blockchain verification. The quoted hole is not held."
      : "Direct #2: this quote pays your sponsor’s Global upline. The sponsor seat is not held until this transfer is verified.",
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

export async function resolveReentryPayment(userId: string, planId?: string): Promise<PlanRecipient & { planId: string; planCode: string; amountUsd: number }> {
  const store0 = await readStore();
  const inferred = planId ?? currentPosition(store0.network_positions, userId)?.plan_id;
  const current = inferred
    ? currentPosition(store0.network_positions, userId, inferred)
    : currentPosition(store0.network_positions, userId);
  const planForCycle = inferred ?? current?.plan_id;
  if (!current || !planForCycle) {
    throw new PlanRoutingError("REENTRY_NOT_REQUIRED", "Global re-entry is not available.");
  }
  const posCount = store0.network_positions.length;
  let intent;
  try {
    intent = await withStore((s) => quoteReentryInStore(s, userId, planForCycle));
  } catch (error) {
    if (error instanceof PlacementError) throw new PlanRoutingError(error.code, error.message);
    throw error;
  }
  const after = await readStore();
  if (after.network_positions.length !== posCount) {
    throw new PlanRoutingError("PREPARE_MUTATED_TREE", "Re-entry prepare must not create Global positions.");
  }
  const plan = after.plans.find((p) => p.id === intent.plan_id);
  if (!plan) {
    throw new PlanRoutingError("NO_QUALIFYING_PLAN", "Re-entry requires the plan of this Global position. Amount is not assumed.");
  }
  return {
    recipient: intentPayee(intent),
    recipientUserId: intent.candidate_recipient_user_id,
    recipientRole: "GLOBAL_REENTRY",
    slot: null,
    directNumber: null,
    globalParentUserId: intent.candidate_recipient_user_id,
    positionId: null,
    intentId: intent.id,
    planId: plan.id,
    planCode: plan.code,
    amountUsd: plan.amount_usd,
    notice:
      "Global re-entry: this transfer is your plan amount to the new Global upline. The new seat activates only after blockchain verification. The quoted hole is not held.",
  };
}
