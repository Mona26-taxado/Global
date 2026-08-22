/**
 * Finalize an already-funded cycle at the CURRENT shared first-empty.
 * No new payment. No fake GLOBAL_REENTRY tx. Same engine for every plan_id.
 */
import { newId } from "@/lib/store";
import type { Store } from "@/lib/store";
import { cycleComplete, findFirstEmptyPlacement, isActiveNode } from "@/network/placement";
import { afterActiveSeatCreated, cycleAlreadyFunded, firstEmptyQuote } from "@/services/placement-intent";
import { occupyingPosition, positionsForPlan } from "@/services/users";
import type { NetworkPositionRow, TransactionRow } from "@/types";

export const LEGACY_FUNDED_MOVEMENT_RECONCILIATION = "LEGACY_FUNDED_MOVEMENT_RECONCILIATION";

export type LegacyFundedReport = {
  plan_id: string;
  from_position_id: string;
  mover_user_id: string | null;
  source_active: boolean;
  cycle_complete: boolean;
  already_funded: boolean;
  funding_tx_hash: string | null;
  funded_by_user_id: string | null;
  current_legal_first_empty: {
    parent_id: string | null;
    parent_user_id: string | null;
    position: "LEFT" | "RIGHT" | null;
    depth: number;
  } | null;
  already_finalized: boolean;
  safe_to_finalize_without_new_payment: boolean;
  reasons: string[];
};

function nowIso() {
  return new Date().toISOString();
}

function hashesEqual(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function samePlanTx(tx: Pick<TransactionRow, "plan_id" | "plan_code">, planId: string) {
  return tx.plan_id === planId || tx.plan_code === planId;
}

function confirmedFundingTx(store: Store, planId: string, hash: string) {
  return (store.transactions ?? []).find(
    (t) =>
      t.status === "CONFIRMED" &&
      samePlanTx(t, planId) &&
      hashesEqual(t.tx_hash, hash) &&
      (t.direct_number === 2 || t.recipient_role === "GLOBAL_UPLINE" || t.payment_type === "PLAN_PURCHASE"),
  );
}

function activeChild(scoped: NetworkPositionRow[], parentId: string, side: "LEFT" | "RIGHT") {
  return scoped.find((n) => n.parent_id === parentId && n.position === side && isActiveNode(n));
}

function walletOf(store: Store, userId: string) {
  return (
    store.wallets.find((w) => w.user_id === userId && w.verified)?.address ??
    store.wallets.find((w) => w.user_id === userId)?.address ??
    null
  );
}

function uniqueFundingEvidence(store: Store, planId: string, fromPositionId: string) {
  const rows = store.network_positions.filter(
    (p) => p.plan_id === planId && p.from_position_id === fromPositionId && p.reentry_tx_hash,
  );
  const withTx = rows
    .map((row) => ({ row, tx: confirmedFundingTx(store, planId, row.reentry_tx_hash!) }))
    .filter((x) => x.tx);
  if (!withTx.length) return null;
  const hashes = new Set(withTx.map((x) => x.row.reentry_tx_hash!.toLowerCase()));
  if (hashes.size !== 1) return null;
  return withTx[0]!;
}

export function inspectLegacyFundedMovement(store: Store, planId: string, fromPositionId: string): LegacyFundedReport {
  const scoped = positionsForPlan(store.network_positions, planId);
  const from = scoped.find((p) => p.id === fromPositionId) ?? null;
  const moverId = from?.user_id ?? null;
  const occupying = moverId ? occupyingPosition(store.network_positions, moverId, planId) : null;
  const sourceActive = Boolean(from && isActiveNode(from) && occupying?.id === from.id);
  const cycle = from ? cycleComplete(scoped, from.id) : false;
  const funded = cycleAlreadyFunded(store, planId, fromPositionId);
  const evidence = uniqueFundingEvidence(store, planId, fromPositionId);
  const already = Boolean(
    occupying &&
      occupying.id !== fromPositionId &&
      occupying.from_position_id === fromPositionId &&
      occupying.source === LEGACY_FUNDED_MOVEMENT_RECONCILIATION,
  );
  const inFlight = (store.payment_intents ?? []).some(
    (i) =>
      i.kind === "GLOBAL_REENTRY" &&
      i.plan_id === planId &&
      i.mover_user_id === moverId &&
      Boolean(i.tx_hash) &&
      (i.status === "PENDING" || i.status === "CONFIRMED"),
  );
  const paidReentry = (store.transactions ?? []).some(
    (t) =>
      t.payment_type === "GLOBAL_REENTRY" &&
      t.status === "CONFIRMED" &&
      t.plan_id === planId &&
      t.user_id === moverId,
  );
  const hole =
    moverId && scoped.some(isActiveNode) ? findFirstEmptyPlacement(scoped, moverId) : null;
  const quote = moverId ? firstEmptyQuote(store, planId, moverId) : null;
  const targetOccupied =
    hole?.parent_id && hole.position ? Boolean(activeChild(scoped, hole.parent_id, hole.position)) : false;
  const parent = hole?.parent_id ? scoped.find((p) => p.id === hole.parent_id) : null;
  const selfPay = Boolean(moverId && quote?.recipient_user_id === moverId);

  const reasons: string[] = [];
  if (!from) reasons.push("SOURCE_SEAT_MISSING");
  if (from && from.plan_id !== planId) reasons.push("PLAN_MISMATCH");
  if (!sourceActive) reasons.push("SOURCE_NOT_CURRENT_ACTIVE");
  if (!cycle) reasons.push("CYCLE_INCOMPLETE");
  if (!funded) reasons.push("CYCLE_NOT_FUNDED");
  if (!evidence) reasons.push("FUNDING_EVIDENCE_AMBIGUOUS");
  if (!hole?.parent_id || !hole.position) reasons.push("NO_LEGAL_FIRST_EMPTY");
  if (parent && !isActiveNode(parent)) reasons.push("PARENT_NOT_ACTIVE");
  if (targetOccupied) reasons.push("TARGET_SLOT_OCCUPIED");
  if (selfPay) reasons.push("REENTRY_SELF_PAY");
  if (inFlight) reasons.push("IN_FLIGHT_REENTRY_PAYMENT");
  if (paidReentry) reasons.push("CONFIRMED_GLOBAL_REENTRY_EXISTS");
  if (already) reasons.push("ALREADY_FINALIZED");

  const safe =
    !already &&
    sourceActive &&
    cycle &&
    funded &&
    Boolean(evidence) &&
    Boolean(hole?.parent_id && hole.position) &&
    Boolean(parent && isActiveNode(parent)) &&
    !targetOccupied &&
    !selfPay &&
    !inFlight &&
    !paidReentry;

  return {
    plan_id: planId,
    from_position_id: fromPositionId,
    mover_user_id: moverId,
    source_active: sourceActive,
    cycle_complete: cycle,
    already_funded: funded,
    funding_tx_hash: evidence?.row.reentry_tx_hash ?? null,
    funded_by_user_id: evidence?.row.funded_by_user_id ?? evidence?.tx?.user_id ?? null,
    current_legal_first_empty: hole
      ? {
          parent_id: hole.parent_id,
          parent_user_id: parent?.user_id ?? quote?.recipient_user_id ?? null,
          position: hole.position,
          depth: hole.depth,
        }
      : null,
    already_finalized: already,
    safe_to_finalize_without_new_payment: safe,
    reasons: safe ? [] : reasons,
  };
}

export function applyLegacyFundedMovement(
  store: Store,
  planId: string,
  fromPositionId: string,
  expectedHole?: { parent_id: string | null; position: "LEFT" | "RIGHT" | null },
): NetworkPositionRow {
  const before = inspectLegacyFundedMovement(store, planId, fromPositionId);
  if (before.already_finalized) {
    return occupyingPosition(store.network_positions, before.mover_user_id ?? "", planId)!;
  }
  if (!before.safe_to_finalize_without_new_payment) {
    throw new Error(`LEGACY_FUNDED_MOVE_BLOCKED:${planId}:${before.reasons.join(",")}`);
  }
  const moverId = before.mover_user_id!;
  const scoped = positionsForPlan(store.network_positions, planId);
  const hole = findFirstEmptyPlacement(scoped, moverId);
  if (
    hole.parent_id !== before.current_legal_first_empty?.parent_id ||
    hole.position !== before.current_legal_first_empty?.position
  ) {
    throw new Error(`LEGACY_FUNDED_MOVE_STALE_HOLE:${planId}`);
  }
  if (expectedHole && (hole.parent_id !== expectedHole.parent_id || hole.position !== expectedHole.position)) {
    throw new Error(`LEGACY_FUNDED_MOVE_STALE_HOLE:${planId}`);
  }
  const old = store.network_positions.find((p) => p.id === fromPositionId);
  if (!old || !isActiveNode(old) || old.user_id !== moverId) {
    throw new Error(`LEGACY_FUNDED_MOVE_SOURCE_CHANGED:${planId}`);
  }
  const parent = store.network_positions.find((p) => p.id === hole.parent_id);
  if (!parent || parent.plan_id !== planId || !isActiveNode(parent)) {
    throw new Error(`LEGACY_FUNDED_MOVE_PARENT_CHANGED:${planId}`);
  }
  const evidence = uniqueFundingEvidence(store, planId, fromPositionId);
  if (!evidence) throw new Error(`LEGACY_FUNDED_MOVE_EVIDENCE_LOST:${planId}`);
  const ended = nowIso();
  old.status = "HISTORY";
  old.ended_at = ended;
  const row: NetworkPositionRow = {
    id: newId("pos"),
    user_id: moverId,
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
    reentry_tx_hash: evidence.row.reentry_tx_hash,
    funded_by_user_id: evidence.row.funded_by_user_id ?? evidence.tx.user_id,
    source: LEGACY_FUNDED_MOVEMENT_RECONCILIATION,
  };
  store.network_positions.push(row);
  afterActiveSeatCreated(store, row);
  return row;
}
