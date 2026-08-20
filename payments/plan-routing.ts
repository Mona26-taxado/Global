import { isAddress } from "viem";
import { activeChainId, paymentRecipient } from "@/lib/network-config";
import { newId, readStore, withStore } from "@/lib/store";
import { placeUser } from "@/services/users";
import type { NetworkPositionRow } from "@/types";

export class PlanRoutingError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type RecipientRole = "SPONSOR" | "GLOBAL_UPLINE" | "COMPANY_GENESIS";

export type PlanRecipient = {
  recipient: `0x${string}`;
  recipientUserId: string | null;
  recipientRole: RecipientRole;
  slot: 1 | 2 | null;
  notice: string;
};

export function planDirectSlot(occupiedCount: number): 1 | 2 {
  if (occupiedCount <= 0) return 1;
  if (occupiedCount === 1) return 2;
  throw new PlanRoutingError(
    "PLAN_DIRECTS_FULL",
    "This sponsor already has two directs on this plan. A third payment is not allowed.",
  );
}

export function globalParentUserId(positions: NetworkPositionRow[], sponsorUserId: string): string | null {
  const self = positions.find((p) => p.user_id === sponsorUserId);
  if (!self?.parent_id) return null;
  return positions.find((p) => p.id === self.parent_id)?.user_id ?? null;
}

async function verifiedWallet(userId: string): Promise<`0x${string}` | null> {
  const store = await readStore();
  const w = store.wallets.find((x) => x.user_id === userId && x.verified && isAddress(x.address));
  return w ? (w.address as `0x${string}`) : null;
}

async function occupiedDirects(sponsorId: string, planId: string, buyerId: string) {
  const store = await readStore();
  const siblingIds = store.users.filter((u) => u.sponsor_id === sponsorId && u.id !== buyerId).map((u) => u.id);
  return store.transactions.filter(
    (t) =>
      t.payment_type === "PLAN_PURCHASE" &&
      t.plan_id === planId &&
      siblingIds.includes(t.user_id) &&
      (t.status === "CONFIRMED" || t.status === "PENDING"),
  ).length;
}

const COMPANY_USER_ID = "user_company";

/**
 * Company sits as Global root so a human Direct #2 always has an existing ID to sit under.
 * Direct #2 still pays that upline's wallet immediately — this is not escrow.
 * Pay is rejected if that upline wallet cannot be resolved.
 */
export async function ensureCompanyRoot() {
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
  const existingPos = after.network_positions.find((p) => p.user_id === COMPANY_USER_ID);
  if (existingPos) return existingPos;
  if (after.network_positions.length > 0) return null;
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

  const slot = planDirectSlot(await occupiedDirects(sponsor.id, planId, buyerId));

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
    notice:
      "Direct #2: your sponsor is placed in Global first. This transfer goes to their Global upline wallet, not to the sponsor.",
  };
}
