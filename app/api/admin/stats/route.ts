import { jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { readStore } from "@/lib/store";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return jsonError("ADMIN_REQUIRED", 401);
  }
  const s = await readStore();
  const liveUsers = s.users.filter((u) => !u.is_demo);
  return jsonOk({
    stats: {
      total_users: liveUsers.length,
      connected_wallets: s.wallets.length,
      verified_wallets: s.wallets.filter((w) => w.verified).length,
      active_registrations: s.registrations.filter((r) => r.status === "ACTIVE").length,
      pending_payments: s.transactions.filter((t) => t.status === "PENDING").length,
      confirmed_payments: s.transactions.filter((t) => t.status === "CONFIRMED").length,
      active_plans: s.transactions.filter((t) => t.payment_type === "PLAN_PURCHASE" && t.status === "CONFIRMED").length,
      referral_count: s.referrals.length,
    },
  });
}
