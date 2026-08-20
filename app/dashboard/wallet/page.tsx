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
      <Card className="mt-6 space-y-3 p-6">
        <div>Type: {me?.wallet_type}</div>
        <div className="font-mono">{me?.address}</div>
        <div>Network: {cfg?.chainName} · Chain ID {cfg?.chainId}</div>
        <div>POL: {bal?.pol ?? "…"}</div>
        <div>USDT: {bal?.usdt ?? "configure contract to read"}</div>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            onClick={() => me?.address && navigator.clipboard.writeText(me.address)}
          >
            Copy
          </Button>
          {me?.address && cfg && (
            <a className="no-underline" href={`${cfg.explorer}/address/${me.address}`} target="_blank" rel="noreferrer">
              <Button variant="ghost">View on Explorer</Button>
            </a>
          )}
        </div>
        <p className="text-xs text-mute">Short: {shortAddr(me?.address)}. Balances are read from the chain. They are never invented.</p>
      </Card>
    </DashShell>
  );
}
