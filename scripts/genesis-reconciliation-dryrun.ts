/**
 * READ-ONLY genesis/root reconciliation audit for every plan_id.
 * Does not write app_state.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { inspectGenesisReconciliation } from "../services/genesis-reconciliation";
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

function yn(v: boolean) {
  return v ? "YES" : "NO";
}

function userLabel(store: Store, userId: string | null) {
  if (!userId) return null;
  const code = store.users.find((u) => u.id === userId)?.referral_code;
  const addr = store.wallets.find((w) => w.user_id === userId)?.address;
  const tail = addr ? addr.slice(-4) : "";
  return code ? `${code}${tail ? ` / ${tail}` : ""}` : userId;
}

async function main() {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.from("app_state").select("payload").eq("id", "globalx").maybeSingle();
  if (error) throw error;
  if (!data?.payload) throw new Error("empty app_state");
  const store = data.payload as Store;
  if (!store.payment_intents) store.payment_intents = [];

  const known = ["PLAN_100", "PLAN_200", "PLAN_500", "PLAN_1000"];
  const extra = store.plans.map((p) => p.id).filter((id) => !known.includes(id));
  const planIds = [...known, ...extra];
  const rows = planIds.map((planId) => inspectGenesisReconciliation(store, planId));

  const report = rows.map((r) => ({
        PLAN_ID: r.plan_id,
        ROOT_USER: r.root_user_code ?? r.root_user_id ?? null,
        ROOT_ACTIVE: yn(r.root_active),
        LEFT_ACTIVE: r.left_active ? userLabel(store, r.left_active.user_id) : "NO",
        RIGHT_ACTIVE: r.right_active ? userLabel(store, r.right_active.user_id) : "NO",
        CYCLE_COMPLETE: yn(r.cycle_complete),
        CURRENT_LEGAL_FIRST_EMPTY: r.current_legal_first_empty
          ? {
              parent: userLabel(store, r.current_legal_first_empty.parent_user_id),
              parent_id: r.current_legal_first_empty.parent_id,
              position: r.current_legal_first_empty.position,
              depth: r.current_legal_first_empty.depth,
            }
          : null,
    VALID_GLOBAL_REENTRY_EXISTS: yn(r.valid_global_reentry_exists),
    SAFE_FOR_GENESIS_RECONCILIATION: yn(r.safe_for_genesis_reconciliation),
    already_reconciled: r.already_reconciled,
    reasons: r.reasons,
    genesis: r.genesis_code,
  }));

  console.log(
    JSON.stringify(
      {
        mutated: false,
        genesis: { user_id: rows[0]?.genesis_user_id, code: rows[0]?.genesis_code },
        plans: report,
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
