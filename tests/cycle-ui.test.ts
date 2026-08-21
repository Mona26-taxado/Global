import { describe, expect, it } from "vitest";
import { legacyRecordIds, logicalCurrentTree, routingLabel, type NetNode } from "../lib/cycle-ui";

describe("payment route labels", () => {
  it("maps Direct #1 / Direct #2 / re-entry to locked UI names", () => {
    expect(routingLabel("SPONSOR", 1)).toBe("DIRECT FIRST");
    expect(routingLabel("GLOBAL_UPLINE", 2)).toBe("GLOBAL SECOND");
    expect(routingLabel("GLOBAL_REENTRY", null)).toBe("GLOBAL REENTRY");
  });
});

function n(partial: Partial<NetNode> & Pick<NetNode, "id" | "user_id">): NetNode {
  return {
    parent_id: null,
    position: null,
    depth: 0,
    status: "ACTIVE",
    ...partial,
  };
}

describe("logicalCurrentTree", () => {
  it("places the second live member at ROOT.RIGHT and reserves ROOT under LEFT", () => {
    const persisted: NetNode[] = [
      n({ id: "root", user_id: "uRoot", started_at: "2026-01-01T00:00:00.000Z", depth: 0, user: { referral_code: "GXGLOBAL", display_name: "Root", is_demo: false } }),
      n({
        id: "e8e1",
        user_id: "uLeft",
        parent_id: "root",
        position: "LEFT",
        depth: 1,
        started_at: "2026-01-01T00:00:00.000Z",
        user: { referral_code: "GXFOUNDER", display_name: "L", is_demo: false },
      }),
      n({
        id: "8502",
        user_id: "uDeep",
        parent_id: "e8e1",
        position: "LEFT",
        depth: 2,
        started_at: "2026-01-01T01:00:00.000Z",
        user: { referral_code: "GX7XMLR6", display_name: "R", is_demo: false },
      }),
    ];
    const logical = logicalCurrentTree(persisted);
    const left = logical.find((p) => p.id === "e8e1")!;
    const right = logical.find((p) => p.id === "8502")!;
    const reserved = logical.find((p) => p.status === "RESERVED")!;
    expect(left.parent_id).toBe("root");
    expect(left.position).toBe("LEFT");
    expect(right.parent_id).toBe("root");
    expect(right.position).toBe("RIGHT");
    expect(reserved.user_id).toBe("uRoot");
    expect(reserved.parent_id).toBe("e8e1");
    expect(reserved.position).toBe("LEFT");
    expect(reserved.source_is_root).toBe(true);
    expect(legacyRecordIds(persisted, logical).has("8502")).toBe(true);
    expect(legacyRecordIds(persisted, logical).has("e8e1")).toBe(false);
  });

  it("does not invent a RESERVED seat when ROOT.RIGHT is still empty", () => {
    const persisted: NetNode[] = [
      n({ id: "root", user_id: "uRoot", started_at: "t0" }),
      n({ id: "left", user_id: "uLeft", parent_id: "root", position: "LEFT", depth: 1, started_at: "t1" }),
    ];
    const logical = logicalCurrentTree(persisted);
    expect(logical.filter((p) => p.status === "RESERVED")).toHaveLength(0);
    expect(logical.find((p) => p.id === "left")?.position).toBe("LEFT");
  });
});
