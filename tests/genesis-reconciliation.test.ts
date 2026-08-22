import { describe, expect, it } from "vitest";
import { DEFAULT_GENESIS_WALLET } from "../lib/network-config";
import type { Store } from "../lib/store";
import { cycleComplete, findFirstEmptyPlacement } from "../network/placement";
import {
  ADMIN_GENESIS_RECONCILIATION,
  applyGenesisReconciliation,
  inspectGenesisAllPlans,
  inspectGenesisReconciliation,
} from "../services/genesis-reconciliation";
import { occupyingPosition, positionsForPlan } from "../services/users";
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

function storeFor(positions: NetworkPositionRow[]): Store {
  return {
    payment_intents: [],
    network_positions: positions,
    wallets: [
      {
        id: "wal-g",
        user_id: "u-genesis",
        address: DEFAULT_GENESIS_WALLET,
        wallet_type: "injected",
        chain_id: 137,
        verified: true,
        created_at: "2026-08-22T12:00:00.000Z",
      },
      {
        id: "wal-l",
        user_id: "u-left",
        address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        wallet_type: "injected",
        chain_id: 137,
        verified: true,
        created_at: "2026-08-22T12:00:00.000Z",
      },
      {
        id: "wal-r",
        user_id: "u-right",
        address: "0xcccccccccccccccccccccccccccccccccccccccc",
        wallet_type: "injected",
        chain_id: 137,
        verified: true,
        created_at: "2026-08-22T12:00:00.000Z",
      },
      {
        id: "wal-n",
        user_id: "u-normal",
        address: "0xdddddddddddddddddddddddddddddddddddddddd",
        wallet_type: "injected",
        chain_id: 137,
        verified: true,
        created_at: "2026-08-22T12:00:00.000Z",
      },
    ],
    users: [
      {
        id: "u-genesis",
        referral_code: "GXGLOBAL",
        sponsor_id: null,
        is_demo: false,
        display_name: "genesis",
        created_at: "2026-08-22T12:00:00.000Z",
      },
      {
        id: "u-left",
        referral_code: "GXLEFTAA",
        sponsor_id: null,
        is_demo: false,
        display_name: "left",
        created_at: "2026-08-22T12:00:00.000Z",
      },
      {
        id: "u-right",
        referral_code: "GXRIGHTA",
        sponsor_id: null,
        is_demo: false,
        display_name: "right",
        created_at: "2026-08-22T12:00:00.000Z",
      },
      {
        id: "u-normal",
        referral_code: "GXNORMAL",
        sponsor_id: null,
        is_demo: false,
        display_name: "normal",
        created_at: "2026-08-22T12:00:00.000Z",
      },
    ],
    plans: PLANS.map((id, i) => ({
      id,
      code: id,
      name: id,
      amount_usd: 100,
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
    transactions: [
      {
        id: "tx-gen-100",
        user_id: "u-genesis",
        payer_wallet: DEFAULT_GENESIS_WALLET,
        recipient_wallet: "0x1111111111111111111111111111111111111111",
        amount: "100000000",
        token: "USDT",
        token_contract: "0x2222",
        chain_id: 137,
        tx_hash: "0xaaaa",
        payment_type: "PLAN_PURCHASE",
        plan_id: "PLAN_100",
        plan_code: "PLAN_100",
        status: "CONFIRMED",
        recipient_role: "COMPANY_GENESIS",
        created_at: "2026-08-22T12:00:00.000Z",
      },
    ],
  } as unknown as Store;
}

function completeRoot(plan: string, rootUser = "u-genesis") {
  return [
    pos(plan, "root", rootUser, null, null, 0),
    pos(plan, "left", "u-left", "root", "LEFT", 1),
    pos(plan, "right", "u-right", "root", "RIGHT", 1),
  ];
}

describe("generic genesis/root reconciliation", () => {
  it("is safe for every plan_id including PLAN_SYNTH when GXGLOBAL is ACTIVE ROOT with a cycle", () => {
    const store = storeFor(PLANS.flatMap((plan) => completeRoot(plan)));
    const reports = inspectGenesisAllPlans(store);
    expect(reports).toHaveLength(PLANS.length);
    for (const plan of PLANS) {
      const r = reports.find((x) => x.plan_id === plan)!;
      expect(r.root_active).toBe(true);
      expect(r.cycle_complete).toBe(true);
      expect(r.valid_global_reentry_exists).toBe(false);
      expect(r.safe_for_genesis_reconciliation).toBe(true);
      expect(r.current_legal_first_empty).toEqual({
        parent_id: `${plan}-left`,
        parent_user_id: "u-left",
        position: "LEFT",
        depth: 2,
      });
      const hole = findFirstEmptyPlacement(positionsForPlan(store.network_positions, plan), "u-genesis");
      expect(hole.parent_id).toBe(r.current_legal_first_empty?.parent_id);
      expect(hole.position).toBe(r.current_legal_first_empty?.position);
    }
  });

  it("does not bypass re-entry for a normal user who is ROOT with a complete cycle", () => {
    const store = storeFor(completeRoot("PLAN_100", "u-normal"));
    const r = inspectGenesisReconciliation(store, "PLAN_100");
    expect(r.root_user_id).toBe("u-normal");
    expect(r.cycle_complete).toBe(true);
    expect(r.safe_for_genesis_reconciliation).toBe(false);
    expect(r.reasons).toContain("ROOT_USER_NOT_GENESIS");
    expect(() => applyGenesisReconciliation(store, "PLAN_100")).toThrow(/GENESIS_RECONCILE_BLOCKED/);
    expect(occupyingPosition(store.network_positions, "u-normal", "PLAN_100")?.parent_id).toBeNull();
  });

  it("moves genesis to the shared first-empty, then second apply creates 0 seats", () => {
    const store = storeFor(completeRoot("PLAN_500"));
    const txSnap = JSON.stringify(store.transactions);
    const refSnap = JSON.stringify(store.referrals);
    const walSnap = JSON.stringify(store.wallets);
    const beforeCount = store.network_positions.length;
    const placed = applyGenesisReconciliation(store, "PLAN_500");
    expect(placed?.parent_id).toBe("PLAN_500-left");
    expect(placed?.position).toBe("LEFT");
    expect(placed?.source).toBe(ADMIN_GENESIS_RECONCILIATION);
    expect(placed?.reentry_tx_hash).toBeNull();
    expect(store.network_positions.find((p) => p.id === "PLAN_500-root")?.status).toBe("HISTORY");
    expect(occupyingPosition(store.network_positions, "u-genesis", "PLAN_500")?.id).toBe(placed?.id);
    expect(cycleComplete(positionsForPlan(store.network_positions, "PLAN_500"), "PLAN_500-left")).toBe(false);
    expect(JSON.stringify(store.transactions)).toBe(txSnap);
    expect(JSON.stringify(store.referrals)).toBe(refSnap);
    expect(JSON.stringify(store.wallets)).toBe(walSnap);
    expect(store.payment_intents).toEqual([]);

    const again = applyGenesisReconciliation(store, "PLAN_500");
    expect(again?.id).toBe(placed?.id);
    expect(store.network_positions.length).toBe(beforeCount + 1);

    const after = inspectGenesisReconciliation(store, "PLAN_500");
    expect(after.already_reconciled).toBe(true);
    expect(after.safe_for_genesis_reconciliation).toBe(false);
    expect(after.root_active).toBe(false);
  });

  it("does not apply when a confirmed GLOBAL_REENTRY exists for that plan", () => {
    const store = storeFor(completeRoot("PLAN_1000"));
    store.transactions.push({
      id: "tx-re",
      user_id: "u-genesis",
      payer_wallet: DEFAULT_GENESIS_WALLET,
      recipient_wallet: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      amount: "1000000000",
      token: "USDT",
      token_contract: "0x2222",
      chain_id: 137,
      tx_hash: "0xreentry",
      payment_type: "GLOBAL_REENTRY",
      plan_id: "PLAN_1000",
      plan_code: "PLAN_1000",
      status: "CONFIRMED",
      recipient_role: "GLOBAL_REENTRY",
      created_at: "2026-08-22T12:00:00.000Z",
    });
    const r = inspectGenesisReconciliation(store, "PLAN_1000");
    expect(r.valid_global_reentry_exists).toBe(true);
    expect(r.safe_for_genesis_reconciliation).toBe(false);
    expect(() => applyGenesisReconciliation(store, "PLAN_1000")).toThrow(/CONFIRMED_GLOBAL_REENTRY_EXISTS/);
  });

  it("stops if the legal hole changed before apply", () => {
    const store = storeFor(completeRoot("PLAN_100"));
    const report = inspectGenesisReconciliation(store, "PLAN_100");
    expect(report.safe_for_genesis_reconciliation).toBe(true);
    store.network_positions.push(pos("PLAN_100", "steal", "u-normal", "left", "LEFT", 2));
    expect(() =>
      applyGenesisReconciliation(store, "PLAN_100", {
        parent_id: report.current_legal_first_empty!.parent_id,
        position: report.current_legal_first_empty!.position,
      }),
    ).toThrow(/GENESIS_RECONCILE_STALE_HOLE/);
    expect(occupyingPosition(store.network_positions, "u-genesis", "PLAN_100")?.id).toBe("PLAN_100-root");
  });

  it("does not rewrite COMPANY_GENESIS plan purchases as GLOBAL_REENTRY", () => {
    const store = storeFor(completeRoot("PLAN_100"));
    applyGenesisReconciliation(store, "PLAN_100");
    expect(store.transactions.every((t) => t.payment_type !== "GLOBAL_REENTRY")).toBe(true);
    expect(store.transactions[0]?.recipient_role).toBe("COMPANY_GENESIS");
  });
});
