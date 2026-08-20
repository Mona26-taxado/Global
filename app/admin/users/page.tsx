"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CopyButton, StatusBadge } from "@/components/ui/app-ui";
import { AdminTable, Pager, ResponsiveDataList, adminTableClass, paginate, walletLabel } from "@/components/ui/data-list";
import { api, shortAddr } from "@/lib/utils";

type Row = Record<string, unknown>;

export default function AdminUsers() {
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  useEffect(() => {
    api<{ rows: Row[] }>("/api/admin/data?resource=users").then((r) => setRows(r.rows ?? []));
  }, []);
  const paged = useMemo(() => paginate(rows, page), [rows, page]);
  return (
    <AdminShell title="Users" description={`${rows.length} members. Wallet addresses are truncated; copy keeps the full value.`}>
      <ResponsiveDataList
        table={
          <AdminTable>
            <table className={adminTableClass()}>
              <thead className="bg-elevated/80 text-[11px] uppercase tracking-[0.14em] text-mute">
                <tr>
                  <th className="px-4 py-3 font-semibold">Member</th>
                  <th className="font-semibold">Wallet</th>
                  <th className="font-semibold">Provider</th>
                  <th className="font-semibold">Registration</th>
                  <th className="font-semibold">Plan</th>
                  <th className="font-semibold">Sponsor</th>
                  <th className="font-semibold">Joined</th>
                  <th className="pr-4" />
                </tr>
              </thead>
              <tbody>
                {paged.slice.map((u) => (
                  <tr key={String(u.id)} className="h-14 border-t border-line transition hover:bg-white/[0.03]">
                    <td className="px-4">
                      <span className="inline-flex items-center gap-1 font-mono text-xs">
                        {shortAddr(String(u.id))}
                        <CopyButton value={String(u.id)} label="" />
                      </span>
                    </td>
                    <td className="font-mono text-xs">
                      {u.wallet ? (
                        <span className="inline-flex items-center gap-1">
                          {shortAddr(String(u.wallet))}
                          <CopyButton value={String(u.wallet)} label="" />
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-secondary">{walletLabel(String(u.wallet_type ?? ""))}</td>
                    <td>
                      <StatusBadge status={String(u.registration_status ?? "")} />
                    </td>
                    <td className="text-cream">{String(u.current_plan ?? "—")}</td>
                    <td className="text-secondary">{String(u.sponsor ?? "—")}</td>
                    <td className="text-mute">{String(u.created_at ?? "").slice(0, 10)}</td>
                    <td className="pr-4">
                      <Link href={`/admin/users/${u.id}`} className="inline-flex min-h-11 items-center gap-1 text-xs no-underline">
                        Details <ChevronRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTable>
        }
        cards={paged.slice.map((u) => (
          <Card key={String(u.id)} className="p-4">
            <p className="font-mono text-sm">{shortAddr(String(u.id))}</p>
            <p className="mt-1 font-mono text-xs text-secondary">{shortAddr(String(u.wallet ?? ""))}</p>
            <p className="mt-1 text-xs text-mute">{walletLabel(String(u.wallet_type ?? ""))}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge status={String(u.registration_status ?? "")} />
              <span className="text-xs text-mute">{String(u.current_plan ?? "No plan")}</span>
            </div>
            <Button asChild variant="ghost" className="mt-3">
              <Link href={`/admin/users/${u.id}`} className="no-underline">
                View Details
              </Link>
            </Button>
          </Card>
        ))}
      />
      <Pager page={paged.page} pages={paged.pages} total={paged.total} onPage={setPage} />
    </AdminShell>
  );
}
