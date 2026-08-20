"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { DashShell, useMe } from "@/components/dash-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader, StatusBadge, WalletAddress } from "@/components/ui/app-ui";
import { api } from "@/lib/utils";

function providerLabel(type?: string) {
  if (type === "trust") return "Trust Wallet";
  if (type === "tokenpocket") return "TokenPocket";
  if (!type) return "Wallet";
  return type;
}

export default function WalletPage() {
  const me = useMe();
  const [cfg, setCfg] = useState<{ explorer: string; chainName: string } | null>(null);
  const [bal, setBal] = useState<{ pol: string; usdt: string; usdtConfigured?: boolean } | null>(null);

  function loadBal() {
    if (!me?.address) return;
    api<{ pol: string; usdt: string; usdtConfigured?: boolean }>(`/api/wallet/balances?address=${me.address}`).then((r) => {
      if (r.ok) setBal(r);
    });
  }

  useEffect(() => {
    api<{ config: { explorer: string; chainName: string } }>("/api/config").then((r) => setCfg(r.config));
  }, []);
  useEffect(() => {
    loadBal();
  }, [me?.address]);

  return (
    <DashShell title="Wallet">
      <PageHeader
        kicker="Wallet"
        title="Verified Wallet"
        description="Balances are read on-chain. GLOBAL X never asks for your seed phrase."
      />
      <Card className="mt-6 space-y-4 p-5 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {me?.verified && <StatusBadge status="VERIFIED" />}
          <StatusBadge status={me?.address ? "CONNECTED" : "DISCONNECTED"} />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Address</p>
          <div className="mt-2">
            <WalletAddress address={me?.address} explorer={cfg?.explorer} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-elevated p-4">
            <p className="text-xs text-mute">Network</p>
            <p className="mt-1 text-sm font-semibold">{cfg?.chainName ?? "Polygon"}</p>
          </div>
          <div className="rounded-xl border border-line bg-elevated p-4">
            <p className="text-xs text-mute">Provider</p>
            <p className="mt-1 text-sm font-semibold">{providerLabel(me?.wallet_type)}</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="ghost" onClick={loadBal}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          {me?.address && cfg && (
            <a className="no-underline" href={`${cfg.explorer}/address/${me.address}`} target="_blank" rel="noreferrer">
              <Button variant="ghost" className="w-full sm:w-auto">
                <ExternalLink className="h-4 w-4" />
                View on explorer
              </Button>
            </a>
          )}
        </div>
      </Card>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Card className="p-5">
          <p className="text-xs text-mute">POL</p>
          <p className="mt-1 font-display text-2xl tabular">{bal?.pol ?? "…"}</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs text-mute">Token balance</p>
          <p className="mt-1 font-display text-2xl tabular">{bal?.usdtConfigured === false ? "—" : (bal?.usdt ?? "…")}</p>
        </Card>
      </div>
    </DashShell>
  );
}
