/**
 * Inspect (default) or APPLY=1 a generic already-funded cycle move to the current first-empty.
 * No plan/user hardcoding. Does not rewrite confirmed txs.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { Store } from "../lib/store";
import {
  applyLegacyFundedMovement,
  inspectLegacyFundedMovement,
} from "../services/legacy-funded-movement";

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

async function main() {
  loadEnv();
  const planId = process.env.PLAN_ID;
  const fromId = process.env.FROM_POSITION_ID;
  if (!planId || !fromId) throw new Error("PLAN_ID and FROM_POSITION_ID required");
  const apply = process.env.APPLY === "1";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.from("app_state").select("payload").eq("id", "globalx").maybeSingle();
  if (error) throw error;
  const store = data!.payload as Store;
  const txBefore = JSON.stringify(store.transactions);
  const before = inspectLegacyFundedMovement(store, planId, fromId);
  let placed = null;
  if (apply) {
    if (!before.safe_to_finalize_without_new_payment) {
      console.log(JSON.stringify({ apply: false, blocked: true, before }, null, 2));
      process.exit(1);
    }
    placed = applyLegacyFundedMovement(store, planId, fromId, {
      parent_id: before.current_legal_first_empty!.parent_id,
      position: before.current_legal_first_empty!.position,
    });
    if (JSON.stringify(store.transactions) !== txBefore) throw new Error("CONFIRMED_TX_MUTATED");
    const { error: writeErr } = await sb.from("app_state").upsert({
      id: "globalx",
      payload: store,
      updated_at: new Date().toISOString(),
    });
    if (writeErr) throw writeErr;
  }
  const after = inspectLegacyFundedMovement(store, planId, fromId);
  console.log(
    JSON.stringify(
      {
        apply,
        txs_unchanged: JSON.stringify(store.transactions) === txBefore,
        before,
        placed: placed
          ? { id: placed.id, parent_id: placed.parent_id, position: placed.position, status: placed.status, source: placed.source }
          : null,
        after,
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
