"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { StatusBadge, WalletAddress } from "@/components/ui/app-ui";
import { api, shortAddr } from "@/lib/utils";

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
  const referrals = (data?.referrals as { id: string; referral_code?: string }[] | undefined) ?? [];

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
              <Field label="Sponsor" value={user.sponsor_id} />
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
            <p className="mt-4 text-sm text-secondary">Direct referrals: {referrals.length}</p>
            {referrals.length > 0 && (
              <ul className="mt-3 space-y-2 text-sm">
                {referrals.slice(0, 8).map((r) => (
                  <li key={r.id} className="font-mono text-xs text-mute">
                    {r.referral_code ?? shortAddr(r.id)}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </AdminShell>
  );
}
