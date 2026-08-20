"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import { Activity, GitBranch, Layers, LayoutDashboard, LogOut, Share2, User, Wallet } from "lucide-react";
import { api } from "@/lib/utils";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WalletAddress } from "@/components/ui/app-ui";

export type Me = {
  id: string;
  referral_code: string;
  referral_link: string;
  address?: string;
  wallet_type?: string;
  verified?: boolean;
  display_name?: string;
  email?: string;
  mobile?: string;
  plans: string[];
  directs: number;
  active_referrals?: number;
  total_referrals?: number;
  referrals?: { id: string; wallet: string | null; registration_status: string; joined: string }[];
  registration?: { status: string; tx_hash?: string | null };
  transactions?: unknown[];
  is_demo: boolean;
};

const NAV: { href: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/plans", label: "Plans", icon: Layers },
  { href: "/dashboard/network", label: "Cycle", icon: GitBranch },
  { href: "/dashboard/referral", label: "Referral", icon: Share2 },
  { href: "/dashboard/transactions", label: "Activity", icon: Activity },
  { href: "/dashboard/wallet", label: "Wallet", icon: Wallet },
  { href: "/dashboard/profile", label: "Profile", icon: User },
  { href: "/register", label: "Register", icon: Layers },
];

const MOBILE_NAV: { href: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/plans", label: "Plans", icon: Layers },
  { href: "/dashboard/referral", label: "Referral", icon: Share2 },
  { href: "/dashboard/transactions", label: "Activity", icon: Activity },
  { href: "/dashboard/profile", label: "Profile", icon: User },
];

export function DashShell({ children }: { children: React.ReactNode; title: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [testnet, setTestnet] = useState(false);

  useEffect(() => {
    api<{ config: { testnet: boolean } }>("/api/config").then((r) => setTestnet(r.config?.testnet === true));
    api<{ me: Me | null }>("/api/me").then((r) => {
      if (!r.me) router.replace("/register");
      else setMe(r.me);
    });
  }, [router]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/");
  }

  if (!me) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="h-24 w-full max-w-md animate-pulse rounded-card bg-surface2" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-content items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/dashboard" className="font-display text-sm tracking-[0.22em] text-cream no-underline">
            GLOBAL X
          </Link>
          <div className="flex min-w-0 items-center gap-2">
            {testnet && <Badge tone="warning">TESTNET</Badge>}
            <span className="hidden sm:inline">
              <WalletAddress address={me.address} />
            </span>
            <Button variant="ghost" className="!min-h-11 !px-3 !text-xs" onClick={logout}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Disconnect</span>
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-content gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[220px_1fr] lg:px-8 lg:py-8">
        <nav className="sticky top-24 hidden self-start lg:flex lg:flex-col lg:gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm no-underline ${
                  active ? "bg-violet/15 text-cream" : "text-mute hover:bg-white/5 hover:text-cream"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <section className="min-w-0">{children}</section>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
          {MOBILE_NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold no-underline ${
                  active ? "bg-violet/15 text-cream" : "text-mute"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function useMe() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<{ me: Me | null }>("/api/me").then((r) => setMe(r.me));
  }, []);
  return me;
}
