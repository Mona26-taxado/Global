import { describe, expect, it } from "vitest";
import { buildPositionJourney, childSlotsByParent, journeyCounts, layoutPreviousChains, liveApiSeats, liveForestRoots, previousHistoryChain, routingLabel, type JourneyPosition, type NetNode } from "../lib/cycle-ui";

describe("payment route labels", () => {
  it("maps Direct #1 / Direct #2 / re-entry to locked UI names", () => {
    expect(routingLabel("SPONSOR", 1)).toBe("DIRECT FIRST");
    expect(routingLabel("GLOBAL_UPLINE", 2)).toBe("GLOBAL SECOND");
    expect(routingLabel("GLOBAL_REENTRY", null)).toBe("GLOBAL REENTRY");
  });
});

describe("buildPositionJourney", () => {
  const p100 = "PLAN_100";
  const p200 = "PLAN_200";

  it("keeps HISTORY then RESERVED as position + re-entry without inventing seats", () => {
    const rows: JourneyPosition[] = [
      {
        id: "pos1",
        plan_id: p100,
        parent_id: null,
        position: null,
        status: "HISTORY",
        started_at: "t0",
        ended_at: "t1",
      },
      {
        id: "rsv",
        plan_id: p100,
        parent_id: "e8e1",
        parent_code: "GXE8E1",
        position: "LEFT",
        status: "RESERVED",
        from_position_id: "pos1",
        started_at: "t1",
        recipient_wallet: "0xd77ec55eb56ace50456515f018b82a6de187e8e1",
      },
    ];
    const steps = buildPositionJourney(rows, p100, []);
    expect(steps.map((s) => s.kind)).toEqual(["position", "reentry"]);
    expect(steps[0]?.title).toBe("Position #1");
    expect(steps[0]?.row.status).toBe("HISTORY");
    expect(steps[1]?.title).toBe("Re-entry #1");
    expect(steps[1]?.row.parent_code).toBe("GXE8E1");
    expect(steps[1]?.payment?.recipient_wallet).toContain("d77e");
    expect(steps[1]?.payment?.status).toBe("PENDING");
  });

  it("after activation keeps HISTORY and shows the new ACTIVE seat", () => {
    const rows: JourneyPosition[] = [
      { id: "pos1", plan_id: p100, status: "HISTORY", started_at: "t0", ended_at: "t1", parent_id: null },
      {
        id: "pos2",
        plan_id: p100,
        status: "ACTIVE",
        started_at: "t2",
        from_position_id: "pos1",
        parent_id: "e8e1",
        parent_code: "GXE8E1",
        position: "LEFT",
        reentry_tx_hash: "0xabc",
        recipient_wallet: "0xd77e",
      },
    ];
    const steps = buildPositionJourney(rows, p100, [
      {
        tx_hash: "0xabc",
        position_id: "pos2",
        status: "CONFIRMED",
        payment_type: "PLAN_PURCHASE",
        recipient_wallet: "0xd77e",
      },
    ]);
    expect(steps.filter((s) => s.kind === "position").map((s) => s.row.id)).toEqual(["pos1", "pos2"]);
    expect(steps.find((s) => s.kind === "reentry")?.payment?.tx_hash).toBe("0xabc");
    expect(journeyCounts(steps).previous).toBe(1);
  });

  it("does not mix PLAN_200 history into PLAN_100", () => {
    const rows: JourneyPosition[] = [
      { id: "a100", plan_id: p100, status: "ACTIVE", started_at: "t0" },
      { id: "a200", plan_id: p200, status: "HISTORY", started_at: "t0" },
    ];
    const steps = buildPositionJourney(rows, p100, []);
    expect(steps).toHaveLength(1);
    expect(steps[0]?.row.id).toBe("a100");
  });

  it("renders ROOT ACTIVE and ROOT RESERVED as two seats when they have different position ids", () => {
    const tree: NetNode[] = [
      { id: "pos-root-active", user_id: "root", parent_id: null, position: null, depth: 0, status: "ACTIVE" },
      { id: "pos-e8e1", user_id: "e8e1", parent_id: "pos-root-active", position: "LEFT", depth: 1, status: "ACTIVE" },
      { id: "pos-99ab", user_id: "99ab", parent_id: "pos-root-active", position: "RIGHT", depth: 1, status: "ACTIVE" },
      { id: "pos-root-rsv", user_id: "root", parent_id: "pos-e8e1", position: "LEFT", depth: 2, status: "RESERVED" },
    ];
    const live = liveApiSeats(tree);
    expect(live).toHaveLength(4);
    expect(new Set(live.map((n) => n.id)).size).toBe(4);
    expect(live.filter((n) => n.user_id === "root")).toHaveLength(2);
    const roots = liveForestRoots(live);
    expect(roots.map((r) => r.id)).toEqual(["pos-root-active"]);
    const kids = childSlotsByParent(live);
    expect(kids.get("pos-root-active")?.left?.id).toBe("pos-e8e1");
    expect(kids.get("pos-root-active")?.right?.id).toBe("pos-99ab");
    expect(kids.get("pos-e8e1")?.left?.id).toBe("pos-root-rsv");
    expect(kids.get("pos-e8e1")?.left?.status).toBe("RESERVED");
  });

  it("walks stored HISTORY via from_position_id and does not invent missing seats", () => {
    const live: NetNode = {
      id: "pos_4984565872461102",
      user_id: "user_6ed8e4893670db32",
      parent_id: "pos_938a4b2c3b7e5eb6",
      position: "LEFT",
      depth: 2,
      status: "ACTIVE",
      from_position_id: "pos_user_6ed8e4893670db32",
    };
    const rows: JourneyPosition[] = [
      { id: "pos_user_6ed8e4893670db32", parent_id: null, position: null, status: "HISTORY", started_at: "t0", ended_at: "t1" },
      { id: live.id, parent_id: "pos_938a4b2c3b7e5eb6", position: "LEFT", status: "ACTIVE", from_position_id: "pos_user_6ed8e4893670db32" },
    ];
    const chain = previousHistoryChain(live, rows);
    expect(chain).toHaveLength(1);
    expect(chain[0]?.id).toBe("pos_user_6ed8e4893670db32");
    expect(chain[0]?.parent_id).toBeNull();
    expect(previousHistoryChain(live, [])).toEqual([]);
    const liveTree = liveApiSeats([
      { id: "pos_938a4b2c3b7e5eb6", user_id: "e8e1", parent_id: "pos_user_6ed8e4893670db32", position: "LEFT", depth: 1, status: "ACTIVE" },
      live,
    ]);
    expect(liveTree.every((n) => (n.status ?? "ACTIVE") !== "HISTORY")).toBe(true);
    expect(childSlotsByParent(liveTree).get("pos_938a4b2c3b7e5eb6")?.left?.id).toBe(live.id);
    const spots = layoutPreviousChains([{ liveId: live.id, x: 400, y: 200, chain }]);
    expect(spots).toHaveLength(1);
    expect(spots[0]?.x).toBeLessThan(400);
    expect(spots[0]?.y).toBeLessThan(200);
    expect(spots[0]?.targetLiveId).toBe(live.id);
  });
});



