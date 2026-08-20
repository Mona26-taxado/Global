"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

export function DashShell({ children, title }: { children: React.ReactNode; title: string }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [testnet, setTestnet] = useState(true);

  useEffect(() => {
    api<{ config: { testnet: boolean } }>("/api/config").then((r) => setTestnet(r.config?.testnet !== false));
    api<{ me: Me | null }>("/api/me").then((r) => {
      if (!r.me) router.replace("/register");
      else setMe(r.me);
    });
  }, [router]);

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    router.replace("/");
  }

  if (!me) return <p className="p-8 text-mute">Loading…</p>;

  const nav = [
    ["/dashboard", "Overview"],
    ["/register", "Registration"],
    ["/dashboard/wallet", "Wallet"],
    ["/plans", "Plans"],
    ["/dashboard/referral", "Referral"],
    ["/dashboard/transactions", "Transactions"],
    ["/dashboard/profile", "Profile"],
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 px-4 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="font-display tracking-[0.24em] text-white no-underline">
            GLOBAL X
          </Link>
          <div className="flex items-center gap-3">
            {testnet && <Badge>TESTNET</Badge>}
            <span className="hidden font-mono text-xs text-mute sm:inline">{shortAddr(me.address)}</span>
            <Button variant="ghost" className="!py-2 text-xs" onClick={logout}>
              Disconnect
            </Button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[200px_1fr]">
        <nav className="flex flex-col gap-1">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-xl px-3 py-2 text-sm text-mute no-underline hover:bg-white/5 hover:text-white">
              {label}
            </Link>
          ))}
        </nav>
        <section>
          <h1 className="font-display text-3xl">{title}</h1>
          {children}
        </section>
      </div>
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
