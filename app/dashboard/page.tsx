"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashShell, useMe } from "@/components/dash-shell";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { api, shortAddr } from "@/lib/utils";

function statusTone(status: string): "mint" | "danger" | "violet" | "mute" {
  if (status === "ACTIVE") return "mint";
  if (status === "FAILED") return "danger";
  if (status === "PENDING") return "violet";
  return "mute";
}

export default function DashboardPage() {
  const me = useMe();
  const [bal, setBal] = useState<{ pol: string; usdt: string; usdtConfigured?: boolean } | null>(null);
  useEffect(() => {
    if (!me?.address) return;
    api<{ pol: string; usdt: string; usdtConfigured?: boolean }>(`/api/wallet/balances?address=${me.address}`).then((r) => {
      if (r.ok) setBal(r);
    });
  }, [me?.address]);

  const reg = me?.registration?.status ?? "NOT_PAID";

  return (
    <DashShell title="Overview">
      <p className="mt-2 max-w-xl text-sm text-mute">Your membership, wallet, and referrals in one place.</p>

      {reg !== "ACTIVE" && (
        <Alert className="mt-5" tone="warning" title="Complete registration">
          Pay the $5 USDT fee to unlock plans and your live referral link.
          <div className="mt-3">
            <Button asChild className="!py-2 text-xs">
              <Link href="/register" className="no-underline">
                Pay $5 now
              </Link>
            </Button>
          </div>
        </Alert>
      )}

      <Card className="mt-6 overflow-hidden p-0">
        <div className="bg-gradient-to-r from-violet/20 to-electric/10 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-mute">Signed in</p>
              <p className="mt-1 font-mono text-sm text-white sm:text-base">{shortAddr(me?.address)}</p>
              <p className="mt-1 text-xs capitalize text-mute">{me?.wallet_type ?? "Wallet"} · Polygon</p>
            </div>
            <Badge tone={statusTone(reg)}>{reg.replaceAll("_", " ")}</Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-4">
          {[
            ["USDT", bal?.usdtConfigured === false ? "—" : (bal?.usdt ?? "…")],
            ["POL", bal?.pol ?? "…"],
            ["Plan", me?.plans?.[0] ?? "None"],
            ["Directs", String(me?.directs ?? 0)],
          ].map(([k, v]) => (
            <div key={k} className="bg-[#0c1228] p-4">
              <div className="text-[11px] uppercase tracking-[0.16em] text-mute">{k}</div>
              <div className="mt-1 truncate font-display text-lg sm:text-xl">{v}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-mute">Referral code</p>
          <p className="mt-2 font-display text-2xl">{me?.referral_code ?? "—"}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild variant="ghost" className="!py-2 text-xs">
              <Link href="/dashboard/referral" className="no-underline">
                Share invite
              </Link>
            </Button>
            <Button asChild variant="ghost" className="!py-2 text-xs">
              <Link href="/plans" className="no-underline">
                View plans
              </Link>
            </Button>
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] uppercase tracking-[0.2em] text-mute">Team</p>
          <p className="mt-2 text-sm text-mute">Active referrals are members who completed $5 registration.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-mute">Active</p>
              <p className="font-display text-2xl">{me?.active_referrals ?? 0}</p>
            </div>
            <div>
              <p className="text-xs text-mute">Total</p>
              <p className="font-display text-2xl">{me?.total_referrals ?? 0}</p>
            </div>
          </div>
        </Card>
      </div>
    </DashShell>
  );
}
