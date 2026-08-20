"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ComponentType } from "react";
import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  Receipt,
  Settings,
  Share2,
  Users,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/utils";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const NAV: { href: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/wallets", label: "Wallets", icon: Wallet },
  { href: "/admin/registrations", label: "Registrations", icon: CreditCard },
  { href: "/admin/transactions", label: "Transactions", icon: Receipt },
  { href: "/admin/plans", label: "Plans", icon: Receipt },
  { href: "/admin/referrals", label: "Referrals", icon: Share2 },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminShell({ children, title }: { children: React.ReactNode; title: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    api("/api/admin/stats").then((r) => {
      if (!r.ok) router.replace("/admin");
      else setOk(true);
    });
  }, [router]);
  if (!ok) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-mute">Loading admin…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-4">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#04060f]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="font-display text-sm tracking-[0.2em] text-white no-underline">
            GLOBAL X ADMIN
          </Link>
          <div className="flex items-center gap-2">
            <Badge>ADMIN</Badge>
            <Button
              variant="ghost"
              className="!px-3 !py-2 text-xs"
              onClick={() =>
                api("/api/admin/logout", { method: "POST" }).then(() => {
                  window.location.href = "/admin";
                })
              }
            >
              <LogOut className="h-3.5 w-3.5" />
              Logout
            </Button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-3 pb-3 lg:hidden">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs no-underline ${
                  active ? "bg-white/10 text-white" : "text-mute"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[220px_1fr] lg:py-8">
        <nav className="hidden lg:flex lg:flex-col lg:gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm no-underline ${
                  active ? "bg-white/10 text-white" : "text-mute hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <section className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.22em] text-mute">Control center</p>
          <h1 className="mt-1 font-display text-3xl sm:text-4xl">{title}</h1>
          <div className="mt-6 overflow-x-auto">{children}</div>
        </section>
      </div>
    </div>
  );
}
