"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/app-ui";
import { AdminTable, Pager, ResponsiveDataList, adminTableClass, fieldClass, formatTokenAmount, paginate } from "@/components/ui/data-list";
import { api, shortAddr } from "@/lib/utils";

type Row = {
  user_id: string;
  payment_type: string;
  amount: string;
  token: string;
  payer_wallet: string;
  recipient_wallet: string;
  tx_hash: string;
  chain_id: number;
  status: string;
  created_at: string;
};

export default function AdminTransactions() {
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [explorer, setExplorer] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [network, setNetwork] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  function load() {
    const q = new URLSearchParams();
    q.set("resource", "transactions");
    if (status) q.set("status", status);
    if (type) q.set("type", type);
    if (network) q.set("network", network);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    api<{ rows: Row[] }>(`/api/admin/data?${q}`).then((r) => {
      setRows(r.rows ?? []);
      setPage(1);
    });
  }

  useEffect(() => {
    api<{ config: { explorer: string } }>("/api/config").then((r) => setExplorer(r.config.explorer));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paged = useMemo(() => paginate(rows, page), [rows, page]);

  return (
    <AdminShell title="Transactions" description="On-chain payments only. Amounts are shown in token units, not raw integer decimals.">
      <div className="mb-5 rounded-feature border border-line bg-surface2 p-4 shadow-card">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All status</option>
          <option>PENDING</option>
          <option>CONFIRMED</option>
          <option>FAILED</option>
          <option>REJECTED</option>
        </select>
        <select className={fieldClass} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="REGISTRATION">REGISTRATION</option>
          <option value="PLAN_PURCHASE">PLAN_PURCHASE</option>
        </select>
        <select className={fieldClass} value={network} onChange={(e) => setNetwork(e.target.value)}>
          <option value="">All networks</option>
          <option value="amoy">Amoy</option>
          <option value="mainnet">Mainnet</option>
        </select>
        <input type="date" className={fieldClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className={fieldClass} value={to} onChange={(e) => setTo(e.target.value)} />
        <Button variant="ghost" onClick={load}>
          Apply
        </Button>
        </div>
      </div>
      <ResponsiveDataList
        table={
          <AdminTable>
            <table className={adminTableClass("min-w-[980px]")}>
              <thead className="bg-elevated/80 text-[11px] uppercase tracking-[0.14em] text-mute">
                <tr>
                  <th className="px-4 py-3 font-semibold">Member</th>
                  <th className="font-semibold">Type</th>
                  <th className="font-semibold">Amount</th>
                  <th className="font-semibold">Token</th>
                  <th className="font-semibold">Sender</th>
                  <th className="font-semibold">Recipient</th>
                  <th className="font-semibold">Transaction</th>
                  <th className="font-semibold">Network</th>
                  <th className="font-semibold">Status</th>
                  <th className="pr-4 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((t) => (
                  <tr key={t.tx_hash} className="h-14 border-t border-line transition hover:bg-white/[0.03]">
                    <td className="px-4 font-mono text-xs">{shortAddr(t.user_id)}</td>
                    <td>{t.payment_type.replaceAll("_", " ")}</td>
                    <td className="tabular font-semibold">{formatTokenAmount(t.amount)}</td>
                    <td>{t.token}</td>
                    <td className="font-mono text-xs">{shortAddr(t.payer_wallet)}</td>
                    <td className="font-mono text-xs">{shortAddr(t.recipient_wallet)}</td>
                    <td className="font-mono text-xs">
                      {t.tx_hash && explorer ? (
                        <a className="inline-flex items-center gap-1 no-underline" href={`${explorer}/tx/${t.tx_hash}`} target="_blank" rel="noreferrer">
                          {shortAddr(t.tx_hash)}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="capitalize text-secondary">{t.chain_id === 137 ? "mainnet" : "amoy"}</td>
                    <td>
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="pr-4 whitespace-nowrap text-mute">{String(t.created_at ?? "").slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTable>
        }
        cards={paged.slice.map((t) => (
          <Card key={t.tx_hash} className="p-4">
            <div className="flex justify-between gap-2">
              <p className="text-sm font-semibold">{t.payment_type}</p>
              <StatusBadge status={t.status} />
            </div>
            <p className="mt-2 font-display text-xl tabular">
              {formatTokenAmount(t.amount)} <span className="text-sm text-mute">{t.token}</span>
            </p>
            <p className="mt-2 font-mono text-xs">{shortAddr(t.tx_hash)}</p>
            {t.tx_hash && explorer && (
              <a className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm" href={`${explorer}/tx/${t.tx_hash}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                View Transaction
              </a>
            )}
          </Card>
        ))}
      />
      <Pager page={paged.page} pages={paged.pages} total={paged.total} onPage={setPage} />
    </AdminShell>
  );
}
