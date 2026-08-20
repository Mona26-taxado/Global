import { describe, expect, it } from "vitest";
import { isCompleteProfile, normalizeMemberProfile } from "../lib/member-profile";

describe("member profile", () => {
  it("accepts a complete profile", () => {
    const p = normalizeMemberProfile({
      display_name: "Riya Shah",
      email: "riya@example.com",
      mobile: "9876543210",
    });
    expect(isCompleteProfile(p)).toBe(true);
  });
  it("rejects incomplete details", () => {
    expect(isCompleteProfile(normalizeMemberProfile({ display_name: "R", email: "bad", mobile: "12" }))).toBe(false);
  });
});
