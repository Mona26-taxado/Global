import { describe, expect, it } from "vitest";
import { auditPlanGlobalBackfill, applyPlanGlobalBackfill } from "../lib/plan-global-reconcile";
import type { Store } from "../lib/store";
import type { NetworkPositionRow, ReferralRow, TransactionRow, UserRow } from "../types";

function user(id: string, code: string, extra?: Partial<UserRow>): UserRow {
  return {
    id,
    referral_code: code,
    sponsor_id: extra?.sponsor_id ?? null,
    is_demo: false,
    display_name: code,
    created_at: "2026-01-01T00:00:00.000Z",
    ...extra,
  };
}

function tx(userId: string, planId: string, created = "2026-01-01T00:00:00.000Z"): TransactionRow {
  return {
    id: `tx_${userId}_${planId}`,
    user_id: userId,
    payer_wallet: "0x1",
    recipient_wallet: "0x2",
    amount: "1",
    token: "USDT",
    token_contract: "0x3",
    chain_id: 80002,
    tx_hash: `h_${userId}_${planId}`,
    payment_type: "PLAN_PURCHASE",
    plan_id: planId,
    plan_code: planId,
    status: "CONFIRMED",
    created_at: created,
  };
}

function ref(sponsorId: string, userId: string, n: 1 | 2): ReferralRow {
  return { id: `ref_${sponsorId}_${n}`, user_id: userId, sponsor_id: sponsorId, referral_code: sponsorId, direct_number: n, status: "ACTIVE" };
}

function pos(partial: Partial<NetworkPositionRow> & Pick<NetworkPositionRow, "id" | "user_id" | "plan_id">): NetworkPositionRow {
  return {
    parent_id: null,
    position: null,
    depth: 0,
    cycle: 0,
    status: "ACTIVE",
    ...partial,
  };
}

function store(partial: Partial<Store>): Store {
  return {
    users: [],
    wallets: [],
    nonces: [],
    referrals: [],
    registrations: [],
    plans: [
      { id: "PLAN_100", code: "PLAN_100", name: "$100", amount_usd: 100, token: "USDT", network: "amoy", description: "", active: true, enabled: true, sort_order: 1, created_at: "t", updated_at: "t" },
      { id: "PLAN_200", code: "PLAN_200", name: "$200", amount_usd: 200, token: "USDT", network: "amoy", description: "", active: true, enabled: true, sort_order: 2, created_at: "t", updated_at: "t" },
    ],
    transactions: [],
    network_positions: [],
    tokenpocket_actions: [],
    global_config: {
      qualification_rule: "",
      global_entry_condition: "",
      two_branch_cycle: "",
      placement_rule: "",
      cycle_completion: "",
      position_movement: "",
    },
    ...partial,
  };
}

describe("PLAN_200 Global backfill dry-run", () => {
  const users = [
    user("user_root", "GXGLOBAL", { is_demo: true }),
    user("user_b", "GXB", { sponsor_id: null }),
    user("user_d", "GXD", { sponsor_id: "user_b" }),
    user("user_e", "GXE", { sponsor_id: "user_b" }),
    user("user_f", "GXF", { sponsor_id: "user_d" }),
    user("user_g", "GXG", { sponsor_id: "user_d" }),
  ];
  const referrals = [
    ref("user_b", "user_d", 1),
    ref("user_b", "user_e", 2),
    ref("user_d", "user_f", 1),
    ref("user_d", "user_g", 2),
  ];
  const wallets = users.map((u, i) => ({
    id: `wal_${u.id}`,
    user_id: u.id,
    address: `0x${String(i + 1).padStart(40, "0")}`,
    wallet_type: "injected",
    chain_id: 80002,
    verified: true,
    created_at: "t",
  }));

  it("does not place B while E is missing; places D at first-empty independently", () => {
    const s = store({
      users,
      wallets,
      referrals,
      transactions: [
        tx("user_b", "PLAN_200"),
        tx("user_d", "PLAN_200"),
        tx("user_f", "PLAN_200"),
        tx("user_g", "PLAN_200", "2026-01-02T00:00:00.000Z"),
        tx("user_b", "PLAN_100"),
      ],
      network_positions: [
        pos({ id: "pos_root", user_id: "user_root", plan_id: "PLAN_200", depth: 0 }),
        pos({ id: "pos_b100", user_id: "user_b", plan_id: "PLAN_100", depth: 0 }),
      ],
    });
    const originalTx = JSON.stringify(s.transactions);
    const original100 = s.network_positions.filter((p) => p.plan_id === "PLAN_100").map((p) => p.id);
    const audit = auditPlanGlobalBackfill(s, "PLAN_200");
    expect(audit.dry_run).toBe(true);
    expect(audit.waiting_not_qualified.some((w) => w.referral_code === "GXB")).toBe(true);
    expect(audit.qualified_missing_seats).toHaveLength(1);
    const d = audit.qualified_missing_seats[0]!;
    expect(d.user.referral_code).toBe("GXD");
    expect(d.direct1.referral_code).toBe("GXF");
    expect(d.direct2.referral_code).toBe("GXG");
    expect(d.currently_has_plan_global_seat).toBe(false);
    expect(d.first_empty?.parent_position_id).toBe("pos_root");
    expect(d.first_empty?.position).toBe("LEFT");
    expect(audit.plan_100_changes).toBe("NONE");
    expect(audit.confirmed_transactions_rewritten).toBe("NONE");
    expect(JSON.stringify(s.transactions)).toBe(originalTx);
    expect(s.network_positions.filter((p) => p.plan_id === "PLAN_100").map((p) => p.id)).toEqual(original100);
    expect(s.network_positions.some((p) => p.user_id === "user_d" && p.plan_id === "PLAN_200")).toBe(false);
  });

  it("is idempotent when D already occupies PLAN_200", () => {
    const s = store({
      users,
      wallets,
      referrals,
      transactions: [tx("user_d", "PLAN_200"), tx("user_f", "PLAN_200"), tx("user_g", "PLAN_200")],
      network_positions: [
        pos({ id: "pos_root", user_id: "user_root", plan_id: "PLAN_200" }),
        pos({ id: "pos_d", user_id: "user_d", plan_id: "PLAN_200", parent_id: "pos_root", position: "LEFT", depth: 1 }),
      ],
    });
    const audit = auditPlanGlobalBackfill(s, "PLAN_200");
    expect(audit.qualified_missing_seats).toHaveLength(0);
    expect(audit.qualified_already_seated.some((x) => x.referral_code === "GXD" && x.position_id === "pos_d")).toBe(true);
  });

  it("apply inserts D once and a second apply is a no-op", () => {
    const s = store({
      users,
      wallets,
      referrals,
      transactions: [tx("user_b", "PLAN_200"), tx("user_d", "PLAN_200"), tx("user_f", "PLAN_200"), tx("user_g", "PLAN_200")],
      network_positions: [pos({ id: "pos_root", user_id: "user_root", plan_id: "PLAN_200", depth: 0 })],
    });
    const first = applyPlanGlobalBackfill(s, "PLAN_200");
    expect(first).toHaveLength(1);
    expect(first[0]?.user_id).toBe("user_d");
    expect(first[0]?.position).toBe("LEFT");
    expect(first[0]?.status).toBe("ACTIVE");
    const txs = s.transactions.length;
    const second = applyPlanGlobalBackfill(s, "PLAN_200");
    expect(second).toHaveLength(0);
    expect(s.transactions).toHaveLength(txs);
    expect(s.network_positions.filter((p) => p.user_id === "user_d" && p.plan_id === "PLAN_200" && (p.status ?? "ACTIVE") === "ACTIVE")).toHaveLength(1);
  });
});
