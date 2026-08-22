import { describe, expect, it } from "vitest";
import { qualifiesForPlanGlobal } from "../lib/plan-progress";
import type { ReferralRow, TransactionRow } from "../types";

function tx(userId: string, planId: string): TransactionRow {
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
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

function ref(sponsorId: string, userId: string, n: 1 | 2): ReferralRow {
  return {
    id: `ref_${sponsorId}_${n}`,
    user_id: userId,
    sponsor_id: sponsorId,
    referral_code: sponsorId,
    direct_number: n,
    status: "ACTIVE",
  };
}

describe("higher-plan Global qualification is local to each user", () => {
  const referrals = [
    ref("user_b", "user_d", 1),
    ref("user_b", "user_e", 2),
    ref("user_d", "user_f", 1),
    ref("user_d", "user_g", 2),
  ];

  it("B waits because E is missing P200; D qualifies through F+G without B in Global", () => {
    const transactions = [tx("user_b", "P2"), tx("user_d", "P2"), tx("user_f", "P2"), tx("user_g", "P2")];
    const store = { transactions, referrals };
    expect(qualifiesForPlanGlobal(store, "user_b", "P2")).toBe(false);
    expect(qualifiesForPlanGlobal(store, "user_d", "P2")).toBe(true);
  });

  it("does not require the sponsor/upline to have plan P", () => {
    const transactions = [tx("user_d", "P2"), tx("user_f", "P2"), tx("user_g", "P2")];
    expect(qualifiesForPlanGlobal({ transactions, referrals }, "user_d", "P2")).toBe(true);
  });

  it("B waits because E is missing PLAN_100; D qualifies through F+G without B in Global", () => {
    const tree = [
      ref("user_b", "user_d", 1),
      ref("user_b", "user_e", 2),
      ref("user_d", "user_f", 1),
      ref("user_d", "user_g", 2),
    ];
    const transactions = [tx("user_b", "PLAN_100"), tx("user_d", "PLAN_100"), tx("user_f", "PLAN_100"), tx("user_g", "PLAN_100")];
    expect(qualifiesForPlanGlobal({ transactions, referrals: tree }, "user_b", "PLAN_100")).toBe(false);
    expect(qualifiesForPlanGlobal({ transactions, referrals: tree }, "user_d", "PLAN_100")).toBe(true);
  });
});
