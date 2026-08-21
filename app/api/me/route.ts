import { jsonOk } from "@/lib/http";
import { getSession } from "@/lib/session";
import { readStore } from "@/lib/store";
import { getRegistration, retryPendingRegistration } from "@/payments/service";
import { currentQualifyingPlan } from "@/payments/plan-routing";
import { appUrl } from "@/lib/network-config";
import { bothLegsFilled, currentPosition, reservedPosition } from "@/services/users";

export async function GET() {
  const session = await getSession();
  if (!session.userId) return jsonOk({ me: null });
  const store = await readStore();
  const user = store.users.find((u) => u.id === session.userId);
  if (!user) return jsonOk({ me: null });
  const wallet = store.wallets.find((w) => w.user_id === user.id);
  const referred = store.users.filter((u) => u.sponsor_id === user.id && !u.is_demo);
  const referralRows = store.referrals.filter((r) => r.sponsor_id === user.id);
  let registration = await getRegistration(user.id);
  if (registration?.status === "PENDING" && registration.tx_hash) {
    try {
      const retried = await retryPendingRegistration(user.id);
      registration = retried.registration ?? registration;
    } catch {
      /* keep PENDING until chain verify succeeds */
    }
  }
  const txs = store.transactions.filter((t) => t.user_id === user.id);
  const plans = txs.filter((t) => t.payment_type === "PLAN_PURCHASE" && t.status === "CONFIRMED").map((t) => t.plan_code);
  const currentPos = currentPosition(store.network_positions, user.id);
  const reserved = reservedPosition(store.network_positions, user.id);
  const plan = currentQualifyingPlan(store, user.id);
  const parentUser = reserved?.recipient_user_id
    ? store.users.find((u) => u.id === reserved.recipient_user_id)
    : null;
  const reentry = {
    required: Boolean(reserved) || Boolean(currentPos && bothLegsFilled(store.network_positions, currentPos.id)),
    reserved: Boolean(reserved),
    position_id: reserved?.id ?? null,
    position: reserved?.position ?? null,
    global_parent_user_id: reserved?.recipient_user_id ?? null,
    global_parent_code: parentUser?.referral_code ?? null,
    recipient_wallet: reserved?.recipient_wallet ?? null,
    amount_usd: plan?.amount_usd ?? null,
    plan_code: plan?.code ?? null,
  };
  const referrals = referred.map((u) => {
    const w = store.wallets.find((x) => x.user_id === u.id);
    const reg = store.registrations.find((r) => r.user_id === u.id);
    const row = referralRows.find((r) => r.user_id === u.id);
    return {
      id: u.id,
      wallet: w?.address ?? null,
      registration_status: reg?.status ?? "NOT_PAID",
      joined: u.created_at,
      direct_number: row?.direct_number ?? null,
    };
  });
  const activeReferrals = referrals.filter((r) => r.registration_status === "ACTIVE").length;
  return jsonOk({
    me: {
      ...user,
      address: session.address,
      wallet_type: wallet?.wallet_type ?? session.walletType,
      verified: Boolean(wallet?.verified),
      registration,
      directs: referred.length,
      active_referrals: activeReferrals,
      total_referrals: referred.length,
      referrals,
      plans,
      transactions: txs,
      reentry,
      referral_link: `${appUrl()}/register?ref=${user.referral_code}`,
    },
  });
}
