"use client";

import { useEffect, useState } from "react";
import { DashShell, useMe } from "@/components/dash-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, shortAddr } from "@/lib/utils";

export default function WalletPage() {
  const me = useMe();
  const [cfg, setCfg] = useState<{ explorer: string; chainId: number; chainName: string } | null>(null);
  const [bal, setBal] = useState<{ pol: string; usdt: string } | null>(null);
  useEffect(() => {
    api<{ config: { explorer: string; chainId: number; chainName: string } }>("/api/config").then((r) => setCfg(r.config));
  }, []);
  useEffect(() => {
    if (!me?.address) return;
    api<{ pol: string; usdt: string }>(`/api/wallet/balances?address=${me.address}`).then((r) => {
      if (r.ok) setBal(r);
    });
  }, [me?.address]);

  return (
    <DashShell title="Wallet">
      <p className="mt-2 text-sm text-mute">Balances are read from Polygon. GLOBAL X never asks for your seed phrase.</p>
      <Card className="mt-6 space-y-4 p-5 sm:p-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-mute">Address</p>
          <p className="mt-1 break-all font-mono text-sm">{me?.address}</p>
          <p className="mt-1 text-xs text-mute">{shortAddr(me?.address)} · {me?.wallet_type}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-mute">POL</p>
            <p className="mt-1 font-display text-xl">{bal?.pol ?? "…"}</p>
          </div>
          <div className="rounded-2xl bg-white/5 p-4">
            <p className="text-xs text-mute">USDT</p>
            <p className="mt-1 font-display text-xl">{bal?.usdt ?? "…"}</p>
          </div>
        </div>
        <p className="text-sm text-mute">
          {cfg?.chainName} · Chain ID {cfg?.chainId}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="ghost" className="w-full sm:w-auto" onClick={() => me?.address && navigator.clipboard.writeText(me.address)}>
            Copy address
          </Button>
          {me?.address && cfg && (
            <a className="no-underline" href={`${cfg.explorer}/address/${me.address}`} target="_blank" rel="noreferrer">
              <Button variant="ghost" className="w-full sm:w-auto">
                View on explorer
              </Button>
            </a>
          )}
        </div>
      </Card>
    </DashShell>
  );
}
