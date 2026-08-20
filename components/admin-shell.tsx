"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/utils";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function AdminShell({ children, title }: { children: React.ReactNode; title: string }) {
  const router = useRouter();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    api("/api/admin/stats").then((r) => {
      if (!r.ok) router.replace("/admin");
      else setOk(true);
    });
  }, [router]);
  if (!ok) return <p className="p-8 text-mute">Loading…</p>;
  const nav = [
    ["/admin", "Dashboard"],
    ["/admin/users", "Users"],
    ["/admin/wallets", "Wallets"],
    ["/admin/registrations", "Registrations"],
    ["/admin/transactions", "Transactions"],
    ["/admin/plans", "Plans"],
    ["/admin/referrals", "Referrals"],
    ["/admin/settings", "Settings"],
  ];
  return (
    <div className="min-h-screen px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl">{title}</h1>
          <Badge>ADMIN</Badge>
        </div>
        <nav className="mt-4 flex flex-wrap gap-2">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-full border border-white/10 px-3 py-1 text-xs text-mute no-underline hover:text-white">
              {label}
            </Link>
          ))}
          <Button
            variant="ghost"
            className="!py-1 text-xs"
            onClick={() => api("/api/admin/logout", { method: "POST" }).then(() => router.replace("/admin"))}
          >
            Logout
          </Button>
        </nav>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
