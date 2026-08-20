"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { DashShell, useMe } from "@/components/dash-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge, WalletAddress } from "@/components/ui/app-ui";
import { api } from "@/lib/utils";

export default function ProfilePage() {
  const me = useMe();
  const router = useRouter();

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/");
  }

  return (
    <DashShell title="Profile">
      <PageHeader kicker="Profile" title="Account" description="Your GLOBAL X identity and session." />
      <div className="mt-6 grid gap-4">
        <Card className="space-y-3 p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Account</p>
          <div>
            <p className="text-xs text-mute">Member ID</p>
            <p className="mt-1 truncate font-mono text-xs text-secondary">{me?.id}</p>
          </div>
        </Card>
        <Card className="space-y-3 p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Wallet</p>
          <WalletAddress address={me?.address} />
          <p className="text-sm capitalize text-secondary">{me?.wallet_type ?? "Wallet"}</p>
          {me?.verified && <StatusBadge status="VERIFIED" />}
        </Card>
        <Card className="space-y-3 p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Referral identity</p>
          <p className="font-display text-2xl">{me?.referral_code}</p>
        </Card>
        <Card className="space-y-3 p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Registration</p>
          <StatusBadge status={me?.registration?.status ?? "NOT_PAID"} />
        </Card>
        <Card className="space-y-3 p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Security / session</p>
          <Button variant="ghost" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        </Card>
      </div>
    </DashShell>
  );
}
