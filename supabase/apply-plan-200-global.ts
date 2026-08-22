import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { readStore, withStore } from "@/lib/store";
import { applyPlanGlobalBackfill, auditPlanGlobalBackfill } from "@/lib/plan-global-reconcile";
import { occupyingPosition, positionsForPlan } from "@/services/users";

function loadEnv() {
  const p = join(process.cwd(), ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (k && process.env[k] === undefined) process.env[k] = v.replace(/^["']|["']$/g, "");
  }
}

loadEnv();

function code(store: Awaited<ReturnType<typeof readStore>>, userId: string) {
  return store.users.find((u) => u.id === userId)?.referral_code ?? userId;
}

async function main() {
  const before = await readStore();
  const pre = auditPlanGlobalBackfill(before, "PLAN_200");
  if (pre.qualified_missing_seats.length !== 1) {
    throw new Error(`Expected 1 missing PLAN_200 seat, got ${pre.qualified_missing_seats.length}`);
  }
  const target = pre.qualified_missing_seats[0]!;
  if (target.user.referral_code !== "GXHRCA9U") {
    throw new Error(`Expected GXHRCA9U, got ${target.user.referral_code}`);
  }
  if (target.first_empty?.parent_referral_code !== "GXGLOBAL" || target.first_empty.position !== "RIGHT") {
    throw new Error("First-empty is no longer GXGLOBAL.RIGHT — aborting");
  }

  const created = await withStore((store) => applyPlanGlobalBackfill(store, "PLAN_200"));
  const after = await readStore();
  const scoped = positionsForPlan(after.network_positions, "PLAN_200");
  const live = scoped
    .filter((p) => (p.status ?? "ACTIVE") === "ACTIVE" || p.status === "RESERVED")
    .map((p) => ({
      id: p.id,
      code: code(after, p.user_id),
      status: p.status ?? "ACTIVE",
      position: p.position,
      parent: p.parent_id ? code(after, scoped.find((x) => x.id === p.parent_id)?.user_id ?? "") : null,
      from: p.from_position_id ?? null,
    }));

  const again = await withStore((store) => applyPlanGlobalBackfill(store, "PLAN_200"));
  const postAudit = auditPlanGlobalBackfill(await readStore(), "PLAN_200");

  console.log(
    JSON.stringify(
      {
        created: created.map((p) => ({
          id: p.id,
          user_id: p.user_id,
          status: p.status,
          position: p.position,
          parent_id: p.parent_id,
          plan_id: p.plan_id,
        })),
        live_plan_200: live,
        second_apply_created: again.length,
        missing_after: postAudit.qualified_missing_seats.length,
        already_seated: postAudit.qualified_already_seated,
        tx_count_before: before.transactions.length,
        tx_count_after: after.transactions.length,
        hrca9u: occupyingPosition(after.network_positions, target.user.user_id, "PLAN_200"),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
