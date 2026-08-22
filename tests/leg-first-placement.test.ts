import { describe, expect, it } from "vitest";
import {
  cycleComplete,
  findFirstEmptyPlacement,
  findReentryPlacement,
  rootSecondLegUnlocked,
} from "../network/placement";
import { quoteDirect2InStore, quoteReentryInStore } from "../services/placement-intent";
import type { Store } from "../lib/store";
import type { NetworkPositionRow } from "../types";

const PLANS = ["PLAN_100", "PLAN_200", "PLAN_500", "PLAN_1000", "PLAN_SYNTH"] as const;

type Side = "LEFT" | "RIGHT" | null;
type Status = NonNullable<NetworkPositionRow["status"]>;

function n(
  id: string,
  user_id: string,
  parent_id: string | null,
  position: Side,
  depth: number,
  status: Status = "ACTIVE",
) {
  return { id, user_id, parent_id, position, depth, status };
}

function holeOf(nodes: ReturnType<typeof n>[], userId = "NEXT") {
  return findFirstEmptyPlacement(nodes, userId);
}

describe("leg-first Global allocator", () => {
  it("CASE 1: ROOT only → next = ROOT.LEFT", () => {
    const nodes = [n("root", "ROOT", null, null, 0)];
    const hole = holeOf(nodes);
    expect(hole.parent_id).toBe("root");
    expect(hole.position).toBe("LEFT");
  });

  it("CASE 2: ROOT.LEFT = A → next = A.LEFT, not ROOT.RIGHT", () => {
    const nodes = [n("root", "ROOT", null, null, 0), n("A", "A", "root", "LEFT", 1)];
    const hole = holeOf(nodes);
    expect(hole.parent_id).toBe("A");
    expect(hole.position).toBe("LEFT");
    expect(rootSecondLegUnlocked(nodes, "root")).toBe(false);
  });

  it("CASE 3: A.LEFT = B → next = A.RIGHT", () => {
    const nodes = [
      n("root", "ROOT", null, null, 0),
      n("A", "A", "root", "LEFT", 1),
      n("B", "B", "A", "LEFT", 2),
    ];
    const hole = holeOf(nodes);
    expect(hole.parent_id).toBe("A");
    expect(hole.position).toBe("RIGHT");
  });

  it("CASE 4: A.LEFT + A.RIGHT ACTIVE → ROOT.RIGHT eligible", () => {
    const nodes = [
      n("root", "ROOT", null, null, 0),
      n("A", "A", "root", "LEFT", 1),
      n("B", "B", "A", "LEFT", 2),
      n("C", "C", "A", "RIGHT", 2),
    ];
    expect(cycleComplete(nodes, "A")).toBe(true);
    expect(rootSecondLegUnlocked(nodes, "root")).toBe(true);
    const hole = holeOf(nodes);
    expect(hole.parent_id).toBe("root");
    expect(hole.position).toBe("RIGHT");
  });

  it("CASE 5: after ROOT.RIGHT opens, left subtree before right subtree, LEFT before RIGHT", () => {
    const nodes = [
      n("root", "ROOT", null, null, 0),
      n("A", "A", "root", "LEFT", 1),
      n("D", "D", "root", "RIGHT", 1),
      n("B", "B", "A", "LEFT", 2),
      n("C", "C", "A", "RIGHT", 2),
    ];
    const hole = holeOf(nodes);
    expect(hole.parent_id).toBe("B");
    expect(hole.position).toBe("LEFT");
    const withB = [...nodes, n("BL", "BL", "B", "LEFT", 3)];
    const next = holeOf(withB);
    expect(next.parent_id).toBe("B");
    expect(next.position).toBe("RIGHT");
  });

  it("CASE 6: A.LEFT RESERVED + A.RIGHT ACTIVE → ROOT.RIGHT locked", () => {
    const nodes = [
      n("root", "ROOT", null, null, 0),
      n("A", "A", "root", "LEFT", 1),
      n("B", "B", "A", "LEFT", 2, "RESERVED"),
      n("C", "C", "A", "RIGHT", 2),
    ];
    expect(cycleComplete(nodes, "A")).toBe(false);
    expect(rootSecondLegUnlocked(nodes, "root")).toBe(false);
    const hole = holeOf(nodes);
    expect(hole.parent_id).toBe("A");
    expect(hole.position).toBe("LEFT");
  });

  it("CASE 7: A.LEFT ACTIVE + A.RIGHT RESERVED → ROOT.RIGHT locked", () => {
    const nodes = [
      n("root", "ROOT", null, null, 0),
      n("A", "A", "root", "LEFT", 1),
      n("B", "B", "A", "LEFT", 2),
      n("C", "C", "A", "RIGHT", 2, "RESERVED"),
    ];
    expect(cycleComplete(nodes, "A")).toBe(false);
    expect(rootSecondLegUnlocked(nodes, "root")).toBe(false);
    const hole = holeOf(nodes);
    expect(hole.parent_id).toBe("A");
    expect(hole.position).toBe("RIGHT");
  });

  it("CASE 8: same holes for PLAN_100 / 200 / 500 / 1000 / PLAN_SYNTH", () => {
    const fingerprints = PLANS.map((plan) => {
      const scoped = [
        n(`${plan}-root`, "ROOT", null, null, 0),
        n(`${plan}-A`, "A", `${plan}-root`, "LEFT", 1),
      ];
      const h2 = holeOf(scoped);
      const withB = [...scoped, n(`${plan}-B`, "B", `${plan}-A`, "LEFT", 2)];
      const h3 = holeOf(withB);
      const withC = [...withB, n(`${plan}-C`, "C", `${plan}-A`, "RIGHT", 2)];
      const h4 = holeOf(withC);
      return {
        case2Parent: h2.parent_id?.endsWith("-A"),
        case2Side: h2.position,
        case3Side: h3.position,
        case4ParentRoot: h4.parent_id?.endsWith("-root"),
        case4Side: h4.position,
      };
    });
    for (const fp of fingerprints.slice(1)) {
      expect(fp).toEqual(fingerprints[0]);
    }
  });

  it("CASE 9: re-entry quote uses the same leg-first hole (ROOT.RIGHT after first-leg)", () => {
    const plan = "PLAN_200";
    const positions: NetworkPositionRow[] = [
      { id: "root", user_id: "u-root", plan_id: plan, parent_id: null, position: null, depth: 0, cycle: 0, status: "ACTIVE", started_at: "2026-08-22T00:00:00.000Z" },
      { id: "A", user_id: "u-a", plan_id: plan, parent_id: "root", position: "LEFT", depth: 1, cycle: 0, status: "ACTIVE", started_at: "2026-08-22T00:00:00.000Z" },
      { id: "B", user_id: "u-b", plan_id: plan, parent_id: "A", position: "LEFT", depth: 2, cycle: 1, status: "ACTIVE", started_at: "2026-08-22T00:00:00.000Z" },
      { id: "C", user_id: "u-c", plan_id: plan, parent_id: "A", position: "RIGHT", depth: 2, cycle: 1, status: "ACTIVE", started_at: "2026-08-22T00:00:00.000Z" },
    ];
    const legal = findReentryPlacement(positions, "u-a");
    expect(legal.parent_id).toBe("root");
    expect(legal.position).toBe("RIGHT");
    const store = storeFor(plan, positions);
    const before = JSON.stringify(store.network_positions);
    const intent = quoteReentryInStore(store, "u-a", plan);
    expect(JSON.stringify(store.network_positions)).toBe(before);
    expect(intent.candidate_parent_position_id).toBe("root");
    expect(intent.candidate_position).toBe("RIGHT");
  });

  it("CASE 10: Direct #2 PREPARE still creates no occupying seat", () => {
    const plan = "PLAN_200";
    const positions: NetworkPositionRow[] = [
      { id: "root", user_id: "u-root", plan_id: plan, parent_id: null, position: null, depth: 0, cycle: 0, status: "ACTIVE", started_at: "2026-08-22T00:00:00.000Z" },
      { id: "A", user_id: "u-a", plan_id: plan, parent_id: "root", position: "LEFT", depth: 1, cycle: 0, status: "ACTIVE", started_at: "2026-08-22T00:00:00.000Z" },
    ];
    const store = storeFor(plan, positions);
    const before = JSON.stringify(store.network_positions);
    const intent = quoteDirect2InStore(store, "u-sx", plan, "u-bx");
    expect(JSON.stringify(store.network_positions)).toBe(before);
    expect(store.network_positions.some((p) => p.status === "RESERVED")).toBe(false);
    expect(intent.candidate_parent_position_id).toBe("A");
    expect(intent.candidate_position).toBe("LEFT");
  });

  it("one-time unlock: HISTORY first-leg head keeps ROOT.RIGHT open after that member moves", () => {
    const nodes = [
      n("root", "ROOT", null, null, 0),
      n("A-old", "A", "root", "LEFT", 1, "HISTORY"),
      n("B", "B", "A-old", "LEFT", 2),
      n("C", "C", "A-old", "RIGHT", 2),
      n("E", "E", "root", "LEFT", 1),
    ];
    expect(rootSecondLegUnlocked(nodes, "root")).toBe(true);
    const hole = holeOf(nodes);
    expect(hole.parent_id).toBe("root");
    expect(hole.position).toBe("RIGHT");
  });

  it("repaired PLAN_200: next legal seat is e8e1.LEFT, not e727.LEFT", () => {
    const nodes = [
      n("pos_ea0064b3d96b1513", "u2575", null, null, 0),
      n("pos_6e85f6797c2c4677", "ue8e1", "pos_ea0064b3d96b1513", "LEFT", 1),
      n("pos_3d67e0159d178b86", "uffe0", "pos_6e85f6797c2c4677", "RIGHT", 2),
      n("pos_e727_right", "ue727", "pos_ea0064b3d96b1513", "RIGHT", 1),
    ];
    expect(rootSecondLegUnlocked(nodes, "pos_ea0064b3d96b1513")).toBe(false);
    const hole = holeOf(nodes);
    expect(hole.parent_id).toBe("pos_6e85f6797c2c4677");
    expect(hole.position).toBe("LEFT");
  });
});

function storeFor(plan: string, positions: NetworkPositionRow[]): Store {
  return {
    payment_intents: [],
    network_positions: positions,
    wallets: [
      { id: "w-root", user_id: "u-root", address: "0x1111111111111111111111111111111111111111", wallet_type: "injected", chain_id: 80002, verified: true, created_at: "2026-08-22T12:00:00.000Z" },
      { id: "w-a", user_id: "u-a", address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", wallet_type: "injected", chain_id: 80002, verified: true, created_at: "2026-08-22T12:00:00.000Z" },
      { id: "w-sx", user_id: "u-sx", address: "0x2222222222222222222222222222222222222222", wallet_type: "injected", chain_id: 80002, verified: true, created_at: "2026-08-22T12:00:00.000Z" },
    ],
    users: [
      { id: "u-root", referral_code: "GXROOTAA", sponsor_id: null, is_demo: false, display_name: "root", created_at: "2026-08-22T12:00:00.000Z" },
      { id: "u-a", referral_code: "GXAAAAAA", sponsor_id: null, is_demo: false, display_name: "a", created_at: "2026-08-22T12:00:00.000Z" },
      { id: "u-sx", referral_code: "GXSPONX", sponsor_id: null, is_demo: false, display_name: "sx", created_at: "2026-08-22T12:00:00.000Z" },
      { id: "u-bx", referral_code: "GXBUYERX", sponsor_id: "u-sx", is_demo: false, display_name: "bx", created_at: "2026-08-22T12:00:00.000Z" },
    ],
    plans: [{ id: plan, code: plan, name: plan, amount_usd: 200, token: "USDT", network: "amoy", description: "", active: true, enabled: true, sort_order: 1, created_at: "", updated_at: "" }],
    referrals: [],
    transactions: [],
  } as unknown as Store;
}
