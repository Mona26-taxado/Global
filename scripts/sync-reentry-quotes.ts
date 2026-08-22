/**
 * Generic completed-cycle re-entry quote sync. Default is dry-run (no write).
 * APPLY=1 writes pending GLOBAL_REENTRY intents only (no seats, no txs).
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { cycleComplete, findFirstEmptyPlacement } from "../network/placement";
import {
  cancelUnpaidAlreadyFundedReentryIntents,
  cycleAlreadyFunded,
  firstEmptyQuote,
  syncReentryQuotesForCompletedCycles,
} from "../services/placement-intent";
import { occupyingPosition, positionsForPlan } from "../services/users";
import type { Store } from "../lib/store";

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

function codeOf(store: Store, userId: string) {
  return store.users.find((u) => u.id === userId)?.referral_code ?? userId;
}

function walletTail(store: Store, userId: string | null) {
  if (!userId) return null;
  const addr = store.wallets.find((w) => w.user_id === userId)?.address;
  return addr ? addr.slice(-4) : null;
}

function scan(store: Store) {
  const rows: unknown[] = [];
  for (const plan of store.plans.map((p) => p.id)) {
    const scoped = positionsForPlan(store.network_positions, plan);
    for (const seat of scoped) {
      if ((seat.status ?? "ACTIVE") !== "ACTIVE") continue;
      if (!cycleComplete(scoped, seat.id)) continue;
      const occ = occupyingPosition(store.network_positions, seat.user_id, plan);
      if (!occ || occ.id !== seat.id) continue;
      const funded = cycleAlreadyFunded(store, plan, seat.id);
      const pending = (store.payment_intents ?? []).filter(
        (i) =>
          i.kind === "GLOBAL_REENTRY" &&
          i.status === "PENDING" &&
          i.plan_id === plan &&
          i.mover_user_id === seat.user_id,
      );
      if (funded) {
        rows.push({
          plan_id: plan,
          user: `${codeOf(store, seat.user_id)} / ${walletTail(store, seat.user_id)}`,
          seat_id: seat.id,
          cycle_complete: true,
          already_funded: true,
          pending_intents: pending.length,
        });
        continue;
      }
      const hole = findFirstEmptyPlacement(scoped, seat.user_id);
      const quote = firstEmptyQuote(store, plan, seat.user_id);
      rows.push({
        plan_id: plan,
        user: `${codeOf(store, seat.user_id)} / ${walletTail(store, seat.user_id)}`,
        seat_id: seat.id,
        cycle_complete: true,
        pending_intents: pending.length,
        candidate_parent: `${codeOf(store, quote.recipient_user_id ?? "")} / ${walletTail(store, quote.recipient_user_id)}`,
        candidate_parent_id: hole.parent_id,
        candidate_position: hole.position,
        recipient_wallet: quote.recipient_wallet,
      });
    }
  }
  return rows;
}

async function main() {
  loadEnv();
  const apply = process.env.APPLY === "1";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.from("app_state").select("payload").eq("id", "globalx").maybeSingle();
  if (error) throw error;
  const store = data!.payload as Store;
  if (!store.payment_intents) store.payment_intents = [];

  const before = scan(store);
  const seatCount = store.network_positions.length;
  const txCount = store.transactions.length;
  const intentCount = store.payment_intents.length;
  const cancelOnly = process.env.CANCEL_ONLY === "1";
  if (apply) {
    cancelUnpaidAlreadyFundedReentryIntents(store);
    if (!cancelOnly) syncReentryQuotesForCompletedCycles(store);
    const { error: writeErr } = await sb.from("app_state").upsert({
      id: "globalx",
      payload: store,
      updated_at: new Date().toISOString(),
    });
    if (writeErr) throw writeErr;
  }
  const after = apply ? scan(store) : before;
  console.log(
    JSON.stringify(
      {
        mutated: apply,
        cancel_only: cancelOnly,
        seats_unchanged: store.network_positions.length === seatCount,
        txs_unchanged: store.transactions.length === txCount,
        intents_before: intentCount,
        intents_after: store.payment_intents.length,
        cancelled_already_funded: store.payment_intents
          .filter((i) => i.status === "CANCELLED" && i.placement_status === "BLOCKED_ALREADY_FUNDED")
          .map((i) => ({ id: i.id, plan_id: i.plan_id, mover_user_id: i.mover_user_id, tx_hash: i.tx_hash ?? null })),
        completed_cycles: after,
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
