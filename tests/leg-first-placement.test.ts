import { describe, expect, it } from "vitest";
import {
  cycleComplete,
  findFirstEmptyPlacement,
  findReentryPlacement,
  rootSecondLegUnlocked,
} from "../network/placement";
import { quoteDirect2InStore, quoteReentryInStore, firstEmptyQuote, expireUnpaidPendingIntent } from "../services/placement-intent";
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

  it.each(PLANS)("%s CASE 5: after ROOT.RIGHT unlocks, complete that row before deeper LEFT-subtree holes", (plan) => {
    const nodes = [
      n(`${plan}-root`, "ROOT", null, null, 0),
      n(`${plan}-A`, "A", `${plan}-root`, "LEFT", 1),
      n(`${plan}-D`, "D", `${plan}-root`, "RIGHT", 1),
      n(`${plan}-B`, "B", `${plan}-A`, "LEFT", 2),
      n(`${plan}-C`, "C", `${plan}-A`, "RIGHT", 2),
    ];
    const hole = holeOf(nodes);
    expect(hole.parent_id).toBe(`${plan}-D`);
    expect(hole.position).toBe("LEFT");
    const withDL = [...nodes, n(`${plan}-DL`, "DL", `${plan}-D`, "LEFT", 2)];
    const next = holeOf(withDL);
    expect(next.parent_id).toBe(`${plan}-D`);
    expect(next.position).toBe("RIGHT");
    const withBoth = [...withDL, n(`${plan}-DR`, "DR", `${plan}-D`, "RIGHT", 2)];
    const deeper = holeOf(withBoth);
    expect(deeper.parent_id).toBe(`${plan}-B`);
    expect(deeper.position).toBe("LEFT");
  });

  it.each(PLANS)("%s CASE 5b: unlocked HISTORY left-head + ACTIVE ROOT.RIGHT → ROOT.RIGHT.LEFT before deeper left-head.LEFT", (plan) => {
    const nodes = [
      n(`${plan}-old-root`, "u2575", null, null, 0, "HISTORY"),
      n(`${plan}-old-left`, "ue8e1", `${plan}-old-root`, "LEFT", 1, "HISTORY"),
      n(`${plan}-n2575`, "u2575", `${plan}-old-left`, "LEFT", 2),
      n(`${plan}-nffe0`, "uffe0", `${plan}-old-left`, "RIGHT", 2),
      n(`${plan}-ne727`, "ue727", `${plan}-old-root`, "RIGHT", 1),
    ];
    expect(rootSecondLegUnlocked(nodes, `${plan}-old-root`)).toBe(true);
    const hole = holeOf(nodes);
    expect(hole.parent_id).toBe(`${plan}-ne727`);
    expect(hole.position).toBe("LEFT");
    const withLeft = [...nodes, n(`${plan}-e727L`, "x", `${plan}-ne727`, "LEFT", 2)];
    expect(holeOf(withLeft).parent_id).toBe(`${plan}-ne727`);
    expect(holeOf(withLeft).position).toBe("RIGHT");
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

  it("CASE 8: same PHASE 1 and PHASE 2 holes for PLAN_100 / 200 / 500 / 1000 / PLAN_SYNTH", () => {
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
      const withD = [...withC, n(`${plan}-D`, "D", `${plan}-root`, "RIGHT", 1)];
      const h5 = holeOf(withD);
      const withDL = [...withD, n(`${plan}-DL`, "DL", `${plan}-D`, "LEFT", 2)];
      const h5b = holeOf(withDL);
      return {
        case2Parent: h2.parent_id?.endsWith("-A"),
        case2Side: h2.position,
        case3Side: h3.position,
        case4ParentRoot: h4.parent_id?.endsWith("-root"),
        case4Side: h4.position,
        case5ParentD: h5.parent_id?.endsWith("-D"),
        case5Side: h5.position,
        case5bParentD: h5b.parent_id?.endsWith("-D"),
        case5bSide: h5b.position,
      };
    });
    expect(fingerprints[0]).toEqual({
      case2Parent: true,
      case2Side: "LEFT",
      case3Side: "RIGHT",
      case4ParentRoot: true,
      case4Side: "RIGHT",
      case5ParentD: true,
      case5Side: "LEFT",
      case5bParentD: true,
      case5bSide: "RIGHT",
    });
    for (const fp of fingerprints.slice(1)) {
      expect(fp).toEqual(fingerprints[0]);
    }
  });

  it.each(PLANS)("%s CASE 9: re-entry quote uses the same two-phase hole (ROOT.RIGHT after first-leg)", (plan) => {
    const positions: NetworkPositionRow[] = [
      { id: `${plan}-root`, user_id: "u-root", plan_id: plan, parent_id: null, position: null, depth: 0, cycle: 0, status: "ACTIVE", started_at: "2026-08-22T00:00:00.000Z" },
      { id: `${plan}-A`, user_id: "u-a", plan_id: plan, parent_id: `${plan}-root`, position: "LEFT", depth: 1, cycle: 0, status: "ACTIVE", started_at: "2026-08-22T00:00:00.000Z" },
      { id: `${plan}-B`, user_id: "u-b", plan_id: plan, parent_id: `${plan}-A`, position: "LEFT", depth: 2, cycle: 1, status: "ACTIVE", started_at: "2026-08-22T00:00:00.000Z" },
      { id: `${plan}-C`, user_id: "u-c", plan_id: plan, parent_id: `${plan}-A`, position: "RIGHT", depth: 2, cycle: 1, status: "ACTIVE", started_at: "2026-08-22T00:00:00.000Z" },
    ];
    const legal = findReentryPlacement(positions, "u-a");
    expect(legal.parent_id).toBe(`${plan}-root`);
    expect(legal.position).toBe("RIGHT");
    const store = storeFor(plan, positions);
    const before = JSON.stringify(store.network_positions);
    const intent = quoteReentryInStore(store, "u-a", plan);
    expect(JSON.stringify(store.network_positions)).toBe(before);
    expect(intent.candidate_parent_position_id).toBe(`${plan}-root`);
    expect(intent.candidate_position).toBe("RIGHT");
  });

  it.each(PLANS)("%s CASE 10: Direct #2 PREPARE still creates no occupying seat", (plan) => {
    const positions: NetworkPositionRow[] = [
      { id: `${plan}-root`, user_id: "u-root", plan_id: plan, parent_id: null, position: null, depth: 0, cycle: 0, status: "ACTIVE", started_at: "2026-08-22T00:00:00.000Z" },
      { id: `${plan}-A`, user_id: "u-a", plan_id: plan, parent_id: `${plan}-root`, position: "LEFT", depth: 1, cycle: 0, status: "ACTIVE", started_at: "2026-08-22T00:00:00.000Z" },
    ];
    const store = storeFor(plan, positions);
    const before = JSON.stringify(store.network_positions);
    const intent = quoteDirect2InStore(store, "u-sx", plan, "u-bx");
    expect(JSON.stringify(store.network_positions)).toBe(before);
    expect(store.network_positions.some((p) => p.status === "RESERVED")).toBe(false);
    expect(intent.candidate_parent_position_id).toBe(`${plan}-A`);
    expect(intent.candidate_position).toBe("LEFT");
  });

  it("ACTIVE + later HISTORY on same parent/side ⇒ ACTIVE wins", () => {
    const nodes = [
      n("root", "ROOT", null, null, 0),
      n("e8e1", "e8e1", "root", "LEFT", 1),
      n("e727", "e727", "root", "RIGHT", 1),
      n("ffe0", "ffe0", "e8e1", "RIGHT", 2),
      n("later-hist", "ghost", "root", "LEFT", 1, "HISTORY"),
    ];
    const hole = holeOf(nodes);
    expect(hole.parent_id).toBe("e8e1");
    expect(hole.position).toBe("LEFT");
  });

  it("HISTORY is walked only when no ACTIVE child occupies that side", () => {
    const nodes = [
      n("root", "ROOT", null, null, 0, "HISTORY"),
      n("old-left", "L", "root", "LEFT", 1, "HISTORY"),
      n("live", "LIVE", "old-left", "LEFT", 2),
    ];
    const hole = holeOf(nodes);
    expect(hole.parent_id).toBe("live");
    expect(hole.position).toBe("LEFT");
  });

  it("payload order does not change the first-empty hole", () => {
    const base = [
      n("root", "ROOT", null, null, 0),
      n("e8e1", "e8e1", "root", "LEFT", 1),
      n("e727", "e727", "root", "RIGHT", 1),
      n("ffe0", "ffe0", "e8e1", "RIGHT", 2),
      n("hist-left", "ghost", "root", "LEFT", 1, "HISTORY"),
      n("rsv", "rsv", "e8e1", "LEFT", 2, "RESERVED"),
    ];
    const reversed = [...base].reverse();
    const a = holeOf(base);
    const b = holeOf(reversed);
    expect(a.parent_id).toBe("e8e1");
    expect(a.position).toBe("LEFT");
    expect(b).toEqual(a);
  });

  it("ACTIVE-over-HISTORY child pick is the same for every plan_id", () => {
    const fps = PLANS.map((plan) => {
      const nodes = [
        n(`${plan}-root`, "ROOT", null, null, 0),
        n(`${plan}-e8e1`, "e8e1", `${plan}-root`, "LEFT", 1),
        n(`${plan}-e727`, "e727", `${plan}-root`, "RIGHT", 1),
        n(`${plan}-ffe0`, "ffe0", `${plan}-e8e1`, "RIGHT", 2),
        n(`${plan}-hist`, "ghost", `${plan}-root`, "LEFT", 1, "HISTORY"),
      ];
      const hole = holeOf(nodes);
      return { parentTail: hole.parent_id?.endsWith("-e8e1"), side: hole.position };
    });
    for (const fp of fps.slice(1)) expect(fp).toEqual(fps[0]);
    expect(fps[0]).toEqual({ parentTail: true, side: "LEFT" });
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

  it("repaired PLAN_200 rows ⇒ first empty is e8e1.LEFT, not e727.LEFT", () => {
    const nodes = [
      n("pos_ea0064b3d96b1513", "u2575", null, null, 0),
      n("pos_6e85f6797c2c4677", "ue8e1", "pos_ea0064b3d96b1513", "LEFT", 1),
      n("pos_d6042a7636892d44", "ue727", "pos_ea0064b3d96b1513", "RIGHT", 1, "HISTORY"),
      n("pos_994fe46589c35c1e", "u2575", "pos_6e85f6797c2c4677", "LEFT", 2, "HISTORY"),
      n("pos_c5a24983cb573a70", "ue727", "pos_ea0064b3d96b1513", "RIGHT", 1),
      n("pos_fd3159e16f8fffcf", "u2575", "pos_6e85f6797c2c4677", "LEFT", 2, "HISTORY"),
      n("pos_3d67e0159d178b86", "uffe0", "pos_6e85f6797c2c4677", "RIGHT", 2),
      n("pos_0ce5694739802e93", "ue8e1", "pos_c5a24983cb573a70", "LEFT", 2, "HISTORY"),
      n("pos_00848c9ad81c034d", "u24", "pos_ea0064b3d96b1513", "LEFT", 1, "HISTORY"),
    ];
    const hole = holeOf(nodes);
    expect(hole.parent_id).toBe("pos_6e85f6797c2c4677");
    expect(hole.position).toBe("LEFT");
    const store = storeFor("PLAN_200", nodes.map((row) => ({
      ...row,
      plan_id: "PLAN_200",
      cycle: Math.floor(row.depth / 2),
      started_at: "2026-08-22T00:00:00.000Z",
    })));
    store.users.push({ id: "ue8e1", referral_code: "GXFOUNDER", sponsor_id: null, is_demo: false, display_name: "e8e1", created_at: "2026-08-22T00:00:00.000Z" });
    store.wallets.push({
      id: "w-e8e1",
      user_id: "ue8e1",
      address: "0xd77ec55eb56ace50456515f018b82a6de187e8e1",
      wallet_type: "injected",
      chain_id: 80002,
      verified: true,
      created_at: "2026-08-22T00:00:00.000Z",
    });
    const quote = firstEmptyQuote(store, "PLAN_200", "NEXT");
    expect(quote.parent_id).toBe("pos_6e85f6797c2c4677");
    expect(quote.position).toBe("LEFT");
    expect(quote.recipient_wallet).toBe("0xd77ec55eb56ace50456515f018b82a6de187e8e1");
  });

  it("pending stale quote with tx_hash null can be invalidated safely", () => {
    const store = storeFor("PLAN_200", [
      { id: "root", user_id: "u-root", plan_id: "PLAN_200", parent_id: null, position: null, depth: 0, cycle: 0, status: "ACTIVE", started_at: "2026-08-22T00:00:00.000Z" },
    ]);
    store.payment_intents = [
      {
        id: "intent_9bff60657828ff51",
        kind: "DIRECT2_PLACEMENT",
        status: "PENDING",
        plan_id: "PLAN_200",
        tx_hash: null,
        quoted_at: "2026-08-22T10:49:04.339Z",
        amount_usd: 200,
        buyer_user_id: "u-bx",
        mover_user_id: "u-sx",
        skip_placement: false,
        candidate_parent_position_id: "pos_c5a24983cb573a70",
        candidate_position: "LEFT",
        candidate_depth: 2,
        candidate_recipient_user_id: "ue727",
        candidate_recipient_wallet: "0xa11dbd434aed4fd03cdc79345295687c8c06e727",
      },
      {
        id: "intent_confirmed_keep",
        kind: "DIRECT2_PLACEMENT",
        status: "CONFIRMED",
        plan_id: "PLAN_200",
        tx_hash: "0xabc",
        quoted_at: "2026-08-22T09:00:00.000Z",
        amount_usd: 200,
        buyer_user_id: "u-other",
        mover_user_id: "u-sx",
        candidate_parent_position_id: "root",
        candidate_position: "LEFT",
        candidate_depth: 1,
        candidate_recipient_user_id: "u-root",
        candidate_recipient_wallet: "0x1111111111111111111111111111111111111111",
      },
    ];
    const positionsBefore = JSON.stringify(store.network_positions);
    const txsBefore = JSON.stringify(store.transactions);
    expect(expireUnpaidPendingIntent(store, "intent_9bff60657828ff51")).toBe(true);
    expect(store.payment_intents[0]?.status).toBe("STALE_ROUTE");
    expect(expireUnpaidPendingIntent(store, "intent_confirmed_keep")).toBe(false);
    expect(store.payment_intents[1]?.status).toBe("CONFIRMED");
    expect(JSON.stringify(store.network_positions)).toBe(positionsBefore);
    expect(JSON.stringify(store.transactions)).toBe(txsBefore);
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
