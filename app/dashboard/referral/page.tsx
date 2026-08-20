"use client";

import { Users } from "lucide-react";
import { DashShell, useMe } from "@/components/dash-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CopyButton, EmptyState, PageHeader, StatCard, StatusBadge, WalletAddress } from "@/components/ui/app-ui";
import { shortAddr } from "@/lib/utils";

export default function ReferralPage() {
  const me = useMe();
  const rows = me?.referrals ?? [];
  const directs = me?.directs ?? 0;
  const full = directs >= 2;

  return (
    <DashShell title="Referral">
      <PageHeader
        kicker="Referral"
        title="Your Referral Link"
        description="Share your link. New members keep you as sponsor. This cannot be changed later."
      />
      <Card className="mt-6 p-5 sm:p-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Referral code</p>
        <p className="mt-2 font-display text-3xl sm:text-4xl">{me?.referral_code}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            readOnly
            value={me?.referral_link ?? ""}
            className="min-h-12 min-w-0 flex-1 truncate rounded-xl border border-line bg-elevated px-4 text-sm text-cream"
          />
          {me?.referral_link && <CopyButton value={me.referral_link} label="Copy Link" />}
        </div>
        {full && <p className="mt-4 text-sm text-warning">Direct referral slots are full.</p>}
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Direct Referrals" value={String(directs)} />
        <StatCard label="Active referrals" value={String(me?.active_referrals ?? 0)} />
        <StatCard label="Total network" value={String(me?.total_referrals ?? 0)} />
      </div>

      <div className="mt-6 space-y-3">
        {rows.length === 0 && (
          <EmptyState
            icon={Users}
            title="No referrals yet."
            detail="Share your referral link to invite your first member."
            action={me?.referral_link ? <CopyButton value={me.referral_link} label="Copy Referral Link" /> : undefined}
          />
        )}
        {rows.map((r, i) => (
          <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Direct {i + 1}</p>
              <p className="mt-1 font-mono text-xs text-secondary">{shortAddr(r.wallet)}</p>
              <p className="mt-1 text-[11px] text-mute">{new Date(r.joined).toLocaleDateString()}</p>
            </div>
            <StatusBadge status={r.registration_status} />
          </Card>
        ))}
      </div>
    </DashShell>
  );
}
