"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { api } from "@/lib/utils";

type Row = Record<string, unknown>;

export default function AdminUsers() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    api<{ rows: Row[] }>("/api/admin/data?resource=users").then((r) => setRows(r.rows ?? []));
  }, []);
  return (
    <AdminShell title="Users">
      <div className="overflow-x-auto text-sm">
        <table className="w-full text-left">
          <thead className="text-xs uppercase text-mute">
            <tr>
              <th className="py-2">User ID</th>
              <th>Wallet</th>
              <th>Type</th>
              <th>Registration</th>
              <th>Plan</th>
              <th>Sponsor</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={String(u.id)} className="border-t border-white/10">
                <td className="py-2 font-mono text-xs">{String(u.id)}</td>
                <td className="font-mono text-xs">{String(u.wallet ?? "—")}</td>
                <td>{String(u.wallet_type ?? "—")}</td>
                <td>{String(u.registration_status)}</td>
                <td>{String(u.current_plan ?? "—")}</td>
                <td>{String(u.sponsor ?? "—")}</td>
                <td>{String(u.created_at ?? "").slice(0, 10)}</td>
                <td>
                  <Link href={`/admin/users/${u.id}`}>View User</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
