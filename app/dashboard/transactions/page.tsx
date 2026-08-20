"use client";

import { useEffect, useState } from "react";
import { DashShell, useMe } from "@/components/dash-shell";
import { Card } from "@/components/ui/card";
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

export default function TxPage() {
  const me = useMe();
  const [explorer, setExplorer] = useState("");
  useEffect(() => {
    api<{ config: { explorer: string } }>("/api/config").then((r) => setExplorer(r.config.explorer));
  }, []);
  const rows = (me?.transactions as Tx[] | undefined) ?? [];
  return (
    <DashShell title="Transactions">
      <div className="mt-6 space-y-3">
        {rows.length === 0 && <Card className="p-6 text-sm text-mute">No payments yet. Connect never creates a transaction.</Card>}
        {rows.map((t) => (
          <Card key={t.tx_hash} className="p-4 text-sm">
            <div>
              {t.status} · {t.payment_type ?? t.plan_code} · {t.token}
            </div>
            {t.tx_hash && explorer ? (
              <a className="mt-2 block break-all font-mono text-xs" href={`${explorer}/tx/${t.tx_hash}`} target="_blank" rel="noreferrer">
                {t.tx_hash} · View on Polygonscan
              </a>
            ) : null}
          </Card>
        ))}
      </div>
    </DashShell>
  );
}
