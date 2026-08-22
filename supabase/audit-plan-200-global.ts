import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { readStore } from "@/lib/store";
import { auditPlanGlobalBackfill } from "@/lib/plan-global-reconcile";

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

async function main() {
  const store = await readStore();
  const audit = auditPlanGlobalBackfill(store, "PLAN_200");
  console.log(JSON.stringify(audit, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
