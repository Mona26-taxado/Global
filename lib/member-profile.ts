export type MemberProfile = {
  display_name: string;
  email: string;
  mobile: string;
};

export function normalizeMemberProfile(input: {
  display_name?: unknown;
  name?: unknown;
  email?: unknown;
  mobile?: unknown;
  phone?: unknown;
}): MemberProfile {
  return {
    display_name: String(input.display_name ?? input.name ?? "").trim(),
    email: String(input.email ?? "").trim().toLowerCase(),
    mobile: String(input.mobile ?? input.phone ?? "").replace(/[^\d+]/g, ""),
  };
}

export function isCompleteProfile(p: MemberProfile) {
  return (
    p.display_name.length >= 2 &&
    p.display_name.length <= 80 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) &&
    /^\+?[0-9]{10,15}$/.test(p.mobile)
  );
}
