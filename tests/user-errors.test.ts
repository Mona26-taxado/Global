import { describe, expect, it } from "vitest";
import { friendlyMessage } from "../lib/user-errors";

describe("friendly errors", () => {
  it("maps balance revert to English", () => {
    const n = friendlyMessage("ERC20: transfer amount exceeds balance");
    expect(n.title).toBe("Not enough USDT");
    expect(n.tone).toBe("error");
  });
  it("unwraps signer json", () => {
    const n = friendlyMessage('{"error":"Error: Signer Error: gasLimit is too low. given 0, need at least 21596."}');
    expect(n.title).toBe("Wallet could not set a fee");
  });
  it("asks for profile details", () => {
    expect(friendlyMessage("PROFILE_REQUIRED").title).toBe("Your details are required");
  });
});
