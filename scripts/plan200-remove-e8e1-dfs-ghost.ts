/**
 * ONE-TIME: remove the mistaken DFS HISTORY e8e1 seat from under PLAN_200 2575.LEFT.
 * Does not rewrite confirmed txs. Does not move the live e8e1 ACTIVE under e727.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { Store } from "../lib/store";
import { findFirstEmptyPlacement, isActiveNode } from "../network/placement";
import { occupyingPosition, positionsForPlan } from "../services/users";

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
const TARGET = "pos_b178347926197cb7";
const FALLBACK_FROM = "pos_6e85f6797c2c4677";
const STATE_ID = "globalx";

function nowIso() {
  return new Date().toISOString();
}

function fp(x: unknown) {
  return JSON.stringify(x);
}

async function main() {
  loadEnv();
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.from("app_state").select("payload").eq("id", STATE_ID).maybeSingle();
  if (error) throw error;
  const store = data!.payload as Store;
  const txBefore = fp(store.transactions);
  const rwBefore = fp({ referrals: store.referrals, wallets: store.wallets });
  const otherBefore = fp(
    store.network_positions
      .filter((p) => p.plan_id !== PLAN)
      .map((p) => p.id)
      .sort(),
  );

  const scoped = positionsForPlan(store.network_positions, PLAN);
  const e8e1 = occupyingPosition(store.network_positions, E8E1, PLAN);
  const e727 = occupyingPosition(store.network_positions, E727, PLAN);
  const n2575 = occupyingPosition(store.network_positions, U2575, PLAN);
  const ghost = store.network_positions.find((p) => p.id === TARGET) ?? null;
  const alreadyGone = !ghost;

  const reasons: string[] = [];
  if (!alreadyGone) {
    if (ghost.plan_id !== PLAN) reasons.push("PLAN_MISMATCH");
    if (ghost.user_id !== E8E1) reasons.push("NOT_E8E1");
    if ((ghost.status ?? "ACTIVE") !== "HISTORY") reasons.push("NOT_HISTORY");
    if (!n2575 || ghost.parent_id !== n2575.id || ghost.position !== "LEFT") reasons.push("NOT_UNDER_2575_LEFT");
    if (store.network_positions.some((p) => p.parent_id === TARGET && isActiveNode(p))) reasons.push("HAS_ACTIVE_CHILDREN");
    if ((store.transactions ?? []).some((t) => t.status === "CONFIRMED" && t.position_id === TARGET)) {
      reasons.push("CONFIRMED_TX_POINTS_AT_SEAT");
    }
    if ((store.payment_intents ?? []).some((i) =>
      i.candidate_parent_position_id === TARGET ||
      i.movement_from_position_id === TARGET ||
      i.movement_parent_position_id === TARGET
    )) {
      reasons.push("INTENT_POINTS_AT_SEAT");
    }
    if (
      !e8e1 ||
      e8e1.parent_id !== e727?.id ||
      e8e1.position !== "LEFT" ||
      !isActiveNode(e8e1)
    ) {
      reasons.push("LIVE_E8E1_NOT_AT_E727_LEFT");
    }
    const hole = findFirstEmptyPlacement(scoped, E8E1);
    if (hole.parent_id !== e727?.id || hole.position !== "RIGHT") reasons.push("HOLE_NOT_E727_RIGHT");
  }

  if (reasons.length) {
    console.log(JSON.stringify({ SAFE: "NO", reasons, ghost }, null, 2));
    return;
  }

  let wrote = false;
  if (!alreadyGone) {
    const nextFrom = ghost!.from_position_id && ghost!.from_position_id !== TARGET ? ghost!.from_position_id : FALLBACK_FROM;
    for (const p of store.network_positions) {
      if (p.from_position_id === TARGET) p.from_position_id = nextFrom;
    }
    store.network_positions = store.network_positions.filter((p) => p.id !== TARGET);
    if (fp(store.transactions) !== txBefore) throw new Error("TX_MUTATED");
    if (fp({ referrals: store.referrals, wallets: store.wallets }) !== rwBefore) throw new Error("RW_MUTATED");
    const { error: writeErr } = await sb.from("app_state").upsert({
      id: STATE_ID,
      payload: store,
      updated_at: nowIso(),
    });
    if (writeErr) throw new Error(writeErr.message);
    wrote = true;
  }

  const { data: afterData, error: afterErr } = await sb.from("app_state").select("payload").eq("id", STATE_ID).maybeSingle();
  if (afterErr) throw afterErr;
  const after = afterData!.payload as Store;
  const afterScoped = positionsForPlan(after.network_positions, PLAN);
  const live = occupyingPosition(after.network_positions, E8E1, PLAN)!;
  const parent2575 = occupyingPosition(after.network_positions, U2575, PLAN)!;
  const stillUnder = afterScoped.filter(
    (p) => p.parent_id === parent2575.id && p.position === "LEFT" && p.user_id === E8E1,
  );
  const hole = findFirstEmptyPlacement(afterScoped, E8E1);
  const e727Live = occupyingPosition(after.network_positions, E727, PLAN)!;

  console.log(
    JSON.stringify(
      {
        SAFE: "YES",
        applied_this_run: wrote,
        removed_id: TARGET,
        still_under_2575_left: stillUnder.map((p) => ({ id: p.id, status: p.status })),
        live_e8e1: { id: live.id, parent_id: live.parent_id, position: live.position, from_position_id: live.from_position_id },
        next_hole: { parent_id: hole.parent_id, is_e727: hole.parent_id === e727Live.id, side: hole.position },
        confirmed_txs_changed: fp(after.transactions) !== txBefore ? "YES" : "NO",
        referrals_wallets_changed: fp({ referrals: after.referrals, wallets: after.wallets }) !== rwBefore ? "YES" : "NO",
        other_plans_changed: fp(after.network_positions.filter((p) => p.plan_id !== PLAN).map((p) => p.id).sort()) !== otherBefore ? "YES" : "NO",
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
