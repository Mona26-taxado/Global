import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePlanRecipient } from "../payments/plan-routing";
import {
  assignSponsor,
  createUser,
  currentPosition,
  reservedPosition,
  finalizeConfirmedDirect2Placement,
} from "../services/users";
import { newId, readStore, withStore } from "../lib/store";
import { activeChainId } from "../lib/network-config";

const dataFile = join(mkdtempSync(join(tmpdir(), "gx-p100-qualify-")), "globalx.json");

const ADDR: Record<string, `0x${string}`> = {
  A: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  B: "0xbbbb00000000000000000000000000000000000b",
  D: "0xdddd00000000000000000000000000000000000d",
  E: "0xeeee00000000000000000000000000000000000e",
  F: "0xffff00000000000000000000000000000000000f",
  G: "0x9999000000000000000000000000000000000009",
};

function emptyPayload() {
  return JSON.stringify({
    users: [],
    wallets: [],
    nonces: [],
    referrals: [],
    registrations: [],
    plans: [
      { id: "PLAN_100", code: "PLAN_100", name: "$100", amount_usd: 100, token: "USDT", network: "amoy", description: "", active: true, enabled: true, sort_order: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
      { id: "PLAN_200", code: "PLAN_200", name: "$200", amount_usd: 200, token: "USDT", network: "amoy", description: "", active: true, enabled: true, sort_order: 2, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
    ],
    transactions: [],
    network_positions: [],
    tokenpocket_actions: [],
    global_config: {},
  });
}

async function member(id: string, code: string, label: string) {
  await createUser({ id, display_name: label });
  await withStore((store) => {
    const row = store.users.find((u) => u.id === id)!;
    row.referral_code = code;
    store.wallets.push({
      id: newId("wal"),
      user_id: id,
      address: ADDR[label]!,
      wallet_type: "injected",
      chain_id: activeChainId(),
      verified: true,
      created_at: new Date().toISOString(),
    });
    store.registrations.push({
      id: newId("reg"),
      user_id: id,
      status: "ACTIVE",
      amount: "5000000",
      tx_hash: null,
      created_at: new Date().toISOString(),
      activated_at: new Date().toISOString(),
    });
  });
}

async function confirmPlan(userId: string, label: string, planId = "PLAN_100") {
  await withStore((store) => {
    if (store.transactions.some((t) => t.user_id === userId && t.plan_id === planId && t.status === "CONFIRMED")) return;
    const plan = store.plans.find((p) => p.id === planId)!;
    store.transactions.push({
      id: newId("tx"),
      user_id: userId,
      payer_wallet: ADDR[label]!,
      recipient_wallet: ADDR[label]!,
      amount: String(plan.amount_usd * 1_000_000),
      token: "USDT",
      token_contract: "0x0000000000000000000000000000000000000001",
      chain_id: activeChainId(),
      tx_hash: `seed_${userId}_${planId}`,
      payment_type: "PLAN_PURCHASE",
      plan_id: planId,
      plan_code: plan.code,
      status: "CONFIRMED",
      recipient_role: "COMPANY_GENESIS",
      routing_slot: null,
      created_at: new Date().toISOString(),
    });
  });
}

describe("PLAN_100 independent Global qualification", () => {
  const previousPath = process.env.GLOBALX_DATA_PATH;
  const previousRecipient = process.env.PAYMENT_RECIPIENT_ADDRESS;

  beforeEach(() => {
    process.env.GLOBALX_DATA_PATH = dataFile;
    process.env.PAYMENT_RECIPIENT_ADDRESS = ADDR.A;
    writeFileSync(dataFile, emptyPayload());
  });

  afterEach(() => {
    writeFileSync(dataFile, emptyPayload());
    if (previousPath === undefined) delete process.env.GLOBALX_DATA_PATH;
    else process.env.GLOBALX_DATA_PATH = previousPath;
    if (previousRecipient === undefined) delete process.env.PAYMENT_RECIPIENT_ADDRESS;
    else process.env.PAYMENT_RECIPIENT_ADDRESS = previousRecipient;
  });

  async function tree() {
    await member("user_b", "GXBBBBBB", "B");
    await member("user_d", "GXDDDDDD", "D");
    await member("user_e", "GXEEEEEE", "E");
    await member("user_f", "GXFFFFFF", "F");
    await member("user_g", "GXGGGGGG", "G");
    await assignSponsor("user_d", "GXBBBBBB");
    await assignSponsor("user_e", "GXBBBBBB");
    await assignSponsor("user_f", "GXDDDDDD");
    await assignSponsor("user_g", "GXDDDDDD");
  }

  it("CASE 1: missing Direct #1 PLAN_100 blocks Direct #2 prepare and creates no seat", async () => {
    await tree();
    await confirmPlan("user_d", "D");
    await expect(resolvePlanRecipient("user_g", "PLAN_100")).rejects.toMatchObject({
      code: "WAITING_FOR_DIRECT_UPGRADES",
    });
    const store = await readStore();
    expect(currentPosition(store.network_positions, "user_d", "PLAN_100")).toBeNull();
    expect(reservedPosition(store.network_positions, "user_d", "PLAN_100")).toBeNull();
    expect(store.network_positions.filter((p) => p.plan_id === "PLAN_100")).toHaveLength(0);
  });

  it("CASE 2: D+F+G PLAN_100 qualifies; prepare RESERVED then confirm ACTIVE at first-empty", async () => {
    await tree();
    await confirmPlan("user_d", "D");
    await confirmPlan("user_f", "F");
    const pay = await resolvePlanRecipient("user_g", "PLAN_100");
    expect(pay.slot).toBe(2);
    let store = await readStore();
    expect(currentPosition(store.network_positions, "user_d", "PLAN_100")).toBeNull();
    expect(reservedPosition(store.network_positions, "user_d", "PLAN_100")?.status).toBe("RESERVED");
    await confirmPlan("user_g", "G");
    await finalizeConfirmedDirect2Placement("user_g", "PLAN_100", "seed_user_g_PLAN_100");
    store = await readStore();
    const seat = currentPosition(store.network_positions, "user_d", "PLAN_100");
    expect(seat?.status ?? "ACTIVE").toBe("ACTIVE");
    expect(seat?.plan_id).toBe("PLAN_100");
  });

  it("CASE 3: B waits because E missing; D enters PLAN_100 independently through F+G", async () => {
    await tree();
    await confirmPlan("user_b", "B");
    await confirmPlan("user_d", "D");
    await confirmPlan("user_f", "F");
    expect(currentPosition((await readStore()).network_positions, "user_b", "PLAN_100")).toBeNull();
    const gPay = await resolvePlanRecipient("user_g", "PLAN_100");
    expect(gPay.slot).toBe(2);
    await confirmPlan("user_g", "G");
    await finalizeConfirmedDirect2Placement("user_g", "PLAN_100", "seed_user_g_PLAN_100");
    const store = await readStore();
    expect(currentPosition(store.network_positions, "user_d", "PLAN_100")?.plan_id).toBe("PLAN_100");
    expect(currentPosition(store.network_positions, "user_b", "PLAN_100")).toBeNull();
  });
});
