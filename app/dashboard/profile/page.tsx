"use client";

import { DashShell, useMe } from "@/components/dash-shell";
import { Card } from "@/components/ui/card";
import { shortAddr } from "@/lib/utils";

export default function ProfilePage() {
  const me = useMe();
  return (
    <DashShell title="Profile">
      <Card className="mt-6 space-y-4 p-5 sm:p-6 text-sm">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-mute">Member ID</p>
          <p className="mt-1 break-all font-mono text-xs">{me?.id}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-mute">Referral</p>
          <p className="mt-1 font-display text-xl">{me?.referral_code}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-mute">Wallet</p>
          <p className="mt-1 break-all font-mono text-xs">{me?.address}</p>
          <p className="mt-1 text-mute">{shortAddr(me?.address)}</p>
        </div>
        <p className="text-mute">Registration: {me?.registration?.status ?? "NOT PAID"}</p>
      </Card>
    </DashShell>
  );
}
