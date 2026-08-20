"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { api } from "@/lib/utils";

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
  useEffect(() => {
    api<{ rows: Row[] }>("/api/admin/data?resource=wallets").then((r) => setRows(r.rows ?? []));
  }, []);
  return (
    <AdminShell title="Wallets">
      <p className="mb-4 text-xs text-mute">Private keys, seed phrases, and recovery phrases are never stored or shown.</p>
      <div className="overflow-x-auto text-sm">
        <table className="w-full text-left">
          <thead className="text-xs uppercase text-mute">
            <tr>
              <th className="py-2">Wallet Address</th>
              <th>Type</th>
              <th>Chain</th>
              <th>Verified</th>
              <th>User</th>
              <th>Connected</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.address} className="border-t border-white/10">
                <td className="py-2 font-mono text-xs">{w.address}</td>
                <td>{w.wallet_type}</td>
                <td>{w.chain}</td>
                <td>{w.verified ? "Yes" : "No"}</td>
                <td className="font-mono text-xs">{w.user ?? "—"}</td>
                <td>{String(w.connected_date ?? "").slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
