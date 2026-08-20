"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashShell, useMe } from "@/components/dash-shell";
import { Card } from "@/components/ui/card";
import { api, shortAddr } from "@/lib/utils";

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
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Wallet", me?.address ? shortAddr(me.address) : "—"],
          ["Type", me?.wallet_type ?? "—"],
          ["Registration", reg],
          ["Plan", me?.plans?.[0] ?? "None"],
          ["Direct referrals", String(me?.directs ?? 0)],
          ["POL", bal?.pol ?? "…"],
          ["USDT", bal?.usdtConfigured === false ? "not configured" : (bal?.usdt ?? "…")],
          ["Referral code", me?.referral_code ?? "—"],
        ].map(([k, v]) => (
          <Card key={k} className="p-5">
            <div className="text-[11px] uppercase tracking-[0.2em] text-mute">{k}</div>
            <div className="mt-2 font-display text-xl">{v}</div>
          </Card>
        ))}
      </div>
      {reg !== "ACTIVE" && (
        <p className="mt-6 text-sm text-mute">
          Complete <Link href="/register">$5 registration</Link> before buying a plan.
        </p>
      )}
    </DashShell>
  );
}
