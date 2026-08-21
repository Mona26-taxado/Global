"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GitBranch, Layers, Users } from "lucide-react";
import { DashShell, useMe } from "@/components/dash-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/ui/app-ui";
import { api, shortAddr } from "@/lib/utils";
import { parentOf, routingLabel, type NetNode } from "@/lib/cycle-ui";
import { usePay } from "@/hooks/use-pay";

type MyTx = {
  payment_type?: string;
  plan_code?: string;
  amount?: string;
  token?: string;
  status: string;
  recipient_role?: string | null;
  routing_slot?: number | null;
  recipient_wallet?: string;
  created_at: string;
};

function positionDisplayStatus(
  me: ReturnType<typeof useMe>,
  self: NetNode | undefined,
  payPhase: string,
): string {
  if (payPhase === "CONFIRMED") return "ACTIVE AFTER REENTRY";
  if (payPhase === "SUBMITTED" || payPhase === "PENDING" || payPhase === "WALLET_CONFIRMATION") return "CONFIRMING";
  if (me?.reentry?.reserved) return "PAYMENT_REQUIRED";
  if (me?.reentry?.required) return "QUALIFIED_FOR_REENTRY";
  if (self?.status === "RESERVED") return "RESERVED";
  if (self) return "ACTIVE";
  return "—";
}

export default function NetworkPage() {
  const me = useMe();
  const reentryPay = usePay();
  const [tree, setTree] = useState<NetNode[]>([]);

  useEffect(() => {
    api<{ tree: NetNode[] }>("/api/network").then((r) => setTree(r.tree ?? []));
  }, [reentryPay.phase]);

  useEffect(() => {
    if (reentryPay.phase !== "CONFIRMED") return;
    const t = window.setTimeout(() => window.location.reload(), 900);
    return () => window.clearTimeout(t);
  }, [reentryPay.phase]);

  const self = useMemo(
    () =>
      tree.find((n) => n.user_id === me?.id && (n.status ?? "ACTIVE") === "ACTIVE") ??
      tree.find((n) => n.user_id === me?.id),
    [tree, me?.id],
  );
  const parent = parentOf(tree, self);
  const left = useMemo(() => (self ? tree.find((n) => n.parent_id === self.id && n.position === "LEFT") : undefined), [tree, self]);
  const right = useMemo(() => (self ? tree.find((n) => n.parent_id === self.id && n.position === "RIGHT") : undefined), [tree, self]);
  const txs = (me?.transactions as MyTx[] | undefined) ?? [];
  const paid = txs.filter((t) => (t.payment_type === "PLAN_PURCHASE" || t.payment_type === "GLOBAL_REENTRY") && t.status === "CONFIRMED");
  const currentPlan = me?.reentry?.plan_code ?? me?.plans?.[me.plans.length - 1] ?? null;
  const status = positionDisplayStatus(me, self, reentryPay.phase);
  const reentryBusy = reentryPay.phase === "SUBMITTED" || reentryPay.phase === "PENDING" || reentryPay.phase === "WALLET_CONFIRMATION";
  const showVerified = reentryPay.phase === "CONFIRMED";

  return (
    <DashShell title="Cycle">
      <PageHeader
        kicker="Cycle"
        title="My Current Global Position"
        description="This page is your Global placement, not your referral sponsor tree. Sponsor stays on Referral."
      />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Position status" value={status === "—" ? "—" : status.replaceAll("_", " ")} />
        <StatCard label="Current plan" value={currentPlan ? currentPlan.replaceAll("_", " ") : "—"} />
        <StatCard label="Direct referrals" value={String(me?.directs ?? 0)} hint="Max 2" />
        <StatCard label="Global parent" value={parent?.user?.referral_code ?? (self ? "Root" : "—")} />
      </div>

      {me?.reentry?.required && (
        <Card className="mt-4 border-warning/40 p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-warning">Global Re-entry Required</p>
          <p className="mt-2 text-sm text-secondary">
            Both LEFT and RIGHT of your current seat are filled. The next BFS seat is reserved. It becomes ACTIVE only after
            blockchain verification of this payment.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-[10px] uppercase tracking-[0.14em] text-mute">New Parent</dt>
              <dd className="mt-1 text-sm text-cream">
                {me.reentry.global_parent_code ?? (me.reentry.global_parent_user_id ? shortAddr(me.reentry.global_parent_user_id) : "—")}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.14em] text-mute">Position</dt>
              <dd className="mt-1 text-sm font-semibold text-cream">{me.reentry.position ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.14em] text-mute">Amount</dt>
              <dd className="mt-1 text-sm tabular text-cream">{me.reentry.amount_usd != null ? `$${me.reentry.amount_usd}` : "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-[0.14em] text-mute">Recipient</dt>
              <dd className="mt-1 font-mono text-sm text-cream">
                {me.reentry.recipient_wallet ? shortAddr(me.reentry.recipient_wallet) : "—"}
              </dd>
            </div>
          </dl>
          {reentryPay.message && (
            <div className="mt-3">
              <Alert
                tone={
                  showVerified
                    ? "success"
                    : reentryPay.phase === "FAILED" || reentryPay.phase === "REJECTED"
                      ? "error"
                      : "info"
                }
              >
                {showVerified ? "Payment confirmed. Activating the reserved seat…" : reentryPay.message}
              </Alert>
            </div>
          )}
          <Button
            className="mt-4"
            onClick={() => void reentryPay.pay("GLOBAL_REENTRY")}
            disabled={reentryBusy || showVerified}
          >
            Pay & Activate New Position
          </Button>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">My Current Global Position</p>
          {self ? (
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-secondary">Status</span>
                <StatusBadge status={status} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-secondary">Global Parent</span>
                <span className="font-semibold text-cream">{parent?.user?.referral_code ?? "Root"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-secondary">LEFT leg</span>
                <span className="text-cream">{left?.user?.referral_code ?? "Empty"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-secondary">RIGHT leg</span>
                <span className="text-cream">{right?.user?.referral_code ?? "Empty"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-secondary">Current Plan</span>
                <span className="text-cream">{currentPlan ? currentPlan.replaceAll("_", " ") : "—"}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-secondary">Your seat</span>
                <span className="text-cream">{self.position ?? "ROOT"}</span>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-secondary">You appear here after Direct #2 placement puts you in Global.</p>
          )}
        </Card>
        <Card className="p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Payments you sent</p>
          <div className="mt-4 space-y-2">
            {paid.slice(0, 8).map((t) => (
              <div key={t.created_at + (t.plan_code ?? "") + (t.payment_type ?? "")} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-secondary">{routingLabel(t.recipient_role, t.routing_slot)}</span>
                <span className="tabular">{t.amount}</span>
              </div>
            ))}
            {paid.length === 0 && <p className="text-sm text-mute">No confirmed plan or re-entry payment yet.</p>}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:gap-3">
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-mute">Parent</p>
          <p className="mt-1 truncate text-sm font-semibold text-cream">{parent?.user?.referral_code ?? (self ? "Root" : "—")}</p>
        </Card>
        <Card className="border-violet/40 p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-mute">You</p>
          <p className="mt-1 truncate text-sm font-semibold text-cream">{me?.referral_code ?? "—"}</p>
          <p className="text-[10px] text-secondary">{self?.position ?? ""}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-mute">Legs</p>
          <p className="mt-1 text-xs text-secondary">L {left?.user?.referral_code ?? "—"}</p>
          <p className="text-xs text-secondary">R {right?.user?.referral_code ?? "—"}</p>
        </Card>
      </div>

      <Card className="mt-4 p-5 sm:p-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Your directs</p>
        <p className="mt-1 text-xs text-mute">Referral sponsor relationship — not Global parent.</p>
        <div className="mt-4 space-y-3">
          {(me?.referrals ?? []).map((r, i) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-elevated px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Direct {r.direct_number ?? i + 1}</p>
                <p className="font-mono text-xs text-mute">{shortAddr(r.wallet)}</p>
              </div>
              <StatusBadge status={r.registration_status} />
            </div>
          ))}
          {(me?.referrals ?? []).length === 0 && <p className="text-sm text-mute">No directs yet.</p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="ghost">
            <Link href="/dashboard/referral" className="no-underline">
              <Users className="h-4 w-4" />
              Referral
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/plans" className="no-underline">
              <Layers className="h-4 w-4" />
              View Plans
            </Link>
          </Button>
        </div>
      </Card>

      {!self && (
        <div className="mt-4">
          <EmptyState
            icon={GitBranch}
            title="Not in Global yet"
            detail="Direct #1 pays your sponsor. Direct #2 places you with BFS and pays the Global parent."
          />
        </div>
      )}
    </DashShell>
  );
}
