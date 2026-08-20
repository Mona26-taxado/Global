"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, shortAddr } from "@/lib/utils";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type Me = {
  id: string;
  referral_code: string;
  referral_link: string;
  address?: string;
  wallet_type?: string;
  plans: string[];
  directs: number;
  active_referrals?: number;
  total_referrals?: number;
  referrals?: { id: string; wallet: string | null; registration_status: string; joined: string }[];
  registration?: { status: string; tx_hash?: string | null };
  transactions?: unknown[];
  is_demo: boolean;
};

const NAV = [
  ["/dashboard", "Overview"],
  ["/register", "Register"],
  ["/dashboard/wallet", "Wallet"],
  ["/plans", "Plans"],
  ["/dashboard/referral", "Referral"],
  ["/dashboard/transactions", "Activity"],
  ["/dashboard/profile", "Profile"],
] as const;

const MOBILE_NAV = [
  ["/dashboard", "Home"],
  ["/register", "Pay"],
  ["/plans", "Plans"],
  ["/dashboard/referral", "Invite"],
  ["/dashboard/wallet", "Wallet"],
] as const;

export function DashShell({ children, title }: { children: React.ReactNode; title: string }) {
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
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-sm text-mute">Loading your account…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 lg:pb-0">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#04060f]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/dashboard" className="font-display text-sm tracking-[0.24em] text-white no-underline sm:text-base">
            GLOBAL X
          </Link>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {testnet && <Badge>TESTNET</Badge>}
            <span className="hidden truncate font-mono text-xs text-mute sm:inline">{shortAddr(me.address)}</span>
            <Button variant="ghost" className="!px-3 !py-2 text-xs" onClick={logout}>
              Disconnect
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[220px_1fr] lg:py-8">
        <nav className="hidden lg:flex lg:flex-col lg:gap-1">
          {NAV.map(([href, label]) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-xl px-3 py-2.5 text-sm no-underline ${
                  active ? "bg-white/10 text-white" : "text-mute hover:bg-white/5 hover:text-white"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <section className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-mute">Member console</p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl">{title}</h1>
          {children}
        </section>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#070b18]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
          {MOBILE_NAV.map(([href, label]) => {
            const active = pathname === href || (href === "/dashboard" && pathname.startsWith("/dashboard") && pathname === "/dashboard");
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-xl px-1 py-2 text-center text-[11px] font-semibold no-underline ${
                  active ? "bg-white/10 text-white" : "text-mute"
                }`}
              >
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
