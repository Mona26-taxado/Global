import { describe, expect, it } from "vitest";
import {
  composeReentryPaymentType,
  parsePaymentType,
  paymentTypeFromTokenPocketPayload,
} from "../payments/payment-type";

describe("GLOBAL_REENTRY:<planId> TokenPocket resume", () => {
  it("does not treat GLOBAL_REENTRY:planId as a single enum", () => {
    expect(parsePaymentType("GLOBAL_REENTRY")).toEqual({ kind: "GLOBAL_REENTRY" });
    expect(parsePaymentType("GLOBAL_REENTRY:P2")).toEqual({ kind: "GLOBAL_REENTRY", planId: "P2" });
    expect(parsePaymentType("GLOBAL_REENTRY:PLAN_100")).toEqual({ kind: "GLOBAL_REENTRY", planId: "PLAN_100" });
    expect(parsePaymentType("PLAN_100")).toEqual({ kind: "PLAN_100" });
  });

  it("restores payment type, plan_id, and recipient snapshot from the TP payload", () => {
    expect(composeReentryPaymentType("P2")).toBe("GLOBAL_REENTRY:P2");
    expect(
      paymentTypeFromTokenPocketPayload({
        paymentType: "GLOBAL_REENTRY:P2",
        kind: "GLOBAL_REENTRY",
        plan_id: "P2",
        recipient: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        positionId: "pos_reserved",
        amountUsd: 200,
      }),
    ).toBe("GLOBAL_REENTRY:P2");
    expect(
      paymentTypeFromTokenPocketPayload({
        kind: "GLOBAL_REENTRY",
        plan_id: "P2",
      }),
    ).toBe("GLOBAL_REENTRY:P2");
    expect(
      paymentTypeFromTokenPocketPayload({
        paymentType: "PLAN_100",
        kind: "PLAN_PURCHASE",
        plan_id: "PLAN_100",
      }),
    ).toBe("PLAN_100");
  });
});
