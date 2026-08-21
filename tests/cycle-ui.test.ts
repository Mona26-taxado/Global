import { describe, expect, it } from "vitest";
import { routingLabel } from "../lib/cycle-ui";

describe("payment route labels", () => {
  it("maps Direct #1 / Direct #2 / re-entry to locked UI names", () => {
    expect(routingLabel("SPONSOR", 1)).toBe("DIRECT FIRST");
    expect(routingLabel("GLOBAL_UPLINE", 2)).toBe("GLOBAL SECOND");
    expect(routingLabel("GLOBAL_REENTRY", null)).toBe("GLOBAL REENTRY");
  });
});
