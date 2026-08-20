import { describe, expect, it } from "vitest";
import { findSponsorByCode } from "../services/users";
import { explorerTxUrl } from "../lib/network-config";
import type { UserRow } from "../types";

const users: UserRow[] = [
  {
    id: "user_a",
    referral_code: "GX123456",
    sponsor_id: null,
    is_demo: false,
    display_name: "A",
    created_at: "2026-01-01T00:00:00.000Z",
  },
];

describe("referral attribution", () => {
  it("resolves a valid code", () => {
    expect(findSponsorByCode(users, "gx123456", "user_b").id).toBe("user_a");
  });
  it("rejects invalid codes", () => {
    expect(() => findSponsorByCode(users, "NOPE", "user_b")).toThrow("INVALID_REFERRAL");
  });
  it("rejects self-referral", () => {
    expect(() => findSponsorByCode(users, "GX123456", "user_a")).toThrow("SELF_REFERRAL");
  });
});

describe("explorer", () => {
  it("builds Amoy links from real hashes only (caller supplies hash)", () => {
    expect(explorerTxUrl("0xabc", "amoy")).toContain("/tx/0xabc");
  });
});
