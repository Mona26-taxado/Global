"use client";

import { useEffect, useState } from "react";
import { CreditCard, ExternalLink, Layers, Loader2, Lock } from "lucide-react";
import { DashShell, useMe } from "@/components/dash-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/app-ui";
import { api } from "@/lib/utils";
import { usePay } from "@/hooks/use-pay";
import { friendlyMessage, payNotice } from "@/lib/user-errors";
import Link from "next/link";

type Plan = {
  id: string;
  code: string;
  name: string;
  amount_usd: number;
  token: string;
  description: string;
  status: string;
  tx_hash: string | null;
  active: boolean;
};

export default function PlansPage() {
  const me = useMe();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState("");
  const [explorer, setExplorer] = useState("");
  const [chainName, setChainName] = useState("Polygon");
  const [selected, setSelected] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ notice?: string } | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const pay = usePay();
  const locked = (me?.registration?.status ?? "") !== "ACTIVE";

  useEffect(() => {
    api<{ config: { explorer: string; chainName: string } }>("/api/config").then((r) => {
      setExplorer(r.config.explorer);
      setChainName(r.config.chainName);
    });
    if (locked) return;
    api<{ plans: Plan[] }>("/api/plans").then((r) => {
      if (!r.ok) setError(r.error ?? "Plans unavailable");
      else setPlans(r.plans);
    });
  }, [pay.phase, locked]);

  const payAlert = payNotice(pay.phase, pay.error);
  const listError = error ? friendlyMessage(error) : null;

  return (
    <DashShell title="Plans">
      <PageHeader
        kicker="Plans"
        title="Choose Your Plan"
        description="After registration is ACTIVE, you can select a membership plan. GLOBAL X never holds the funds."
        actions={<StatusBadge status={me?.registration?.status ?? "NOT_PAID"} />}
      />

      {locked && (
        <EmptyState
          icon={Lock}
          title="Plans are locked"
          detail="Complete registration to unlock plans."
          action={
            <Button asChild>
              <Link href="/register" className="no-underline">
                Continue registration
              </Link>
            </Button>
          }
        />
      )}

      {listError && !locked && (
        <Alert className="mt-4" tone={listError.tone} title={listError.title}>
          {listError.detail}{" "}
          <Link href="/register">Complete registration</Link>
        </Alert>
      )}

      {!locked && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(plans ?? []).filter((p) => p.active).map((p) => (
            <Card key={p.id} className="flex flex-col p-6">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-mute">{p.code}</p>
                  <h2 className="mt-1 font-display text-[22px] text-cream">{p.name}</h2>
                </div>
                {p.status === "ACTIVE" && <StatusBadge status="CURRENT PLAN" />}
              </div>
              <p className="mt-3 font-display text-3xl tabular">${p.amount_usd}</p>
              <p className="text-sm text-secondary">{p.token} · {chainName}</p>
              <p className="mt-3 flex-1 text-sm text-secondary">{p.description}</p>
              <p className="mt-3">
                <StatusBadge status={p.status} />
              </p>
              {p.status !== "ACTIVE" && selected === p.code && quote?.notice && (
                <p className="mt-3 text-xs text-mute">{quote.notice}</p>
              )}
              {p.status !== "ACTIVE" && selected === p.code && quoteError && (
                <Alert className="mt-3" tone={friendlyMessage(quoteError).tone} title={friendlyMessage(quoteError).title}>
                  {friendlyMessage(quoteError).detail}
                </Alert>
              )}
              {p.status !== "ACTIVE" && selected === p.code && !quoteError && (
                <Button className="mt-4 w-full" onClick={() => pay.pay(p.code)} disabled={pay.phase === "WALLET_CONFIRMATION"}>
                  {pay.phase === "WALLET_CONFIRMATION" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Confirming transaction…
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      Pay now
                    </>
                  )}
                </Button>
              )}
              {p.status !== "ACTIVE" && selected !== p.code && (
                <Button
                  className="mt-4 w-full"
                  variant="ghost"
                  onClick={async () => {
                    setSelected(p.code);
                    setQuoteError("");
                    setQuote(null);
                    const r = await api<{ payment: { notice?: string } }>(`/api/payments/prepare?type=${p.code}`);
                    if (!r.ok) setQuoteError(r.error ?? "Cannot prepare this payment yet.");
                    else setQuote(r.payment);
                  }}
                >
                  <Layers className="h-4 w-4" />
                  Select plan
                </Button>
              )}
              {p.tx_hash && explorer && (
                <a className="mt-3 inline-flex min-h-11 items-center gap-1 text-xs no-underline" href={`${explorer}/tx/${p.tx_hash}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  View transaction
                </a>
              )}
            </Card>
          ))}
        </div>
      )}
      {payAlert && (
        <Alert className="mt-4" tone={payAlert.tone} title={payAlert.title}>
          {payAlert.detail}
        </Alert>
      )}
    </DashShell>
  );
}
