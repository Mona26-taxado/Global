import { cycleComplete, findFirstEmptyPlacement, liveNodes } from "@/network/placement";
import { makeReferralCode, newId, readStore, supabaseEnabled, withStore } from "@/lib/store";
import type { Store as StoreShape } from "@/lib/store";
import type { NetworkPositionRow, ReferralRow, UserRow } from "@/types";
import { basePlan } from "@/lib/plan-progress";
import {
  afterActiveSeatCreated,
  confirmDirect2FromIntent,
  confirmReentryFromIntent,
  failPendingIntents,
  findPendingIntent,
  intentPayee,
  pendingPlacementsForPlan,
  quoteDirect2InStore,
  quoteReentryInStore,
} from "@/services/placement-intent";

export { bothLegsFilled, cycleComplete } from "@/network/placement";
export const DIRECT_REFERRAL_LIMIT = 2;
export const DIRECT_REFERRAL_LIMIT_REACHED = "DIRECT_REFERRAL_LIMIT_REACHED";

function nowIso() {
  return new Date().toISOString();
}

export function positionsForPlan(positions: NetworkPositionRow[], planId: string) {
  return positions.filter((p) => p.plan_id === planId);
}

export function activePositions(positions: NetworkPositionRow[], planId?: string) {
  const scoped = planId ? positionsForPlan(positions, planId) : positions;
  return liveNodes(scoped);
}

export function currentPosition(positions: NetworkPositionRow[], userId: string, planId?: string) {
  return (
    positions.find(
      (p) =>
        p.user_id === userId &&
        (planId ? p.plan_id === planId : true) &&
        (p.status ?? "ACTIVE") === "ACTIVE",
    ) ?? null
  );
}

export function reservedPosition(positions: NetworkPositionRow[], userId: string, planId?: string) {
  return (
    positions.find(
      (p) => p.user_id === userId && (planId ? p.plan_id === planId : true) && p.status === "RESERVED",
    ) ?? null
  );
}

/** Current Global seat that occupies a slot (ACTIVE only). */
export function occupyingPosition(positions: NetworkPositionRow[], userId: string, planId?: string) {
  return currentPosition(positions, userId, planId);
}

function resolvePlanId(store: StoreShape, planId?: string) {
  if (planId) return planId;
  return basePlan(store.plans)?.id ?? store.plans[0]?.id ?? "";
}

export function sponsorDirectCount(store: Pick<StoreShape, "referrals">, sponsorId: string, exceptUserId?: string) {
  return store.referrals.filter((r) => r.sponsor_id === sponsorId && r.user_id !== exceptUserId).length;
}

export function assertCanAcceptDirect(store: Pick<StoreShape, "referrals">, sponsorId: string, exceptUserId?: string) {
  if (sponsorDirectCount(store, sponsorId, exceptUserId) >= DIRECT_REFERRAL_LIMIT) {
    throw new Error(DIRECT_REFERRAL_LIMIT_REACHED);
  }
}

export function nextDirectNumber(store: Pick<StoreShape, "referrals">, sponsorId: string): 1 | 2 {
  const n = sponsorDirectCount(store, sponsorId);
  if (n <= 0) return 1;
  if (n === 1) return 2;
  throw new Error(DIRECT_REFERRAL_LIMIT_REACHED);
}

export function buyerDirectNumber(
  referrals: ReferralRow[],
  users: UserRow[],
  buyerId: string,
  sponsorId: string,
): 1 | 2 {
  const row = referrals.find((r) => r.user_id === buyerId && r.sponsor_id === sponsorId);
  if (row?.direct_number === 1 || row?.direct_number === 2) return row.direct_number;
  const siblings = users
    .filter((u) => u.sponsor_id === sponsorId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const idx = siblings.findIndex((u) => u.id === buyerId);
  if (idx === 0) return 1;
  if (idx === 1) return 2;
  throw new Error(DIRECT_REFERRAL_LIMIT_REACHED);
}

export async function createUser(input: {
  display_name?: string;
  email?: string;
  mobile?: string;
  is_demo?: boolean;
  id?: string;
}): Promise<UserRow> {
  return withStore((store) => {
    const existing = store.users.find((u) => u.id === input.id);
    if (existing) return existing;
    let code = makeReferralCode();
    while (store.users.some((u) => u.referral_code === code)) code = makeReferralCode();
    const user: UserRow = {
      id: input.id ?? newId("user"),
      referral_code: code,
      sponsor_id: null,
      is_demo: Boolean(input.is_demo),
      display_name: input.display_name ?? "Member",
      email: input.email,
      mobile: input.mobile,
      created_at: new Date().toISOString(),
    };
    store.users.push(user);
    return user;
  });
}

/** Server-side only. Never accept a sponsor_id from the frontend. */
export function findSponsorByCode(users: UserRow[], code: string, userId: string) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) throw new Error("INVALID_REFERRAL");
  const sponsor = users.find((u) => u.referral_code === normalized);
  if (!sponsor) throw new Error("INVALID_REFERRAL");
  if (sponsor.id === userId) throw new Error("SELF_REFERRAL");
  return sponsor;
}

export async function assignSponsor(userId: string, code: string) {
  return withStore((store) => {
    const user = store.users.find((u) => u.id === userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    if (user.sponsor_id) throw new Error("SPONSOR_LOCKED");
    const sponsor = findSponsorByCode(store.users, code, userId);
    assertCanAcceptDirect(store, sponsor.id, userId);
    const directNumber = nextDirectNumber(store, sponsor.id);
    user.sponsor_id = sponsor.id;
    store.referrals.push({
      id: newId("ref"),
      user_id: userId,
      sponsor_id: sponsor.id,
      referral_code: sponsor.referral_code,
      direct_number: directNumber,
      status: "ACTIVE",
    });
    return { sponsor_id: sponsor.id, direct_number: directNumber };
  });
}

function insertPosition(
  store: StoreShape,
  userId: string,
  extra: Partial<NetworkPositionRow> & {
    status: NetworkPositionRow["status"];
    plan_id: string;
  },
): NetworkPositionRow {
  if (extra.status === "RESERVED") {
    throw new Error("PREPARE_MUST_NOT_INSERT_POSITION");
  }
  if (extra.status === "ACTIVE" && extra.funded_by_user_id) {
    throw new Error("DIRECT2_MUST_NOT_INSERT_ACTIVE");
  }
  const scoped = positionsForPlan(store.network_positions, extra.plan_id);
  const placement = findFirstEmptyPlacement(scoped, userId);
  const started = extra.started_at ?? (extra.status === "ACTIVE" ? nowIso() : null);
  const row: NetworkPositionRow = {
    id: newId("pos"),
    user_id: userId,
    plan_id: extra.plan_id,
    parent_id: placement.parent_id,
    position: placement.position,
    depth: placement.depth,
    cycle: Math.floor(placement.depth / 2),
    status: extra.status,
    started_at: started ?? undefined,
    ended_at: extra.ended_at ?? null,
    from_position_id: extra.from_position_id ?? null,
    recipient_user_id: extra.recipient_user_id ?? null,
    recipient_wallet: extra.recipient_wallet ?? null,
    reentry_tx_hash: extra.reentry_tx_hash ?? null,
    funded_by_user_id: extra.funded_by_user_id ?? null,
  };
  store.network_positions.push(row);
  return row;
}

function insertActivePosition(store: StoreShape, userId: string, planId: string): NetworkPositionRow {
  return insertPosition(store, userId, { status: "ACTIVE", plan_id: planId, started_at: nowIso() });
}

export function qualifyForReentryInStore(
  store: StoreShape,
  userId: string,
  planId?: string,
): NetworkPositionRow | null {
  const plan = resolvePlanId(store, planId ?? currentPosition(store.network_positions, userId)?.plan_id);
  const current = currentPosition(store.network_positions, userId, plan);
  if (!current) return null;
  const scoped = positionsForPlan(store.network_positions, plan);
  if (!cycleComplete(scoped, current.id)) return current;
  try {
    quoteReentryInStore(store, userId, plan);
  } catch {
    /* eligibility still cycleComplete; missing wallet/funded cycle */
  }
  return current;
}

export function activateReservedReentryInStore(store: StoreShape, userId: string, txHash: string, planId?: string) {
  const plan = resolvePlanId(store, planId ?? currentPosition(store.network_positions, userId)?.plan_id);
  const intent = findPendingIntent(store, "GLOBAL_REENTRY", userId, plan);
  if (!intent) return currentPosition(store.network_positions, userId, plan);
  return confirmReentryFromIntent(store, userId, plan, txHash, intentPayee(intent));
}

function maybeReenterAncestors(store: StoreShape, child: NetworkPositionRow) {
  afterActiveSeatCreated(store, child);
}

/** Direct #2 PREPARE: quote only. Never inserts a network_position. */
export function provisionDirect2SponsorInStore(
  store: StoreShape,
  sponsorId: string,
  planId: string,
  buyerId: string,
) {
  return quoteDirect2InStore(store, sponsorId, resolvePlanId(store, planId), buyerId);
}

/** After CONFIRMED Direct #2: atomic first-empty check then ACTIVE. */
export function finalizeConfirmedDirect2InStore(store: StoreShape, buyerId: string, planId: string, txHash: string) {
  const plan = resolvePlanId(store, planId);
  const intent = findPendingIntent(store, "DIRECT2_PLACEMENT", buyerId, plan);
  if (!intent) return;
  confirmDirect2FromIntent(store, buyerId, plan, txHash, intentPayee(intent));
}

/** Failed/cancelled Direct #2: expire intent only. Tree unchanged. Never rewrite CONFIRMED txs. */
export function voidUnpaidDirect2ProvisionInStore(store: StoreShape, buyerId: string, planId?: string) {
  failPendingIntents(store, buyerId, planId, "FAILED");
}

export function assertRegistrationDidNotCreateGlobal(store: StoreShape, userId: string, positionIdsBefore: Set<string>) {
  const added = store.network_positions.filter((p) => p.user_id === userId && !positionIdsBefore.has(p.id));
  if (added.length) {
    throw new Error("REGISTRATION_MUST_NOT_CREATE_GLOBAL");
  }
}

export const UNPAID_ACTIVE_INSERT_BLOCKED = "UNPAID_ACTIVE_INSERT_BLOCKED";

export function placeUserInStore(
  store: StoreShape,
  userId: string,
  planId?: string,
  opts?: { allowUnpaidInsert?: boolean },
): NetworkPositionRow {
  if (!opts?.allowUnpaidInsert) {
    throw new Error(UNPAID_ACTIVE_INSERT_BLOCKED);
  }
  const plan = resolvePlanId(store, planId);
  const existing = currentPosition(store.network_positions, userId, plan);
  if (existing) {
    maybeReenterAncestors(store, existing);
    return existing;
  }
  const row = insertActivePosition(store, userId, plan);
  maybeReenterAncestors(store, row);
  return row;
}

/** Seed/demo/company-root only. Payment paths must not call this without allowUnpaidInsert. */
export async function placeUser(
  userId: string,
  planId?: string,
  opts?: { allowUnpaidInsert?: boolean },
): Promise<NetworkPositionRow> {
  return withStore((store) => placeUserInStore(store, userId, planId, opts));
}

/** Qualify + reserve next Global seat. Does not activate until re-entry payment is verified. */
export async function qualifyForReentry(userId: string, planId?: string): Promise<NetworkPositionRow | null> {
  return withStore((store) => qualifyForReentryInStore(store, userId, planId));
}

export async function activateReservedReentry(userId: string, txHash: string, planId?: string) {
  return withStore((store) => activateReservedReentryInStore(store, userId, txHash, planId));
}

export async function finalizeConfirmedDirect2Placement(buyerId: string, planId: string, txHash: string) {
  return withStore((store) => finalizeConfirmedDirect2InStore(store, buyerId, planId, txHash));
}

export async function voidUnpaidDirect2Provision(buyerId: string, planId?: string) {
  return withStore((store) => voidUnpaidDirect2ProvisionInStore(store, buyerId, planId));
}

/** @deprecated use qualifyForReentry — kept name so existing callers reserve instead of free-moving. */
export async function promoteIfGlobalLegsComplete(userId: string, planId?: string): Promise<NetworkPositionRow | null> {
  return qualifyForReentry(userId, planId);
}

export async function getNetwork(planId?: string) {
  const store = await readStore();
  const plan = resolvePlanId(store, planId);
  const tree = positionsForPlan(store.network_positions, plan)
    .filter((p) => (p.status ?? "ACTIVE") === "ACTIVE")
    .map((p) => ({
      ...p,
      user: store.users.find((u) => u.id === p.user_id),
    }));
  return { tree, pending_placements: pendingPlacementsForPlan(store, plan) };
}

export async function getDownline(userId: string, planId?: string) {
  const store = await readStore();
  const plan = resolvePlanId(store, planId);
  const self = currentPosition(store.network_positions, userId, plan);
  if (!self) return [];
  const live = activePositions(store.network_positions, plan);
  const out: NetworkPositionRow[] = [];
  const walk = (parentId: string) => {
    for (const child of live.filter((p) => p.parent_id === parentId)) {
      out.push(child);
      walk(child.id);
    }
  };
  walk(self.id);
  return out;
}

export function supabaseConfigured() {
  return supabaseEnabled();
}
