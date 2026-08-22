import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolvePlanRecipient } from "../payments/plan-routing";
import { assignSponsor, createUser, currentPosition, finalizeConfirmedDirect2Placement, placeUser, reservedPosition } from "../services/users";
import { newId, readStore, withStore } from "../lib/store";
import { activeChainId } from "../lib/network-config";

const dataFile = join(mkdtempSync(join(tmpdir(), "gx-reg-")), "globalx.json");
const ROOT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SPONSOR = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const BUYER = "0xcccccccccccccccccccccccccccccccccccccccc";
const DIRECT2 = "0xdddddddddddddddddddddddddddddddddddddddd";

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
  });
}

async function confirmRegistration(userId: string) {
  await withStore((store) => {
    store.registrations.push({
      id: newId("reg"),
      user_id: userId,
      status: "ACTIVE",
      amount: "5000000",
      tx_hash: "0xreg",
      created_at: new Date().toISOString(),
      activated_at: new Date().toISOString(),
    });
  });
}

async function confirmPlan(userId: string, address: string) {
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

describe("$5 registration does not enter Global", () => {
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

  it("$5 only => 0 Global positions for every plan", async () => {
    await member("user_new", "GXNEWUSR", BUYER);
    await confirmRegistration("user_new");
    const store = await readStore();
    expect(store.registrations.find((r) => r.user_id === "user_new")?.status).toBe("ACTIVE");
    expect(store.network_positions.filter((p) => p.user_id === "user_new")).toHaveLength(0);
    for (const plan of ["PLAN_100", "PLAN_200", "PLAN_500", "PLAN_1000"]) {
      expect(store.network_positions.filter((p) => p.user_id === "user_new" && p.plan_id === plan)).toHaveLength(0);
    }
  });

  it("TEST B: Global placement runs only after qualifying plan Direct #2, and places the sponsor not the $5 registrant", async () => {
    await member("user_root", "GXROOTAA", ROOT);
    await member("user_s", "GXSPONSOR", SPONSOR);
    await member("user_d1", "GXDIRECT1", BUYER);
    await member("user_d2", "GXDIRECT2", DIRECT2);
    await confirmRegistration("user_d2");
    expect((await readStore()).network_positions.filter((p) => p.user_id === "user_d2")).toHaveLength(0);

    await confirmPlan("user_root", ROOT);
    await confirmPlan("user_s", SPONSOR);
    await confirmPlan("user_d1", BUYER);
    await placeUser("user_root", "PLAN_100");
    await assignSponsor("user_s", "GXROOTAA");
    await assignSponsor("user_d1", "GXSPONSOR");
    await assignSponsor("user_d2", "GXSPONSOR");

    const pay = await resolvePlanRecipient("user_d2", "PLAN_100");
    expect(pay.slot).toBe(2);
    expect(pay.recipientRole).toBe("GLOBAL_UPLINE");

    let store = await readStore();
    expect(currentPosition(store.network_positions, "user_s")).toBeNull();
    expect(reservedPosition(store.network_positions, "user_s")).toBeNull();
    expect(store.payment_intents.some((i) => i.kind === "DIRECT2_PLACEMENT" && i.status === "PENDING")).toBe(true);
    expect(store.network_positions.filter((p) => p.user_id === "user_d2")).toHaveLength(0);

    await finalizeConfirmedDirect2Placement("user_d2", "PLAN_100", "0xd2confirm");
    store = await readStore();
    expect(currentPosition(store.network_positions, "user_s")?.parent_id).toBe(
      currentPosition(store.network_positions, "user_root")?.id,
    );
    expect(store.network_positions.filter((p) => p.user_id === "user_d2")).toHaveLength(0);
  });
});
