"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, Layers, Network, Share2, Wallet } from "lucide-react";
import { DashShell, useMe } from "@/components/dash-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { PageHeader, StatCard, StatusBadge, WalletAddress } from "@/components/ui/app-ui";
import { api } from "@/lib/utils";

export default function DashboardPage() {
  const me = useMe();
  const [bal, setBal] = useState<{ pol: string; usdt: string; usdtConfigured?: boolean } | null>(null);
  const [chainName, setChainName] = useState("Polygon");
  const [position, setPosition] = useState<string | null>(null);
  const [cycle, setCycle] = useState<string | null>(null);

  useEffect(() => {
    api<{ config: { chainName: string } }>("/api/config").then((r) => {
      if (r.config?.chainName) setChainName(r.config.chainName);
    });
  }, []);

  useEffect(() => {
    if (!me?.address) return;
    api<{ pol: string; usdt: string; usdtConfigured?: boolean }>(`/api/wallet/balances?address=${me.address}`).then((r) => {
      if (r.ok) setBal(r);
    });
  }, [me?.address]);

  useEffect(() => {
    if (!me?.id) return;
    api<{ tree: { user_id: string; position: string | null; depth: number; cycle?: number }[] }>("/api/network").then((r) => {
      const node = (r.tree ?? []).find((n) => n.user_id === me.id);
      setPosition(node?.position ?? null);
      setCycle(node ? String(node.cycle ?? Math.floor(node.depth / 2)) : null);
    });
  }, [me?.id]);

  const reg = me?.registration?.status ?? "NOT_PAID";
  const txs = (me?.transactions as { payment_type?: string; plan_code?: string; status: string; created_at: string }[] | undefined) ?? [];

  return (
    <DashShell title="Overview">
      <PageHeader
        kicker="Overview"
        title={me?.display_name ? `Welcome, ${me.display_name}` : "Welcome"}
        description="Your membership, wallet, and referrals in one place."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={reg} />
            <span className="text-xs text-mute">{chainName}</span>
          </div>
        }
      />
      <p className="mt-2 text-sm text-secondary">
        <WalletAddress address={me?.address} />
      </p>

      {reg !== "ACTIVE" && (
        <Alert className="mt-5" tone="warning" title="Complete registration">
          Pay the registration fee to unlock plans and your live referral link.
          <div className="mt-3">
            <Button asChild className="!text-xs">
              <Link href="/register" className="no-underline">
                Continue registration
              </Link>
            </Button>
          </div>
        </Alert>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Membership Status" value={<StatusBadge status={reg} />} />
        <StatCard label="Current Plan" value={me?.plans?.[0] ?? "—"} />
        <StatCard label="Direct Referrals" value={String(me?.directs ?? 0)} />
        <StatCard label="Global Position" value={position ?? "—"} hint={!position ? "Shown when placed in Global" : undefined} />
        <StatCard label="Cycle" value={cycle ?? "—"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_0.8fr]">
        <Card className="p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Network Overview</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-elevated p-4">
              <p className="text-xs text-mute">Active referrals</p>
              <p className="mt-1 font-display text-2xl tabular">{me?.active_referrals ?? 0}</p>
            </div>
            <div className="rounded-xl border border-line bg-elevated p-4">
              <p className="text-xs text-mute">Total network</p>
              <p className="mt-1 font-display text-2xl tabular">{me?.total_referrals ?? 0}</p>
            </div>
          </div>
          <Button asChild variant="ghost" className="mt-4">
            <Link href="/dashboard/network" className="no-underline">
              <Network className="h-4 w-4" />
              View Network
            </Link>
          </Button>
        </Card>
        <Card className="p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Wallet</p>
          <p className="mt-3 text-sm capitalize text-secondary">{me?.wallet_type ?? "Wallet"}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-mute">POL</p>
              <p className="font-display text-xl tabular">{bal?.pol ?? "…"}</p>
            </div>
            <div>
              <p className="text-xs text-mute">{bal?.usdtConfigured === false ? "Token" : "Balance"}</p>
              <p className="font-display text-xl tabular">{bal?.usdtConfigured === false ? "—" : (bal?.usdt ?? "…")}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Quick Actions</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button asChild variant="ghost">
              <Link href="/plans" className="no-underline">
                <Layers className="h-4 w-4" />
                View Plans
              </Link>
            </Button>
            <Button
              variant="ghost"
              onClick={() => me?.referral_link && navigator.clipboard.writeText(me.referral_link)}
            >
              <Copy className="h-4 w-4" />
              Copy Referral Link
            </Button>
            <Button asChild variant="ghost">
              <Link href="/dashboard/network" className="no-underline">
                <Network className="h-4 w-4" />
                View Network
              </Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/dashboard/wallet" className="no-underline">
                <Wallet className="h-4 w-4" />
                Wallet
              </Link>
            </Button>
          </div>
        </Card>
        <Card className="p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Recent Activity</p>
          <div className="mt-4 space-y-3">
            {txs.slice(0, 4).map((t) => (
              <div key={t.created_at + (t.plan_code ?? "")} className="flex items-center justify-between gap-3">
                <span className="truncate text-sm">{t.payment_type ?? t.plan_code}</span>
                <StatusBadge status={t.status} />
              </div>
            ))}
            {txs.length === 0 && <p className="text-sm text-mute">No activity yet.</p>}
            <Button asChild variant="ghost" className="mt-2">
              <Link href="/dashboard/transactions" className="no-underline">
                View activity
              </Link>
            </Button>
          </div>
        </Card>
      </div>
    </DashShell>
  );
}
