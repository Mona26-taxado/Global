"use client";

import { DashShell, useMe } from "@/components/dash-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { shortAddr } from "@/lib/utils";
import { useState } from "react";

export default function ReferralPage() {
  const me = useMe();
  const [copied, setCopied] = useState(false);
  const rows = me?.referrals ?? [];
  return (
    <DashShell title="Referral">
      <Card className="mt-6 p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-mute">My referral code</div>
        <div className="mt-2 font-display text-3xl">{me?.referral_code}</div>
        <p className="mt-3 break-all text-sm text-mute">{me?.referral_link}</p>
        <div className="mt-4 flex gap-3">
          <Button
            variant="ghost"
            onClick={() => {
              if (!me?.referral_link) return;
              navigator.clipboard.writeText(me.referral_link);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy Link"}
          </Button>
          {me?.referral_link && (
            <a
              className="no-underline"
              href={`https://wa.me/?text=${encodeURIComponent(me.referral_link)}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button variant="ghost">Share</Button>
            </a>
          )}
        </div>
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-xs text-mute">Direct</div>
            <div className="font-display text-2xl">{me?.directs ?? 0}</div>
          </div>
          <div>
            <div className="text-xs text-mute">Active</div>
            <div className="font-display text-2xl">{me?.active_referrals ?? 0}</div>
          </div>
          <div>
            <div className="text-xs text-mute">Total</div>
            <div className="font-display text-2xl">{me?.total_referrals ?? 0}</div>
          </div>
        </div>
      </Card>
      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-mute">
            <tr>
              <th className="py-2">User ID</th>
              <th>Wallet</th>
              <th>Registration</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td className="py-4 text-mute" colSpan={4}>
                  No referrals yet. Counts are live users only.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/10">
                <td className="py-3 font-mono text-xs">{r.id}</td>
                <td className="font-mono text-xs">{shortAddr(r.wallet)}</td>
                <td>{r.registration_status}</td>
                <td>{new Date(r.joined).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashShell>
  );
}
