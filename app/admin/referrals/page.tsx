"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/app-ui";
import { AdminTable, Pager, ResponsiveDataList, adminTableClass, fieldClass, paginate } from "@/components/ui/data-list";
import { api, shortAddr } from "@/lib/utils";

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
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");

  function load(query = q) {
    api<{ rows: Row[] }>(`/api/admin/data?resource=referrals&q=${encodeURIComponent(query)}`).then((r) => {
      setRows(r.rows ?? []);
      setPage(1);
    });
  }
  useEffect(() => {
    load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paged = useMemo(() => paginate(rows, page), [rows, page]);

  return (
    <AdminShell title="Referrals" description="Sponsor relationships as stored by the existing referral records.">
      <div className="mb-5 flex flex-col gap-2 rounded-feature border border-line bg-surface2 p-4 shadow-card sm:flex-row">
        <input
          className={fieldClass}
          placeholder="Search wallet, user ID, or referral code"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button variant="ghost" onClick={() => load()}>
          <Search className="h-4 w-4" />
          Search
        </Button>
      </div>
      <ResponsiveDataList
        table={
          <AdminTable>
            <table className={adminTableClass()}>
              <thead className="bg-elevated/80 text-[11px] uppercase tracking-[0.14em] text-mute">
                <tr>
                  <th className="px-4 py-3 font-semibold">Member</th>
                  <th className="font-semibold">Sponsor</th>
                  <th className="font-semibold">Referral code</th>
                  <th className="font-semibold">Registration</th>
                  <th className="pr-4 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((r) => (
                  <tr key={r.user_id} className="h-14 border-t border-line transition hover:bg-white/[0.03]">
                    <td className="px-4 font-mono text-xs">{shortAddr(r.user_id)}</td>
                    <td className="text-secondary">{r.sponsor_code ?? shortAddr(r.sponsor_id)}</td>
                    <td className="font-semibold">{r.referral_code}</td>
                    <td>
                      <StatusBadge status={r.registration_status ?? "—"} />
                    </td>
                    <td className="pr-4 text-mute">{String(r.joined ?? "").slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTable>
        }
        cards={paged.slice.map((r) => (
          <Card key={r.user_id} className="p-4">
            <p className="font-display text-xl">{r.referral_code}</p>
            <p className="mt-1 font-mono text-xs text-secondary">{shortAddr(r.user_id)}</p>
            <p className="mt-1 text-xs text-mute">Sponsor {r.sponsor_code ?? shortAddr(r.sponsor_id)}</p>
            <div className="mt-3">
              <StatusBadge status={r.registration_status ?? "—"} />
            </div>
          </Card>
        ))}
      />
      <Pager page={paged.page} pages={paged.pages} total={paged.total} onPage={setPage} />
    </AdminShell>
  );
}
