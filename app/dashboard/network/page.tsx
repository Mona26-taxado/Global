"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { GitBranch, Layers, Users } from "lucide-react";
import { NetworkCanvas } from "@/components/network/tree";
import { DashShell, useMe } from "@/components/dash-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState, PageHeader, StatCard, StatusBadge } from "@/components/ui/app-ui";
import { formatTokenAmount } from "@/components/ui/data-list";
import { api, shortAddr } from "@/lib/utils";
import { parentOf, routingLabel, type NetNode } from "@/lib/cycle-ui";

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

export default function NetworkPage() {
  const me = useMe();
  const [tree, setTree] = useState<NetNode[]>([]);

  useEffect(() => {
    api<{ tree: NetNode[] }>("/api/network").then((r) => setTree(r.tree ?? []));
  }, []);

  const self = useMemo(() => tree.find((n) => n.user_id === me?.id), [tree, me?.id]);
  const parent = parentOf(tree, self);
  const children = useMemo(() => (self ? tree.filter((n) => n.parent_id === self.id) : []), [tree, self]);
  const txs = (me?.transactions as MyTx[] | undefined) ?? [];
  const paid = txs.filter((t) => t.payment_type === "PLAN_PURCHASE" && t.status === "CONFIRMED");
  const paidTotal = paid.reduce((sum, t) => sum + (Number.isFinite(Number(t.amount)) ? Number(t.amount) : 0), 0);

  return (
    <DashShell title="Cycle">
      <PageHeader
        kicker="Cycle"
        title="Your Global cycle"
        description="Placement and the payments you sent. Incoming Direct #1 receipts sit on the payer’s transaction, so this screen cannot invent a private profit ledger."
      />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Position" value={self?.position ?? "—"} hint={!self ? "Not placed in Global yet" : undefined} />
        <StatCard label="Cycle" value={self ? String(self.cycle ?? Math.floor(self.depth / 2)) : "—"} />
        <StatCard label="Upline" value={parent?.user?.referral_code ?? (self ? "Root" : "—")} />
        <StatCard label="Direct referrals" value={String(me?.directs ?? 0)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Global slot</p>
          {self ? (
            <div className="mt-4 space-y-2 text-sm">
              <p>
                You sit <span className="font-semibold text-cream">{self.position ?? "ROOT"}</span> under{" "}
                <span className="font-semibold text-cream">{parent?.user?.referral_code ?? "the Global root"}</span>.
              </p>
              <p className="text-secondary">
                Depth {self.depth}. Cycle {self.cycle ?? Math.floor(self.depth / 2)}.
              </p>
              <p className="text-secondary">
                Global children in this view: {children.length ? children.map((c) => c.user?.referral_code ?? shortAddr(c.user_id)).join(", ") : "none yet"}.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-secondary">You appear here after Direct #2 placement puts you in Global.</p>
          )}
        </Card>
        <Card className="p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Plan payments you sent</p>
          <p className="mt-3 font-display text-3xl tabular">{paid.length ? formatTokenAmount(paidTotal) : "0"}</p>
          <p className="text-xs text-mute">Confirmed plan purchases from your wallet — this is outflow, not profit.</p>
          <div className="mt-4 space-y-2">
            {paid.slice(0, 6).map((t) => (
              <div key={t.created_at + (t.plan_code ?? "")} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-secondary">{routingLabel(t.recipient_role, t.routing_slot)}</span>
                <span className="tabular">{formatTokenAmount(t.amount)}</span>
              </div>
            ))}
            {paid.length === 0 && <p className="text-sm text-mute">No confirmed plan payment yet.</p>}
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-5 sm:p-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Received (Direct #1 to you)</p>
        <Alert className="mt-4" tone="info" title="Incoming profit is not on this member feed">
          When a direct buys your plan as Direct #1, USDT goes to your wallet on-chain. That record is stored on their payment, not on `/api/me`. This UI does not fake a receive total.
        </Alert>
        <EmptyState
          icon={GitBranch}
          title="No receive ledger in member API"
          detail="Share your referral link. Direct #1 plan payments settle to your verified wallet. Admin Cycle shows the full payer → recipient map."
          action={
            <Button asChild variant="ghost">
              <Link href="/dashboard/referral" className="no-underline">
                <Users className="h-4 w-4" />
                Open referral
              </Link>
            </Button>
          }
        />
      </Card>

      <Card className="mt-4 p-5 sm:p-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Your directs</p>
        <div className="mt-4 space-y-3">
          {(me?.referrals ?? []).map((r, i) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-elevated px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Direct {i + 1}</p>
                <p className="font-mono text-xs text-mute">{shortAddr(r.wallet)}</p>
              </div>
              <StatusBadge status={r.registration_status} />
            </div>
          ))}
          {(me?.referrals ?? []).length === 0 && <p className="text-sm text-mute">No directs yet.</p>}
        </div>
        <Button asChild variant="ghost" className="mt-4">
          <Link href="/plans" className="no-underline">
            <Layers className="h-4 w-4" />
            View Plans
          </Link>
        </Button>
      </Card>

      <div className="mt-6">
        <NetworkCanvas highlightUserId={me?.id} />
      </div>
    </DashShell>
  );
}
