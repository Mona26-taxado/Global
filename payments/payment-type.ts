/** TokenPocket / localStorage may store `GLOBAL_REENTRY:<planId>`. Never treat that string as a single enum. */

export function parsePaymentType(raw: string): { kind: string; planId?: string } {
  const value = String(raw ?? "").trim();
  if (value === "REENTRY" || value === "GLOBAL_REENTRY") {
    return { kind: "GLOBAL_REENTRY" };
  }
  const prefix = "GLOBAL_REENTRY:";
  if (value.startsWith(prefix)) {
    const planId = value.slice(prefix.length).trim();
    return { kind: "GLOBAL_REENTRY", planId: planId || undefined };
  }
  return { kind: value };
}

export function composeReentryPaymentType(planId?: string | null) {
  return planId ? `GLOBAL_REENTRY:${planId}` : "GLOBAL_REENTRY";
}

export function paymentTypeFromTokenPocketPayload(payload: unknown, fallback?: string): string {
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>;
    if (typeof p.paymentType === "string" && p.paymentType.trim()) return p.paymentType.trim();
    if (p.kind === "GLOBAL_REENTRY" && typeof p.plan_id === "string" && p.plan_id.trim()) {
      return composeReentryPaymentType(p.plan_id.trim());
    }
  }
  return fallback || "REGISTRATION";
}
