"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { api } from "@/lib/utils";

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
  const [explorer, setExplorer] = useState("");
  useEffect(() => {
    api<{ config: { explorer: string } }>("/api/config").then((r) => setExplorer(r.config.explorer));
    api<{ rows: Row[] }>("/api/admin/data?resource=registrations").then((r) => setRows(r.rows ?? []));
  }, []);
  return (
    <AdminShell title="Registrations">
      <div className="overflow-x-auto text-sm">
        <table className="w-full text-left">
          <thead className="text-xs uppercase text-mute">
            <tr>
              <th className="py-2">User</th>
              <th>Fee</th>
              <th>Token</th>
              <th>Network</th>
              <th>TX Hash</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.user}-${r.created_at}`} className="border-t border-white/10">
                <td className="py-2 font-mono text-xs">{r.user}</td>
                <td>{r.fee}</td>
                <td>{r.token}</td>
                <td>{r.network}</td>
                <td className="font-mono text-xs">
                  {r.tx_hash && explorer ? (
                    <a href={`${explorer}/tx/${r.tx_hash}`} target="_blank" rel="noreferrer">
                      {r.tx_hash.slice(0, 12)}…
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{r.status}</td>
                <td>{String(r.created_at ?? "").slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
