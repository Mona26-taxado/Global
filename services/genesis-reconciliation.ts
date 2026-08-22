import { genesisReferralCode, genesisWalletAddress } from "@/lib/network-config";
import { newId } from "@/lib/store";
import type { Store } from "@/lib/store";
import { cycleComplete, findFirstEmptyPlacement, isActiveNode, isForestRoot, placementRoots } from "@/network/placement";
import { occupyingPosition, positionsForPlan } from "@/services/users";
import type { NetworkPositionRow, PaymentIntentRow, TransactionRow, UserRow } from "@/types";

export const ADMIN_GENESIS_RECONCILIATION = "ADMIN_GENESIS_RECONCILIATION";

export type FirstEmptyReport = {
  parent_id: string | null;
  parent_user_id: string | null;
  position: "LEFT" | "RIGHT" | null;
  depth: number;
};

export type GenesisPlanReport = {
  plan_id: string;
  genesis_user_id: string | null;
  genesis_code: string | null;
  root_user_id: string | null;
  root_user_code: string | null;
  root_position_id: string | null;
  root_active: boolean;
  left_active: { id: string; user_id: string } | null;
  right_active: { id: string; user_id: string } | null;
  cycle_complete: boolean;
  current_legal_first_empty: FirstEmptyReport | null;
  valid_global_reentry_exists: boolean;
  already_reconciled: boolean;
  safe_for_genesis_reconciliation: boolean;
  reasons: string[];
};

function nowIso() {
  return new Date().toISOString();
}

function codeOf(store: Store, userId: string | null) {
  if (!userId) return null;
  return store.users.find((u) => u.id === userId)?.referral_code ?? null;
}

function walletOf(store: Store, userId: string) {
  return (
    store.wallets.find((w) => w.user_id === userId && w.verified)?.address ??
    store.wallets.find((w) => w.user_id === userId)?.address ??
    null
  );
}

/** Configured genesis/admin root only. Referral code + wallet must both match. */
export function resolveGenesisUser(store: Pick<Store, "users" | "wallets">): UserRow | null {
  const code = genesisReferralCode().toUpperCase();
  const wallet = genesisWalletAddress();
  const users = store.users.filter((u) => u.referral_code.toUpperCase() === code);
  for (const user of users) {
    const addr = walletOf(store as Store, user.id)?.toLowerCase();
    if (addr === wallet) return user;
  }
  return null;
}

function activeChild(
  scoped: NetworkPositionRow[],
  parentId: string,
  side: "LEFT" | "RIGHT",
): NetworkPositionRow | undefined {
  return scoped.find((n) => n.parent_id === parentId && n.position === side && isActiveNode(n));
}

function confirmedReentryForCycle(
  store: Pick<Store, "transactions" | "payment_intents">,
  genesisUserId: string,
  planId: string,
  fromPositionId: string,
) {
  const intentHit = (store.payment_intents ?? []).some(
    (i: PaymentIntentRow) =>
      i.kind === "GLOBAL_REENTRY" &&
      i.status === "CONFIRMED" &&
      i.plan_id === planId &&
      i.mover_user_id === genesisUserId &&
      i.movement_from_position_id === fromPositionId,
  );
  const txHit = (store.transactions ?? []).some(
    (t: TransactionRow) =>
      t.payment_type === "GLOBAL_REENTRY" &&
      t.status === "CONFIRMED" &&
      t.plan_id === planId &&
      t.user_id === genesisUserId,
  );
  return intentHit || txHit;
}

export function inspectGenesisReconciliation(store: Store, planId: string): GenesisPlanReport {
  const genesis = resolveGenesisUser(store);
  const scoped = positionsForPlan(store.network_positions, planId);
  const ids = new Set(scoped.map((n) => n.id));
  const forestRoot = placementRoots(scoped)[0] ?? null;
  const occupying = genesis ? occupyingPosition(store.network_positions, genesis.id, planId) : null;
  const rootActive = Boolean(forestRoot && occupying && occupying.id === forestRoot.id && isActiveNode(forestRoot));
  const left = forestRoot ? activeChild(scoped, forestRoot.id, "LEFT") : undefined;
  const right = forestRoot ? activeChild(scoped, forestRoot.id, "RIGHT") : undefined;
  const cycle = forestRoot ? cycleComplete(scoped, forestRoot.id) : false;
  const hole =
    occupying && scoped.some(isActiveNode)
      ? findFirstEmptyPlacement(scoped, occupying.user_id)
      : occupying && scoped.length === 0
        ? findFirstEmptyPlacement(scoped, occupying.user_id)
        : forestRoot && genesis
          ? findFirstEmptyPlacement(scoped, genesis.id)
          : null;
  const targetOccupied =
    hole?.parent_id && hole.position
      ? Boolean(activeChild(scoped, hole.parent_id, hole.position))
      : false;
  const already =
    Boolean(genesis && occupying && forestRoot && occupying.id !== forestRoot.id && occupying.from_position_id);
  const fromId = occupying?.id ?? forestRoot?.id ?? "";
  const reentry =
    Boolean(genesis && fromId) && confirmedReentryForCycle(store, genesis!.id, planId, fromId);

  const reasons: string[] = [];
  if (!genesis) reasons.push("GENESIS_USER_NOT_CONFIGURED");
  if (!forestRoot) reasons.push("NO_PLAN_ROOT");
  if (genesis && forestRoot && forestRoot.user_id !== genesis.id) reasons.push("ROOT_USER_NOT_GENESIS");
  if (!rootActive) reasons.push("ROOT_NOT_ACTIVE");
  if (!left) reasons.push("LEFT_NOT_ACTIVE");
  if (!right) reasons.push("RIGHT_NOT_ACTIVE");
  if (!cycle) reasons.push("CYCLE_INCOMPLETE");
  if (!hole || !hole.parent_id || !hole.position) reasons.push("NO_LEGAL_FIRST_EMPTY");
  if (targetOccupied) reasons.push("TARGET_SLOT_OCCUPIED");
  if (reentry) reasons.push("CONFIRMED_GLOBAL_REENTRY_EXISTS");
  if (already) reasons.push("ALREADY_RECONCILED");

  const genesisIsCurrentRoot = Boolean(genesis && occupying && forestRoot && occupying.id === forestRoot.id);
  const safe =
    !already &&
    Boolean(genesis) &&
    genesisIsCurrentRoot &&
    rootActive &&
    Boolean(left && right && cycle) &&
    Boolean(hole?.parent_id && hole.position) &&
    !targetOccupied &&
    !reentry;

  return {
    plan_id: planId,
    genesis_user_id: genesis?.id ?? null,
    genesis_code: genesis?.referral_code ?? null,
    root_user_id: forestRoot?.user_id ?? null,
    root_user_code: codeOf(store, forestRoot?.user_id ?? null),
    root_position_id: forestRoot?.id ?? null,
    root_active: rootActive,
    left_active: left ? { id: left.id, user_id: left.user_id } : null,
    right_active: right ? { id: right.id, user_id: right.user_id } : null,
    cycle_complete: cycle,
    current_legal_first_empty: hole
      ? {
          parent_id: hole.parent_id,
          parent_user_id: hole.parent_id ? scoped.find((p) => p.id === hole.parent_id)?.user_id ?? null : null,
          position: hole.position,
          depth: hole.depth,
        }
      : null,
    valid_global_reentry_exists: reentry,
    already_reconciled: already,
    safe_for_genesis_reconciliation: safe,
    reasons: safe ? [] : reasons,
  };
}

export function inspectGenesisAllPlans(store: Store): GenesisPlanReport[] {
  const ids = [...new Set(store.plans.map((p) => p.id))];
  return ids.map((planId) => inspectGenesisReconciliation(store, planId));
}

/**
 * Explicit admin/genesis ROOT move. Does not create a payment, intent, or tx.
 * Does not queue other members. Idempotent: already moved → 0 new seats.
 * Pass the dry-run hole so a changed first-empty stops instead of silent re-place.
 */
export function applyGenesisReconciliation(
  store: Store,
  planId: string,
  expectedHole?: Pick<FirstEmptyReport, "parent_id" | "position">,
): NetworkPositionRow | null {
  const before = inspectGenesisReconciliation(store, planId);
  if (before.already_reconciled) return occupyingPosition(store.network_positions, before.genesis_user_id ?? "", planId);
  if (!before.safe_for_genesis_reconciliation) {
    throw new Error(`GENESIS_RECONCILE_BLOCKED:${planId}:${before.reasons.join(",")}`);
  }
  const genesisId = before.genesis_user_id!;
  const scoped = positionsForPlan(store.network_positions, planId);
  const hole = findFirstEmptyPlacement(scoped, genesisId);
  if (
    hole.parent_id !== before.current_legal_first_empty?.parent_id ||
    hole.position !== before.current_legal_first_empty?.position
  ) {
    throw new Error(`GENESIS_RECONCILE_STALE_HOLE:${planId}`);
  }
  if (
    expectedHole &&
    (hole.parent_id !== expectedHole.parent_id || hole.position !== expectedHole.position)
  ) {
    throw new Error(`GENESIS_RECONCILE_STALE_HOLE:${planId}`);
  }
  const old = store.network_positions.find((p) => p.id === before.root_position_id);
  if (!old || !isActiveNode(old) || !isForestRoot(old, new Set(scoped.map((n) => n.id)))) {
    throw new Error(`GENESIS_RECONCILE_ROOT_CHANGED:${planId}`);
  }
  const parent = store.network_positions.find((p) => p.id === hole.parent_id);
  if (!parent || parent.plan_id !== planId || !isActiveNode(parent)) {
    throw new Error(`GENESIS_RECONCILE_PARENT_CHANGED:${planId}`);
  }
  const ended = nowIso();
  old.status = "HISTORY";
  old.ended_at = ended;
  const row: NetworkPositionRow = {
    id: newId("pos"),
    user_id: genesisId,
    plan_id: planId,
    parent_id: hole.parent_id,
    position: hole.position,
    depth: hole.depth,
    cycle: Math.floor(hole.depth / 2),
    status: "ACTIVE",
    started_at: ended,
    ended_at: null,
    from_position_id: old.id,
    recipient_user_id: parent.user_id,
    recipient_wallet: walletOf(store, parent.user_id),
    reentry_tx_hash: null,
    funded_by_user_id: null,
    source: ADMIN_GENESIS_RECONCILIATION,
  };
  store.network_positions.push(row);
  return row;
}
