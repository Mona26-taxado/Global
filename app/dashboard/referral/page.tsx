"use client";

import { DashShell, useMe } from "@/components/dash-shell";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { shortAddr } from "@/lib/utils";
import { useState } from "react";

export default function ReferralPage() {
  const me = useMe();
  const [copied, setCopied] = useState(false);
  const rows = me?.referrals ?? [];
  return (
    <DashShell title="Referral">
      <p className="mt-2 text-sm text-mute">Share your link. New members keep you as sponsor. This cannot be changed later.</p>
      <Card className="mt-6 p-5 sm:p-6">
        <div className="text-[11px] uppercase tracking-[0.2em] text-mute">Your code</div>
        <div className="mt-2 font-display text-3xl sm:text-4xl">{me?.referral_code}</div>
        <p className="mt-3 break-all text-xs text-mute sm:text-sm">{me?.referral_link}</p>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <Button
            variant="ghost"
            className="w-full sm:w-auto"
            onClick={() => {
              if (!me?.referral_link) return;
              navigator.clipboard.writeText(me.referral_link);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
          {me?.referral_link && (
            <a className="no-underline" href={`https://wa.me/?text=${encodeURIComponent(me.referral_link)}`} target="_blank" rel="noreferrer">
              <Button variant="ghost" className="w-full sm:w-auto">
                Share on WhatsApp
              </Button>
            </a>
          )}
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2 text-center">
          {[
            ["Direct", me?.directs ?? 0],
            ["Active", me?.active_referrals ?? 0],
            ["Total", me?.total_referrals ?? 0],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-2xl bg-white/5 py-3">
              <div className="text-[10px] uppercase tracking-wider text-mute">{k}</div>
              <div className="font-display text-2xl">{v}</div>
            </div>
          ))}
        </div>
      </Card>
      <div className="mt-6 space-y-3">
        {rows.length === 0 && (
          <Card className="p-5 text-sm text-mute">No referrals yet. Counts include live members only.</Card>
        )}
        {rows.map((r) => (
          <Card key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
            <div>
              <p className="font-mono text-xs text-white">{shortAddr(r.wallet)}</p>
              <p className="mt-1 text-[11px] text-mute">{new Date(r.joined).toLocaleDateString()}</p>
            </div>
            <Badge tone={r.registration_status === "ACTIVE" ? "mint" : "mute"}>{r.registration_status}</Badge>
          </Card>
        ))}
      </div>
    </DashShell>
  );
}
