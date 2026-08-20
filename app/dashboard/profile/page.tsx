"use client";

import { DashShell, useMe } from "@/components/dash-shell";
import { Card } from "@/components/ui/card";

export default function ProfilePage() {
  const me = useMe();
  return (
    <DashShell title="Profile">
      <Card className="mt-6 space-y-2 p-6 text-sm">
        <div>ID: {me?.id}</div>
        <div>Referral: {me?.referral_code}</div>
        <div>Wallet: {me?.address}</div>
        <p className="text-mute">Registration: {me?.registration?.status ?? "NOT_PAID"}</p>
      </Card>
    </DashShell>
  );
}
