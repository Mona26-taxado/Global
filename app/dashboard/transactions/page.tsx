"use client";

import { useEffect, useState } from "react";
import { Activity, ExternalLink, Layers } from "lucide-react";
import Link from "next/link";
import { DashShell, useMe } from "@/components/dash-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui/app-ui";
import { ResponsiveDataList } from "@/components/ui/data-list";
import { api, shortAddr } from "@/lib/utils";
import { routingLabel } from "@/lib/cycle-ui";

type Tx = {
  tx_hash: string;
  payment_type?: string;
  plan_code: string;
  status: string;
  token: string;
  created_at: string;
  amount: string;
  recipient_role?: string | null;
  routing_slot?: number | null;
};

export default function TxPage() {
  const me = useMe();
  const [explorer, setExplorer] = useState("");
  useEffect(() => {
    api<{ config: { explorer: string } }>("/api/config").then((r) => setExplorer(r.config.explorer));
  }, []);
  const rows = (me?.transactions as Tx[] | undefined) ?? [];

  return (
    <DashShell title="Activity">
      <PageHeader
        kicker="Activity"
        title="Transactions"
        description="Only real on-chain payments appear here. Connect never creates a transaction."
      />
      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            icon={Activity}
            title="No activity yet."
            detail="Registration and plan payments will appear here after they are submitted."
            action={
              <Button asChild>
                <Link href="/plans" className="no-underline">
                  <Layers className="h-4 w-4" />
                  View Plans
                </Link>
              </Button>
            }
          />
        ) : (
          <ResponsiveDataList
            table={
              <div className="overflow-hidden rounded-card border border-line">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-elevated text-xs uppercase tracking-wider text-mute">
                    <tr>
                      <th className="px-4 py-3">Type</th>
                      <th>Amount</th>
                      <th>Token</th>
                      <th>Status</th>
                      <th>Transaction</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((t) => (
                      <tr key={t.tx_hash} className="h-14 border-t border-line">
                        <td className="px-4">{routingLabel(t.recipient_role, t.routing_slot)}</td>
                        <td className="tabular">{t.amount}</td>
                        <td>{t.token}</td>
                        <td>
                          <StatusBadge status={t.status} />
                        </td>
                        <td>
                          {t.tx_hash && explorer ? (
                            <a className="inline-flex items-center gap-1 no-underline" href={`${explorer}/tx/${t.tx_hash}`} target="_blank" rel="noreferrer">
                              {shortAddr(t.tx_hash)}
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="text-mute">{String(t.created_at ?? "").slice(0, 10)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
            cards={rows.map((t) => (
              <Card key={t.tx_hash} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">{routingLabel(t.recipient_role, t.routing_slot)}</p>
                  <StatusBadge status={t.status} />
                </div>
                <p className="mt-2 font-display text-xl tabular">
                  {t.amount} <span className="text-sm text-mute">{t.token}</span>
                </p>
                <p className="mt-1 text-xs text-mute">{String(t.created_at ?? "").slice(0, 10)}</p>
                <p className="mt-2 font-mono text-xs text-secondary">{shortAddr(t.tx_hash)}</p>
                {t.tx_hash && explorer && (
                  <a className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm no-underline" href={`${explorer}/tx/${t.tx_hash}`} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Transaction
                  </a>
                )}
              </Card>
            ))}
          />
        )}
      </div>
    </DashShell>
  );
}
