import { describe, expect, it } from "vitest";
import { findPlacement } from "../network/placement";
import { amountToUnits } from "../payments/service";
import { tokenPocketLoginParam } from "../wallet/tokenpocket/deeplink";

describe("network BFS", () => {
  it("places A root then B left C right", () => {
    const nodes: ReturnType<typeof findPlacement>[] = [];
    const a = findPlacement(nodes, "A");
    nodes.push({ ...a, id: "pos-A" });
    const b = findPlacement(nodes, "B");
    expect(b.position).toBe("LEFT");
    nodes.push({ ...b, id: "pos-B" });
    const c = findPlacement(nodes, "C");
    expect(c.position).toBe("RIGHT");
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
