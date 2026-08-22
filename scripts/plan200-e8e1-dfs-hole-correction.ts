/**
 * ONE-TIME PLAN_200 correction: GXFOUNDER / e8e1 from wrong DFS 2575.LEFT
 * to legal e727.LEFT. No new payment. No fake GLOBAL_REENTRY tx.
 * Does not rewrite confirmed txs, referrals, wallets, or other plans.
 * Idempotent: second apply creates 0 seats.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { newId } from "../lib/store";
import type { Store } from "../lib/store";
import { cycleComplete, findFirstEmptyPlacement, isActiveNode } from "../network/placement";
import { afterActiveSeatCreated, cycleAlreadyFunded } from "../services/placement-intent";
import { occupyingPosition, positionsForPlan } from "../services/users";
import type { NetworkPositionRow, PaymentIntentRow, TransactionRow } from "../types";

function loadEnv() {
  const p = join(process.cwd(), ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

const PLAN = "PLAN_200";
const E8E1 = "user_fabc29c69b8f1cb7";
const E727 = "user_1ddb80e2f1b1aec5";
const U2575 = "user_6ed8e4893670db32";
const SOURCE = "PLAN200_E8E1_DFS_HOLE_CORRECTION";
const STATE_ID = "globalx";
const OTHER_PLANS = ["PLAN_100", "PLAN_500", "PLAN_1000"] as const;

function nowIso() {
  return new Date().toISOString();
}

function hashesEqual(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function walletOf(store: Store, userId: string) {
  return (
    store.wallets.find((w) => w.user_id === userId && w.verified)?.address ??
    store.wallets.find((w) => w.user_id === userId)?.address ??
    null
  );
}

function fingerprintTxs(txs: TransactionRow[]) {
  return JSON.stringify(txs);
}

function fingerprintConfirmedTxs(txs: TransactionRow[]) {
  return JSON.stringify((txs ?? []).filter((t) => t.status === "CONFIRMED"));
}

function fingerprintOtherPlans(positions: NetworkPositionRow[]) {
  return JSON.stringify(
    positions
      .filter((p) => p.plan_id !== PLAN)
      .map((p) => p.id)
      .sort(),
  );
}

function fingerprintReferralsWallets(store: Store) {
  return JSON.stringify({ referrals: store.referrals, wallets: store.wallets });
}

function fundingTx(store: Store, hash: string) {
  return (store.transactions ?? []).find(
    (t) =>
      t.status === "CONFIRMED" &&
      (t.plan_id === PLAN || t.plan_code === PLAN) &&
      hashesEqual(t.tx_hash, hash) &&
      (t.direct_number === 2 || t.recipient_role === "GLOBAL_UPLINE" || t.payment_type === "PLAN_PURCHASE"),
  );
}

function laterConfirmedDependsOnWrongSeat(
  store: Store,
  wrong: NetworkPositionRow,
): { ok: boolean; hits: unknown[] } {
  const hits: unknown[] = [];
  for (const t of store.transactions ?? []) {
    if (t.status !== "CONFIRMED") continue;
    if (t.position_id === wrong.id) hits.push({ kind: "tx_position_id", id: t.id });
  }
  for (const i of store.payment_intents ?? []) {
    if (i.status !== "CONFIRMED") continue;
    if (
      i.candidate_parent_position_id === wrong.id ||
      i.movement_from_position_id === wrong.id ||
      i.movement_parent_position_id === wrong.id
    ) {
      hits.push({ kind: "confirmed_intent", id: i.id });
    }
  }
  const children = store.network_positions.filter((p) => p.parent_id === wrong.id);
  for (const c of children) {
    for (const t of store.transactions ?? []) {
      if (t.status === "CONFIRMED" && t.position_id === c.id) {
        hits.push({ kind: "child_tx_position_id", id: t.id, child: c.id });
      }
    }
  }
  return { ok: hits.length === 0, hits };
}

function inspect(store: Store) {
  const scoped = positionsForPlan(store.network_positions, PLAN);
  const e8e1 = occupyingPosition(store.network_positions, E8E1, PLAN);
  const e727 = occupyingPosition(store.network_positions, E727, PLAN);
  const n2575 = occupyingPosition(store.network_positions, U2575, PLAN);
  const hole = scoped.some(isActiveNode) ? findFirstEmptyPlacement(scoped, E8E1) : null;
  const holeParent = hole?.parent_id ? scoped.find((p) => p.id === hole.parent_id) : null;
  const e727LeftActive = e727
    ? scoped.find((n) => n.parent_id === e727.id && n.position === "LEFT" && isActiveNode(n))
    : undefined;
  const already = Boolean(
    e8e1 &&
      e727 &&
      e8e1.parent_id === e727.id &&
      e8e1.position === "LEFT" &&
      isActiveNode(e8e1) &&
      e8e1.source === SOURCE &&
      e8e1.from_position_id,
  );
  const reasons: string[] = [];
  if (already) {
    return {
      ok: true as const,
      already: true as const,
      reasons,
      e8e1,
      e727,
      n2575,
      hole,
      holeParent,
      scoped,
      wrong: store.network_positions.find((p) => p.id === e8e1!.from_position_id) ?? null,
      fundingTx: e8e1?.reentry_tx_hash ? fundingTx(store, e8e1.reentry_tx_hash) : null,
      later: { ok: true, hits: [] as unknown[] },
    };
  }

  const under2575Left = Boolean(e8e1 && n2575 && e8e1.parent_id === n2575.id && e8e1.position === "LEFT" && isActiveNode(e8e1));
  if (!e8e1 || !isActiveNode(e8e1)) reasons.push("E8E1_NOT_ACTIVE");
  if (!under2575Left) reasons.push("E8E1_NOT_WRONG_2575_LEFT");
  if (!e727 || !isActiveNode(e727) || e727.user_id !== E727) reasons.push("E727_NOT_ACTIVE");
  if (e727LeftActive) reasons.push("E727_LEFT_ACTIVE_OCCUPIED");
  if (!hole || hole.parent_id !== e727?.id || hole.position !== "LEFT") reasons.push("ALLOCATOR_HOLE_NOT_E727_LEFT");
  const hash = e8e1?.reentry_tx_hash ?? null;
  const tx = hash ? fundingTx(store, hash) : undefined;
  if (!hash || !tx) reasons.push("FUNDING_TX_MISSING");
  const fundedFrom = e8e1?.from_position_id ? cycleAlreadyFunded(store, PLAN, e8e1.from_position_id) : false;
  if (!fundedFrom) reasons.push("MOVEMENT_NOT_FUNDED");
  const later = e8e1 ? laterConfirmedDependsOnWrongSeat(store, e8e1) : { ok: false, hits: ["NO_SEAT"] };
  if (!later.ok) reasons.push("LATER_CONFIRMED_DEPENDS_ON_2575_LEFT");
  if (e8e1 && scoped.some((p) => p.parent_id === e8e1.id && isActiveNode(p))) reasons.push("WRONG_SEAT_HAS_ACTIVE_CHILDREN");
  if (e8e1 && e8e1.plan_id !== PLAN) reasons.push("PLAN_MISMATCH");

  return {
    ok: reasons.length === 0,
    already: false as const,
    reasons,
    e8e1,
    e727,
    n2575,
    hole,
    holeParent,
    scoped,
    wrong: e8e1 ?? null,
    fundingTx: tx ?? null,
    later,
  };
}

function apply(store: Store, first: ReturnType<typeof inspect>) {
  if (first.already) return occupyingPosition(store.network_positions, E8E1, PLAN)!;
  if (!first.ok || !first.e8e1 || !first.e727 || !first.hole) {
    throw new Error(`NOT_SAFE:${first.reasons.join(",")}`);
  }
  const old = store.network_positions.find((p) => p.id === first.e8e1!.id)!;
  const parent = store.network_positions.find((p) => p.id === first.e727!.id)!;
  const ended = nowIso();
  old.status = "HISTORY";
  old.ended_at = ended;
  const row: NetworkPositionRow = {
    id: newId("pos"),
    user_id: E8E1,
    plan_id: PLAN,
    parent_id: parent.id,
    position: "LEFT",
    depth: parent.depth + 1,
    cycle: Math.floor((parent.depth + 1) / 2),
    status: "ACTIVE",
    started_at: ended,
    ended_at: null,
    from_position_id: old.id,
    recipient_user_id: parent.user_id,
    recipient_wallet: walletOf(store, parent.user_id),
    reentry_tx_hash: old.reentry_tx_hash ?? first.fundingTx?.tx_hash ?? null,
    funded_by_user_id: old.funded_by_user_id ?? first.fundingTx?.user_id ?? null,
    source: SOURCE,
  };
  store.network_positions.push(row);
  afterActiveSeatCreated(store, row);
  return row;
}

function nextHole(store: Store) {
  const scoped = positionsForPlan(store.network_positions, PLAN);
  const hole = findFirstEmptyPlacement(scoped, E8E1);
  const parent = hole.parent_id ? scoped.find((p) => p.id === hole.parent_id) : null;
  return {
    parent_id: hole.parent_id,
    parent_user_id: parent?.user_id ?? null,
    parent_code: store.users.find((u) => u.id === parent?.user_id)?.referral_code ?? null,
    position: hole.position,
    depth: hole.depth,
  };
}

function newlyCompletedCycles(store: Store, beforeIds: Set<string>) {
  const scoped = positionsForPlan(store.network_positions, PLAN);
  const out: { position_id: string; user_id: string; code: string | null }[] = [];
  for (const seat of scoped) {
    if (!isActiveNode(seat)) continue;
    if (!cycleComplete(scoped, seat.id)) continue;
    if (beforeIds.has(seat.id)) continue;
    out.push({
      position_id: seat.id,
      user_id: seat.user_id,
      code: store.users.find((u) => u.id === seat.user_id)?.referral_code ?? null,
    });
  }
  const still: typeof out = [];
  for (const seat of scoped) {
    if (!isActiveNode(seat) || !cycleComplete(scoped, seat.id)) continue;
    if (!beforeIds.has(seat.id)) continue;
  }
  void still;
  const completedNow: typeof out = [];
  for (const seat of scoped) {
    if (!isActiveNode(seat) || !cycleComplete(scoped, seat.id)) continue;
    completedNow.push({
      position_id: seat.id,
      user_id: seat.user_id,
      code: store.users.find((u) => u.id === seat.user_id)?.referral_code ?? null,
    });
  }
  return { completed_active_seats: completedNow, newly_completed_vs_before: out };
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.from("app_state").select("payload, updated_at").eq("id", STATE_ID).maybeSingle();
  if (error) throw error;
  if (!data?.payload) throw new Error("empty app_state");
  const store = data.payload as Store;
  if (!store.payment_intents) store.payment_intents = [];

  const txBefore = fingerprintTxs(store.transactions);
  const confirmedBefore = fingerprintConfirmedTxs(store.transactions);
  const otherBefore = fingerprintOtherPlans(store.network_positions);
  const rwBefore = fingerprintReferralsWallets(store);
  const posCountBefore = store.network_positions.length;
  const intentCountBefore = (store.payment_intents ?? []).length;
  const scopedBefore = positionsForPlan(store.network_positions, PLAN);
  const cyclesBefore = new Set(
    scopedBefore.filter((s) => isActiveNode(s) && cycleComplete(scopedBefore, s.id)).map((s) => s.id),
  );

  const first = inspect(store);
  if (!first.ok && !first.already) {
    console.log(
      JSON.stringify(
        {
          "1_SAFE_TO_RECONCILE": "NO",
          STOP: true,
          reasons: first.reasons,
          later_hits: first.later.hits,
          old_e8e1_position: first.e8e1,
          allocator_hole: first.hole,
          confirmed_txs_changed: "NO",
          new_payment_created: "NO",
        },
        null,
        2,
      ),
    );
    return;
  }

  let wrote = false;
  const oldId = first.already ? first.e8e1!.from_position_id! : first.e8e1!.id;
  if (!first.already) {
    apply(store, first);
    const again = inspect(store);
    if (!again.already) throw new Error(`post-apply inspect failed: ${again.reasons.join(",")}`);
    if (fingerprintTxs(store.transactions) !== txBefore) throw new Error("CONFIRMED_TX_MUTATED");
    if (fingerprintOtherPlans(store.network_positions) !== otherBefore) throw new Error("OTHER_PLANS_MUTATED");
    if (fingerprintReferralsWallets(store) !== rwBefore) throw new Error("REFERRALS_OR_WALLETS_MUTATED");
    const { error: writeErr } = await sb.from("app_state").upsert({
      id: STATE_ID,
      payload: store,
      updated_at: nowIso(),
    });
    if (writeErr) throw new Error(`Supabase write failed: ${writeErr.message}`);
    wrote = true;
  }

  const { data: afterData, error: afterErr } = await sb.from("app_state").select("payload").eq("id", STATE_ID).maybeSingle();
  if (afterErr) throw afterErr;
  const after = afterData!.payload as Store;
  const second = inspect(after);
  const live = occupyingPosition(after.network_positions, E8E1, PLAN)!;
  const old = after.network_positions.find((p) => p.id === oldId)!;
  const parent = occupyingPosition(after.network_positions, E727, PLAN)!;
  const scopedAfter = positionsForPlan(after.network_positions, PLAN);
  const cyclesAfter = newlyCompletedCycles(after, cyclesBefore);
  const newly = scopedAfter
    .filter((s) => isActiveNode(s) && cycleComplete(scopedAfter, s.id) && !cyclesBefore.has(s.id))
    .map((s) => ({
      position_id: s.id,
      user_id: s.user_id,
      code: after.users.find((u) => u.id === s.user_id)?.referral_code ?? null,
    }));
  const txsChanged = fingerprintConfirmedTxs(after.transactions) !== confirmedBefore;
  const anyTxChanged = fingerprintTxs(after.transactions) !== txBefore;
  const otherChanged = fingerprintOtherPlans(after.network_positions) !== otherBefore;
  const rwChanged = fingerprintReferralsWallets(after) !== rwBefore;
  const newPaymentIntents = (after.payment_intents ?? []).length - intentCountBefore;
  const secondWouldCreate = second.already ? 0 : 1;

  console.log(
    JSON.stringify(
      {
        "1_SAFE_TO_RECONCILE": first.ok || first.already ? "YES" : "NO",
        applied_this_run: wrote,
        "2_old_e8e1_position": {
          id: old.id,
          user_id: old.user_id,
          plan_id: old.plan_id,
          parent_id: old.parent_id,
          position: old.position,
          depth: old.depth,
          status: old.status,
          ended_at: old.ended_at ?? null,
          source: old.source ?? null,
        },
        "3_new_e8e1_position": {
          id: live.id,
          user_id: live.user_id,
          plan_id: live.plan_id,
          parent_id: live.parent_id,
          position: live.position,
          depth: live.depth,
          status: live.status,
          from_position_id: live.from_position_id ?? null,
          reentry_tx_hash: live.reentry_tx_hash ?? null,
          funded_by_user_id: live.funded_by_user_id ?? null,
          source: live.source ?? null,
        },
        "4_new_parent": {
          id: parent.id,
          user_id: parent.user_id,
          code: after.users.find((u) => u.id === parent.user_id)?.referral_code ?? null,
        },
        "5_side": live.position,
        "6_confirmed_txs_changed": txsChanged || anyTxChanged ? "YES" : "NO",
        "7_new_payment_created": anyTxChanged ? "YES" : "NO",
        "8_next_legal_hole_after_reconciliation": nextHole(after),
        "9_any_cycle_newly_completed": newly.length ? newly : "NONE",
        "10_second_run_creates_0_duplicate_rows": second.already && secondWouldCreate === 0 ? "YES" : "NO",
        other_plans_changed: otherChanged ? "YES" : "NO",
        referrals_or_wallets_changed: rwChanged ? "YES" : "NO",
        new_payment_intents_delta: newPaymentIntents,
        rows_created_this_run: wrote ? after.network_positions.length - posCountBefore : 0,
        funding_tx: first.fundingTx
          ? { id: first.fundingTx.id, hash: first.fundingTx.tx_hash, type: first.fundingTx.payment_type }
          : null,
        cycles_complete_active: cyclesAfter.completed_active_seats,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
