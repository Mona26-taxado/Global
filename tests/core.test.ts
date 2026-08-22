import { describe, expect, it } from "vitest";
import {
  bothLegsFilled,
  cycleComplete,
  findPlacement,
  findReentryPlacement,
  occupyingSeatsAfterEarlierHole,
} from "../network/placement";
import {
  finalizeConfirmedDirect2InStore,
  provisionDirect2SponsorInStore,
  qualifyForReentryInStore,
  reservedPosition,
} from "../services/users";
import type { Store } from "../lib/store";
import { amountToUnits } from "../payments/service";
import { tokenPocketLoginParam } from "../wallet/tokenpocket/deeplink";
import type { NetworkPositionRow } from "../types";

describe("global placement (first empty LEFT then RIGHT)", () => {
  function push(
    nodes: ReturnType<typeof findPlacement>[],
    row: ReturnType<typeof findPlacement>,
    id: string,
    status: "ACTIVE" | "RESERVED" | "HISTORY" = "ACTIVE",
  ) {
    nodes.push({ ...row, id, status });
  }

  it("CASE 1: after A.LEFT, next is A.RIGHT", () => {
    const nodes: ReturnType<typeof findPlacement>[] = [];
    const a = findPlacement(nodes, "A");
    expect(a.parent_id).toBeNull();
    push(nodes, a, "pos-A");
    const x = findPlacement(nodes, "X");
    expect(x.position).toBe("LEFT");
    expect(x.parent_id).toBe("pos-A");
    push(nodes, x, "pos-X");
    const y = findPlacement(nodes, "Y");
    expect(y.position).toBe("RIGHT");
    expect(y.parent_id).toBe("pos-A");
  });

  it("CASE 2: after A.LEFT and A.RIGHT, next is X.LEFT", () => {
    const nodes: ReturnType<typeof findPlacement>[] = [];
    push(nodes, findPlacement(nodes, "A"), "pos-A");
    push(nodes, findPlacement(nodes, "X"), "pos-X");
    push(nodes, findPlacement(nodes, "Y"), "pos-Y");
    const z = findPlacement(nodes, "Z");
    expect(z.parent_id).toBe("pos-X");
    expect(z.position).toBe("LEFT");
  });

  it("CASE 3: RESERVED does not occupy, so the next call can take the same hole", () => {
    const nodes: ReturnType<typeof findPlacement>[] = [];
    push(nodes, findPlacement(nodes, "A"), "pos-A");
    const reserved = findPlacement(nodes, "X");
    expect(reserved.position).toBe("LEFT");
    push(nodes, reserved, "pos-X-reserved", "RESERVED");
    const next = findPlacement(nodes, "Y");
    expect(next.parent_id).toBe("pos-A");
    expect(next.position).toBe("LEFT");
  });

  it("does not treat historical seats as live attach points", () => {
    const nodes = [
      { id: "pos-A", user_id: "A", parent_id: null, position: null, depth: 0, status: "HISTORY" as const },
      { id: "pos-X", user_id: "X", parent_id: "pos-A", position: "LEFT" as const, depth: 1, status: "ACTIVE" as const },
    ];
    const next = findPlacement(nodes, "Y");
    expect(next.parent_id).toBe("pos-X");
    expect(next.position).toBe("LEFT");
  });

  it("re-entry CASE 1: A with only LEFT X → A.RIGHT, not X.LEFT", () => {
    const nodes = [
      { id: "pos-A", user_id: "A", parent_id: null, position: null, depth: 0, status: "ACTIVE" as const },
      { id: "pos-X", user_id: "X", parent_id: "pos-A", position: "LEFT" as const, depth: 1, status: "ACTIVE" as const },
    ];
    const hole = findReentryPlacement(nodes, "M");
    expect(hole.parent_id).toBe("pos-A");
    expect(hole.position).toBe("RIGHT");
  });

  it("re-entry CASE 2: A.LEFT X and A.RIGHT Y → X.LEFT", () => {
    const nodes = [
      { id: "pos-A", user_id: "A", parent_id: null, position: null, depth: 0, status: "ACTIVE" as const },
      { id: "pos-X", user_id: "X", parent_id: "pos-A", position: "LEFT" as const, depth: 1, status: "ACTIVE" as const },
      { id: "pos-Y", user_id: "Y", parent_id: "pos-A", position: "RIGHT" as const, depth: 1, status: "ACTIVE" as const },
    ];
    const hole = findReentryPlacement(nodes, "M");
    expect(hole.parent_id).toBe("pos-X");
    expect(hole.position).toBe("LEFT");
  });

  it("re-entry CASE 3: Z under X.LEFT → X.RIGHT", () => {
    const nodes = [
      { id: "pos-A", user_id: "A", parent_id: null, position: null, depth: 0, status: "ACTIVE" as const },
      { id: "pos-X", user_id: "X", parent_id: "pos-A", position: "LEFT" as const, depth: 1, status: "ACTIVE" as const },
      { id: "pos-Y", user_id: "Y", parent_id: "pos-A", position: "RIGHT" as const, depth: 1, status: "ACTIVE" as const },
      { id: "pos-Z", user_id: "Z", parent_id: "pos-X", position: "LEFT" as const, depth: 2, status: "ACTIVE" as const },
    ];
    const hole = findReentryPlacement(nodes, "M");
    expect(hole.parent_id).toBe("pos-X");
    expect(hole.position).toBe("RIGHT");
  });

  it("re-entry CASE 4: legacy RESERVED A.RIGHT does not occupy; first-empty is still A.RIGHT", () => {
    const nodes = [
      { id: "pos-A", user_id: "A", parent_id: null, position: null, depth: 0, status: "ACTIVE" as const },
      { id: "pos-X", user_id: "X", parent_id: "pos-A", position: "LEFT" as const, depth: 1, status: "ACTIVE" as const },
      { id: "pos-R", user_id: "R", parent_id: "pos-A", position: "RIGHT" as const, depth: 1, status: "RESERVED" as const },
    ];
    const hole = findReentryPlacement(nodes, "M");
    expect(hole.parent_id).toBe("pos-A");
    expect(hole.position).toBe("RIGHT");
  });

  it("re-entry CASE 5: plan live sets are independent", () => {
    const p1 = [
      { id: "p1-A", user_id: "A", parent_id: null, position: null, depth: 0, status: "ACTIVE" as const },
      { id: "p1-X", user_id: "X", parent_id: "p1-A", position: "LEFT" as const, depth: 1, status: "ACTIVE" as const },
    ];
    const p2 = [
      { id: "p2-A", user_id: "A", parent_id: null, position: null, depth: 0, status: "ACTIVE" as const },
      { id: "p2-X", user_id: "X", parent_id: "p2-A", position: "LEFT" as const, depth: 1, status: "ACTIVE" as const },
      { id: "p2-Y", user_id: "Y", parent_id: "p2-A", position: "RIGHT" as const, depth: 1, status: "ACTIVE" as const },
    ];
    const h1 = findReentryPlacement(p1, "M");
    const h2 = findReentryPlacement(p2, "M");
    expect(h1.parent_id).toBe("p1-A");
    expect(h1.position).toBe("RIGHT");
    expect(h2.parent_id).toBe("p2-X");
    expect(h2.position).toBe("LEFT");
  });

  it("screenshot case: empty A.RIGHT is taken before any deeper re-entry hole", () => {
    const nodes = [
      { id: "pos-A", user_id: "A", parent_id: null, position: null, depth: 0, status: "ACTIVE" as const },
      { id: "pos-X", user_id: "X", parent_id: "pos-A", position: "LEFT" as const, depth: 1, status: "ACTIVE" as const },
      { id: "pos-Y", user_id: "Y", parent_id: "pos-X", position: "LEFT" as const, depth: 2, status: "ACTIVE" as const },
    ];
    const hole = findReentryPlacement(nodes, "M");
    expect(hole.parent_id).toBe("pos-A");
    expect(hole.position).toBe("RIGHT");
  });

  it("X complete → next empty is Y.RIGHT (global BFS, not X's downline)", () => {
    const nodes = [
      { id: "pos-ROOT", user_id: "ROOT", parent_id: null, position: null, depth: 0, status: "ACTIVE" as const },
      { id: "pos-X", user_id: "X", parent_id: "pos-ROOT", position: "LEFT" as const, depth: 1, status: "ACTIVE" as const },
      { id: "pos-Y", user_id: "Y", parent_id: "pos-ROOT", position: "RIGHT" as const, depth: 1, status: "ACTIVE" as const },
      { id: "pos-A", user_id: "A", parent_id: "pos-X", position: "LEFT" as const, depth: 2, status: "ACTIVE" as const },
      { id: "pos-B", user_id: "B", parent_id: "pos-X", position: "RIGHT" as const, depth: 2, status: "ACTIVE" as const },
      { id: "pos-C", user_id: "C", parent_id: "pos-Y", position: "LEFT" as const, depth: 2, status: "ACTIVE" as const },
    ];
    const hole = findReentryPlacement(nodes, "X");
    expect(hole.parent_id).toBe("pos-Y");
    expect(hole.position).toBe("RIGHT");
  });

  it("does not skip an earlier same-level empty after HISTORY parents drop out of live", () => {
    const nodes = [
      { id: "pos-root", user_id: "root", parent_id: null, position: null, depth: 0, status: "HISTORY" as const },
      { id: "pos-e2", user_id: "e2", parent_id: "pos-root", position: "LEFT" as const, depth: 1, status: "HISTORY" as const },
      { id: "pos-62", user_id: "r62", parent_id: "pos-root", position: "RIGHT" as const, depth: 1, status: "HISTORY" as const },
      { id: "pos-282c", user_id: "n282c", parent_id: "pos-e2", position: "LEFT" as const, depth: 2, status: "ACTIVE" as const },
      { id: "pos-5a59", user_id: "n5a59", parent_id: "pos-e2", position: "RIGHT" as const, depth: 2, status: "ACTIVE" as const },
      { id: "pos-a9a3", user_id: "na9a3", parent_id: "pos-62", position: "LEFT" as const, depth: 2, status: "ACTIVE" as const },
      { id: "pos-4836", user_id: "n4836", parent_id: "pos-62", position: "RIGHT" as const, depth: 2, status: "ACTIVE" as const },
      { id: "pos-f76c", user_id: "nf76c", parent_id: "pos-282c", position: "LEFT" as const, depth: 3, status: "ACTIVE" as const },
      { id: "pos-f768", user_id: "nf768", parent_id: "pos-a9a3", position: "LEFT" as const, depth: 3, status: "ACTIVE" as const },
    ];
    const hole = findPlacement(nodes, "NEXT");
    expect(hole.parent_id).toBe("pos-282c");
    expect(hole.position).toBe("RIGHT");
  });

  it("cycle completes only with ACTIVE LEFT and RIGHT", () => {
    const both = [
      { id: "pos-A", user_id: "A", parent_id: null, position: null, depth: 0 },
      { id: "pos-L", user_id: "L", parent_id: "pos-A", position: "LEFT" as const, depth: 1 },
      { id: "pos-R", user_id: "R", parent_id: "pos-A", position: "RIGHT" as const, depth: 1 },
    ];
    expect(bothLegsFilled(both, "pos-A")).toBe(true);
    expect(cycleComplete(both, "pos-A")).toBe(true);

    const oneLegPlusDownline = [
      { id: "pos-A", user_id: "A", parent_id: null, position: null, depth: 0 },
      { id: "pos-X", user_id: "X", parent_id: "pos-A", position: "LEFT" as const, depth: 1 },
      { id: "pos-Y", user_id: "Y", parent_id: "pos-X", position: "LEFT" as const, depth: 2 },
    ];
    expect(bothLegsFilled(oneLegPlusDownline, "pos-A")).toBe(false);
    expect(cycleComplete(oneLegPlusDownline, "pos-A")).toBe(false);
  });

  it("LEFT RESERVED + RIGHT ACTIVE => cycle false", () => {
    const nodes = [
      { id: "pos-X", user_id: "X", parent_id: null, position: null, depth: 0, status: "ACTIVE" as const },
      { id: "pos-L", user_id: "L", parent_id: "pos-X", position: "LEFT" as const, depth: 1, status: "RESERVED" as const },
      { id: "pos-R", user_id: "R", parent_id: "pos-X", position: "RIGHT" as const, depth: 1, status: "ACTIVE" as const },
    ];
    expect(cycleComplete(nodes, "pos-X")).toBe(false);
  });

  it("LEFT ACTIVE + RIGHT RESERVED => cycle false", () => {
    const nodes = [
      { id: "pos-X", user_id: "X", parent_id: null, position: null, depth: 0, status: "ACTIVE" as const },
      { id: "pos-L", user_id: "L", parent_id: "pos-X", position: "LEFT" as const, depth: 1, status: "ACTIVE" as const },
      { id: "pos-R", user_id: "R", parent_id: "pos-X", position: "RIGHT" as const, depth: 1, status: "RESERVED" as const },
    ];
    expect(cycleComplete(nodes, "pos-X")).toBe(false);
  });

  it("LEFT ACTIVE + RIGHT ACTIVE => cycle true", () => {
    const nodes = [
      { id: "pos-X", user_id: "X", parent_id: null, position: null, depth: 0, status: "ACTIVE" as const },
      { id: "pos-L", user_id: "L", parent_id: "pos-X", position: "LEFT" as const, depth: 1, status: "ACTIVE" as const },
      { id: "pos-R", user_id: "R", parent_id: "pos-X", position: "RIGHT" as const, depth: 1, status: "ACTIVE" as const },
    ];
    expect(cycleComplete(nodes, "pos-X")).toBe(true);
  });

  it("PLAN_100 audit: 2575.RIGHT is first empty; GXH4QSGA under current e8e1.LEFT is legacy skip", () => {
    const nodes = [
      { id: "pos_user_6ed8e4893670db32", user_id: "u2575", parent_id: null, position: null, depth: 0, status: "HISTORY" as const },
      { id: "pos_938a4b2c3b7e5eb6", user_id: "ue8e1", parent_id: "pos_user_6ed8e4893670db32", position: "LEFT" as const, depth: 1, status: "HISTORY" as const },
      { id: "pos_a9e48adb3b386daa", user_id: "u99ab", parent_id: "pos_user_6ed8e4893670db32", position: "RIGHT" as const, depth: 1, status: "HISTORY" as const },
      { id: "pos_4984565872461102", user_id: "u2575", parent_id: "pos_938a4b2c3b7e5eb6", position: "LEFT" as const, depth: 2, status: "ACTIVE" as const },
      { id: "pos_edbfffdce9cffb78", user_id: "u3026", parent_id: "pos_938a4b2c3b7e5eb6", position: "RIGHT" as const, depth: 2, status: "ACTIVE" as const },
      { id: "pos_3d56d3a822d7ae2d", user_id: "ue8e1", parent_id: "pos_a9e48adb3b386daa", position: "LEFT" as const, depth: 2, status: "ACTIVE" as const },
      { id: "pos_283dd10ac9a937b2", user_id: "un628", parent_id: "pos_a9e48adb3b386daa", position: "RIGHT" as const, depth: 2, status: "ACTIVE" as const },
      { id: "pos_20e6f7c9d55810f4", user_id: "u99ab", parent_id: "pos_4984565872461102", position: "LEFT" as const, depth: 3, status: "ACTIVE" as const },
      { id: "pos_ad98381513d44897", user_id: "uffe0", parent_id: "pos_3d56d3a822d7ae2d", position: "LEFT" as const, depth: 3, status: "ACTIVE" as const },
    ];
    const hole = findPlacement(nodes, "NEXT");
    expect(hole.parent_id).toBe("pos_4984565872461102");
    expect(hole.position).toBe("RIGHT");
    expect(occupyingSeatsAfterEarlierHole(nodes)).toEqual(new Set(["pos_ad98381513d44897"]));
  });

  it("simulate: ffe0 on 2575.RIGHT completes 2575; next empty is 3026.LEFT; 2575 RESERVED pays 3026 wallet", () => {
    const plan = "PLAN_100";
    const row = (
      id: string,
      user_id: string,
      parent_id: string | null,
      position: "LEFT" | "RIGHT" | null,
      depth: number,
      status: NetworkPositionRow["status"],
    ): NetworkPositionRow => ({
      id,
      user_id,
      plan_id: plan,
      parent_id,
      position,
      depth,
      cycle: Math.floor(depth / 2),
      status,
      started_at: "2026-08-21T12:00:00.000Z",
    });
    const store = {
      network_positions: [
        row("pos_root_h", "u2575", null, null, 0, "HISTORY"),
        row("pos_e8e1_h", "ue8e1", "pos_root_h", "LEFT", 1, "HISTORY"),
        row("pos_99ab_h", "u99ab", "pos_root_h", "RIGHT", 1, "HISTORY"),
        row("pos_2575", "u2575", "pos_e8e1_h", "LEFT", 2, "ACTIVE"),
        row("pos_3026", "u3026", "pos_e8e1_h", "RIGHT", 2, "ACTIVE"),
        row("pos_e8e1", "ue8e1", "pos_99ab_h", "LEFT", 2, "ACTIVE"),
        row("pos_n628", "un628", "pos_99ab_h", "RIGHT", 2, "ACTIVE"),
        row("pos_99ab", "u99ab", "pos_2575", "LEFT", 3, "ACTIVE"),
        row("pos_ffe0", "uffe0", "pos_2575", "RIGHT", 3, "ACTIVE"),
      ],
      wallets: [
        {
          id: "wal_3026",
          user_id: "u3026",
          address: "0xbd7509eb24b4f33e3da1310fd9bd3e44f9b23026",
          wallet_type: "injected",
          chain_id: 80002,
          verified: true,
          created_at: "2026-08-21T12:00:00.000Z",
        },
      ],
      users: [],
      plans: [{ id: plan }],
      payment_intents: [],
    } as unknown as Store;
    expect(cycleComplete(store.network_positions, "pos_2575")).toBe(true);
    const next = findPlacement(store.network_positions, "u2575");
    expect(next.parent_id).toBe("pos_3026");
    expect(next.position).toBe("LEFT");
    const reserved = qualifyForReentryInStore(store, "u2575", plan);
    expect(reserved?.status).toBe("ACTIVE");
    expect(store.payment_intents.some((i) => i.kind === "GLOBAL_REENTRY" && i.status === "PENDING")).toBe(true);
  });

  it("RESERVED right child does not complete the cycle", () => {
    const nodes = [
      { id: "pos-X", user_id: "X", parent_id: null, position: null, depth: 0, status: "ACTIVE" as const },
      { id: "pos-Y", user_id: "Y", parent_id: "pos-X", position: "LEFT" as const, depth: 1, status: "ACTIVE" as const },
      { id: "pos-A", user_id: "A", parent_id: "pos-X", position: "RIGHT" as const, depth: 1, status: "RESERVED" as const },
    ];
    expect(cycleComplete(nodes, "pos-X")).toBe(false);
  });

  function pos(
    id: string,
    user_id: string,
    parent_id: string | null,
    position: "LEFT" | "RIGHT" | null,
    depth: number,
    status: NetworkPositionRow["status"],
  ): NetworkPositionRow {
    return {
      id,
      user_id,
      plan_id: "PLAN_100",
      parent_id,
      position,
      depth,
      cycle: Math.floor(depth / 2),
      status,
      started_at: "2026-08-22T12:00:00.000Z",
    };
  }

  function cycleStore(positions: NetworkPositionRow[]): Store {
    return {
      network_positions: positions,
      payment_intents: [],
      wallets: [
        {
          id: "wal_root",
          user_id: "u-root",
          address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          wallet_type: "injected",
          chain_id: 80002,
          verified: true,
          created_at: "2026-08-22T12:00:00.000Z",
        },
        {
          id: "wal_left",
          user_id: "u-left",
          address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          wallet_type: "injected",
          chain_id: 80002,
          verified: true,
          created_at: "2026-08-22T12:00:00.000Z",
        },
      ],
      users: [
        {
          id: "u-root",
          referral_code: "GXROOTAA",
          sponsor_id: null,
          is_demo: false,
          display_name: "root",
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
          id: "u-sponsor",
          referral_code: "GXSPONSR",
          sponsor_id: null,
          is_demo: false,
          display_name: "sponsor",
          created_at: "2026-08-22T12:00:00.000Z",
        },
        {
          id: "u-d2",
          referral_code: "GXD2AAAA",
          sponsor_id: "u-sponsor",
          is_demo: false,
          display_name: "d2",
          created_at: "2026-08-22T12:00:00.000Z",
        },
      ],
      plans: [{ id: "PLAN_100" }],
      referrals: [
        {
          id: "ref-d2",
          user_id: "u-d2",
          sponsor_id: "u-sponsor",
          referral_code: "GXSPONSR",
          direct_number: 2,
          status: "ACTIVE",
        },
      ],
    } as unknown as Store;
  }

  it("Direct #2 PREPARE creates RESERVED but does not trigger ancestor cycle", () => {
    const store = cycleStore([
      pos("pos-root", "u-root", null, null, 0, "ACTIVE"),
      pos("pos-left", "u-left", "pos-root", "LEFT", 1, "ACTIVE"),
    ]);
    const intent = provisionDirect2SponsorInStore(store, "u-sponsor", "PLAN_100", "u-d2");
    expect(intent.status).toBe("PENDING");
    expect(intent.candidate_parent_position_id).toBe("pos-root");
    expect(intent.candidate_position).toBe("RIGHT");
    expect(cycleComplete(store.network_positions, "pos-root")).toBe(false);
    expect(reservedPosition(store.network_positions, "u-root", "PLAN_100")).toBeNull();
  });

  it("Direct #2 CONFIRM converts RESERVED→ACTIVE and only then may trigger ancestor cycle", () => {
    const store = cycleStore([
      pos("pos-root", "u-root", null, null, 0, "ACTIVE"),
      pos("pos-left", "u-left", "pos-root", "LEFT", 1, "ACTIVE"),
    ]);
    provisionDirect2SponsorInStore(store, "u-sponsor", "PLAN_100", "u-d2");
    expect(reservedPosition(store.network_positions, "u-root", "PLAN_100")).toBeNull();
    finalizeConfirmedDirect2InStore(store, "u-d2", "PLAN_100", "0xd2confirm");
    const sponsor = store.network_positions.find((p) => p.user_id === "u-sponsor");
    expect(sponsor?.status).toBe("ACTIVE");
    expect(reservedPosition(store.network_positions, "u-root", "PLAN_100")).toBeNull();
  });
});

describe("payments", () => {
  it("uses 6 decimal units", () => {
    expect(amountToUnits(100, 6)).toBe(BigInt(100_000_000));
  });
});

describe("TokenPocket connect", () => {
  it("login param has no transfer fields", () => {
    const param = tokenPocketLoginParam({
      actionId: "1",
      callbackUrl: "http://localhost:3000/api/wallet/tokenpocket/callback?actionId=1",
      dappName: "GLOBAL X",
      dappIcon: "http://localhost:3000/icon.svg",
      chainId: "80002",
    });
    expect(param.action).toBe("login");
    expect("to" in param).toBe(false);
    expect("amount" in param).toBe(false);
    expect("contract" in param).toBe(false);
    expect("symbol" in param).toBe(false);
  });
});
