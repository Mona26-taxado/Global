"use client";

import { useEffect, useState } from "react";
import { DashShell } from "@/components/dash-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
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
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState("");
  const [explorer, setExplorer] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ notice?: string } | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const pay = usePay();

  useEffect(() => {
    api<{ config: { explorer: string } }>("/api/config").then((r) => setExplorer(r.config.explorer));
    api<{ plans: Plan[] }>("/api/plans").then((r) => {
      if (!r.ok) setError(r.error ?? "Plans unavailable");
      else setPlans(r.plans);
    });
  }, [pay.phase]);

  const payAlert = payNotice(pay.phase, pay.error);
  const listError = error ? friendlyMessage(error) : null;

  return (
    <DashShell title="Plans">
      <p className="mt-2 text-sm text-mute">
        After registration is ACTIVE: Direct #1 pays your sponsor’s wallet. Direct #2 waits until the sponsor is placed in Global, then pays the Global upline. GLOBAL X never holds the funds.
      </p>
      {listError && (
        <Alert className="mt-4" tone={listError.tone} title={listError.title}>
          {listError.detail}{" "}
          <Link href="/register">Complete registration</Link>
        </Alert>
      )}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {(plans ?? []).filter((p) => p.active).map((p) => (
          <Card key={p.id} className="p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-mute">GLOBAL X</div>
            <h2 className="mt-2 font-display text-3xl">{p.name}</h2>
            <div className="mt-2 text-mute">${p.amount_usd} USDT · Polygon</div>
            <p className="mt-2 text-sm text-mute">{p.description}</p>
            <p className="mt-3 text-sm">Status: {p.status}</p>
          {p.status !== "ACTIVE" && selected === p.code && quote?.notice && (
            <p className="mt-3 text-xs text-mute">{quote.notice}</p>
          )}
          {p.status !== "ACTIVE" && selected === p.code && quoteError && (
            <Alert className="mt-3" tone={friendlyMessage(quoteError).tone} title={friendlyMessage(quoteError).title}>
              {friendlyMessage(quoteError).detail}
            </Alert>
          )}
          {p.status !== "ACTIVE" && selected === p.code && !quoteError && (
            <Button className="mt-4 w-full" onClick={() => pay.pay(p.code)}>
              PAY NOW
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
                const r = await api<{ payment: { notice?: string; recipientRole?: string; slot?: number } }>(
                  `/api/payments/prepare?type=${p.code}`,
                );
                if (!r.ok) setQuoteError(r.error ?? "Cannot prepare this payment yet.");
                else setQuote(r.payment);
              }}
            >
              SELECT PLAN
            </Button>
          )}
            {p.tx_hash && explorer && (
              <a className="mt-3 block text-xs" href={`${explorer}/tx/${p.tx_hash}`} target="_blank" rel="noreferrer">
                View on Polygonscan
              </a>
            )}
          </Card>
        ))}
      </div>
      {payAlert && (
        <Alert className="mt-4" tone={payAlert.tone} title={payAlert.title}>
          {payAlert.detail}
        </Alert>
      )}
      {pay.txHash && explorer && (
        <a className="mt-2 block font-mono text-xs" href={`${explorer}/tx/${pay.txHash}`} target="_blank" rel="noreferrer">
          {pay.txHash}
        </a>
      )}
    </DashShell>
  );
}
