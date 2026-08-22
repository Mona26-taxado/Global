import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePlanRecipient, resolveReentryPayment } from "../payments/plan-routing";
import { listUserPlans } from "../payments/service";
import {
  assignSponsor,
  createUser,
  currentPosition,
  placeUser,
  qualifyForReentry,
  reservedPosition,
  finalizeConfirmedDirect2Placement,
} from "../services/users";
import { newId, readStore, withStore } from "../lib/store";
import { isPlanUnlocked } from "../lib/plan-progress";
import { activeChainId } from "../lib/network-config";

const dataFile = join(mkdtempSync(join(tmpdir(), "gx-plan-trees-")), "globalx.json");

const ADDR: Record<string, `0x${string}`> = {
  X: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  Y: "0xcccccccccccccccccccccccccccccccccccccccc",
  Z: "0xdddddddddddddddddddddddddddddddddddddddd",
  A: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  L: "0x1111111111111111111111111111111111111111",
  R: "0x2222222222222222222222222222222222222222",
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
      { id: "P1", code: "P1", name: "P1", amount_usd: 100, token: "USDT", network: "amoy", description: "", active: true, enabled: true, sort_order: 1, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
      { id: "P2", code: "P2", name: "P2", amount_usd: 200, token: "USDT", network: "amoy", description: "", active: true, enabled: true, sort_order: 2, created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z" },
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
    if (!store.wallets.some((w) => w.user_id === id)) {
      store.wallets.push({
        id: newId("wal"),
        user_id: id,
        address: ADDR[label]!,
        wallet_type: "injected",
        chain_id: activeChainId(),
        verified: true,
        created_at: new Date().toISOString(),
      });
    }
    if (!store.registrations.some((r) => r.user_id === id)) {
      store.registrations.push({
        id: newId("reg"),
        user_id: id,
        status: "ACTIVE",
        amount: "5000000",
        tx_hash: null,
        created_at: new Date().toISOString(),
        activated_at: new Date().toISOString(),
      });
    }
  });
}

async function confirmPlan(userId: string, label: string, planId: string) {
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

describe("plan-scoped Global trees", () => {
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

  it("keeps P1 Global when P2 membership waits for the same directs", async () => {
    await member("user_x", "GXXXXXXX", "X");
    await member("user_y", "GYYYYYYY", "Y");
    await member("user_z", "GZZZZZZZ", "Z");
    await confirmPlan("user_x", "X", "P1");
    await assignSponsor("user_y", "GXXXXXXX");
    await confirmPlan("user_y", "Y", "P1");
    await assignSponsor("user_z", "GXXXXXXX");
    const zPay = await resolvePlanRecipient("user_z", "P1");
    expect(zPay.slot).toBe(2);
    await confirmPlan("user_z", "Z", "P1");
    await finalizeConfirmedDirect2Placement("user_z", "P1", "seed_user_z_P1");

    let store = await readStore();
    const p1Before = currentPosition(store.network_positions, "user_x", "P1");
    expect(p1Before).toBeTruthy();
    expect(p1Before?.plan_id).toBe("P1");

    await confirmPlan("user_x", "X", "P2");
    const views = await listUserPlans("user_x");
    const p2 = views.find((p) => p.id === "P2");
    expect(p2?.status).toBe("ACTIVE");
    expect(p2?.global_status).toBe("ACTIVE_WAITING_FOR_DIRECTS");
    store = await readStore();
    expect(currentPosition(store.network_positions, "user_x", "P2")).toBeNull();
    expect(currentPosition(store.network_positions, "user_x", "P1")?.id).toBe(p1Before?.id);

    await confirmPlan("user_y", "Y", "P2");
    expect((await listUserPlans("user_x")).find((p) => p.id === "P2")?.global_status).toBe("ACTIVE_WAITING_FOR_DIRECTS");

    const ePay = await resolvePlanRecipient("user_z", "P2");
    expect(ePay.slot).toBe(2);
    expect(ePay.globalParentUserId).toBeTruthy();
    await confirmPlan("user_z", "Z", "P2");
    await finalizeConfirmedDirect2Placement("user_z", "P2", "seed_user_z_P2");
    store = await readStore();
    const p2Pos = currentPosition(store.network_positions, "user_x", "P2");
    expect(p2Pos).toBeTruthy();
    expect(p2Pos?.plan_id).toBe("P2");
    expect(currentPosition(store.network_positions, "user_x", "P1")?.id).toBe(p1Before?.id);
    expect(p2Pos?.id).not.toBe(p1Before?.id);
  });

  it("uses each plan amount for re-entry and does not mix trees", async () => {
    await member("user_x", "GXXXXXXX", "X");
    await member("user_l", "GXLLLLLL", "L");
    await member("user_r", "GXRRRRRR", "R");
    await confirmPlan("user_x", "X", "P1");
    await confirmPlan("user_x", "X", "P2");
    await placeUser("user_x", "P1");
    await placeUser("user_x", "P2");
    await withStore((store) => {
      for (const planId of ["P1", "P2"] as const) {
        const parent = currentPosition(store.network_positions, "user_x", planId)!;
        store.network_positions.push({
          id: `pos_${planId}_L`,
          user_id: "user_l",
          plan_id: planId,
          parent_id: parent.id,
          position: "LEFT",
          depth: parent.depth + 1,
          cycle: 0,
          status: "ACTIVE",
          started_at: new Date().toISOString(),
          ended_at: null,
        });
        store.network_positions.push({
          id: `pos_${planId}_R`,
          user_id: "user_r",
          plan_id: planId,
          parent_id: parent.id,
          position: "RIGHT",
          depth: parent.depth + 1,
          cycle: 0,
          status: "ACTIVE",
          started_at: new Date().toISOString(),
          ended_at: null,
        });
      }
    });
    const r1 = await qualifyForReentry("user_x", "P1");
    const pay1 = await resolveReentryPayment("user_x", "P1");
    expect(pay1.amountUsd).toBe(100);
    expect(r1?.plan_id).toBe("P1");
    const r2 = await qualifyForReentry("user_x", "P2");
    const pay2 = await resolveReentryPayment("user_x", "P2");
    expect(pay2.amountUsd).toBe(200);
    expect(r2?.plan_id).toBe("P2");
    expect(r1?.id).not.toBe(r2?.id);
    const store = await readStore();
    expect(reservedPosition(store.network_positions, "user_x", "P1")?.id).toBe(r1?.id);
    expect(reservedPosition(store.network_positions, "user_x", "P2")?.id).toBe(r2?.id);
    expect(currentPosition(store.network_positions, "user_x", "P1")?.status ?? "ACTIVE").toBe("ACTIVE");
    expect(currentPosition(store.network_positions, "user_x", "P2")?.status ?? "ACTIVE").toBe("ACTIVE");
  });

  it("places P2 and a future plan on their own trees, ignoring P1 seats", async () => {
    await member("user_a", "GXAAAAAA", "A");
    await member("user_x", "GXXXXXXX", "X");
    await member("user_y", "GYYYYYYY", "Y");
    await member("user_z", "GZZZZZZZ", "Z");
    await confirmPlan("user_a", "A", "P1");
    await confirmPlan("user_x", "X", "P1");
    await confirmPlan("user_y", "Y", "P1");
    await confirmPlan("user_z", "Z", "P1");
    const p1A = await placeUser("user_a", "P1");
    const p1X = await placeUser("user_x", "P1");
    const p1Y = await placeUser("user_y", "P1");
    const p1Z = await placeUser("user_z", "P1");
    expect(p1X.parent_id).toBe(p1A.id);
    expect(p1Y.parent_id).toBe(p1A.id);
    expect(p1Y.position).toBe("RIGHT");
    expect(p1Z.parent_id).toBe(p1X.id);

    await confirmPlan("user_a", "A", "P2");
    await confirmPlan("user_x", "X", "P2");
    await confirmPlan("user_y", "Y", "P2");
    const p2A = await placeUser("user_a", "P2");
    const p2X = await placeUser("user_x", "P2");
    const p2Y = await placeUser("user_y", "P2");
    expect(p2A.id).not.toBe(p1A.id);
    expect(p2X.parent_id).toBe(p2A.id);
    expect(p2X.position).toBe("LEFT");
    expect(p2Y.parent_id).toBe(p2A.id);
    expect(p2Y.position).toBe("RIGHT");

    await withStore((store) => {
      store.plans.push({
        id: "P3",
        code: "P3",
        name: "P3",
        amount_usd: 500,
        token: "USDT",
        network: "amoy",
        description: "",
        active: true,
        enabled: true,
        sort_order: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });
    await confirmPlan("user_a", "A", "P3");
    await confirmPlan("user_x", "X", "P3");
    const p3A = await placeUser("user_a", "P3");
    const p3X = await placeUser("user_x", "P3");
    expect(p3A.plan_id).toBe("P3");
    expect(p3X.plan_id).toBe("P3");
    expect(p3X.parent_id).toBe(p3A.id);
    expect(p3X.position).toBe("LEFT");
    const store = await readStore();
    expect(currentPosition(store.network_positions, "user_z", "P1")?.id).toBe(p1Z.id);
    expect(currentPosition(store.network_positions, "user_z", "P2")).toBeNull();
  });

  it("unlocks a future admin plan with the same ordering engine", async () => {
    await member("user_x", "GXXXXXXX", "X");
    await confirmPlan("user_x", "X", "P1");
    await confirmPlan("user_x", "X", "P2");
    await withStore((store) => {
      store.plans.push({
        id: "P3",
        code: "P3",
        name: "P3",
        amount_usd: 500,
        token: "USDT",
        network: "amoy",
        description: "",
        active: true,
        enabled: true,
        sort_order: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });
    const store = await readStore();
    expect(isPlanUnlocked(store.plans, store.transactions, "user_x", "P3")).toBe(true);
    const views = await listUserPlans("user_x");
    expect(views.find((p) => p.id === "P3")?.status).toBe("AVAILABLE");
    expect(views.find((p) => p.id === "P3")?.global_status).toBe("AVAILABLE");
  });

  it("B waits because E missing P2, while D independently qualifies through F+G and enters P2 Global", async () => {
    await member("user_b", "GXBBBBBB", "B");
    await member("user_d", "GXDDDDDD", "D");
    await member("user_e", "GXEEEEEE", "E");
    await member("user_f", "GXFFFFFF", "F");
    await member("user_g", "GXGGGGGG", "G");
    for (const [id, label] of [
      ["user_b", "B"],
      ["user_d", "D"],
      ["user_e", "E"],
      ["user_f", "F"],
      ["user_g", "G"],
    ] as const) {
      await confirmPlan(id, label, "P1");
    }
    await assignSponsor("user_d", "GXBBBBBB");
    await assignSponsor("user_e", "GXBBBBBB");
    await assignSponsor("user_f", "GXDDDDDD");
    await assignSponsor("user_g", "GXDDDDDD");
    await confirmPlan("user_b", "B", "P2");
    await confirmPlan("user_d", "D", "P2");
    await confirmPlan("user_f", "F", "P2");

    expect((await listUserPlans("user_b")).find((p) => p.id === "P2")?.global_status).toBe("ACTIVE_WAITING_FOR_DIRECTS");
    expect(currentPosition((await readStore()).network_positions, "user_b", "P2")).toBeNull();

    const gPay = await resolvePlanRecipient("user_g", "P2");
    expect(gPay.slot).toBe(2);
    await confirmPlan("user_g", "G", "P2");
    await finalizeConfirmedDirect2Placement("user_g", "P2", "seed_user_g_P2");

    const store = await readStore();
    expect(currentPosition(store.network_positions, "user_d", "P2")?.plan_id).toBe("P2");
    expect(currentPosition(store.network_positions, "user_b", "P2")).toBeNull();
    expect((await listUserPlans("user_b")).find((p) => p.id === "P2")?.global_status).toBe("ACTIVE_WAITING_FOR_DIRECTS");
    expect((await listUserPlans("user_d")).find((p) => p.id === "P2")?.global_status).toBe("GLOBAL_ACTIVE");
  });
});
