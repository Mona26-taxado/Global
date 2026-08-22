/**
 * ONE-TIME PLAN_200 admin/genesis reconciliation for GXGLOBAL / 2575.
 * Does not create a blockchain payment. Does not rewrite confirmed txs.
 * Does not queue e8e1 re-entry. Idempotent: second apply creates 0 seats.
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { cycleComplete, findFirstEmptyPlacement } from "../network/placement";
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
const MOVER = "user_6ed8e4893670db32";
const E8E1 = "user_fabc29c69b8f1cb7";
const E727 = "user_1ddb80e2f1b1aec5";
const GENESIS_TX_IDS = ["tx_9bb1200a232f4fd0", "tx_33c9f7e8ec52e887"] as const;
const OTHER_PLANS = ["PLAN_100", "PLAN_500", "PLAN_1000"] as const;
const STATE_ID = "globalx";

type Store = {
  users: { id: string; referral_code: string }[];
  wallets: { user_id: string; address: string; verified?: boolean }[];
  referrals: unknown[];
  transactions: TransactionRow[];
  payment_intents: PaymentIntentRow[];
  network_positions: NetworkPositionRow[];
};

function nowIso() {
  return new Date().toISOString();
}

function newPosId() {
  return `pos_${randomBytes(8).toString("hex")}`;
}

function walletOf(store: Store, userId: string) {
  return (
    store.wallets.find((w) => w.user_id === userId && w.verified)?.address ??
    store.wallets.find((w) => w.user_id === userId)?.address ??
    null
  );
}

function fingerprintTxs(txs: TransactionRow[], ids: readonly string[]) {
  return JSON.stringify(
    ids.map((id) => txs.find((t) => t.id === id) ?? null),
  );
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

function liveReentryForMovement(intents: PaymentIntentRow[], fromId: string) {
  return (intents ?? []).filter(
    (i) =>
      i.kind === "GLOBAL_REENTRY" &&
      i.plan_id === PLAN &&
      i.mover_user_id === MOVER &&
      i.movement_from_position_id === fromId &&
      (i.status === "PENDING" || i.status === "CONFIRMED"),
  );
}

function inspect(store: Store) {
  const scoped = positionsForPlan(store.network_positions, PLAN);
  const root = occupyingPosition(store.network_positions, MOVER, PLAN);
  const e8e1 = occupyingPosition(store.network_positions, E8E1, PLAN);
  const e727 = occupyingPosition(store.network_positions, E727, PLAN);
  const hole = findFirstEmptyPlacement(scoped, MOVER);
  const e8e1LeftActive = e8e1
    ? scoped.find(
        (n) => n.parent_id === e8e1.id && n.position === "LEFT" && (n.status ?? "ACTIVE") === "ACTIVE",
      )
    : undefined;
  const already =
    Boolean(root && e8e1) &&
    root!.parent_id === e8e1!.id &&
    root!.position === "LEFT" &&
    (root!.status ?? "ACTIVE") === "ACTIVE" &&
    Boolean(root!.from_position_id);
  const oldRootId = already ? root!.from_position_id! : root?.id;
  const reentry = oldRootId ? liveReentryForMovement(store.payment_intents ?? [], oldRootId) : [];

  const reasons: string[] = [];
  if (already) {
    return { ok: true as const, already: true as const, root, e8e1, e727, hole, scoped, reentry, reasons };
  }
  if (!root || (root.status ?? "ACTIVE") !== "ACTIVE") reasons.push("ROOT_2575_NOT_ACTIVE");
  if (root && root.parent_id) reasons.push("2575_NOT_FOREST_ROOT");
  if (!e8e1 || e8e1.parent_id !== root?.id || e8e1.position !== "LEFT") reasons.push("E8E1_NOT_ROOT_LEFT_ACTIVE");
  if (!e727 || e727.parent_id !== root?.id || e727.position !== "RIGHT") reasons.push("E727_NOT_ROOT_RIGHT_ACTIVE");
  if (root && !cycleComplete(scoped, root.id)) reasons.push("ROOT_CYCLE_INCOMPLETE");
  if (!e8e1 || hole.parent_id !== e8e1.id || hole.position !== "LEFT") reasons.push("FIRST_EMPTY_NOT_E8E1_LEFT");
  if (e8e1LeftActive) reasons.push("E8E1_LEFT_OCCUPIED");
  if (reentry.length) reasons.push("LIVE_GLOBAL_REENTRY_EXISTS");
  return {
    ok: reasons.length === 0,
    already: false as const,
    root,
    e8e1,
    e727,
    hole,
    scoped,
    reentry,
    reasons,
  };
}

function e8e1NextHole(store: Store, e8e1Id: string) {
  const scoped = positionsForPlan(store.network_positions, PLAN);
  const hole = findFirstEmptyPlacement(scoped, E8E1);
  const parent = scoped.find((p) => p.id === hole.parent_id);
  return {
    parent_id: hole.parent_id,
    parent_user_id: parent?.user_id ?? null,
    position: hole.position,
    depth: hole.depth,
    cycleComplete: cycleComplete(scoped, e8e1Id),
  };
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

  const txBefore = fingerprintTxs(store.transactions, GENESIS_TX_IDS);
  const otherBefore = fingerprintOtherPlans(store.network_positions);
  const rwBefore = fingerprintReferralsWallets(store);
  const posCountBefore = store.network_positions.length;
  const p200Before = store.network_positions.filter((p) => p.plan_id === PLAN).length;

  const first = inspect(store);
  if (!first.ok && !first.already) {
    console.log(
      JSON.stringify(
        {
          SAFE_TO_APPLY: "NO",
          STOP: true,
          reasons: first.reasons,
          old_2575_position: first.root,
          first_empty: first.hole,
          reentry: first.reentry.map((i) => ({ id: i.id, status: i.status })),
          confirmed_txs_changed: "NO",
          other_plans_changed: "NO",
        },
        null,
        2,
      ),
    );
    return;
  }

  let wrote = false;
  let newSeat: NetworkPositionRow | null = first.already ? first.root : null;
  const oldRootId = first.already ? first.root!.from_position_id! : first.root!.id;

  if (!first.already) {
    const ended = nowIso();
    first.root!.status = "HISTORY";
    first.root!.ended_at = ended;
    const parent = first.e8e1!;
    newSeat = {
      id: newPosId(),
      user_id: MOVER,
      plan_id: PLAN,
      parent_id: parent.id,
      position: "LEFT",
      depth: parent.depth + 1,
      cycle: Math.floor((parent.depth + 1) / 2),
      status: "ACTIVE",
      started_at: ended,
      ended_at: null,
      from_position_id: first.root!.id,
      recipient_user_id: E8E1,
      recipient_wallet: walletOf(store, E8E1),
      reentry_tx_hash: null,
      funded_by_user_id: null,
    };
    store.network_positions.push(newSeat);

    const again = inspect(store);
    if (!again.already) {
      throw new Error(`post-apply inspect failed: ${again.reasons.join(",")}`);
    }

    const { error: writeErr } = await sb.from("app_state").upsert({
      id: STATE_ID,
      payload: store,
      updated_at: nowIso(),
    });
    if (writeErr) throw new Error(`Supabase write failed: ${writeErr.message}`);
    wrote = true;
  }

  const { data: afterData, error: afterErr } = await sb
    .from("app_state")
    .select("payload")
    .eq("id", STATE_ID)
    .maybeSingle();
  if (afterErr) throw afterErr;
  const after = afterData!.payload as Store;
  const p200After = after.network_positions.filter((p) => p.plan_id === PLAN).length;
  const second = inspect(after);
  const e8e1Live = occupyingPosition(after.network_positions, E8E1, PLAN)!;
  const oldRoot = after.network_positions.find((p) => p.id === oldRootId)!;
  const live2575 = occupyingPosition(after.network_positions, MOVER, PLAN)!;
  const txsChanged = fingerprintTxs(after.transactions, GENESIS_TX_IDS) !== txBefore;
  const otherChanged = fingerprintOtherPlans(after.network_positions) !== otherBefore;
  const rwChanged = fingerprintReferralsWallets(after) !== rwBefore;
  const secondWouldCreate = second.already ? 0 : 1;
  const rowsCreated = wrote ? after.network_positions.length - posCountBefore : 0;

  console.log(
    JSON.stringify(
      {
        SAFE_TO_APPLY: first.ok || first.already ? "YES" : "NO",
        applied_this_run: wrote,
        "1_SAFE_TO_APPLY": "YES",
        "2_old_2575_position": {
          id: oldRoot.id,
          user_id: oldRoot.user_id,
          plan_id: oldRoot.plan_id,
          parent_id: oldRoot.parent_id,
          position: oldRoot.position,
          depth: oldRoot.depth,
          status: oldRoot.status,
          ended_at: oldRoot.ended_at,
        },
        "3_new_parent_side": {
          parent_id: live2575.parent_id,
          parent_user_id: E8E1,
          parent_code: "GXFOUNDER",
          position: live2575.position,
        },
        "4_new_2575_ACTIVE_position_id": live2575.id,
        "5_old_ROOT_status": oldRoot.status,
        "6_e8e1_cycleComplete_after": cycleComplete(positionsForPlan(after.network_positions, PLAN), e8e1Live.id),
        "7_e8e1_next_legal_hole_read_only": e8e1NextHole(after, e8e1Live.id),
        "8_confirmed_txs_changed": txsChanged ? "YES" : "NO",
        "9_other_plans_changed": otherChanged || rwChanged ? "YES" : "NO",
        "10_second_run_creates_0_rows": second.already && secondWouldCreate === 0 ? "YES" : "NO",
        p200_seat_count_before: p200Before,
        p200_seat_count_after: p200After,
        rows_created_this_run: rowsCreated,
        genesis_tx_ids_unchanged: !txsChanged,
        e8e1_not_moved: occupyingPosition(after.network_positions, E8E1, PLAN)?.id === e8e1Live.id,
        second_inspect_already: second.already,
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
