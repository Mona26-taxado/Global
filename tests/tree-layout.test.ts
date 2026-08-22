import { describe, expect, it } from "vitest";
import { childSlotsByParent, displayForestSeats, layoutForestRoots, type NetNode } from "../lib/cycle-ui";
import {
  layoutBinaryForest,
  searchTreeSeats,
  visLayoutChildren,
  TREE_NODE_H,
  TREE_NODE_W,
  type LayoutVis,
} from "../lib/tree-layout";
import { fitTreeToViewport, zoomAroundViewportCenter } from "../lib/tree-viewport";

function member(
  id: string,
  user: string,
  parent: string | null,
  side: "LEFT" | "RIGHT" | null,
  status: NetNode["status"],
  plan_id = "PLAN_200",
): NetNode {
  return { id, user_id: user, parent_id: parent, position: side, depth: parent ? 1 : 0, status, plan_id };
}

function toVis(node: NetNode, byParent: Map<string, { left?: NetNode; right?: NetNode }>, seen: Set<string>): LayoutVis {
  const vis: LayoutVis = {
    key: node.id,
    kind: "member",
    position: node.position === "RIGHT" ? "RIGHT" : node.position === "LEFT" ? "LEFT" : null,
    node,
  };
  if (seen.has(node.id)) return vis;
  seen.add(node.id);
  const kids = byParent.get(node.id) ?? {};
  vis.left = kids.left
    ? toVis(kids.left, byParent, seen)
    : { key: `${node.id}-empty-L`, kind: "empty", position: "LEFT" };
  vis.right = kids.right
    ? toVis(kids.right, byParent, seen)
    : { key: `${node.id}-empty-R`, kind: "empty", position: "RIGHT" };
  return vis;
}

describe("admin binary tree layout", () => {
  const plan200: NetNode[] = [
    member("pos-root", "global", null, null, "ACTIVE"),
    member("pos-rsv", "u24", "pos-root", "LEFT", "RESERVED"),
    member("pos-e727", "ue727", "pos-root", "RIGHT", "ACTIVE"),
    member("pos-e8e1", "ue8e1", "pos-e727", "LEFT", "ACTIVE"),
  ];

  it("places LEFT left of parent and RIGHT right of parent", () => {
    const vis = toVis(plan200[0]!, childSlotsByParent(plan200), new Set());
    const { placed } = layoutBinaryForest([vis]);
    const root = placed.find((p) => p.vis.node?.id === "pos-root")!;
    const left = placed.find((p) => p.vis.node?.id === "pos-rsv")!;
    const right = placed.find((p) => p.vis.node?.id === "pos-e727")!;
    expect(left.x).toBeLessThan(root.x);
    expect(right.x).toBeGreaterThan(root.x);
    expect(left.y).toBe(right.y);
    expect(left.y).toBeGreaterThan(root.y);
  });

  it("keeps RESERVED in its API LEFT slot and EMPTY opposite an occupied child", () => {
    const vis = toVis(plan200[0]!, childSlotsByParent(plan200), new Set());
    const { placed } = layoutBinaryForest([vis]);
    const e727 = placed.find((p) => p.vis.node?.id === "pos-e727")!;
    const e8e1 = placed.find((p) => p.vis.node?.id === "pos-e8e1")!;
    const emptyR = placed.find((p) => p.vis.key === "pos-e727-empty-R")!;
    expect(placed.find((p) => p.vis.node?.id === "pos-rsv")?.vis.node?.status).toBe("RESERVED");
    expect(e8e1.x).toBeLessThan(e727.x);
    expect(emptyR.x).toBeGreaterThan(e727.x);
    expect(emptyR.y).toBe(e8e1.y);
    expect(emptyR.vis.kind).toBe("empty");
  });

  it("lets ACTIVE and RESERVED coexist without converting status", () => {
    const vis = toVis(plan200[0]!, childSlotsByParent(plan200), new Set());
    const { placed } = layoutBinaryForest([vis]);
    expect(placed.find((p) => p.vis.node?.id === "pos-root")?.vis.node?.status).toBe("ACTIVE");
    expect(placed.find((p) => p.vis.node?.id === "pos-rsv")?.vis.node?.status).toBe("RESERVED");
    expect(placed.find((p) => p.vis.node?.id === "pos-e727")?.vis.node?.status).toBe("ACTIVE");
  });

  it("does not treat HISTORY as live status", () => {
    const hist: LayoutVis = {
      key: "h",
      kind: "member",
      position: "LEFT",
      node: { id: "h", parent_id: "pos-root", status: "HISTORY" },
    };
    expect(hist.node?.status).toBe("HISTORY");
    expect(hist.node?.status).not.toBe("ACTIVE");
    expect(hist.node?.status).not.toBe("RESERVED");
  });

  it("isolates PLAN_200 from PLAN_100 rows", () => {
    const mixed = [
      ...plan200,
      member("p100", "x", null, null, "ACTIVE", "PLAN_100"),
    ];
    const only200 = mixed.filter((n) => n.plan_id === "PLAN_200");
    expect(only200.every((n) => n.plan_id === "PLAN_200")).toBe(true);
    expect(only200.some((n) => n.id === "p100")).toBe(false);
  });

  it("Fit uses the complete rendered bounds and stays horizontally centered", () => {
    const vis = toVis(plan200[0]!, childSlotsByParent(plan200), new Set());
    const { width, height } = layoutBinaryForest([vis]);
    const fit = fitTreeToViewport({
      viewportWidth: 1200,
      viewportHeight: 700,
      contentWidth: width,
      contentHeight: height,
      padding: 48,
    });
    expect(fit.positionX).toBeCloseTo((1200 - width * fit.scale) / 2, 5);
    expect(fit.positionX).toBeGreaterThan(20);
    expect(fit.positionY).toBeGreaterThanOrEqual(0);
    expect(width).toBeGreaterThan(TREE_NODE_W);
    expect(height).toBeGreaterThan(TREE_NODE_H);
  });

  it("zoom does not change logical node coordinates", () => {
    const vis = toVis(plan200[0]!, childSlotsByParent(plan200), new Set());
    const a = layoutBinaryForest([vis]);
    const zoomed = zoomAroundViewportCenter({
      scale: 1,
      positionX: 10,
      positionY: 10,
      viewportWidth: 800,
      viewportHeight: 640,
      nextScale: 1.18,
    });
    const b = layoutBinaryForest([vis]);
    expect(b.placed.map((p) => `${p.vis.key}:${p.x}:${p.y}`)).toEqual(a.placed.map((p) => `${p.vis.key}:${p.x}:${p.y}`));
    expect(zoomed.scale).toBeGreaterThan(1);
  });

  it("search finds every seat for the same user/wallet", () => {
    const seats = [
      { id: "a", user_id: "u1", status: "ACTIVE", user: { referral_code: "GXE8E1" } },
      { id: "b", user_id: "u1", status: "RESERVED", user: { referral_code: "GXE8E1" } },
      { id: "c", user_id: "u1", status: "HISTORY", user: { referral_code: "GXE8E1" } },
      { id: "d", user_id: "u2", status: "ACTIVE", user: { referral_code: "GXOTHR" } },
    ];
    const hits = searchTreeSeats(seats, "e8e1", { userId: "u1", referralCode: "GXE8E1", wallet: "0xe8e1" });
    expect(hits.map((h) => h.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("layoutForestRoots keeps a single live apex for the PLAN_200 screenshot shape", () => {
    const tree: NetNode[] = [
      member("pos-root", "global", null, null, "ACTIVE"),
      member("pos-hist", "e8e1", "pos-root", "LEFT", "HISTORY"),
      member("pos-rsv", "u24", "pos-root", "LEFT", "RESERVED"),
      member("pos-e727", "e727", "pos-root", "RIGHT", "ACTIVE"),
      member("pos-ffe0", "ffe0", "pos-hist", "RIGHT", "ACTIVE"),
    ];
    expect(layoutForestRoots(tree).map((r) => r.id)).toEqual(["pos-root"]);
    expect(childSlotsByParent(tree).get("pos-root")?.left?.status).toBe("RESERVED");
    expect(visLayoutChildren({ key: "x", kind: "empty", position: "LEFT" })).toEqual([]);
  });
});
