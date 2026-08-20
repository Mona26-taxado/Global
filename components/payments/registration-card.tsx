"use client";

import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { usePay } from "@/hooks/use-pay";
import { useEffect, useState } from "react";
import { api } from "@/lib/utils";

type Cfg = { chainName: string; explorer: string; testnet: boolean; usdtConfigured: boolean };

export function RegistrationPayCard({
  status,
  txHash,
  onActive,
}: {
  status: string;
  txHash?: string | null;
  onActive?: () => void;
}) {
  const pay = usePay();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  useEffect(() => {
    api<{ config: Cfg }>("/api/config").then((r) => setCfg(r.config));
  }, []);
  useEffect(() => {
    if (pay.phase === "CONFIRMED") onActive?.();
  }, [pay.phase, onActive]);

  const uiStatus =
    status === "ACTIVE"
      ? "ACTIVE"
      : pay.phase === "PENDING" || status === "PENDING"
        ? "PAYMENT PENDING"
        : status === "FAILED" || pay.phase === "FAILED"
          ? "PAYMENT FAILED"
          : "NOT PAID";

  const hash = pay.txHash || txHash;

  return (
    <Card className="mt-6 p-6">
      {cfg?.testnet && <Badge>TESTNET</Badge>}
      <h2 className="mt-3 font-display text-2xl">GLOBAL X REGISTRATION</h2>
      <p className="mt-1 text-sm text-mute">Registration Fee</p>
      <div className="mt-2 font-display text-4xl">$5 USDT</div>
      <p className="mt-2 text-sm text-mute">Network: {cfg?.chainName ?? "Polygon Amoy"}</p>
      <p className="mt-4 text-sm">
        Status: <span className="text-violet-200">{uiStatus}</span>
      </p>
      {!cfg?.usdtConfigured && (
        <p className="mt-3 text-sm text-danger">USDT testnet contract is not configured.</p>
      )}
      {status !== "ACTIVE" && (
        <Button
          className="mt-6 w-full"
          disabled={pay.phase === "WALLET_CONFIRMATION" || cfg?.usdtConfigured === false}
          onClick={() => pay.pay("REGISTRATION")}
        >
          {pay.phase === "WALLET_CONFIRMATION" ? "Waiting for wallet confirmation..." : "PAY $5 REGISTRATION"}
        </Button>
      )}
      {pay.message && <p className="mt-3 text-sm">{pay.message}</p>}
      {pay.phase === "FAILED" && (
        <p className="mt-2 text-sm text-mute">
          Wallet password ke baad ye page wapas aa sakta hai. Agar transaction revert hui ho to is wallet mein configured USDT + POL (gas) check karo.
        </p>
      )}
      {hash && (
        <p className="mt-3 break-all font-mono text-xs">
          {hash}
          {cfg?.explorer && (
            <>
              {" "}
              <a href={`${cfg.explorer}/tx/${hash}`} target="_blank" rel="noreferrer">
                View on Polygonscan
              </a>
            </>
          )}
        </p>
      )}
    </Card>
  );
}
