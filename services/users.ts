import { bothLegsFilled, cycleComplete, findFirstEmptyPlacement, liveNodes } from "@/network/placement";
import { makeReferralCode, newId, readStore, supabaseEnabled, withStore } from "@/lib/store";
import type { Store as StoreShape } from "@/lib/store";
import type { NetworkPositionRow, ReferralRow, UserRow } from "@/types";
import { basePlan } from "@/lib/plan-progress";

/** Idempotent ACTIVE first-empty seat. Does not create transactions. Skips if ACTIVE or RESERVED already occupies. */
export function ensureActivePlanSeatInStore(store: StoreShape, userId: string, planId: string) {
  const occupying = occupyingPosition(store.network_positions, userId, planId);
  if (occupying) return { row: occupying, created: false };
  const row = insertActivePosition(store, userId, planId);
  maybeReenterAncestors(store, row);
  return { row, created: true };
}

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

/** Current Global seat that occupies a slot (ACTIVE, else unpaid RESERVED snapshot). */
export function occupyingPosition(positions: NetworkPositionRow[], userId: string, planId?: string) {
  return currentPosition(positions, userId, planId) ?? reservedPosition(positions, userId, planId);
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

function parentUserId(store: StoreShape, parentPositionId: string | null) {
  if (!parentPositionId) return null;
  return store.network_positions.find((p) => p.id === parentPositionId)?.user_id ?? null;
}

function verifiedWalletAddress(store: StoreShape, userId: string | null) {
  if (!userId) return null;
  const w = store.wallets.find((x) => x.user_id === userId && x.verified);
  return w?.address?.toLowerCase() ?? null;
}

export function qualifyForReentryInStore(
  store: StoreShape,
  userId: string,
  planId?: string,
  opts?: { occupyingOk?: boolean },
): NetworkPositionRow | null {
  const plan = resolvePlanId(store, planId ?? currentPosition(store.network_positions, userId)?.plan_id);
  const already = reservedPosition(store.network_positions, userId, plan);
  if (already) return already;
  const current = currentPosition(store.network_positions, userId, plan);
  if (!current) return null;
  const scoped = positionsForPlan(store.network_positions, plan);
  const complete = opts?.occupyingOk ? bothLegsFilled(scoped, current.id) : cycleComplete(scoped, current.id);
  if (!complete) return current;
  const reserved = insertPosition(store, userId, {
    status: "RESERVED",
    plan_id: plan,
    from_position_id: current.id,
    reentry_tx_hash: null,
  });
  const recipientUserId = parentUserId(store, reserved.parent_id);
  reserved.recipient_user_id = recipientUserId;
  reserved.recipient_wallet = verifiedWalletAddress(store, recipientUserId);
  return reserved;
}

export function activateReservedReentryInStore(store: StoreShape, userId: string, txHash: string, planId?: string) {
  const plan = resolvePlanId(store, planId ?? reservedPosition(store.network_positions, userId)?.plan_id);
  const reserved = reservedPosition(store.network_positions, userId, plan);
  if (!reserved) return currentPosition(store.network_positions, userId, plan);
  const old =
    store.network_positions.find((p) => p.id === reserved.from_position_id) ??
    currentPosition(store.network_positions, userId, plan);
  if (old && old.id !== reserved.id && (old.status ?? "ACTIVE") === "ACTIVE") {
    old.status = "HISTORY";
    old.ended_at = nowIso();
  }
  reserved.status = "ACTIVE";
  reserved.started_at = reserved.started_at ?? nowIso();
  reserved.ended_at = null;
  reserved.reentry_tx_hash = txHash;
  maybeReenterAncestors(store, reserved);
  return reserved;
}

function maybeReenterAncestors(store: StoreShape, child: NetworkPositionRow, occupyingOk = false) {
  let parentId = child.parent_id;
  while (parentId) {
    const parentPos = store.network_positions.find((p) => p.id === parentId);
    if (!parentPos) return;
    if ((parentPos.status ?? "ACTIVE") === "ACTIVE") {
      const scoped = positionsForPlan(store.network_positions, child.plan_id);
      const complete = occupyingOk ? bothLegsFilled(scoped, parentPos.id) : cycleComplete(scoped, parentPos.id);
      if (complete) {
        qualifyForReentryInStore(store, parentPos.user_id, child.plan_id, occupyingOk ? { occupyingOk: true } : undefined);
      }
    }
    parentId = parentPos.parent_id;
  }
}

function voidReservedSeat(row: NetworkPositionRow) {
  row.status = "HISTORY";
  row.ended_at = nowIso();
}

/** Direct #2 PREPARE: occupy first-empty as RESERVED. Never ACTIVE. */
export function provisionDirect2SponsorInStore(
  store: StoreShape,
  sponsorId: string,
  planId: string,
  buyerId: string,
): NetworkPositionRow {
  const plan = resolvePlanId(store, planId);
  const existingActive = currentPosition(store.network_positions, sponsorId, plan);
  if (existingActive) {
    maybeReenterAncestors(store, existingActive, true);
    return existingActive;
  }
  const existingReserved = reservedPosition(store.network_positions, sponsorId, plan);
  if (existingReserved) {
    if (!existingReserved.funded_by_user_id) existingReserved.funded_by_user_id = buyerId;
    maybeReenterAncestors(store, existingReserved, true);
    return existingReserved;
  }
  const row = insertPosition(store, sponsorId, {
    status: "RESERVED",
    plan_id: plan,
    funded_by_user_id: buyerId,
    reentry_tx_hash: null,
  });
  if ((row.status ?? "ACTIVE") === "ACTIVE") {
    throw new Error("DIRECT2_PREPARE_MUST_NOT_ACTIVATE");
  }
  maybeReenterAncestors(store, row, true);
  return row;
}

/** After CONFIRMED Direct #2 plan transfer: activate sponsor snapshot, then any funded cycle movement. */
export function finalizeConfirmedDirect2InStore(store: StoreShape, buyerId: string, planId: string, txHash: string) {
  const buyer = store.users.find((u) => u.id === buyerId);
  if (!buyer?.sponsor_id) return;
  const plan = resolvePlanId(store, planId);
  const sponsorReserved = reservedPosition(store.network_positions, buyer.sponsor_id, plan);
  if (sponsorReserved && !sponsorReserved.from_position_id) {
    activateReservedReentryInStore(store, buyer.sponsor_id, txHash, plan);
  }
  const movement = store.network_positions.find(
    (p) =>
      p.plan_id === plan &&
      p.status === "RESERVED" &&
      p.funded_by_user_id === buyerId &&
      Boolean(p.from_position_id),
  );
  if (movement) {
    activateReservedReentryInStore(store, movement.user_id, txHash, plan);
  }
}

/** Failed/cancelled Direct #2: drop unpaid RESERVED snapshots. Never rewrite CONFIRMED txs. */
export function voidUnpaidDirect2ProvisionInStore(store: StoreShape, buyerId: string, planId?: string) {
  for (const row of store.network_positions) {
    if (row.status !== "RESERVED") continue;
    if (row.funded_by_user_id !== buyerId) continue;
    if (row.reentry_tx_hash) continue;
    if (planId && row.plan_id !== planId) continue;
    voidReservedSeat(row);
  }
}

export function assertRegistrationDidNotCreateGlobal(store: StoreShape, userId: string, positionIdsBefore: Set<string>) {
  const added = store.network_positions.filter((p) => p.user_id === userId && !positionIdsBefore.has(p.id));
  if (added.length) {
    throw new Error("REGISTRATION_MUST_NOT_CREATE_GLOBAL");
  }
}

export async function placeUser(userId: string, planId?: string): Promise<NetworkPositionRow> {
  return withStore((store) => {
    const plan = resolvePlanId(store, planId);
    const existing = currentPosition(store.network_positions, userId, plan);
    if (existing) {
      maybeReenterAncestors(store, existing);
      return existing;
    }
    const row = insertActivePosition(store, userId, plan);
    maybeReenterAncestors(store, row);
    return row;
  });
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
  return positionsForPlan(store.network_positions, plan)
    .filter((p) => (p.status ?? "ACTIVE") === "ACTIVE" || p.status === "RESERVED")
    .map((p) => ({
      ...p,
      user: store.users.find((u) => u.id === p.user_id),
    }));
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
