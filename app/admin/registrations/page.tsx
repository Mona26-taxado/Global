"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/app-ui";
import { AdminTable, Pager, ResponsiveDataList, adminTableClass, paginate } from "@/components/ui/data-list";
import { api, shortAddr } from "@/lib/utils";
import { friendlyMessage } from "@/lib/user-errors";

type Row = {
  user: string;
  fee: string;
  token: string;
  network: string;
  tx_hash: string | null;
  status: string;
  created_at: string;
};

export default function AdminRegistrations() {
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [explorer, setExplorer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function load() {
    const r = await api<{ rows: Row[] }>("/api/admin/data?resource=registrations");
    setRows(r.rows ?? []);
  }

  useEffect(() => {
    api<{ config: { explorer: string } }>("/api/config").then((r) => setExplorer(r.config.explorer));
    void load();
  }, []);

  async function verify(userId: string) {
    setBusy(userId);
    setNotice("");
    const r = await api<{ registration?: { status: string } }>("/api/admin/verify-registration", {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
    setBusy(null);
    if (!r.ok) setNotice(r.error ?? "Could not verify");
    await load();
  }

  const alert = notice ? friendlyMessage(notice) : null;
  const paged = useMemo(() => paginate(rows, page), [rows, page]);

  return (
    <AdminShell title="Registrations" description="On-chain $5 registration records. Verify retries existing pending hashes only.">
      {alert && (
        <Alert className="mb-4" tone={alert.tone} title={alert.title}>
          {alert.detail}
        </Alert>
      )}
      <ResponsiveDataList
        table={
          <AdminTable>
            <table className={adminTableClass()}>
              <thead className="bg-elevated/80 text-[11px] uppercase tracking-[0.14em] text-mute">
                <tr>
                  <th className="px-4 py-3 font-semibold">Member</th>
                  <th className="font-semibold">Fee</th>
                  <th className="font-semibold">Token</th>
                  <th className="font-semibold">Network</th>
                  <th className="font-semibold">Transaction</th>
                  <th className="font-semibold">Status</th>
                  <th className="font-semibold">Date</th>
                  <th className="pr-4" />
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((r) => (
                  <tr key={`${r.user}-${r.created_at}`} className="h-14 border-t border-line transition hover:bg-white/[0.03]">
                    <td className="px-4 font-mono text-xs">{shortAddr(r.user)}</td>
                    <td className="tabular">{r.fee}</td>
                    <td>{r.token}</td>
                    <td className="capitalize text-secondary">{r.network}</td>
                    <td className="font-mono text-xs">
                      {r.tx_hash && explorer ? (
                        <a className="inline-flex items-center gap-1 no-underline" href={`${explorer}/tx/${r.tx_hash}`} target="_blank" rel="noreferrer">
                          {shortAddr(r.tx_hash)}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="text-mute">{String(r.created_at ?? "").slice(0, 10)}</td>
                    <td className="pr-4">
                      {r.status === "PENDING" && r.tx_hash && (
                        <Button variant="ghost" className="!px-3 !text-xs" disabled={busy === r.user} onClick={() => verify(r.user)}>
                          <RefreshCw className={`h-3.5 w-3.5 ${busy === r.user ? "animate-spin" : ""}`} />
                          Verify
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTable>
        }
        cards={paged.slice.map((r) => (
          <Card key={`${r.user}-${r.created_at}`} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-xs">{shortAddr(r.user)}</p>
              <StatusBadge status={r.status} />
            </div>
            <p className="mt-2 text-sm">
              {r.fee} {r.token} · {r.network}
            </p>
            {r.tx_hash && explorer && (
              <a className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm" href={`${explorer}/tx/${r.tx_hash}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                View Transaction
              </a>
            )}
            {r.status === "PENDING" && r.tx_hash && (
              <Button className="mt-3 w-full" variant="ghost" disabled={busy === r.user} onClick={() => verify(r.user)}>
                Verify
              </Button>
            )}
          </Card>
        ))}
      />
      <Pager page={paged.page} pages={paged.pages} total={paged.total} onPage={setPage} />
    </AdminShell>
  );
}
