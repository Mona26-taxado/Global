import { describe, expect, it } from "vitest";
import { globalParentUserId, planDirectSlot, PlanRoutingError } from "../payments/plan-routing";
import type { NetworkPositionRow } from "../types";

describe("plan direct slots", () => {
  it("first occupied 0 is Direct #1 (pays sponsor)", () => {
    expect(planDirectSlot(0)).toBe(1);
  });
  it("second is Direct #2 (pays Global upline after placement)", () => {
    expect(planDirectSlot(1)).toBe(2);
  });
  it("rejects a third direct", () => {
    try {
      planDirectSlot(2);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(PlanRoutingError);
      expect((error as PlanRoutingError).code).toBe("DIRECT_REFERRAL_LIMIT_REACHED");
    }
  });
});

describe("global parent", () => {
  it("resolves parent user from position parent_id", () => {
    const positions: NetworkPositionRow[] = [
      { id: "pos_c", user_id: "company", parent_id: null, position: null, depth: 0, cycle: 0 },
      { id: "pos_x", user_id: "X", parent_id: "pos_c", position: "LEFT", depth: 1, cycle: 0 },
    ];
    expect(globalParentUserId(positions, "X")).toBe("company");
  });
  it("returns null when sponsor is root (Pay must wait)", () => {
    const positions: NetworkPositionRow[] = [
      { id: "pos_x", user_id: "X", parent_id: null, position: null, depth: 0, cycle: 0 },
    ];
    expect(globalParentUserId(positions, "X")).toBe(null);
  });
});
