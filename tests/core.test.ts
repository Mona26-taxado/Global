import { describe, expect, it } from "vitest";
import { bothLegsFilled, findPlacement } from "../network/placement";
import { amountToUnits } from "../payments/service";
import { tokenPocketLoginParam } from "../wallet/tokenpocket/deeplink";

describe("global placement (BFS LEFT then RIGHT)", () => {
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

  it("CASE 3: after X.LEFT, next is X.RIGHT", () => {
    const nodes: ReturnType<typeof findPlacement>[] = [];
    push(nodes, findPlacement(nodes, "A"), "pos-A");
    push(nodes, findPlacement(nodes, "X"), "pos-X");
    push(nodes, findPlacement(nodes, "Y"), "pos-Y");
    push(nodes, findPlacement(nodes, "Z"), "pos-Z");
    const w = findPlacement(nodes, "W");
    expect(w.parent_id).toBe("pos-X");
    expect(w.position).toBe("RIGHT");
  });

  it("CASE 4: after X.LEFT and X.RIGHT, next is Y.LEFT", () => {
    const nodes: ReturnType<typeof findPlacement>[] = [];
    push(nodes, findPlacement(nodes, "A"), "pos-A");
    push(nodes, findPlacement(nodes, "X"), "pos-X");
    push(nodes, findPlacement(nodes, "Y"), "pos-Y");
    push(nodes, findPlacement(nodes, "Z"), "pos-Z");
    push(nodes, findPlacement(nodes, "W"), "pos-W");
    const next = findPlacement(nodes, "N");
    expect(next.parent_id).toBe("pos-Y");
    expect(next.position).toBe("LEFT");
  });

  it("CASE 5: RESERVED occupies the slot so the next allocator call cannot take it", () => {
    const nodes: ReturnType<typeof findPlacement>[] = [];
    push(nodes, findPlacement(nodes, "A"), "pos-A");
    const reserved = findPlacement(nodes, "X");
    expect(reserved.position).toBe("LEFT");
    push(nodes, reserved, "pos-X-reserved", "RESERVED");
    const next = findPlacement(nodes, "Y");
    expect(next.parent_id).toBe("pos-A");
    expect(next.position).toBe("RIGHT");
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

  it("detects both Global legs", () => {
    const nodes = [
      { id: "pos-A", user_id: "A", parent_id: null, position: null, depth: 0 },
      { id: "pos-L", user_id: "L", parent_id: "pos-A", position: "LEFT" as const, depth: 1 },
      { id: "pos-R", user_id: "R", parent_id: "pos-A", position: "RIGHT" as const, depth: 1 },
    ];
    expect(bothLegsFilled(nodes, "pos-A")).toBe(true);
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