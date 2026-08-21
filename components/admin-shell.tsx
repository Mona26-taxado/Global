"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  CreditCard,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  Share2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { api } from "@/lib/utils";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const NAV: { href: string; label: string; icon: ComponentType<{ className?: string }>; group: string }[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, group: "Overview" },
  { href: "/admin/users", label: "Users", icon: Users, group: "Members" },
  { href: "/admin/wallets", label: "Wallets", icon: Wallet, group: "Members" },
  { href: "/admin/registrations", label: "Registrations", icon: CreditCard, group: "Payments" },
  { href: "/admin/transactions", label: "Transactions", icon: Receipt, group: "Payments" },
  { href: "/admin/plans", label: "Plans", icon: Receipt, group: "Payments" },
  { href: "/admin/referrals", label: "Referrals", icon: Share2, group: "Network" },
  { href: "/admin/cycle", label: "Cycle / Global Tree", icon: GitBranch, group: "Network" },
  { href: "/admin/settings", label: "Settings", icon: Settings, group: "System" },
];

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  let lastGroup = "";
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon, group }) => {
        const showGroup = group !== lastGroup;
        lastGroup = group;
        const active = pathname === href;
        return (
          <div key={href}>
            {showGroup && (
              <p className="mb-2 mt-5 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-mute first:mt-0">
                {group}
              </p>
            )}
            <Link
              href={href}
              onClick={onNavigate}
              className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm no-underline transition ${
                active
                  ? "bg-gradient-to-r from-violet/20 to-electric/10 text-cream shadow-[inset_0_0_0_1px_rgba(124,92,255,0.25)]"
                  : "text-secondary hover:bg-white/[0.04] hover:text-cream"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-violet" : ""}`} />
              {label}
            </Link>
          </div>
        );
      })}
    </nav>
  );
}

export function AdminShell({
  children,
  title,
  description,
}: {
  children: ReactNode;
  title: string;
  description?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ok, setOk] = useState(false);
  const [open, setOpen] = useState(false);
  const [testnet, setTestnet] = useState(false);

  useEffect(() => {
    api("/api/admin/stats").then((r) => {
      if (r.ok) setOk(true);
      else if (pathname !== "/admin") router.replace("/admin");
    });
    api<{ config: { testnet: boolean } }>("/api/config").then((r) => setTestnet(r.config?.testnet === true));
  }, [router, pathname]);

  if (!ok) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="h-40 w-full max-w-lg animate-pulse rounded-feature bg-surface2" />
      </div>
    );
  }

  const brand = (
    <Link href="/admin" className="flex items-center gap-3 no-underline">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet to-electric text-xs font-bold text-white shadow-glow">
        GX
      </span>
      <span>
        <span className="block font-display text-[11px] tracking-[0.22em] text-cream">GLOBAL X</span>
        <span className="block text-[11px] text-mute">Admin console</span>
      </span>
    </Link>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[260px] flex-col overflow-hidden border-r border-line bg-surface px-4 py-5 lg:flex">
        {brand}
        <div className="mt-8 min-h-0 flex-1 overflow-y-auto pr-1">
          <NavLinks pathname={pathname} />
        </div>
        <p className="px-3 pt-4 text-[11px] text-mute">Username / password only</p>
      </aside>

      <div className="min-w-0 flex-1 lg:pl-[260px]">
        <header className="sticky top-0 z-30 border-b border-line bg-ink/75 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-3 lg:hidden">{brand}</div>
            <div className="hidden min-w-0 lg:block">
              <p className="text-[11px] uppercase tracking-[0.18em] text-mute">Control center</p>
              <h1 className="truncate font-display text-[22px] leading-7 text-cream">{title}</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line lg:hidden"
                aria-label="Open menu"
                onClick={() => setOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </button>
              {testnet ? <Badge tone="warning">TESTNET</Badge> : <Badge tone="mint">LIVE</Badge>}
              <Badge>ADMIN</Badge>
              <Button
                variant="ghost"
                className="!min-h-11 !px-3 !text-xs"
                onClick={() =>
                  api("/api/admin/logout", { method: "POST" }).then(() => {
                    window.location.href = "/admin";
                  })
                }
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </header>

        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button type="button" className="absolute inset-0 bg-black/70" aria-label="Close menu" onClick={() => setOpen(false)} />
            <aside className="absolute bottom-4 left-4 top-4 w-[min(calc(100%-32px),320px)] overflow-y-auto rounded-modal border border-line bg-elevated p-4 shadow-lift">
              <div className="mb-4 flex items-center justify-between">
                {brand}
                <button type="button" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line" onClick={() => setOpen(false)}>
                  <X className="h-5 w-5" />
                </button>
              </div>
              <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}

        <section className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="lg:hidden">
            <p className="text-[11px] uppercase tracking-[0.18em] text-mute">Control center</p>
            <h1 className="mt-1 font-display text-[30px] leading-9 text-cream">{title}</h1>
          </div>
          {description && <p className="mt-2 max-w-2xl text-sm text-secondary lg:mt-0">{description}</p>}
          <div className="mt-6">{children}</div>
        </section>
      </div>
    </div>
  );
}
