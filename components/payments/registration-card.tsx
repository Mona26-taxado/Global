"use client";

import Link from "next/link";
import { CheckCircle2, CreditCard, ExternalLink, Layers, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { StatusBadge, WalletAddress } from "@/components/ui/app-ui";
import { usePay } from "@/hooks/use-pay";
import { friendlyMessage, payNotice } from "@/lib/user-errors";
import { useEffect, useState } from "react";
import { api, shortAddr } from "@/lib/utils";

type Cfg = { chainName: string; explorer: string; testnet: boolean; usdtConfigured: boolean };

export function RegistrationPayCard({
  status,
  txHash,
  wallet,
  onActive,
}: {
  status: string;
  txHash?: string | null;
  wallet?: string;
  onActive?: () => void;
}) {
  const pay = usePay(status === "ACTIVE" ? undefined : { txHash, paymentType: "REGISTRATION" });
  const [cfg, setCfg] = useState<Cfg | null>(null);
  useEffect(() => {
    api<{ config: Cfg }>("/api/config").then((r) => setCfg(r.config));
  }, []);
  useEffect(() => {
    if (status === "ACTIVE" || pay.phase === "CONFIRMED") onActive?.();
  }, [status, pay.phase, onActive]);

  const pending = pay.phase === "PENDING" || pay.phase === "SUBMITTED" || status === "PENDING";
  const failed = status === "FAILED" || pay.phase === "FAILED" || pay.phase === "REJECTED";
  const hash = pay.txHash || txHash;
  const notice = status === "ACTIVE" ? payNotice("CONFIRMED") : payNotice(pay.phase, pay.error);
  const configAlert = !cfg?.usdtConfigured
    ? friendlyMessage("USDT testnet contract is not configured.")
    : null;

  if (status === "ACTIVE") {
    return (
      <Card className="mt-6 p-6 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-mint" />
        <h2 className="mt-4 font-display text-[22px] text-cream">Registration Complete</h2>
        <p className="mt-2 text-sm text-secondary">Your GLOBAL X account is active.</p>
        <Button asChild className="mt-6">
          <Link href="/plans" className="no-underline">
            <Layers className="h-4 w-4" />
            View Plans
          </Link>
        </Button>
      </Card>
    );
  }

  if (pending) {
    return (
      <Card className="mt-6 p-6">
        {cfg?.testnet && <StatusBadge status="TESTNET" />}
        <div className="mt-3 flex items-center gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-violet" />
          <div>
            <h2 className="font-display text-[22px] text-cream">Transaction submitted</h2>
            <p className="mt-1 text-sm text-secondary">Waiting for blockchain confirmation.</p>
          </div>
        </div>
        {hash && (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-mute">
            {shortAddr(hash)}
            {cfg?.explorer && (
              <a
                href={`${cfg.explorer}/tx/${hash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-1 text-info no-underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View transaction
              </a>
            )}
          </p>
        )}
        {notice && (
          <Alert className="mt-4" tone={notice.tone} title={notice.title}>
            {notice.detail}
          </Alert>
        )}
      </Card>
    );
  }

  if (failed) {
    return (
      <Card className="mt-6 p-6">
        <StatusBadge status="FAILED" />
        <h2 className="mt-3 font-display text-[22px] text-cream">Transaction Failed</h2>
        <p className="mt-2 text-sm text-secondary">Your registration was not completed.</p>
        {notice && (
          <Alert className="mt-4" tone={notice.tone} title={notice.title}>
            {notice.detail}
          </Alert>
        )}
        <Button className="mt-6 w-full" onClick={() => pay.pay("REGISTRATION")} disabled={cfg?.usdtConfigured === false}>
          <CreditCard className="h-4 w-4" />
          Retry payment
        </Button>
      </Card>
    );
  }

  return (
    <Card className="mt-6 p-5 sm:p-6">
      {cfg?.testnet && <StatusBadge status="TESTNET" />}
      <h2 className="mt-3 font-display text-[22px] text-cream">Registration Required</h2>
      <p className="mt-3 font-display text-[40px] leading-[46px] tabular text-cream">$5</p>
      <p className="text-sm text-secondary">Configured payment token on {cfg?.chainName ?? "Polygon"}</p>
      <dl className="mt-5 space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-mute">Network</dt>
          <dd className="text-cream">{cfg?.chainName ?? "Polygon"}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-mute">Wallet</dt>
          <dd>
            <WalletAddress address={wallet} />
          </dd>
        </div>
      </dl>
      {configAlert && (
        <Alert className="mt-4" tone={configAlert.tone} title={configAlert.title}>
          {configAlert.detail}
        </Alert>
      )}
      <Button
        className="mt-6 w-full"
        disabled={pay.phase === "WALLET_CONFIRMATION" || cfg?.usdtConfigured === false}
        onClick={() => pay.pay("REGISTRATION")}
      >
        {pay.phase === "WALLET_CONFIRMATION" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Confirming transaction…
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4" />
            Pay $5 & Register
          </>
        )}
      </Button>
      {notice && (
        <Alert className="mt-4" tone={notice.tone} title={notice.title}>
          {notice.detail}
        </Alert>
      )}
    </Card>
  );
}
