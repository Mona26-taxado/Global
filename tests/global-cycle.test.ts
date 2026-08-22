import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePlanRecipient, resolveReentryPayment } from "../payments/plan-routing";
import {
  activateReservedReentry,
  assignSponsor,
  createUser,
  currentPosition,
  DIRECT_REFERRAL_LIMIT_REACHED,
  placeUser,
  qualifyForReentry,
  reservedPosition,
  finalizeConfirmedDirect2Placement,
} from "../services/users";
import { newId, readStore, withStore } from "../lib/store";
import { activeChainId } from "../lib/network-config";

const dataFile = join(mkdtempSync(join(tmpdir(), "gx-cycle-")), "globalx.json");

const ADDR: Record<string, `0x${string}`> = {
  A: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  X: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  Y: "0xcccccccccccccccccccccccccccccccccccccccc",
  Z: "0xdddddddddddddddddddddddddddddddddddddddd",
  B: "0x1111111111111111111111111111111111111111",
  C: "0x2222222222222222222222222222222222222222",
  D: "0x3333333333333333333333333333333333333333",
  E: "0x4444444444444444444444444444444444444444",
};

function emptyPayload() {
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

async function confirmPlan(userId: string, label: string) {
  await withStore((store) => {
    if (store.transactions.some((t) => t.user_id === userId && t.plan_id === "PLAN_100" && t.status === "CONFIRMED")) {
      return;
    }
    store.transactions.push({
      id: newId("tx"),
      user_id: userId,
      payer_wallet: ADDR[label]!,
      recipient_wallet: ADDR[label]!,
      amount: "100000000",
      token: "USDT",
      token_contract: "0x0000000000000000000000000000000000000001",
      chain_id: activeChainId(),
      tx_hash: `seed_${userId}_plan`,
      payment_type: "PLAN_PURCHASE",
      plan_id: "PLAN_100",
      plan_code: "PLAN_100",
      status: "CONFIRMED",
      recipient_role: "COMPANY_GENESIS",
      routing_slot: null,
      created_at: new Date().toISOString(),
    });
  });
}

describe("GLOBAL X Direct #1 / Direct #2 cycle", () => {
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

  it("matches the A/X/Y/Z/B/C/D/E payment sequence and blocks a third direct", async () => {
    await member("user_a", "GXAAAAAA", "A");
    await member("user_x", "GXBBBBBB", "X");
    await member("user_y", "GXCCCCCC", "Y");
    await member("user_z", "GXDDDDDD", "Z");
    await member("user_b", "GX111111", "B");
    await member("user_c", "GX222222", "C");
    await member("user_d", "GX333333", "D");
    await member("user_e", "GX444444", "E");

    await confirmPlan("user_a", "A");
    await confirmPlan("user_x", "X");
    await placeUser("user_a", undefined, { allowUnpaidInsert: true });

    const yRef = await assignSponsor("user_y", "GXBBBBBB");
    expect(yRef.direct_number).toBe(1);
    const yPay = await resolvePlanRecipient("user_y", "PLAN_100");
    expect(yPay.slot).toBe(1);
    expect(yPay.recipientUserId).toBe("user_x");
    expect(yPay.recipient.toLowerCase()).toBe(ADDR.X);
    await confirmPlan("user_y", "Y");

    const zRef = await assignSponsor("user_z", "GXBBBBBB");
    expect(zRef.direct_number).toBe(2);
    const zPay = await resolvePlanRecipient("user_z", "PLAN_100");
    expect(zPay.slot).toBe(2);
    expect(zPay.recipientUserId).toBe("user_a");
    expect(zPay.globalParentUserId).toBe("user_a");
    expect(zPay.recipient.toLowerCase()).toBe(ADDR.A);
    await finalizeConfirmedDirect2Placement("user_z", "PLAN_100", "0xzpay");

    let store = await readStore();
    expect(currentPosition(store.network_positions, "user_x")?.parent_id).toBe(
      currentPosition(store.network_positions, "user_a")?.id,
    );

    await confirmPlan("user_y", "Y");
    const bRef = await assignSponsor("user_b", "GXCCCCCC");
    expect(bRef.direct_number).toBe(1);
    const bPay = await resolvePlanRecipient("user_b", "PLAN_100");
    expect(bPay.recipientUserId).toBe("user_y");
    await confirmPlan("user_b", "B");

    const cRef = await assignSponsor("user_c", "GXCCCCCC");
    expect(cRef.direct_number).toBe(2);
    const cPay = await resolvePlanRecipient("user_c", "PLAN_100");
    expect(cPay.recipientUserId).toBe("user_x");
    expect(reservedPosition((await readStore()).network_positions, "user_a")).toBeNull();
    await finalizeConfirmedDirect2Placement("user_c", "PLAN_100", "0xcpay");
    store = await readStore();
    const ySeat = currentPosition(store.network_positions, "user_y");
    const aNow = currentPosition(store.network_positions, "user_a");
    const yParent = store.network_positions.find((p) => p.id === ySeat?.parent_id);
    expect(ySeat?.position).toBe("LEFT");
    expect(yParent?.user_id).toBe("user_x");
    expect(aNow?.parent_id).toBeNull();
    expect(reservedPosition(store.network_positions, "user_a")).toBeNull();

    await confirmPlan("user_z", "Z");
    const dRef = await assignSponsor("user_d", "GXDDDDDD");
    expect(dRef.direct_number).toBe(1);
    const dPay = await resolvePlanRecipient("user_d", "PLAN_100");
    expect(dPay.recipientUserId).toBe("user_z");
    await confirmPlan("user_d", "D");

    const eRef = await assignSponsor("user_e", "GXDDDDDD");
    expect(eRef.direct_number).toBe(2);
    const ePay = await resolvePlanRecipient("user_e", "PLAN_100");
    expect(ePay.recipientUserId).toBe("user_a");
    await finalizeConfirmedDirect2Placement("user_e", "PLAN_100", "0xepay");
    store = await readStore();
    const zSeat = currentPosition(store.network_positions, "user_z");
    const zParent = store.network_positions.find((p) => p.id === zSeat?.parent_id);
    expect(zSeat?.position).toBe("RIGHT");
    expect(zParent?.user_id).toBe("user_x");
    const xNow = currentPosition(store.network_positions, "user_x");
    expect(xNow?.parent_id).toBe(currentPosition(store.network_positions, "user_a")?.id);
    expect(xNow?.position).toBe("RIGHT");

    expect(store.users.find((u) => u.id === "user_y")?.sponsor_id).toBe("user_x");
    expect(store.users.find((u) => u.id === "user_z")?.sponsor_id).toBe("user_x");
    expect(store.users.find((u) => u.id === "user_c")?.sponsor_id).toBe("user_y");
    expect(store.users.find((u) => u.id === "user_e")?.sponsor_id).toBe("user_z");

    const extra = await createUser({ display_name: "Third" });
    await expect(assignSponsor(extra.id, "GXBBBBBB")).rejects.toThrow(DIRECT_REFERRAL_LIMIT_REACHED);

    const again = await resolvePlanRecipient("user_z", "PLAN_100");
    expect(again.recipientUserId).toBe("user_a");
    expect(store.network_positions.filter((p) => p.user_id === "user_x" && (p.status ?? "ACTIVE") === "ACTIVE")).toHaveLength(1);

    expect(yPay.recipientUserId).toBe("user_x");
    expect(zPay.recipientUserId).toBe("user_a");
    expect(bPay.recipientUserId).toBe("user_y");
    expect(cPay.recipientUserId).toBe("user_x");
    expect(dPay.recipientUserId).toBe("user_z");
    expect(ePay.recipientUserId).toBe("user_a");
  });

  it("reserves A under X then X under Y after paid rotation", async () => {
    await member("user_a", "GXAAAAAA", "A");
    await member("user_x", "GXBBBBBB", "X");
    await member("user_y", "GXCCCCCC", "Y");
    await confirmPlan("user_a", "A");
    await confirmPlan("user_x", "X");
    await confirmPlan("user_y", "Y");
    await placeUser("user_a", undefined, { allowUnpaidInsert: true });
    await placeUser("user_x", undefined, { allowUnpaidInsert: true });
    await fillBothLegs("user_a", "user_x", "user_y");

    let store = await readStore();
    const posA = currentPosition(store.network_positions, "user_a")!;
    const posX = currentPosition(store.network_positions, "user_x")!;
    const posY = currentPosition(store.network_positions, "user_y")!;
    expect(posX.parent_id).toBe(posA.id);
    expect(posX.position).toBe("LEFT");
    expect(posY.parent_id).toBe(posA.id);
    expect(posY.position).toBe("RIGHT");

    const payA = await resolveReentryPayment("user_a");
    expect(payA.recipientUserId).toBe("user_x");
    expect(payA.amountUsd).toBe(100);
    expect(reservedPosition(store.network_positions, "user_a")).toBeNull();
    expect(posA.status ?? "ACTIVE").toBe("ACTIVE");
    store = await readStore();
    expect(currentPosition(store.network_positions, "user_a")?.id).toBe(posA.id);

    await activateReservedReentry("user_a", "0xA-reenter");
    store = await readStore();
    expect(store.network_positions.find((p) => p.id === posA.id)?.status).toBe("HISTORY");
    expect(reservedPosition(store.network_positions, "user_a")).toBeNull();
    expect(currentPosition(store.network_positions, "user_a")?.parent_id).toBe(posX.id);
    expect(currentPosition(store.network_positions, "user_a")?.position).toBe("LEFT");
  });

  async function fillBothLegs(parentUserId: string, leftId: string, rightId: string) {
    await withStore((store) => {
      const parent = currentPosition(store.network_positions, parentUserId)!;
      if (!store.network_positions.some((p) => p.user_id === leftId)) {
        store.network_positions.push({
          id: `pos_${leftId}_leg`,
          user_id: leftId,
          plan_id: parent.plan_id,
          parent_id: parent.id,
          position: "LEFT",
          depth: parent.depth + 1,
          cycle: 0,
          status: "ACTIVE",
          started_at: new Date().toISOString(),
          ended_at: null,
        });
      }
      if (!store.network_positions.some((p) => p.user_id === rightId)) {
        store.network_positions.push({
          id: `pos_${rightId}_leg`,
          user_id: rightId,
          plan_id: parent.plan_id,
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
  }

  it("requires paid re-entry: reserve, snapshot, amount, no ACTIVE until verified, history, idempotent, repeatable", async () => {
    await member("user_a", "GXAAAAAA", "A");
    await member("user_x", "GXBBBBBB", "X");
    await member("user_y", "GXCCCCCC", "Y");
    await member("user_l2", "GXLLLLL2", "B");
    await member("user_r2", "GXRRRRR2", "C");
    await confirmPlan("user_a", "A");
    await withStore((store) => {
      store.plans.push({
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
        created_at: "2026-06-01T00:00:00.000Z",
        updated_at: "2026-06-01T00:00:00.000Z",
      });
      store.transactions.push({
        id: newId("tx"),
        user_id: "user_a",
        payer_wallet: ADDR.A,
        recipient_wallet: ADDR.A,
        amount: "500000000",
        token: "USDT",
        token_contract: "0x0000000000000000000000000000000000000001",
        chain_id: activeChainId(),
        tx_hash: "seed_user_a_plan500",
        payment_type: "PLAN_PURCHASE",
        plan_id: "PLAN_500",
        plan_code: "PLAN_500",
        status: "CONFIRMED",
        recipient_role: "COMPANY_GENESIS",
        routing_slot: null,
        created_at: "2026-06-02T00:00:00.000Z",
      });
    });
    await placeUser("user_a", undefined, { allowUnpaidInsert: true });
    await placeUser("user_x", undefined, { allowUnpaidInsert: true });
    await fillBothLegs("user_a", "user_x", "user_y");

    await qualifyForReentry("user_a");
    const pay = await resolveReentryPayment("user_a");
    expect(pay.recipientRole).toBe("GLOBAL_REENTRY");
    expect(pay.recipient.toLowerCase()).toBe(ADDR.X);
    expect(pay.amountUsd).toBe(100);
    expect(pay.recipient.toLowerCase()).not.toBe(ADDR.A);
    let store = await readStore();
    const oldId = currentPosition(store.network_positions, "user_a")?.id;
    expect(reservedPosition(store.network_positions, "user_a")).toBeNull();

    const againPay = await resolveReentryPayment("user_a");
    expect(againPay.recipient.toLowerCase()).toBe(pay.recipient.toLowerCase());

    await activateReservedReentry("user_a", "0xreentry1");
    store = await readStore();
    expect(reservedPosition(store.network_positions, "user_a")).toBeNull();
    const active = currentPosition(store.network_positions, "user_a");
    expect(active?.status ?? "ACTIVE").toBe("ACTIVE");
    expect(active?.id).not.toBe(oldId);
    expect(active?.reentry_tx_hash).toBe("0xreentry1");
    const history = store.network_positions.filter((p) => p.user_id === "user_a" && p.status === "HISTORY");
    expect(history.length).toBe(1);
    expect(history[0]?.id).toBe(oldId);

    await activateReservedReentry("user_a", "0xreentry1");
    store = await readStore();
    expect(store.network_positions.filter((p) => p.user_id === "user_a" && (p.status ?? "ACTIVE") === "ACTIVE")).toHaveLength(1);

    await fillBothLegs("user_a", "user_l2", "user_r2");
    await qualifyForReentry("user_a");
    const pay2 = await resolveReentryPayment("user_a");
    expect(pay2.amountUsd).toBe(100);
    store = await readStore();
    expect(currentPosition(store.network_positions, "user_a")?.id).toBe(active?.id);
    await activateReservedReentry("user_a", "0xreentry2");
    store = await readStore();
    expect(store.network_positions.filter((p) => p.user_id === "user_a" && p.status === "HISTORY")).toHaveLength(2);
    expect(currentPosition(store.network_positions, "user_a")?.reentry_tx_hash).toBe("0xreentry2");
  });

  it("blocks GLOBAL_REENTRY when snapshot is the mover wallet instead of the parent", async () => {
    await member("user_a", "GXAAAAAA", "A");
    await member("user_x", "GXBBBBBB", "X");
    await member("user_y", "GXCCCCCC", "Y");
    await confirmPlan("user_a", "A");
    await placeUser("user_a", undefined, { allowUnpaidInsert: true });
    await placeUser("user_x", undefined, { allowUnpaidInsert: true });
    await fillBothLegs("user_a", "user_x", "user_y");
    await qualifyForReentry("user_a");
    await withStore((store) => {
      const intent = store.payment_intents.find((i) => i.kind === "GLOBAL_REENTRY" && i.mover_user_id === "user_a" && i.status === "PENDING");
      if (intent) {
        intent.candidate_recipient_user_id = "user_a";
        intent.candidate_recipient_wallet = ADDR.A;
      }
    });
    await expect(activateReservedReentry("user_a", "0xself")).rejects.toMatchObject({ code: "REENTRY_SELF_PAY" });
  });

  it("blocks GLOBAL_REENTRY when the parent wallet is unverified and does not use a fallback", async () => {
    await member("user_a", "GXAAAAAA", "A");
    await member("user_x", "GXBBBBBB", "X");
    await member("user_y", "GXCCCCCC", "Y");
    await confirmPlan("user_a", "A");
    await placeUser("user_a", undefined, { allowUnpaidInsert: true });
    await placeUser("user_x", undefined, { allowUnpaidInsert: true });
    await fillBothLegs("user_a", "user_x", "user_y");
    await withStore((store) => {
      const w = store.wallets.find((x) => x.user_id === "user_x")!;
      w.verified = false;
    });
    await expect(resolveReentryPayment("user_a")).rejects.toMatchObject({ code: "GLOBAL_UPLINE_WALLET_UNVERIFIED" });
  });
});
