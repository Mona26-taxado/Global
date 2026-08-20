import { findPlacement } from "@/network/placement";
import { makeReferralCode, newId, readStore, supabaseEnabled, withStore } from "@/lib/store";
import type { NetworkPositionRow, UserRow } from "@/types";

export async function createUser(input: {
  display_name?: string;
  email?: string;
  mobile?: string;
  is_demo?: boolean;
  id?: string;
}): Promise<UserRow> {
  return withStore((store) => {
    const existing = store.users.find((u) => u.id === input.id);
    if (existing) return existing;
    let code = makeReferralCode();
    while (store.users.some((u) => u.referral_code === code)) code = makeReferralCode();
    const user: UserRow = {
      id: input.id ?? newId("user"),
      referral_code: code,
      sponsor_id: null,
      is_demo: Boolean(input.is_demo),
      display_name: input.display_name ?? "Member",
      email: input.email,
      mobile: input.mobile,
      created_at: new Date().toISOString(),
    };
    store.users.push(user);
    return user;
  });
}

/** Server-side only. Never accept a sponsor_id from the frontend. */
export function findSponsorByCode(users: UserRow[], code: string, userId: string) {
  const normalized = code.trim().toUpperCase();
  if (!normalized) throw new Error("INVALID_REFERRAL");
  const sponsor = users.find((u) => u.referral_code === normalized);
  if (!sponsor) throw new Error("INVALID_REFERRAL");
  if (sponsor.id === userId) throw new Error("SELF_REFERRAL");
  return sponsor;
}

export async function assignSponsor(userId: string, code: string) {
  return withStore((store) => {
    const user = store.users.find((u) => u.id === userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    if (user.sponsor_id) throw new Error("SPONSOR_LOCKED");
    const sponsor = findSponsorByCode(store.users, code, userId);
    user.sponsor_id = sponsor.id;
    store.referrals.push({
      id: newId("ref"),
      user_id: userId,
      sponsor_id: sponsor.id,
      referral_code: sponsor.referral_code,
    });
    return { sponsor_id: sponsor.id };
  });
}

export async function placeUser(userId: string): Promise<NetworkPositionRow> {
  return withStore((store) => {
    const existing = store.network_positions.find((p) => p.user_id === userId);
    if (existing) return existing;
    const placement = findPlacement(store.network_positions, userId);
    const row: NetworkPositionRow = {
      id: placement.id,
      user_id: userId,
      parent_id: placement.parent_id,
      position: placement.position,
      depth: placement.depth,
      cycle: Math.floor(placement.depth / 2),
    };
    store.network_positions.push(row);
    return row;
  });
}

export async function getNetwork() {
  const store = await readStore();
  return store.network_positions.map((p) => ({
    ...p,
    user: store.users.find((u) => u.id === p.user_id),
  }));
}

export async function getDownline(userId: string) {
  const store = await readStore();
  const self = store.network_positions.find((p) => p.user_id === userId);
  if (!self) return [];
  const out: NetworkPositionRow[] = [];
  const walk = (parentId: string) => {
    for (const child of store.network_positions.filter((p) => p.parent_id === parentId)) {
      out.push(child);
      walk(child.id);
    }
  };
  walk(self.id);
  return out;
}

export function supabaseConfigured() {
  return supabaseEnabled();
}
