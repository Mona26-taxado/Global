import type { PlanRow, ReferralRow, TransactionRow } from "@/types";

export function orderedPlans(plans: PlanRow[]) {
  return [...plans].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.code.localeCompare(b.code));
}

export function activeOrderedPlans(plans: PlanRow[]) {
  return orderedPlans(plans).filter((p) => p.active || p.enabled);
}

export function basePlan(plans: PlanRow[]) {
  return activeOrderedPlans(plans)[0] ?? orderedPlans(plans)[0] ?? null;
}

export function hasConfirmedPlan(
  transactions: Pick<TransactionRow, "user_id" | "plan_id" | "payment_type" | "status">[],
  userId: string,
  planId: string,
) {
  return transactions.some(
    (t) => t.user_id === userId && t.plan_id === planId && t.payment_type === "PLAN_PURCHASE" && t.status === "CONFIRMED",
  );
}

export function isPlanUnlocked(plans: PlanRow[], transactions: TransactionRow[], userId: string, planId: string) {
  const active = activeOrderedPlans(plans);
  const idx = active.findIndex((p) => p.id === planId);
  if (idx < 0) return false;
  if (idx === 0) return true;
  return hasConfirmedPlan(transactions, userId, active[idx - 1]!.id);
}

export function sponsorDirects(referrals: ReferralRow[], sponsorId: string) {
  return referrals
    .filter((r) => r.sponsor_id === sponsorId)
    .sort((a, b) => (a.direct_number ?? 9) - (b.direct_number ?? 9));
}

export function qualifiesForPlanGlobal(
  store: {
    transactions: TransactionRow[];
    referrals: ReferralRow[];
  },
  userId: string,
  planId: string,
  pendingBuyerId?: string,
) {
  if (!hasConfirmedPlan(store.transactions, userId, planId) && userId !== pendingBuyerId) return false;
  if (!hasConfirmedPlan(store.transactions, userId, planId)) return false;
  const directs = sponsorDirects(store.referrals, userId);
  if (directs.length < 2) return false;
  return directs.every(
    (d) => hasConfirmedPlan(store.transactions, d.user_id, planId) || d.user_id === pendingBuyerId,
  );
}

export type PlanViewState =
  | "LOCKED"
  | "AVAILABLE"
  | "ACTIVE_WAITING_FOR_DIRECTS"
  | "GLOBAL_ACTIVE"
  | "REENTRY_PAYMENT_REQUIRED";

export function planViewState(input: {
  unlocked: boolean;
  membership: boolean;
  globalActive: boolean;
  reentryRequired: boolean;
  waitingForDirects: boolean;
}): PlanViewState {
  if (input.reentryRequired) return "REENTRY_PAYMENT_REQUIRED";
  if (input.globalActive) return "GLOBAL_ACTIVE";
  if (input.membership && input.waitingForDirects) return "ACTIVE_WAITING_FOR_DIRECTS";
  if (input.membership) return "ACTIVE_WAITING_FOR_DIRECTS";
  if (input.unlocked) return "AVAILABLE";
  return "LOCKED";
}
