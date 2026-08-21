import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readStore } from "../lib/store";
import { ensureDemoNetwork } from "../supabase/seed";
import { basePlan } from "../lib/plan-progress";

const dataFile = join(mkdtempSync(join(tmpdir(), "gx-store-plan-")), "globalx.json");

describe("store plan_id migration and base-plan seed", () => {
  const previousPath = process.env.GLOBALX_DATA_PATH;

  beforeEach(() => {
    process.env.GLOBALX_DATA_PATH = dataFile;
  });

  afterEach(() => {
    if (previousPath === undefined) delete process.env.GLOBALX_DATA_PATH;
    else process.env.GLOBALX_DATA_PATH = previousPath;
  });

  it("assigns missing network_positions.plan_id to the base plan and does not drop rows", async () => {
    writeFileSync(
      dataFile,
      JSON.stringify({
        users: [{ id: "u1", referral_code: "GXAAAAAA", sponsor_id: null, is_demo: false, display_name: "A", created_at: "2026-01-01T00:00:00.000Z" }],
        wallets: [],
        nonces: [],
        referrals: [],
        registrations: [],
        plans: [
          { id: "PLAN_100", code: "PLAN_100", name: "$100", amount_usd: 100, token: "USDT", network: "amoy", description: "", active: true, enabled: true, sort_order: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
          { id: "PLAN_200", code: "PLAN_200", name: "$200", amount_usd: 200, token: "USDT", network: "amoy", description: "", active: true, enabled: true, sort_order: 2, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
        ],
        transactions: [{ id: "tx1", user_id: "u1", payer_wallet: "0x1", recipient_wallet: "0x2", amount: "1", token: "USDT", token_contract: "0x3", chain_id: 80002, tx_hash: "0xabc", payment_type: "PLAN_PURCHASE", plan_code: "PLAN_100", status: "CONFIRMED", created_at: "2026-01-01T00:00:00.000Z" }],
        network_positions: [{ id: "pos1", user_id: "u1", parent_id: null, position: null, depth: 0, cycle: 0 }],
        tokenpocket_actions: [],
        global_config: {},
      }),
    );
    const store = await readStore();
    expect(store.network_positions).toHaveLength(1);
    expect(store.network_positions[0]?.plan_id).toBe("PLAN_100");
    expect(store.transactions[0]?.plan_id).toBe("PLAN_100");
    expect(store.plans.every((p) => typeof p.sort_order === "number")).toBe(true);
  });

  it("seeds demo seats on the base plan_id only", async () => {
    writeFileSync(
      dataFile,
      JSON.stringify({
        users: [],
        wallets: [],
        nonces: [],
        referrals: [],
        registrations: [],
        plans: [],
        transactions: [],
        network_positions: [],
        tokenpocket_actions: [],
        global_config: {},
      }),
    );
    await ensureDemoNetwork(2);
    const store = await readStore();
    const base = basePlan(store.plans)!;
    expect(store.users.filter((u) => u.is_demo)).toHaveLength(2);
    expect(store.network_positions.length).toBeGreaterThan(0);
    expect(store.network_positions.every((p) => p.plan_id === base.id)).toBe(true);
    expect(store.network_positions.some((p) => p.plan_id !== base.id)).toBe(false);
  });
});
