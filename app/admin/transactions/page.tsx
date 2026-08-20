"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { api } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
    api<{ rows: Row[] }>(`/api/admin/data?${q}`).then((r) => setRows(r.rows ?? []));
  }

  useEffect(() => {
    api<{ config: { explorer: string } }>("/api/config").then((r) => setExplorer(r.config.explorer));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminShell title="Transactions">
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        <select className="rounded-xl border border-white/10 bg-black/30 px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All status</option>
          <option>PENDING</option>
          <option>CONFIRMED</option>
          <option>FAILED</option>
          <option>REJECTED</option>
        </select>
        <select className="rounded-xl border border-white/10 bg-black/30 px-3 py-2" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="REGISTRATION">REGISTRATION</option>
          <option value="PLAN_PURCHASE">PLAN_PURCHASE</option>
        </select>
        <select className="rounded-xl border border-white/10 bg-black/30 px-3 py-2" value={network} onChange={(e) => setNetwork(e.target.value)}>
          <option value="">All networks</option>
          <option value="amoy">Amoy</option>
          <option value="mainnet">Mainnet</option>
        </select>
        <input type="date" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button variant="ghost" className="!py-2 text-xs" onClick={load}>
          Apply
        </Button>
      </div>
      <div className="overflow-x-auto text-sm">
        <table className="w-full text-left">
          <thead className="text-xs uppercase text-mute">
            <tr>
              <th className="py-2">User</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Token</th>
              <th>Sender</th>
              <th>Recipient</th>
              <th>TX Hash</th>
              <th>Network</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.tx_hash} className="border-t border-white/10">
                <td className="py-2 font-mono text-xs">{t.user_id}</td>
                <td>{t.payment_type}</td>
                <td>{t.amount}</td>
                <td>{t.token}</td>
                <td className="font-mono text-xs">{t.payer_wallet?.slice(0, 10)}…</td>
                <td className="font-mono text-xs">{t.recipient_wallet?.slice(0, 10)}…</td>
                <td className="font-mono text-xs">
                  {t.tx_hash && explorer ? (
                    <a href={`${explorer}/tx/${t.tx_hash}`} target="_blank" rel="noreferrer">
                      {t.tx_hash.slice(0, 12)}…
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{t.chain_id === 137 ? "mainnet" : "amoy"}</td>
                <td>{t.status}</td>
                <td>{String(t.created_at ?? "").slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
