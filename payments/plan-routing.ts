import { isAddress } from "viem";
import { activeChainId, paymentRecipient } from "@/lib/network-config";
import { newId, readStore, withStore } from "@/lib/store";
import { buyerDirectNumber, currentPosition, DIRECT_REFERRAL_LIMIT_REACHED, placeUser, qualifyForReentry, reservedPosition } from "@/services/users";
import type { NetworkPositionRow } from "@/types";

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

export function globalParentUserId(positions: NetworkPositionRow[], sponsorUserId: string): string | null {
  const self = currentPosition(positions, sponsorUserId);
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
export async function ensureCompanyRoot() {
  const existing = await readStore();
  if (existing.network_positions.some((p) => (p.status ?? "ACTIVE") === "ACTIVE")) {
    return currentPosition(existing.network_positions, COMPANY_USER_ID);
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
  const existingPos = currentPosition(after.network_positions, COMPANY_USER_ID);
  if (existingPos) return existingPos;
  if (after.network_positions.some((p) => (p.status ?? "ACTIVE") === "ACTIVE")) return null;
  return await placeUser(COMPANY_USER_ID);
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
      notice: "Direct #1: this USDT transfer goes to your sponsor’s verified wallet. You confirm it in your wallet.",
    };
  }

  await ensureCompanyRoot();
  const placed = await placeUser(sponsor.id);
  const parentId = globalParentUserId((await readStore()).network_positions, sponsor.id);
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
    notice:
      "Direct #2: your sponsor is placed in Global first. This transfer goes to their Global upline wallet, not to the sponsor.",
  };
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

export async function resolveReentryPayment(userId: string): Promise<PlanRecipient & { planId: string; planCode: string; amountUsd: number }> {
  const qualified = await qualifyForReentry(userId);
  const store = await readStore();
  const reserved = reservedPosition(store.network_positions, userId);
  if (!reserved || reserved.status !== "RESERVED") {
    throw new PlanRoutingError(
      "REENTRY_NOT_REQUIRED",
      qualified?.status === "ACTIVE"
        ? "This member has not completed both Global legs, so re-entry payment is not required."
        : "Global re-entry is not available.",
    );
  }
  if (!reserved.parent_id || !reserved.recipient_user_id) {
    throw new PlanRoutingError(
      "GLOBAL_UPLINE_NOT_READY",
      "Re-entry is reserved but the new Global parent is not ready. Pay is blocked. Funds are not held by GLOBAL X.",
    );
  }
  let wallet = reserved.recipient_wallet;
  if (!wallet) {
    wallet = await requireVerifiedWallet(
      reserved.recipient_user_id,
      "GLOBAL_UPLINE_WALLET_UNVERIFIED",
      "New Global upline wallet is not verified. Re-entry pay is blocked. Funds are not sent to the company as a substitute.",
    );
    await withStore((s) => {
      const row = reservedPosition(s.network_positions, userId);
      if (row && !row.recipient_wallet) row.recipient_wallet = wallet;
    });
  }
  const plan = currentQualifyingPlan(store, userId);
  if (!plan) {
    throw new PlanRoutingError("NO_QUALIFYING_PLAN", "Re-entry requires an active qualifying plan. Amount is not assumed.");
  }
  return {
    recipient: wallet as `0x${string}`,
    recipientUserId: reserved.recipient_user_id,
    recipientRole: "GLOBAL_REENTRY",
    slot: null,
    directNumber: null,
    globalParentUserId: reserved.recipient_user_id,
    positionId: reserved.id,
    planId: plan.id,
    planCode: plan.code,
    amountUsd: plan.amount_usd,
    notice:
      "Global re-entry: this transfer is your plan amount to the new Global upline. The new seat activates only after blockchain verification.",
  };
}
