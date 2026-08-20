import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { readStore } from "@/lib/store";
import { retryPendingRegistration } from "@/payments/service";

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

loadEnv();

async function main() {
  const userId = process.argv[2];
  const store = await readStore();
  const pending = store.registrations.filter((r) => r.status === "PENDING" && r.tx_hash);
  const targets = userId ? pending.filter((r) => r.user_id === userId) : pending;
  if (!targets.length) {
    console.log("No pending registrations with a tx hash.");
    return;
  }
  for (const row of targets) {
    try {
      const result = await retryPendingRegistration(row.user_id);
      console.log(row.user_id, result.registration?.status, row.tx_hash);
    } catch (e) {
      console.error(row.user_id, e instanceof Error ? e.message : e);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

