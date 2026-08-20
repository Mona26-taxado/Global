"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { CopyButton, StatusBadge } from "@/components/ui/app-ui";
import { AdminTable, Pager, ResponsiveDataList, adminTableClass, paginate, walletLabel } from "@/components/ui/data-list";
import { api, shortAddr } from "@/lib/utils";

type Row = {
  address: string;
  wallet_type: string;
  chain: string;
  verified: boolean;
  user: string | null;
  connected_date: string;
};

export default function AdminWallets() {
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  useEffect(() => {
    api<{ rows: Row[] }>("/api/admin/data?resource=wallets").then((r) => setRows(r.rows ?? []));
  }, []);
  const paged = useMemo(() => paginate(rows, page), [rows, page]);
  return (
    <AdminShell title="Wallets" description="Private keys, seed phrases, and recovery phrases are never stored or shown.">
      <ResponsiveDataList
        table={
          <AdminTable>
            <table className={adminTableClass()}>
              <thead className="bg-elevated/80 text-[11px] uppercase tracking-[0.14em] text-mute">
                <tr>
                  <th className="px-4 py-3 font-semibold">Address</th>
                  <th className="font-semibold">Provider</th>
                  <th className="font-semibold">Network</th>
                  <th className="font-semibold">Status</th>
                  <th className="font-semibold">Member</th>
                  <th className="pr-4 font-semibold">Connected</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((w) => (
                  <tr key={w.address} className="h-14 border-t border-line transition hover:bg-white/[0.03]">
                    <td className="px-4">
                      <span className="inline-flex items-center gap-1 font-mono text-xs">
                        {shortAddr(w.address)}
                        <CopyButton value={w.address} label="" />
                      </span>
                    </td>
                    <td>{walletLabel(w.wallet_type)}</td>
                    <td className="text-secondary">{w.chain}</td>
                    <td>
                      <StatusBadge status={w.verified ? "VERIFIED" : "UNVERIFIED"} />
                    </td>
                    <td className="font-mono text-xs">{w.user ? shortAddr(w.user) : "—"}</td>
                    <td className="pr-4 text-mute">{String(w.connected_date ?? "").slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTable>
        }
        cards={paged.slice.map((w) => (
          <Card key={w.address} className="p-4">
            <p className="font-mono text-sm">{shortAddr(w.address)}</p>
            <p className="mt-1 text-sm text-secondary">{walletLabel(w.wallet_type)}</p>
            <p className="mt-1 text-xs text-mute">{w.chain}</p>
            <div className="mt-3">
              <StatusBadge status={w.verified ? "VERIFIED" : "UNVERIFIED"} />
            </div>
          </Card>
        ))}
      />
      <Pager page={paged.page} pages={paged.pages} total={paged.total} onPage={setPage} />
    </AdminShell>
  );
}
