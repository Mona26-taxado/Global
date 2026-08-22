import type { Store } from "@/lib/store";
import { hasConfirmedPlan, permanentDirects, qualifiesForPlanGlobal } from "@/lib/plan-progress";
import { cycleComplete } from "@/network/placement";
import {
  currentPosition,
  ensureActivePlanSeatInStore,
  occupyingPosition,
  positionsForPlan,
} from "@/services/users";
import type { NetworkPositionRow, TransactionRow, UserRow } from "@/types";

export type ConfirmedPlanProof = {
  user_id: string;
  referral_code: string;
  wallet: string | null;
  wallet_verified: boolean;
  tx_id: string;
  tx_hash: string;
  created_at: string;
};

export type StoreRowChange = {
  table: "network_positions";
  action: "insert" | "update";
  id: string;
  before: Partial<NetworkPositionRow> | null;
  after: Partial<NetworkPositionRow>;
};

export type QualifiedSeatPreview = {
  user: ConfirmedPlanProof;
  direct1: ConfirmedPlanProof;
  direct2: ConfirmedPlanProof;
  currently_has_plan_global_seat: boolean;
  why_qualifies: string;
  action: "INSERT_FIRST_EMPTY" | "SKIP_ALREADY_SEATED";
  first_empty: {
    parent_position_id: string | null;
    parent_user_id: string | null;
    parent_referral_code: string | null;
    position: "LEFT" | "RIGHT" | null;
    depth: number;
  } | null;
  completes_existing_cycle: boolean;
  cycle_parent_position_id: string | null;
  row_changes: StoreRowChange[];
};

export type PlanGlobalBackfillAudit = {
  plan_id: string;
  dry_run: true;
  qualified_missing_seats: QualifiedSeatPreview[];
  qualified_already_seated: { referral_code: string; user_id: string; position_id: string }[];
  waiting_not_qualified: { referral_code: string; user_id: string; reason: string }[];
  plan_100_position_ids_before: string[];
  plan_100_position_ids_after_preview: string[];
  plan_100_changes: "NONE";
  confirmed_transactions_rewritten: "NONE";
  transactions_count_before: number;
  transactions_count_after_preview: number;
};

function confirmedPlanPurchase(store: Store, userId: string, planId: string): TransactionRow | null {
  const rows = store.transactions
    .filter(
      (t) =>
        t.user_id === userId &&
        t.plan_id === planId &&
        t.payment_type === "PLAN_PURCHASE" &&
        t.status === "CONFIRMED",
    )
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return rows[0] ?? null;
}

function proof(store: Store, user: UserRow, planId: string): ConfirmedPlanProof | null {
  const tx = confirmedPlanPurchase(store, user.id, planId);
  if (!tx) return null;
  const wallet = store.wallets.find((w) => w.user_id === user.id && w.verified) ?? store.wallets.find((w) => w.user_id === user.id);
  return {
    user_id: user.id,
    referral_code: user.referral_code,
    wallet: wallet?.address ?? null,
    wallet_verified: Boolean(wallet?.verified),
    tx_id: tx.id,
    tx_hash: tx.tx_hash,
    created_at: tx.created_at,
  };
}

function codeOf(store: Store, userId: string | null | undefined) {
  if (!userId) return null;
  return store.users.find((u) => u.id === userId)?.referral_code ?? null;
}

function positionFingerprint(p: NetworkPositionRow) {
  return JSON.stringify({
    id: p.id,
    user_id: p.user_id,
    plan_id: p.plan_id,
    parent_id: p.parent_id,
    position: p.position,
    depth: p.depth,
    status: p.status ?? "ACTIVE",
    from_position_id: p.from_position_id ?? null,
    funded_by_user_id: p.funded_by_user_id ?? null,
    ended_at: p.ended_at ?? null,
    reentry_tx_hash: p.reentry_tx_hash ?? null,
  });
}

function diffPositions(before: NetworkPositionRow[], after: NetworkPositionRow[]): StoreRowChange[] {
  const beforeById = new Map(before.map((p) => [p.id, p]));
  const afterById = new Map(after.map((p) => [p.id, p]));
  const changes: StoreRowChange[] = [];
  for (const row of after) {
    const prev = beforeById.get(row.id);
    if (!prev) {
      changes.push({ table: "network_positions", action: "insert", id: row.id, before: null, after: row });
      continue;
    }
    if (positionFingerprint(prev) !== positionFingerprint(row)) {
      changes.push({ table: "network_positions", action: "update", id: row.id, before: prev, after: row });
    }
  }
  for (const row of before) {
    if (!afterById.has(row.id)) {
      changes.push({ table: "network_positions", action: "update", id: row.id, before: row, after: { id: row.id, status: "DELETED" as NetworkPositionRow["status"] } });
    }
  }
  return changes;
}

function cloneStore(store: Store): Store {
  return structuredClone(store);
}

function direct2ConfirmedAt(store: Store, userId: string, planId: string) {
  const { direct2 } = permanentDirects(store.referrals, userId);
  if (!direct2) return "\uffff";
  return confirmedPlanPurchase(store, direct2.user_id, planId)?.created_at ?? "\uffff";
}

/**
 * Dry-run only. Mutates a clone. Never writes the store.
 * PLAN_100 and confirmed transactions are not touched.
 */
export function auditPlanGlobalBackfill(store: Store, planId: string): PlanGlobalBackfillAudit {
  const plan100Ids = new Set(
    store.network_positions.filter((p) => p.plan_id === "PLAN_100" || p.plan_id === "P1").map((p) => p.id),
  );
  const txCount = store.transactions.length;
  const working = cloneStore(store);
  const previews: QualifiedSeatPreview[] = [];
  const already: PlanGlobalBackfillAudit["qualified_already_seated"] = [];
  const waiting: PlanGlobalBackfillAudit["waiting_not_qualified"] = [];

  const humans = store.users.filter((u) => !u.is_demo);
  const qualified = humans.filter((u) => qualifiesForPlanGlobal(store, u.id, planId));
  qualified.sort(
    (a, b) =>
      direct2ConfirmedAt(store, a.id, planId).localeCompare(direct2ConfirmedAt(store, b.id, planId)) ||
      a.id.localeCompare(b.id),
  );

  for (const u of humans) {
    if (qualifiesForPlanGlobal(store, u.id, planId)) continue;
    if (!hasConfirmedPlan(store.transactions, u.id, planId)) continue;
    const { direct1, direct2 } = permanentDirects(store.referrals, u.id);
    const d1ok = direct1 && hasConfirmedPlan(store.transactions, direct1.user_id, planId);
    const d2ok = direct2 && hasConfirmedPlan(store.transactions, direct2.user_id, planId);
    waiting.push({
      referral_code: u.referral_code,
      user_id: u.id,
      reason: !direct1 || !direct2 ? "missing permanent Direct #1 or Direct #2" : !d1ok ? "Direct #1 plan not CONFIRMED" : !d2ok ? "Direct #2 plan not CONFIRMED" : "not qualified",
    });
  }

  for (const u of qualified) {
    const userProof = proof(store, u, planId);
    const { direct1, direct2 } = permanentDirects(store.referrals, u.id);
    const d1 = direct1 ? store.users.find((x) => x.id === direct1.user_id) : undefined;
    const d2 = direct2 ? store.users.find((x) => x.id === direct2.user_id) : undefined;
    const d1Proof = d1 ? proof(store, d1, planId) : null;
    const d2Proof = d2 ? proof(store, d2, planId) : null;
    if (!userProof || !d1Proof || !d2Proof) continue;

    const occupying = occupyingPosition(working.network_positions, u.id, planId);
    if (occupying) {
      already.push({ referral_code: u.referral_code, user_id: u.id, position_id: occupying.id });
      previews.push({
        user: userProof,
        direct1: d1Proof,
        direct2: d2Proof,
        currently_has_plan_global_seat: true,
        why_qualifies: `${u.referral_code} has CONFIRMED ${planId}; Direct #1 ${d1Proof.referral_code} CONFIRMED; Direct #2 ${d2Proof.referral_code} CONFIRMED. Independent of sponsor/upline Global.`,
        action: "SKIP_ALREADY_SEATED",
        first_empty: null,
        completes_existing_cycle: false,
        cycle_parent_position_id: null,
        row_changes: [],
      });
      continue;
    }

    const beforePos = working.network_positions.map((p) => ({ ...p }));
    const placed = ensureActivePlanSeatInStore(working, u.id, planId);
    const changes = diffPositions(beforePos, working.network_positions);
    const parentId = placed.row.parent_id;
    const scopedAfter = positionsForPlan(working.network_positions, planId);
    const completes = Boolean(parentId && cycleComplete(scopedAfter, parentId));

    previews.push({
      user: userProof,
      direct1: d1Proof,
      direct2: d2Proof,
      currently_has_plan_global_seat: false,
      why_qualifies: `${u.referral_code} has CONFIRMED ${planId}; Direct #1 ${d1Proof.referral_code} CONFIRMED; Direct #2 ${d2Proof.referral_code} CONFIRMED. Independent of sponsor/upline Global.`,
      action: "INSERT_FIRST_EMPTY",
      first_empty: {
        parent_position_id: placed.row.parent_id,
        parent_user_id: working.network_positions.find((p) => p.id === placed.row.parent_id)?.user_id ?? null,
        parent_referral_code: codeOf(working, working.network_positions.find((p) => p.id === placed.row.parent_id)?.user_id),
        position: placed.row.position,
        depth: placed.row.depth,
      },
      completes_existing_cycle: completes,
      cycle_parent_position_id: completes ? parentId : null,
      row_changes: changes,
    });
  }

  const after100 = working.network_positions.filter((p) => p.plan_id === "PLAN_100" || p.plan_id === "P1").map((p) => p.id);
  const before100 = [...plan100Ids];
  const same100 = before100.length === after100.length && before100.every((id) => after100.includes(id));

  return {
    plan_id: planId,
    dry_run: true,
    qualified_missing_seats: previews.filter((p) => p.action === "INSERT_FIRST_EMPTY"),
    qualified_already_seated: already,
    waiting_not_qualified: waiting,
    plan_100_position_ids_before: before100.sort(),
    plan_100_position_ids_after_preview: after100.sort(),
    plan_100_changes: same100 ? "NONE" : "UNEXPECTED_CHANGE",
    confirmed_transactions_rewritten: "NONE",
    transactions_count_before: txCount,
    transactions_count_after_preview: working.transactions.length,
  };
}

export function occupyingPlanSeat(store: Store, userId: string, planId: string) {
  return occupyingPosition(store.network_positions, userId, planId) ?? currentPosition(store.network_positions, userId, planId);
}

function plan100Ids(store: Store) {
  return store.network_positions.filter((p) => p.plan_id === "PLAN_100" || p.plan_id === "P1").map((p) => p.id).sort();
}

function txFingerprint(store: Store) {
  return JSON.stringify(
    store.transactions.map((t) => ({
      id: t.id,
      status: t.status,
      tx_hash: t.tx_hash,
      user_id: t.user_id,
      plan_id: t.plan_id,
      payment_type: t.payment_type,
    })),
  );
}

function freezeUnrelated(store: Store) {
  return {
    txs: txFingerprint(store),
    plan100: plan100Ids(store).join(","),
    referrals: JSON.stringify(store.referrals),
    wallets: JSON.stringify(store.wallets),
  };
}

/** Mutates `store` only: PLAN_200-style qualified missing seats via first-empty. No txs. */
export function applyPlanGlobalBackfill(store: Store, planId: string) {
  const frozen = freezeUnrelated(store);
  const humans = store.users.filter((u) => !u.is_demo);
  const qualified = humans.filter((u) => qualifiesForPlanGlobal(store, u.id, planId));
  qualified.sort(
    (a, b) =>
      direct2ConfirmedAt(store, a.id, planId).localeCompare(direct2ConfirmedAt(store, b.id, planId)) ||
      a.id.localeCompare(b.id),
  );
  const created: NetworkPositionRow[] = [];
  for (const u of qualified) {
    const occupying = occupyingPosition(store.network_positions, u.id, planId);
    if (occupying) continue;
    const result = ensureActivePlanSeatInStore(store, u.id, planId);
    if (result.created) created.push(result.row);
  }
  const after = freezeUnrelated(store);
  if (after.txs !== frozen.txs) throw new Error("BACKFILL_MUST_NOT_TOUCH_TRANSACTIONS");
  if (after.plan100 !== frozen.plan100) throw new Error("BACKFILL_MUST_NOT_TOUCH_PLAN_100");
  if (after.referrals !== frozen.referrals) throw new Error("BACKFILL_MUST_NOT_TOUCH_REFERRALS");
  if (after.wallets !== frozen.wallets) throw new Error("BACKFILL_MUST_NOT_TOUCH_WALLETS");
  return created;
}
