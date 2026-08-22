import { describe, expect, it } from "vitest";
import { DEFAULT_GENESIS_WALLET } from "../lib/network-config";
import type { Store } from "../lib/store";
import { cycleComplete, findFirstEmptyPlacement, isActiveNode } from "../network/placement";
import {
  applyLegacyFundedMovement,
  inspectLegacyFundedMovement,
  LEGACY_FUNDED_MOVEMENT_RECONCILIATION,
} from "../services/legacy-funded-movement";
import { occupyingPosition } from "../services/users";
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

function fundedComplete(plan: (typeof PLANS)[number]) {
  const store = storeFor([
    pos(plan, "root", "u-a", null, null, 0),
    pos(plan, "left", "u-left", "root", "LEFT", 1),
    pos(plan, "right", "u-right", "root", "RIGHT", 1),
  ]);
  const hash = `0xlegacy-move-${plan}`;
  store.network_positions.push({
    ...pos(plan, "ghost", "u-a", "left", "LEFT", 2, "HISTORY"),
    from_position_id: `${plan}-root`,
    reentry_tx_hash: hash,
    funded_by_user_id: "u-new",
  });
  store.transactions.push({
    id: `tx-${plan}-d2`,
    user_id: "u-new",
    payer_wallet: "0xdddddddddddddddddddddddddddddddddddddddd",
    recipient_wallet: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    amount: "100000000",
    token: "USDT",
    token_contract: "0x1111",
    chain_id: 137,
    tx_hash: hash,
    payment_type: "PLAN_PURCHASE",
    plan_id: plan,
    plan_code: plan,
    status: "CONFIRMED",
    recipient_role: "GLOBAL_UPLINE",
    routing_slot: 2,
    direct_number: 2,
    position_id: `${plan}-ghost`,
    created_at: "2026-08-22T12:00:00.000Z",
  });
  return store;
}

describe("legacy funded movement finalization", () => {
  it.each(PLANS)("%s: inspects current first-empty and finalizes without a new payment", (plan) => {
    const store = fundedComplete(plan);
    const fromId = `${plan}-root`;
    const txsBefore = JSON.stringify(store.transactions);
    const legal = findFirstEmptyPlacement(
      store.network_positions.filter((p) => p.plan_id === plan),
      "u-a",
    );
    const report = inspectLegacyFundedMovement(store, plan, fromId);
    expect(report.source_active).toBe(true);
    expect(report.cycle_complete).toBe(true);
    expect(report.already_funded).toBe(true);
    expect(report.safe_to_finalize_without_new_payment).toBe(true);
    expect(report.current_legal_first_empty?.parent_id).toBe(legal.parent_id);
    expect(report.current_legal_first_empty?.position).toBe(legal.position);

    const placed = applyLegacyFundedMovement(store, plan, fromId, {
      parent_id: legal.parent_id,
      position: legal.position,
    });
    expect(store.network_positions.find((p) => p.id === fromId)?.status).toBe("HISTORY");
    expect(placed.status).toBe("ACTIVE");
    expect(placed.parent_id).toBe(legal.parent_id);
    expect(placed.position).toBe(legal.position);
    expect(placed.source).toBe(LEGACY_FUNDED_MOVEMENT_RECONCILIATION);
    expect(placed.reentry_tx_hash).toBe(`0xlegacy-move-${plan}`);
    expect(occupyingPosition(store.network_positions, "u-a", plan)?.id).toBe(placed.id);
    expect(store.network_positions.filter((p) => p.user_id === "u-a" && p.plan_id === plan && isActiveNode(p))).toHaveLength(1);
    expect(store.transactions.filter((t) => t.payment_type === "GLOBAL_REENTRY")).toHaveLength(0);
    expect(JSON.stringify(store.transactions)).toBe(txsBefore);
    expect(inspectLegacyFundedMovement(store, plan, fromId).already_finalized).toBe(true);
    expect(applyLegacyFundedMovement(store, plan, fromId).id).toBe(placed.id);
  });

  it.each(PLANS)("%s: refuses when the cycle is not funded", (plan) => {
    const store = storeFor([
      pos(plan, "root", "u-a", null, null, 0),
      pos(plan, "left", "u-left", "root", "LEFT", 1),
      pos(plan, "right", "u-right", "root", "RIGHT", 1),
    ]);
    const report = inspectLegacyFundedMovement(store, plan, `${plan}-root`);
    expect(report.safe_to_finalize_without_new_payment).toBe(false);
    expect(report.reasons).toContain("CYCLE_NOT_FUNDED");
    expect(() => applyLegacyFundedMovement(store, plan, `${plan}-root`)).toThrow(/LEGACY_FUNDED_MOVE_BLOCKED/);
  });

  it.each(PLANS)("%s: refuses when LEFT+RIGHT are not both ACTIVE", (plan) => {
    const store = storeFor([pos(plan, "root", "u-a", null, null, 0), pos(plan, "left", "u-left", "root", "LEFT", 1)]);
    store.network_positions.push({
      ...pos(plan, "ghost", "u-a", "left", "LEFT", 2, "HISTORY"),
      from_position_id: `${plan}-root`,
      reentry_tx_hash: `0x${plan}`,
      funded_by_user_id: "u-new",
    });
    store.transactions.push({
      id: `tx-${plan}-half`,
      user_id: "u-new",
      payer_wallet: "0xdd",
      recipient_wallet: "0xbb",
      amount: "1",
      token: "USDT",
      token_contract: "0x1",
      chain_id: 137,
      tx_hash: `0x${plan}`,
      payment_type: "PLAN_PURCHASE",
      plan_id: plan,
      plan_code: plan,
      status: "CONFIRMED",
      recipient_role: "GLOBAL_UPLINE",
      direct_number: 2,
      position_id: `${plan}-ghost`,
      created_at: "2026-08-22T12:00:00.000Z",
    });
    expect(cycleComplete(store.network_positions.filter((p) => p.plan_id === plan), `${plan}-root`)).toBe(false);
    expect(inspectLegacyFundedMovement(store, plan, `${plan}-root`).reasons).toContain("CYCLE_INCOMPLETE");
  });
});
