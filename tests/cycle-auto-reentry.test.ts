import { describe, expect, it } from "vitest";
import type { Store } from "../lib/store";
import { cycleComplete, findFirstEmptyPlacement } from "../network/placement";
import {
  afterActiveSeatCreated,
  confirmDirect2FromIntent,
  confirmReentryFromIntent,
  firstEmptyQuote,
  quoteDirect2InStore,
  syncReentryQuotesForCompletedCycles,
} from "../services/placement-intent";
import { applyGenesisReconciliation } from "../services/genesis-reconciliation";
import { DEFAULT_GENESIS_WALLET } from "../lib/network-config";
import type { NetworkPositionRow } from "../types";

const PLANS = ["PLAN_100", "PLAN_200", "PLAN_500", "PLAN_1000", "PLAN_SYNTH"] as const;

function pos(
  plan: string,
  id: string,
  user_id: string,
  parent_id: string | null,
  position: "LEFT" | "RIGHT" | null,
  depth: number,
  status: NetworkPositionRow["status"] = "ACTIVE",
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

function wallet(id: string, user: string, address: string) {
  return {
    id,
    user_id: user,
    address,
    wallet_type: "injected" as const,
    chain_id: 137,
    verified: true,
    created_at: "2026-08-22T12:00:00.000Z",
  };
}

function user(id: string, code: string) {
  return {
    id,
    referral_code: code,
    sponsor_id: null,
    is_demo: false,
    display_name: id,
    created_at: "2026-08-22T12:00:00.000Z",
  };
}

function storeFor(positions: NetworkPositionRow[]): Store {
  return {
    payment_intents: [],
    network_positions: positions,
    wallets: [
      wallet("w-g", "u-genesis", DEFAULT_GENESIS_WALLET),
      wallet("w-a", "u-a", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      wallet("w-l", "u-left", "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
      wallet("w-r", "u-right", "0xcccccccccccccccccccccccccccccccccccccccc"),
      wallet("w-n", "u-new", "0xdddddddddddddddddddddddddddddddddddddddd"),
    ],
    users: [
      user("u-genesis", "GXGLOBAL"),
      user("u-a", "GXAAAAAA"),
      user("u-left", "GXLEFTAA"),
      user("u-right", "GXRIGHTA"),
      user("u-new", "GXNEWAAA"),
    ],
    plans: PLANS.map((id, i) => ({
      id,
      code: id,
      name: id,
      amount_usd: id === "PLAN_SYNTH" ? 777 : Number(id.replace("PLAN_", "")) || 100,
      token: "USDT",
      network: "mainnet",
      description: "",
      active: true,
      enabled: true,
      sort_order: i + 1,
      created_at: "2026-08-22T12:00:00.000Z",
      updated_at: "2026-08-22T12:00:00.000Z",
    })),
    referrals: [],
    transactions: [],
  } as unknown as Store;
}

function pendingReentry(store: Store, userId: string, plan: string) {
  return (store.payment_intents ?? []).filter(
    (i) => i.kind === "GLOBAL_REENTRY" && i.status === "PENDING" && i.mover_user_id === userId && i.plan_id === plan,
  );
}

describe("auto-queue re-entry when a cycle completes", () => {
  it.each(PLANS)("%s: LEFT+RIGHT ACTIVE queues exactly one pending quote; second run does not duplicate", (plan) => {
    const store = storeFor([
      pos(plan, "root", "u-a", null, null, 0),
      pos(plan, "left", "u-left", "root", "LEFT", 1),
    ]);
    const right = pos(plan, "right", "u-right", "root", "RIGHT", 1);
    store.network_positions.push(right);
    const beforeSeats = JSON.stringify(store.network_positions);
    afterActiveSeatCreated(store, right);
    expect(cycleComplete(store.network_positions.filter((p) => p.plan_id === plan), `${plan}-root`)).toBe(true);
    expect(pendingReentry(store, "u-a", plan)).toHaveLength(1);
    const intent = pendingReentry(store, "u-a", plan)[0]!;
    const hole = findFirstEmptyPlacement(
      store.network_positions.filter((p) => p.plan_id === plan),
      "u-a",
    );
    expect(intent.candidate_parent_position_id).toBe(hole.parent_id);
    expect(intent.candidate_position).toBe(hole.position);
    expect(JSON.stringify(store.network_positions)).toBe(beforeSeats);

    afterActiveSeatCreated(store, right);
    syncReentryQuotesForCompletedCycles(store, plan);
    expect(pendingReentry(store, "u-a", plan)).toHaveLength(1);
    expect(JSON.stringify(store.network_positions)).toBe(beforeSeats);
  });

  it.each(PLANS)("%s: unpaid quote does not occupy; confirm moves ACTIVE", (plan) => {
    const store = storeFor([
      pos(plan, "root", "u-a", null, null, 0),
      pos(plan, "left", "u-left", "root", "LEFT", 1),
      pos(plan, "right", "u-right", "root", "RIGHT", 1),
    ]);
    afterActiveSeatCreated(store, store.network_positions[2]!);
    const intent = pendingReentry(store, "u-a", plan)[0]!;
    const quote = firstEmptyQuote(store, plan, "u-a");
    expect(intent.candidate_parent_position_id).toBe(quote.parent_id);
    expect(store.network_positions.filter((p) => p.user_id === "u-a" && p.plan_id === plan && (p.status ?? "ACTIVE") === "ACTIVE")).toHaveLength(1);

    const placed = confirmReentryFromIntent(store, "u-a", plan, `0xre-${plan}`, intent.candidate_recipient_wallet!);
    expect(store.network_positions.find((p) => p.id === `${plan}-root`)?.status).toBe("HISTORY");
    expect(placed.status).toBe("ACTIVE");
    expect(placed.parent_id).toBe(intent.candidate_parent_position_id);
    expect(placed.position).toBe(intent.candidate_position);
    expect(pendingReentry(store, "u-a", plan)).toHaveLength(0);
  });

  it.each(PLANS)("%s: PREPARE does not queue; Direct #2 that funds the cycle does not add GLOBAL_REENTRY", (plan) => {
    const store = storeFor([
      pos(plan, "root", "u-a", null, null, 0),
      pos(plan, "left", "u-left", "root", "LEFT", 1),
    ]);
    store.users.push(user("u-sx", "GXSPONX"), user("u-bx", "GXBUYERX"));
    store.wallets.push(wallet("w-sx", "u-sx", "0x1111111111111111111111111111111111111111"));
    const before = JSON.stringify(store.network_positions);
    quoteDirect2InStore(store, "u-sx", plan, "u-bx");
    expect(JSON.stringify(store.network_positions)).toBe(before);
    expect(pendingReentry(store, "u-a", plan)).toHaveLength(0);

    confirmDirect2FromIntent(store, "u-bx", plan, `0xd2-${plan}`, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    const funded = (store.payment_intents ?? []).some(
      (i) => i.kind === "DIRECT2_PLACEMENT" && i.status === "CONFIRMED" && i.plan_id === plan && i.movement_user_id === "u-a",
    );
    if (funded) {
      expect(pendingReentry(store, "u-a", plan)).toHaveLength(0);
    }
  });

  it("genesis ACTIVE child that completes a parent queues that parent on every plan_id", () => {
    for (const plan of PLANS) {
      const store = storeFor([
        pos(plan, "root", "u-genesis", null, null, 0),
        pos(plan, "left", "u-left", "root", "LEFT", 1),
        pos(plan, "right", "u-right", "root", "RIGHT", 1),
        pos(plan, "lr", "u-new", "left", "RIGHT", 2),
      ]);
      const before = store.network_positions.length;
      applyGenesisReconciliation(store, plan);
      expect(store.network_positions.length).toBe(before + 1);
      expect(pendingReentry(store, "u-left", plan)).toHaveLength(1);
      expect(store.network_positions.filter((p) => p.plan_id === plan && (p.status ?? "ACTIVE") === "ACTIVE" && p.user_id === "u-genesis")).toHaveLength(1);
    }
  });
});
