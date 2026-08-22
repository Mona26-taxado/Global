import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePlanRecipient } from "../payments/plan-routing";
import { listUserPlans } from "../payments/service";
import {
  activateReservedReentry,
  assignSponsor,
  createUser,
  currentPosition,
  finalizeConfirmedDirect2Placement,
  placeUser,
  reservedPosition,
  voidUnpaidDirect2Provision,
} from "../services/users";
import { newId, readStore, withStore } from "../lib/store";
import { activeChainId } from "../lib/network-config";
const dataFile = join(mkdtempSync(join(tmpdir(), "gx-d2-")), "globalx.json");

const ADDR: Record<string, `0x${string}`> = {
  ROOT: "0x4c914838613a605b1ef256816c1ac8912c172575",
  E8E1: "0xd77ec55eb56ace50456515f018b82a6de187e8e1",
  RIGHT: "0xc7e6000000000000000000000000000000000001",
  PAYER: "0xbd7509eb24b4f33e3da1310fd9bd3e44f9b23026",
  A: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  B: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  C: "0xcccccccccccccccccccccccccccccccccccccccc",
  D: "0xdddddddddddddddddddddddddddddddddddddddd",
};

function emptyPayload(extraPlans: object[] = []) {
  return JSON.stringify({
    users: [],
    wallets: [],
    nonces: [],
    referrals: [],
    registrations: [],
    plans: [
      {
        id: "PLAN_100",
        code: "PLAN_100",
        name: "$100 PLAN",
        amount_usd: 100,
        token: "USDT",
        network: "amoy",
        description: "",
        active: true,
        enabled: true,
        sort_order: 1,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "PLAN_200",
        code: "PLAN_200",
        name: "$200 PLAN",
        amount_usd: 200,
        token: "USDT",
        network: "amoy",
        description: "",
        active: true,
        enabled: true,
        sort_order: 2,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "PLAN_500",
        code: "PLAN_500",
        name: "$500 PLAN",
        amount_usd: 500,
        token: "USDT",
        network: "amoy",
        description: "",
        active: true,
        enabled: true,
        sort_order: 3,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "PLAN_1000",
        code: "PLAN_1000",
        name: "$1000 PLAN",
        amount_usd: 1000,
        token: "USDT",
        network: "amoy",
        description: "",
        active: true,
        enabled: true,
        sort_order: 4,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      ...extraPlans,
    ],
    transactions: [],
    network_positions: [],
    tokenpocket_actions: [],
    global_config: {},
  });
}

async function member(id: string, code: string, address: string) {
  await createUser({ id, display_name: id });
  await withStore((store) => {
    const row = store.users.find((u) => u.id === id)!;
    row.referral_code = code;
    store.wallets.push({
      id: newId("wal"),
      user_id: id,
      address,
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
      tx_hash: `0xreg_${id}`,
      created_at: new Date().toISOString(),
      activated_at: new Date().toISOString(),
    });
  });
}

async function confirmPlan(userId: string, address: string, planId = "PLAN_100") {
  await withStore((store) => {
    store.transactions.push({
      id: newId("tx"),
      user_id: userId,
      payer_wallet: address,
      recipient_wallet: address,
      amount: "100000000",
      token: "USDT",
      token_contract: "0x0000000000000000000000000000000000000001",
      chain_id: activeChainId(),
      tx_hash: `seed_${userId}_${planId}`,
      payment_type: "PLAN_PURCHASE",
      plan_id: planId,
      plan_code: planId,
      status: "CONFIRMED",
      recipient_role: "SPONSOR",
      routing_slot: 1,
      created_at: new Date().toISOString(),
    });
  });
}

describe("Direct #2 funds Global movement before recipient snapshot", () => {
  const previousPath = process.env.GLOBALX_DATA_PATH;

  beforeEach(() => {
    process.env.GLOBALX_DATA_PATH = dataFile;
    writeFileSync(dataFile, emptyPayload());
  });

  afterEach(() => {
    writeFileSync(dataFile, emptyPayload());
    if (previousPath === undefined) delete process.env.GLOBALX_DATA_PATH;
    else process.env.GLOBALX_DATA_PATH = previousPath;
  });

  it("1. $5 registration creates no Global position", async () => {
    await member("user_new", "GXNEWUSR", ADDR.PAYER);
    const store = await readStore();
    expect(store.registrations.find((r) => r.user_id === "user_new")?.status).toBe("ACTIVE");
    expect(store.network_positions.filter((p) => p.user_id === "user_new")).toHaveLength(0);
  });

  it("2. Direct #1 still pays the sponsor wallet and does not place Global", async () => {
    await member("user_s", "GXSPONSOR", ADDR.A);
    await member("user_d1", "GXDIRECT1", ADDR.B);
    await assignSponsor("user_d1", "GXSPONSOR");
    for (const plan of ["PLAN_100", "PLAN_200", "PLAN_500", "PLAN_1000"] as const) {
      await confirmPlan("user_s", ADDR.A, plan);
      const pay = await resolvePlanRecipient("user_d1", plan);
      expect(pay.slot).toBe(1);
      expect(pay.recipientRole).toBe("SPONSOR");
      expect(pay.recipientUserId).toBe("user_s");
      expect(pay.positionId).toBeUndefined();
      expect(currentPosition((await readStore()).network_positions, "user_s", plan)).toBeNull();
      expect(reservedPosition((await readStore()).network_positions, "user_s", plan)).toBeNull();
      await confirmPlan("user_d1", ADDR.B, plan);
    }
  });

  it("3–7. Direct #2 that completes a cycle reserves first, pays the new parent, no extra re-entry, fail/retry/success", async () => {
    await member("user_root", "GXROOTAA", ADDR.ROOT);
    await member("user_e8e1", "GXE8E1AA", ADDR.E8E1);
    await member("user_right", "GXRIGHTA", ADDR.RIGHT);
    await member("user_right_d1", "GXRD1AAA", ADDR.C);
    await member("user_payer", "GXPAYER1", ADDR.PAYER);
    await confirmPlan("user_root", ADDR.ROOT);
    await confirmPlan("user_e8e1", ADDR.E8E1);
    await confirmPlan("user_right", ADDR.RIGHT);
    await placeUser("user_root", "PLAN_100", { allowUnpaidInsert: true });
    await placeUser("user_e8e1", "PLAN_100", { allowUnpaidInsert: true });

    await assignSponsor("user_right_d1", "GXRIGHTA");
    await assignSponsor("user_payer", "GXRIGHTA");
    await confirmPlan("user_right_d1", ADDR.C);

    let store = await readStore();
    const beforeRoot = currentPosition(store.network_positions, "user_root", "PLAN_100");
    expect(beforeRoot?.parent_id).toBeNull();
    expect(currentPosition(store.network_positions, "user_e8e1", "PLAN_100")?.position).toBe("LEFT");
    expect(currentPosition(store.network_positions, "user_right", "PLAN_100")).toBeNull();
    expect(reservedPosition(store.network_positions, "user_root", "PLAN_100")).toBeNull();

    const pay = await resolvePlanRecipient("user_payer", "PLAN_100");
    expect(pay.slot).toBe(2);
    expect(pay.recipientUserId).toBe("user_e8e1");
    expect(pay.recipient.toLowerCase()).toBe(ADDR.E8E1);

    store = await readStore();
    expect(currentPosition(store.network_positions, "user_right", "PLAN_100")).toBeNull();
    expect(reservedPosition(store.network_positions, "user_right", "PLAN_100")).toBeNull();
    expect(reservedPosition(store.network_positions, "user_root", "PLAN_100")).toBeNull();
    expect(store.payment_intents.some((i) => i.kind === "DIRECT2_PLACEMENT" && i.status === "PENDING")).toBe(true);

    const views = await listUserPlans("user_root");
    expect(views.find((p) => p.id === "PLAN_100")?.global_status).not.toBe("REENTRY_PAYMENT_REQUIRED");

    const retry = await resolvePlanRecipient("user_payer", "PLAN_100");
    expect(retry.recipient.toLowerCase()).toBe(pay.recipient.toLowerCase());

    await finalizeConfirmedDirect2Placement("user_payer", "PLAN_100", "0xdirect2verify");
    store = await readStore();
    expect(currentPosition(store.network_positions, "user_right", "PLAN_100")?.status ?? "ACTIVE").toBe("ACTIVE");
    expect(currentPosition(store.network_positions, "user_root", "PLAN_100")?.parent_id).toBeNull();
    expect(currentPosition(store.network_positions, "user_right", "PLAN_100")?.parent_id).toBe(
      currentPosition(store.network_positions, "user_e8e1", "PLAN_100")?.id,
    );
  });

  it("8–9. first-empty ROOT leg-first; ACTIVE occupies; HISTORY does not", async () => {
    await member("user_a", "GXAAAAAA", ADDR.A);
    await member("user_b", "GXBBBBBB", ADDR.B);
    await member("user_c", "GXCCCCCC", ADDR.C);
    await member("user_d", "GXDDDDDD", ADDR.D);
    await confirmPlan("user_a", ADDR.A);
    await confirmPlan("user_b", ADDR.B);
    await confirmPlan("user_c", ADDR.C);
    await confirmPlan("user_d", ADDR.D);
    const a = await placeUser("user_a", "PLAN_100", { allowUnpaidInsert: true });
    const b = await placeUser("user_b", "PLAN_100", { allowUnpaidInsert: true });
    const c = await placeUser("user_c", "PLAN_100", { allowUnpaidInsert: true });
    expect(b.parent_id).toBe(a.id);
    expect(b.position).toBe("LEFT");
    expect(c.parent_id).toBe(b.id);
    expect(c.position).toBe("LEFT");
    expect(reservedPosition((await readStore()).network_positions, "user_a", "PLAN_100")).toBeNull();
    const d = await placeUser("user_d", "PLAN_100", { allowUnpaidInsert: true });
    expect(d.parent_id).toBe(b.id);
    expect(d.position).toBe("RIGHT");
    await withStore((store) => {
      const hist = store.network_positions.find((p) => p.id === a.id)!;
      hist.status = "HISTORY";
    });
    await member("user_e", "GXEEEEEE", ADDR.PAYER);
    await confirmPlan("user_e", ADDR.PAYER);
    const e = await placeUser("user_e", "PLAN_100", { allowUnpaidInsert: true });
    expect(e.parent_id).not.toBe(a.id);
  });

  it("10. PLAN_100 / 200 / 500 / 1000 trees stay isolated", async () => {
    await member("user_a", "GXAAAAAA", ADDR.A);
    await member("user_b", "GXBBBBBB", ADDR.B);
    for (const plan of ["PLAN_100", "PLAN_200", "PLAN_500", "PLAN_1000"] as const) {
      await confirmPlan("user_a", ADDR.A, plan);
      await confirmPlan("user_b", ADDR.B, plan);
      const root = await placeUser("user_a", plan, { allowUnpaidInsert: true });
      const child = await placeUser("user_b", plan, { allowUnpaidInsert: true });
      expect(root.plan_id).toBe(plan);
      expect(child.plan_id).toBe(plan);
      expect(child.parent_id).toBe(root.id);
    }
    const store = await readStore();
    expect(currentPosition(store.network_positions, "user_a", "PLAN_100")?.id).not.toBe(
      currentPosition(store.network_positions, "user_a", "PLAN_200")?.id,
    );
  });

  it("11. a future admin-created plan uses the same Direct #2 movement engine", async () => {
    await withStore((store) => {
      store.plans.push({
        id: "PLAN_ADMIN",
        code: "PLAN_ADMIN",
        name: "Admin plan",
        amount_usd: 250,
        token: "USDT",
        network: "amoy",
        description: "",
        active: true,
        enabled: true,
        sort_order: 99,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });
    await member("user_root", "GXROOTAA", ADDR.ROOT);
    await member("user_left", "GXLEFTAA", ADDR.E8E1);
    await member("user_right", "GXRIGHTA", ADDR.RIGHT);
    await member("user_right_d1", "GXRD1AAA", ADDR.C);
    await member("user_payer", "GXPAYER1", ADDR.PAYER);
    for (const id of ["user_root", "user_left", "user_right", "user_right_d1", "user_payer"] as const) {
      await confirmPlan(id, ADDR.ROOT, "PLAN_100");
      await confirmPlan(id, ADDR.ROOT, "PLAN_200");
      await confirmPlan(id, ADDR.ROOT, "PLAN_500");
      await confirmPlan(id, ADDR.ROOT, "PLAN_1000");
      await confirmPlan(id, ADDR.ROOT, "PLAN_ADMIN");
    }
    await placeUser("user_root", "PLAN_ADMIN", { allowUnpaidInsert: true });
    await placeUser("user_left", "PLAN_ADMIN", { allowUnpaidInsert: true });
    await assignSponsor("user_right_d1", "GXRIGHTA");
    await assignSponsor("user_payer", "GXRIGHTA");
    const pay = await resolvePlanRecipient("user_payer", "PLAN_ADMIN");
    expect(pay.recipientUserId).toBe("user_left");
    expect(pay.recipient.toLowerCase()).toBe(ADDR.E8E1);
    expect(reservedPosition((await readStore()).network_positions, "user_root", "PLAN_ADMIN")).toBeNull();
    expect(reservedPosition((await readStore()).network_positions, "user_right", "PLAN_ADMIN")).toBeNull();
  });

  it("Direct #2 PREPARE only: no confirmed plan tx and no ACTIVE Global seat", async () => {
    await member("user_root", "GXROOTAA", ADDR.ROOT);
    await member("user_s", "GXSPONSOR", ADDR.A);
    await member("user_d1", "GXDIRECT1", ADDR.B);
    await member("user_d2", "GXDIRECT2", ADDR.PAYER);
    await confirmPlan("user_root", ADDR.ROOT);
    await confirmPlan("user_s", ADDR.A);
    await placeUser("user_root", "PLAN_100", { allowUnpaidInsert: true });
    await assignSponsor("user_d1", "GXSPONSOR");
    await assignSponsor("user_d2", "GXSPONSOR");
    await confirmPlan("user_d1", ADDR.B);

    const pay = await resolvePlanRecipient("user_d2", "PLAN_100");
    expect(pay.slot).toBe(2);
    const store = await readStore();
    expect(store.transactions.filter((t) => t.user_id === "user_d2" && t.plan_id === "PLAN_100")).toHaveLength(0);
    expect(currentPosition(store.network_positions, "user_s", "PLAN_100")).toBeNull();
    expect(reservedPosition(store.network_positions, "user_s", "PLAN_100")).toBeNull();
    expect(store.network_positions.filter((p) => p.user_id === "user_s" && (p.status ?? "ACTIVE") === "ACTIVE")).toHaveLength(0);
  });

  it("failed Direct #2: no ACTIVE placement", async () => {
    await member("user_root", "GXROOTAA", ADDR.ROOT);
    await member("user_s", "GXSPONSOR", ADDR.A);
    await member("user_d1", "GXDIRECT1", ADDR.B);
    await member("user_d2", "GXDIRECT2", ADDR.PAYER);
    await confirmPlan("user_root", ADDR.ROOT);
    await confirmPlan("user_s", ADDR.A);
    await placeUser("user_root", "PLAN_100", { allowUnpaidInsert: true });
    await assignSponsor("user_d1", "GXSPONSOR");
    await assignSponsor("user_d2", "GXSPONSOR");
    await confirmPlan("user_d1", ADDR.B);
    await resolvePlanRecipient("user_d2", "PLAN_100");
    await withStore((store) => {
      store.transactions.push({
        id: newId("tx"),
        user_id: "user_d2",
        payer_wallet: ADDR.PAYER,
        recipient_wallet: ADDR.ROOT,
        amount: "100000000",
        token: "USDT",
        token_contract: "0x0000000000000000000000000000000000000001",
        chain_id: activeChainId(),
        tx_hash: "0xd2failed",
        payment_type: "PLAN_PURCHASE",
        plan_id: "PLAN_100",
        plan_code: "PLAN_100",
        status: "FAILED",
        recipient_role: "GLOBAL_UPLINE",
        routing_slot: 2,
        direct_number: 2,
        created_at: new Date().toISOString(),
      });
    });
    await voidUnpaidDirect2Provision("user_d2", "PLAN_100");
    const store = await readStore();
    expect(store.transactions.find((t) => t.tx_hash === "0xd2failed")?.status).toBe("FAILED");
    expect(currentPosition(store.network_positions, "user_s", "PLAN_100")).toBeNull();
    expect(reservedPosition(store.network_positions, "user_s", "PLAN_100")).toBeNull();
    expect(store.network_positions.filter((p) => p.user_id === "user_s" && (p.status ?? "ACTIVE") === "ACTIVE")).toHaveLength(0);
  });

  it("Direct #2 CONFIRMED: placement finalizes", async () => {
    await member("user_root", "GXROOTAA", ADDR.ROOT);
    await member("user_s", "GXSPONSOR", ADDR.A);
    await member("user_d1", "GXDIRECT1", ADDR.B);
    await member("user_d2", "GXDIRECT2", ADDR.PAYER);
    await confirmPlan("user_root", ADDR.ROOT);
    await confirmPlan("user_s", ADDR.A);
    await placeUser("user_root", "PLAN_100", { allowUnpaidInsert: true });
    await assignSponsor("user_d1", "GXSPONSOR");
    await assignSponsor("user_d2", "GXSPONSOR");
    await confirmPlan("user_d1", ADDR.B);
    await resolvePlanRecipient("user_d2", "PLAN_100");
    await confirmPlan("user_d2", ADDR.PAYER);
    await finalizeConfirmedDirect2Placement("user_d2", "PLAN_100", "seed_user_d2_PLAN_100");
    const store = await readStore();
    expect(currentPosition(store.network_positions, "user_s", "PLAN_100")?.status ?? "ACTIVE").toBe("ACTIVE");
    expect(currentPosition(store.network_positions, "user_s", "PLAN_100")?.parent_id).toBe(
      currentPosition(store.network_positions, "user_root", "PLAN_100")?.id,
    );
  });

  it("12. existing CONFIRMED transactions are never rewritten by routing", async () => {
    await member("user_a", "GXAAAAAA", ADDR.A);
    await withStore((store) => {
      store.transactions.push({
        id: "tx_confirmed_keep",
        user_id: "user_a",
        payer_wallet: ADDR.PAYER,
        recipient_wallet: ADDR.ROOT,
        amount: "100000000",
        token: "USDT",
        token_contract: "0x0000000000000000000000000000000000000001",
        chain_id: activeChainId(),
        tx_hash: "0xconfirmedkeep",
        payment_type: "PLAN_PURCHASE",
        plan_id: "PLAN_100",
        plan_code: "PLAN_100",
        status: "CONFIRMED",
        recipient_role: "GLOBAL_UPLINE",
        routing_slot: 2,
        created_at: "2026-01-01T00:00:00.000Z",
      });
    });
    await member("user_s", "GXSPONSOR", ADDR.B);
    await member("user_d2", "GXDIRECT2", ADDR.C);
    await confirmPlan("user_s", ADDR.B);
    await assignSponsor("user_d2", "GXSPONSOR");
    await resolvePlanRecipient("user_d2", "PLAN_100").catch(() => undefined);
    const store = await readStore();
    const kept = store.transactions.find((t) => t.id === "tx_confirmed_keep");
    expect(kept?.status).toBe("CONFIRMED");
    expect(kept?.recipient_wallet).toBe(ADDR.ROOT);
    expect(kept?.tx_hash).toBe("0xconfirmedkeep");
  });
});
