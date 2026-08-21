"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { StatusBadge, WalletAddress } from "@/components/ui/app-ui";
import { api, shortAddr } from "@/lib/utils";
import { routingLabel } from "@/lib/cycle-ui";

function Field({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "object") return null;
  return (
    <div className="rounded-xl border border-line bg-elevated px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.14em] text-mute">{label}</p>
      <p className="mt-1 break-all text-sm text-cream">{String(value)}</p>
    </div>
  );
}

export default function AdminUserView() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    api<Record<string, unknown>>(`/api/admin/data?resource=user&id=${params.id}`).then((r) => setData(r));
  }, [params.id]);

  const user = (data?.user as Record<string, unknown> | undefined) ?? {};
  const wallet = (data?.wallet as Record<string, unknown> | undefined) ?? {};
  const registration = (data?.registration as Record<string, unknown> | undefined) ?? {};
  const referrer = (data?.referrer as { referral_code?: string } | undefined) ?? {};
  const referrals =
    (data?.referrals as { id?: string; user_id?: string; referral_code?: string; direct_number?: number }[] | undefined) ??
    [];
  const currentParent = data?.current_global_parent_code ?? data?.current_global_parent_id;
  const currentPos = (data?.current_position as Record<string, unknown> | undefined) ?? {};
  const positions =
    (data?.positions as {
      id: string;
      status?: string;
      position?: string | null;
      parent_id?: string | null;
      parent_code?: string | null;
      started_at?: string;
      ended_at?: string | null;
      reentry_tx_hash?: string | null;
    }[] | undefined) ?? [];
  const txs =
    (data?.transactions as {
      tx_hash: string;
      recipient_role?: string | null;
      routing_slot?: number | null;
      amount?: string;
      status?: string;
      payment_type?: string;
    }[] | undefined) ?? [];

  return (
    <AdminShell title="Member" description="Existing user record. No private keys or seed phrases.">
      {!data ? (
        <div className="h-40 animate-pulse rounded-feature bg-surface2" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Identity</p>
            <p className="mt-3 font-display text-2xl">{String(user.referral_code ?? "Member")}</p>
            <div className="mt-4 grid gap-3">
              <Field label="User ID" value={user.id ?? params.id} />
              <Field label="Name" value={user.display_name} />
              <Field label="Email" value={user.email} />
              <Field label="Mobile" value={user.mobile} />
            </div>
          </Card>
          <Card className="p-5 sm:p-6">
            <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Wallet & registration</p>
            <div className="mt-4">
              <WalletAddress address={String(wallet.address ?? "")} />
            </div>
            <div className="mt-4">
              <StatusBadge status={String(registration.status ?? "NOT PAID")} />
            </div>
          </Card>
          <Card className="p-5 sm:p-6">
            <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Referral</p>
            <p className="mt-3 text-sm text-secondary">Sponsor is permanent and is not the Global parent.</p>
            <div className="mt-3 grid gap-3">
              <Field label="Sponsor" value={referrer.referral_code ?? user.sponsor_id} />
              <p className="text-sm text-secondary">Direct referrals: {referrals.length} / 2</p>
              {referrals.length > 0 && (
                <ul className="space-y-2 text-sm">
                  {referrals.slice(0, 8).map((r) => (
                    <li key={r.id ?? r.user_id} className="font-mono text-xs text-mute">
                      Direct {r.direct_number ?? "—"} · {r.referral_code ?? shortAddr(r.user_id ?? r.id ?? "")}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
          <Card className="p-5 sm:p-6">
            <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Global</p>
            <div className="mt-4 grid gap-3">
              <Field label="Current Global parent" value={currentParent} />
              <Field label="Current leg" value={currentPos.position} />
              <Field label="Position status" value={currentPos.status} />
            </div>
          </Card>
          <Card className="p-5 sm:p-6 lg:col-span-2">
            <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Payment route</p>
            <div className="mt-4 space-y-2">
              {txs.slice(0, 8).map((t) => (
                <p key={t.tx_hash} className="text-xs text-secondary">
                  {routingLabel(t.recipient_role, t.routing_slot)} · {t.amount} · {t.status} · {shortAddr(t.tx_hash)}
                </p>
              ))}
              {txs.length === 0 && <p className="text-sm text-mute">No payments on file.</p>}
            </div>
          </Card>
          <Card className="p-5 sm:p-6 lg:col-span-2">
            <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Position history</p>
            <div className="mt-4 space-y-3">
              {positions
                .slice()
                .sort((a, b) => String(a.started_at ?? "").localeCompare(String(b.started_at ?? "")))
                .map((p, i) => (
                  <div key={p.id} className="border-l border-violet/30 pl-4">
                    <p className="text-sm font-semibold text-cream">Position #{i + 1}</p>
                    <p className="text-xs text-secondary">
                      Parent: {p.parent_code ?? "—"} · {p.position ?? "ROOT"}
                    </p>
                    <p className="text-[11px] text-mute">
                      {p.status === "HISTORY" ? "COMPLETED" : p.status ?? "ACTIVE"}
                      {p.started_at ? ` · ${new Date(p.started_at).toLocaleString()}` : ""}
                      {p.ended_at ? ` → ${new Date(p.ended_at).toLocaleString()}` : ""}
                    </p>
                    {p.reentry_tx_hash && <p className="font-mono text-[10px] text-mute">Tx: {shortAddr(p.reentry_tx_hash)}</p>}
                  </div>
                ))}
              {positions.length === 0 && <p className="text-sm text-mute">Not placed in Global yet.</p>}
            </div>
          </Card>
        </div>
      )}
    </AdminShell>
  );
}
