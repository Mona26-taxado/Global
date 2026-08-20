"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import {
  BadgeCheck,
  CreditCard,
  LayoutDashboard,
  Receipt,
  Settings,
  Share2,
  Shield,
  Users,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/utils";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AdminShell } from "@/components/admin-shell";
import { friendlyMessage } from "@/lib/user-errors";

const STATS: { key: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { key: "total_users", label: "Members", icon: Users },
  { key: "connected_wallets", label: "Wallets", icon: Wallet },
  { key: "verified_wallets", label: "Verified", icon: BadgeCheck },
  { key: "active_registrations", label: "Registrations", icon: CreditCard },
  { key: "pending_payments", label: "Pending", icon: Receipt },
  { key: "confirmed_payments", label: "Confirmed", icon: BadgeCheck },
  { key: "active_plans", label: "Active plans", icon: LayoutDashboard },
  { key: "referral_count", label: "Referrals", icon: Share2 },
];

const LINKS: { href: string; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/wallets", label: "Wallets", icon: Wallet },
  { href: "/admin/registrations", label: "Registrations", icon: CreditCard },
  { href: "/admin/transactions", label: "Transactions", icon: Receipt },
  { href: "/admin/plans", label: "Plans", icon: LayoutDashboard },
  { href: "/admin/referrals", label: "Referrals", icon: Share2 },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const s = await api<{ stats: Record<string, number> }>("/api/admin/stats");
    if (!s.ok) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    setStats(s.stats);
  }

  useEffect(() => {
    void load();
  }, []);

  if (!authed) {
    const notice = error ? friendlyMessage(error === "ADMIN_REQUIRED" ? "Please sign in again" : error) : null;
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-16">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet/20 text-violet-200">
          <Shield className="h-6 w-6" />
        </div>
        <Badge>Admin</Badge>
        <h1 className="mt-4 font-display text-4xl">Control center</h1>
        <p className="mt-2 text-sm text-mute">Sign in to review members, payments, and settings.</p>
        <form
          className="mt-6 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await api("/api/admin/login", {
              method: "POST",
              body: JSON.stringify({ username, password }),
            });
            if (!r.ok) setError(r.error ?? "Login failed");
            else void load();
          }}
        >
          <input
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
          />
          <input
            type="password"
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
          />
          <Button className="w-full" type="submit">
            <Shield className="h-4 w-4" />
            Sign in
          </Button>
          {notice && (
            <Alert tone={notice.tone} title={notice.title}>
              {notice.detail}
            </Alert>
          )}
        </form>
      </main>
    );
  }

  return (
    <AdminShell title="Dashboard">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STATS.map(({ key, label, icon: Icon }) => (
          <Card key={key} className="p-4">
            <div className="flex items-center gap-2 text-mute">
              <Icon className="h-4 w-4 text-violet-200" />
              <span className="text-[11px] uppercase tracking-wider">{label}</span>
            </div>
            <div className="mt-2 font-display text-2xl">{stats?.[key] ?? "—"}</div>
          </Card>
        ))}
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="no-underline">
            <Card className="flex items-center gap-3 p-4 transition hover:border-violet/40">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/5 text-violet-200">
                <Icon className="h-5 w-5" />
              </span>
              <span className="font-semibold text-white">{label}</span>
            </Card>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
