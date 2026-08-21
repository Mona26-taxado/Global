import { describe, expect, it } from "vitest";
import { bothLegsFilled, cycleComplete, findPlacement, findReentryPlacement } from "../network/placement";
import { amountToUnits } from "../payments/service";
import { tokenPocketLoginParam } from "../wallet/tokenpocket/deeplink";

describe("global placement (left-descending powerline)", () => {
  function push(
    nodes: ReturnType<typeof findPlacement>[],
    row: ReturnType<typeof findPlacement>,
    id: string,
    status: "ACTIVE" | "RESERVED" | "HISTORY" = "ACTIVE",
  ) {
    nodes.push({ ...row, id, status });
  }

  it("CASE 1: A.LEFT then descend — next is X.LEFT, not A.RIGHT", () => {
    const nodes: ReturnType<typeof findPlacement>[] = [];
    const a = findPlacement(nodes, "A");
    expect(a.parent_id).toBeNull();
    push(nodes, a, "pos-A");
    const x = findPlacement(nodes, "X");
    expect(x.position).toBe("LEFT");
    expect(x.parent_id).toBe("pos-A");
    push(nodes, x, "pos-X");
    const y = findPlacement(nodes, "Y");
    expect(y.position).toBe("LEFT");
    expect(y.parent_id).toBe("pos-X");
  });

  it("CASE 2: after X.LEFT, next is Y.LEFT", () => {
    const nodes: ReturnType<typeof findPlacement>[] = [];
    push(nodes, findPlacement(nodes, "A"), "pos-A");
    push(nodes, findPlacement(nodes, "X"), "pos-X");
    push(nodes, findPlacement(nodes, "Y"), "pos-Y");
    const z = findPlacement(nodes, "Z");
    expect(z.parent_id).toBe("pos-Y");
    expect(z.position).toBe("LEFT");
  });

  it("CASE 3: RESERVED occupies the slot so the next call cannot take it", () => {
    const nodes: ReturnType<typeof findPlacement>[] = [];
    push(nodes, findPlacement(nodes, "A"), "pos-A");
    const reserved = findPlacement(nodes, "X");
    expect(reserved.position).toBe("LEFT");
    push(nodes, reserved, "pos-X-reserved", "RESERVED");
    const next = findPlacement(nodes, "Y");
    expect(next.parent_id).toBe("pos-X-reserved");
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

  it("re-entry CASE 4: RESERVED A.RIGHT is not reused; next is X.LEFT", () => {
    const nodes = [
      { id: "pos-A", user_id: "A", parent_id: null, position: null, depth: 0, status: "ACTIVE" as const },
      { id: "pos-X", user_id: "X", parent_id: "pos-A", position: "LEFT" as const, depth: 1, status: "ACTIVE" as const },
      { id: "pos-R", user_id: "R", parent_id: "pos-A", position: "RIGHT" as const, depth: 1, status: "RESERVED" as const },
    ];
    const hole = findReentryPlacement(nodes, "M");
    expect(hole.parent_id).toBe("pos-X");
    expect(hole.position).toBe("LEFT");
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

  it("detects both Global legs and powerline cycle complete", () => {
    const both = [
      { id: "pos-A", user_id: "A", parent_id: null, position: null, depth: 0 },
      { id: "pos-L", user_id: "L", parent_id: "pos-A", position: "LEFT" as const, depth: 1 },
      { id: "pos-R", user_id: "R", parent_id: "pos-A", position: "RIGHT" as const, depth: 1 },
    ];
    expect(bothLegsFilled(both, "pos-A")).toBe(true);
    expect(cycleComplete(both, "pos-A")).toBe(true);

    const powerline = [
      { id: "pos-A", user_id: "A", parent_id: null, position: null, depth: 0 },
      { id: "pos-X", user_id: "X", parent_id: "pos-A", position: "LEFT" as const, depth: 1 },
      { id: "pos-Y", user_id: "Y", parent_id: "pos-X", position: "LEFT" as const, depth: 2 },
    ];
    expect(bothLegsFilled(powerline, "pos-A")).toBe(false);
    expect(cycleComplete(powerline, "pos-A")).toBe(true);
    expect(cycleComplete(powerline, "pos-X")).toBe(false);
  });

  it("RESERVED right child does not complete the cycle", () => {
    const nodes = [
      { id: "pos-X", user_id: "X", parent_id: null, position: null, depth: 0, status: "ACTIVE" as const },
      { id: "pos-Y", user_id: "Y", parent_id: "pos-X", position: "LEFT" as const, depth: 1, status: "ACTIVE" as const },
      { id: "pos-A", user_id: "A", parent_id: "pos-X", position: "RIGHT" as const, depth: 1, status: "RESERVED" as const },
    ];
    expect(cycleComplete(nodes, "pos-X")).toBe(false);
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
