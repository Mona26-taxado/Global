"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { api } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type Row = {
  user_id: string;
  sponsor_id: string;
  referral_code: string;
  sponsor_code?: string;
  wallet?: string;
  registration_status?: string;
  joined?: string;
};

export default function AdminReferrals() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  function load(query = q) {
    api<{ rows: Row[] }>(`/api/admin/data?resource=referrals&q=${encodeURIComponent(query)}`).then((r) =>
      setRows(r.rows ?? []),
    );
  }
  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AdminShell title="Referrals">
      <div className="mb-4 flex gap-2">
        <input
          className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm"
          placeholder="Search wallet, user ID, or referral code"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button variant="ghost" onClick={() => load()}>
          Search
        </Button>
      </div>
      <div className="overflow-x-auto text-sm">
        <table className="w-full text-left">
          <thead className="text-xs uppercase text-mute">
            <tr>
              <th className="py-2">User</th>
              <th>Sponsor</th>
              <th>Referral Code</th>
              <th>Registration</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="border-t border-white/10">
                <td className="py-2 font-mono text-xs">{r.user_id}</td>
                <td className="font-mono text-xs">{r.sponsor_code ?? r.sponsor_id}</td>
                <td>{r.referral_code}</td>
                <td>{r.registration_status ?? "—"}</td>
                <td>{String(r.joined ?? "").slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
