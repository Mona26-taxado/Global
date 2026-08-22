import { describe, expect, it } from "vitest";
import { cycleComplete, findFirstEmptyPlacement, occupiesSlot } from "../network/placement";
import {
  confirmDirect2FromIntent,
  failPendingIntents,
  PlacementError,
  quoteDirect2InStore,
  quoteReentryInStore,
} from "../services/placement-intent";
import type { Store } from "../lib/store";
import type { NetworkPositionRow } from "../types";

const PLANS = ["PLAN_100", "PLAN_200", "PLAN_500", "PLAN_1000", "PLAN_SYNTH"] as const;
const PLAN_AMOUNTS: Record<(typeof PLANS)[number], number> = {
  PLAN_100: 100,
  PLAN_200: 200,
  PLAN_500: 500,
  PLAN_1000: 1000,
  PLAN_SYNTH: 777,
};

function pos(
  plan: string,
  id: string,
  user_id: string,
  parent_id: string | null,
  position: "LEFT" | "RIGHT" | null,
  depth: number,
  status: NetworkPositionRow["status"],
): NetworkPositionRow {
  return {
    id: `${plan}-${id}`,
    user_id,
    plan_id: plan,
    parent_id: parent_id ? `${plan}-${parent_id}` : null,
    position,
    depth,
    cycle: Math.floor(depth / 2),
    status,
    started_at: "2026-08-22T12:00:00.000Z",
  };
}

function storeFor(plan: string, positions: NetworkPositionRow[]): Store {
  return {
    payment_intents: [],
    network_positions: positions,
    wallets: [
      { id: "w-root", user_id: "u-root", address: "0x1111111111111111111111111111111111111111", wallet_type: "injected", chain_id: 80002, verified: true, created_at: "2026-08-22T12:00:00.000Z" },
      { id: "w-left", user_id: "u-left", address: "0x2222222222222222222222222222222222222222", wallet_type: "injected", chain_id: 80002, verified: true, created_at: "2026-08-22T12:00:00.000Z" },
    ],
    users: [
      { id: "u-root", referral_code: "GXROOTAA", sponsor_id: null, is_demo: false, display_name: "root", created_at: "2026-08-22T12:00:00.000Z" },
      { id: "u-left", referral_code: "GXLEFTAA", sponsor_id: null, is_demo: false, display_name: "left", created_at: "2026-08-22T12:00:00.000Z" },
      { id: "u-sx", referral_code: "GXSPONX", sponsor_id: null, is_demo: false, display_name: "sx", created_at: "2026-08-22T12:00:00.000Z" },
      { id: "u-sy", referral_code: "GXSPONY", sponsor_id: null, is_demo: false, display_name: "sy", created_at: "2026-08-22T12:00:00.000Z" },
      { id: "u-bx", referral_code: "GXBUYERX", sponsor_id: "u-sx", is_demo: false, display_name: "bx", created_at: "2026-08-22T12:00:00.000Z" },
      { id: "u-by", referral_code: "GXBUYERY", sponsor_id: "u-sy", is_demo: false, display_name: "by", created_at: "2026-08-22T12:00:00.000Z" },
    ],
    plans: PLANS.map((id, i) => ({
      id,
      code: id,
      name: id,
      amount_usd: PLAN_AMOUNTS[id],
      token: "USDT",
      network: "amoy",
      description: "",
      active: true,
      enabled: true,
      sort_order: i + 1,
      created_at: "",
      updated_at: "",
    })),
    referrals: [],
    transactions: [
      {
        id: "tx-keep",
        user_id: "u-root",
        payer_wallet: "0x1111111111111111111111111111111111111111",
        recipient_wallet: "0x1111111111111111111111111111111111111111",
        amount: "100000000",
        token: "USDT",
        token_contract: "0x1",
        chain_id: 80002,
        tx_hash: "0xconfirmedkeep",
        payment_type: "PLAN_PURCHASE",
        plan_id: plan,
        plan_code: plan,
        status: "CONFIRMED",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
  } as unknown as Store;
}

describe("non-blocking Global payment (all plans)", () => {
  it.each(PLANS)("%s A: Direct #2 PREPARE leaves tree unchanged, 0 ACTIVE/RESERVED added", (plan) => {
    const store = storeFor(plan, [pos(plan, "root", "u-root", null, null, 0, "ACTIVE")]);
    const before = JSON.stringify(store.network_positions);
    const intent = quoteDirect2InStore(store, "u-sx", plan, "u-bx");
    expect(JSON.stringify(store.network_positions)).toBe(before);
    expect(store.network_positions.filter((p) => p.status === "RESERVED")).toHaveLength(0);
    expect(store.network_positions.filter((p) => (p.status ?? "ACTIVE") === "ACTIVE" && p.user_id === "u-sx")).toHaveLength(0);
    expect(intent.status).toBe("PENDING");
    expect(intent.candidate_parent_position_id).toBe(`${plan}-root`);
    expect(intent.candidate_position).toBe("LEFT");
  });

  it.each(PLANS)("%s B: two quotes same hole; first confirm wins; second STALE_ROUTE", (plan) => {
    const store = storeFor(plan, [pos(plan, "root", "u-root", null, null, 0, "ACTIVE")]);
    const qx = quoteDirect2InStore(store, "u-sx", plan, "u-bx");
    const qy = quoteDirect2InStore(store, "u-sy", plan, "u-by");
    expect(qx.candidate_parent_position_id).toBe(qy.candidate_parent_position_id);
    expect(qx.candidate_position).toBe(qy.candidate_position);
    const payee = qy.candidate_recipient_wallet!;
    confirmDirect2FromIntent(store, "u-by", plan, "0xy", payee);
    expect(store.network_positions.find((p) => p.user_id === "u-sy" && p.plan_id === plan)?.status).toBe("ACTIVE");
    let code = "";
    try {
      confirmDirect2FromIntent(store, "u-bx", plan, "0xx", qx.candidate_recipient_wallet!);
    } catch (e) {
      code = (e as PlacementError).code;
    }
    expect(code).toBe("STALE_ROUTE");
    expect(store.network_positions.find((p) => p.user_id === "u-sx" && (p.status ?? "ACTIVE") === "ACTIVE")).toBeUndefined();
  });

  it.each(PLANS)("%s C: failed/cancelled tree equals tree before prepare", (plan) => {
    const store = storeFor(plan, [pos(plan, "root", "u-root", null, null, 0, "ACTIVE")]);
    const before = JSON.stringify(store.network_positions);
    quoteDirect2InStore(store, "u-sx", plan, "u-bx");
    failPendingIntents(store, "u-bx", plan, "FAILED");
    expect(JSON.stringify(store.network_positions)).toBe(before);
    expect(store.payment_intents.every((i) => i.buyer_user_id !== "u-bx" || i.status === "FAILED")).toBe(true);
  });

  it.each(PLANS)("%s D: cycle ACTIVE+ACTIVE only; pending/RESERVED does not complete", (plan) => {
    const reservedMix = [
      pos(plan, "root", "u-root", null, null, 0, "ACTIVE"),
      pos(plan, "L", "u-left", "root", "LEFT", 1, "RESERVED"),
      pos(plan, "R", "u-sy", "root", "RIGHT", 1, "ACTIVE"),
    ];
    expect(cycleComplete(reservedMix, `${plan}-root`)).toBe(false);
    const both = [
      pos(plan, "root", "u-root", null, null, 0, "ACTIVE"),
      pos(plan, "L", "u-left", "root", "LEFT", 1, "ACTIVE"),
      pos(plan, "R", "u-sy", "root", "RIGHT", 1, "ACTIVE"),
    ];
    expect(cycleComplete(both, `${plan}-root`)).toBe(true);
  });

  it.each(PLANS)("%s E: confirm quote match inserts ACTIVE", (plan) => {
    const store = storeFor(plan, [pos(plan, "root", "u-root", null, null, 0, "ACTIVE")]);
    const intent = quoteDirect2InStore(store, "u-sx", plan, "u-bx");
    const { placed } = confirmDirect2FromIntent(store, "u-bx", plan, "0xok", intent.candidate_recipient_wallet!);
    expect(placed?.status).toBe("ACTIVE");
    expect(placed?.parent_id).toBe(`${plan}-root`);
    expect(placed?.position).toBe("LEFT");
  });

  it.each(PLANS)("%s F: confirm after seat taken inserts no ACTIVE for loser", (plan) => {
    const store = storeFor(plan, [pos(plan, "root", "u-root", null, null, 0, "ACTIVE")]);
    const qx = quoteDirect2InStore(store, "u-sx", plan, "u-bx");
    quoteDirect2InStore(store, "u-sy", plan, "u-by");
    confirmDirect2FromIntent(store, "u-by", plan, "0xy", store.payment_intents.find((i) => i.buyer_user_id === "u-by")!.candidate_recipient_wallet!);
    const beforeLoser = store.network_positions.filter((p) => p.user_id === "u-sx").length;
    expect(() => confirmDirect2FromIntent(store, "u-bx", plan, "0xx", qx.candidate_recipient_wallet!)).toThrow();
    expect(store.network_positions.filter((p) => p.user_id === "u-sx")).toHaveLength(beforeLoser);
  });

  it.each(PLANS)("%s G: legacy RESERVED does not block allocator", (plan) => {
    const nodes = [
      pos(plan, "root", "u-root", null, null, 0, "ACTIVE"),
      pos(plan, "ghost", "u-sx", "root", "LEFT", 1, "RESERVED"),
    ];
    expect(occupiesSlot(nodes[1]!)).toBe(false);
    const hole = findFirstEmptyPlacement(nodes, "u-sy");
    expect(hole.parent_id).toBe(`${plan}-root`);
    expect(hole.position).toBe("LEFT");
  });

  it.each(PLANS)("%s I: existing CONFIRMED tx hash/fields unchanged by prepare", (plan) => {
    const store = storeFor(plan, [pos(plan, "root", "u-root", null, null, 0, "ACTIVE")]);
    const before = JSON.stringify(store.transactions);
    quoteDirect2InStore(store, "u-sx", plan, "u-bx");
    expect(JSON.stringify(store.transactions)).toBe(before);
    expect(store.transactions[0]?.tx_hash).toBe("0xconfirmedkeep");
    expect(store.transactions[0]?.status).toBe("CONFIRMED");
  });
});

function stripPlan(plan: string, value: string | null | undefined) {
  return value?.startsWith(`${plan}-`) ? value.slice(plan.length + 1) : value ?? null;
}

function seatFingerprint(plan: (typeof PLANS)[number]) {
  const root = [pos(plan, "root", "u-root", null, null, 0, "ACTIVE")];
  const store = storeFor(plan, root);
  const before = JSON.stringify(store.network_positions);
  const qx = quoteDirect2InStore(store, "u-sx", plan, "u-bx");
  const qy = quoteDirect2InStore(store, "u-sy", plan, "u-by");
  const afterPrepare = JSON.stringify(store.network_positions);
  confirmDirect2FromIntent(store, "u-by", plan, "0xy", qy.candidate_recipient_wallet!);
  let stale = "";
  try {
    confirmDirect2FromIntent(store, "u-bx", plan, "0xx", qx.candidate_recipient_wallet!);
  } catch (e) {
    stale = (e as PlacementError).code;
  }
  const mixed = [
    pos(plan, "root", "u-root", null, null, 0, "ACTIVE"),
    pos(plan, "L", "u-left", "root", "LEFT", 1, "RESERVED"),
    pos(plan, "R", "u-sy", "root", "RIGHT", 1, "ACTIVE"),
  ];
  const both = [
    pos(plan, "root", "u-root", null, null, 0, "ACTIVE"),
    pos(plan, "L", "u-left", "root", "LEFT", 1, "ACTIVE"),
    pos(plan, "R", "u-sy", "root", "RIGHT", 1, "ACTIVE"),
  ];
  const reStore = storeFor(plan, both);
  quoteReentryInStore(reStore, "u-root", plan);
  const ghost = [
    pos(plan, "root", "u-root", null, null, 0, "ACTIVE"),
    pos(plan, "ghost", "u-sx", "root", "LEFT", 1, "RESERVED"),
  ];
  const hole = findFirstEmptyPlacement(ghost, "u-sy");
  return {
    prepareUnchanged: afterPrepare === before,
    sameQuotedHole: qx.candidate_position === qy.candidate_position && stripPlan(plan, qx.candidate_parent_position_id) === stripPlan(plan, qy.candidate_parent_position_id),
    quotedSide: qx.candidate_position,
    quotedParent: stripPlan(plan, qx.candidate_parent_position_id),
    quotedAmount: qx.amount_usd,
    winnerActive: store.network_positions.find((p) => p.user_id === "u-sy" && p.plan_id === plan)?.status,
    winnerSide: store.network_positions.find((p) => p.user_id === "u-sy" && p.plan_id === plan)?.position,
    loserActive: Boolean(store.network_positions.find((p) => p.user_id === "u-sx" && (p.status ?? "ACTIVE") === "ACTIVE")),
    stale,
    cycleMixed: cycleComplete(mixed, `${plan}-root`),
    cycleBoth: cycleComplete(both, `${plan}-root`),
    reentryOccupies: reStore.network_positions.some((p) => p.status === "RESERVED"),
    reentryPending: reStore.payment_intents.some((i) => i.kind === "GLOBAL_REENTRY" && i.status === "PENDING"),
    legacyHoleParent: stripPlan(plan, hole.parent_id),
    legacyHoleSide: hole.position,
    occupiesReserved: occupiesSlot(ghost[1]!),
  };
}

describe("one shared seat engine (fingerprint)", () => {
  it("PLAN_100/200/500/1000 and PLAN_SYNTH produce identical occupancy/cycle/stale outcomes", () => {
    const fps = PLANS.map((plan) => {
      const fp = seatFingerprint(plan);
      const { quotedAmount, ...seat } = fp;
      expect(quotedAmount).toBe(PLAN_AMOUNTS[plan]);
      return seat;
    });
    for (const fp of fps.slice(1)) {
      expect(fp).toEqual(fps[0]);
    }
  });
});
