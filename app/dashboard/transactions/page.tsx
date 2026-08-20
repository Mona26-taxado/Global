"use client";

import { useEffect, useState } from "react";
import { DashShell, useMe } from "@/components/dash-shell";
import { Badge, Card } from "@/components/ui/card";
import { api } from "@/lib/utils";

type Tx = {
  tx_hash: string;
  payment_type?: string;
  plan_code: string;
  status: string;
  token: string;
  created_at: string;
  amount: string;
};

function tone(status: string): "mint" | "danger" | "violet" | "mute" {
  if (status === "CONFIRMED") return "mint";
  if (status === "FAILED") return "danger";
  if (status === "PENDING") return "violet";
  return "mute";
}

export default function TxPage() {
  const me = useMe();
  const [explorer, setExplorer] = useState("");
  useEffect(() => {
    api<{ config: { explorer: string } }>("/api/config").then((r) => setExplorer(r.config.explorer));
  }, []);
  const rows = (me?.transactions as Tx[] | undefined) ?? [];
  return (
    <DashShell title="Activity">
      <p className="mt-2 text-sm text-mute">Only real on-chain payments appear here. Connect never creates a transaction.</p>
      <div className="mt-6 space-y-3">
        {rows.length === 0 && <Card className="p-6 text-sm text-mute">No payments yet.</Card>}
        {rows.map((t) => (
          <Card key={t.tx_hash} className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{t.payment_type ?? t.plan_code}</p>
              <Badge tone={tone(t.status)}>{t.status}</Badge>
            </div>
            <p className="mt-1 text-xs text-mute">{t.token}</p>
            {t.tx_hash && explorer ? (
              <a className="mt-2 block break-all font-mono text-[11px]" href={`${explorer}/tx/${t.tx_hash}`} target="_blank" rel="noreferrer">
                View on Polygonscan
              </a>
            ) : null}
          </Card>
        ))}
      </div>
    </DashShell>
  );
}
