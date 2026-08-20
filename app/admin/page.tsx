"use client";

import Link from "next/link";
import { useEffect, useState, type ComponentType } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  CreditCard,
  LayoutDashboard,
  Receipt,
  Shield,
  Users,
  Wallet,
} from "lucide-react";
import { api, shortAddr } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AdminShell } from "@/components/admin-shell";
import { StatusBadge } from "@/components/ui/app-ui";
import { fieldClass, formatTokenAmount, Meter } from "@/components/ui/data-list";
import { friendlyMessage } from "@/lib/user-errors";

type Stats = Record<string, number>;

const HERO: { key: string; label: string; icon: ComponentType<{ className?: string }>; href: string }[] = [
  { key: "total_users", label: "Members", icon: Users, href: "/admin/users" },
  { key: "active_registrations", label: "Active registrations", icon: CreditCard, href: "/admin/registrations" },
  { key: "confirmed_payments", label: "Confirmed payments", icon: BadgeCheck, href: "/admin/transactions" },
  { key: "active_plans", label: "Active plans", icon: LayoutDashboard, href: "/admin/plans" },
];

type Tx = { tx_hash: string; payment_type: string; amount: string; token: string; status: string; created_at: string };
type UserRow = { id: string; wallet?: string; registration_status?: string; current_plan?: string | null; created_at?: string };

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [txs, setTxs] = useState<Tx[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);

  async function load() {
    const s = await api<{ stats: Stats }>("/api/admin/stats");
    if (!s.ok) {
      setAuthed(false);
      return;
    }
    setAuthed(true);
    setStats(s.stats);
    const [t, u] = await Promise.all([
      api<{ rows: Tx[] }>("/api/admin/data?resource=transactions"),
      api<{ rows: UserRow[] }>("/api/admin/data?resource=users"),
    ]);
    setTxs([...(t.rows ?? [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 6));
    setUsers([...(u.rows ?? [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 6));
  }

  useEffect(() => {
    void load();
  }, []);

  if (!authed) {
    const notice = error ? friendlyMessage(error === "ADMIN_REQUIRED" ? "Please sign in again" : error) : null;
    return (
      <main className="min-h-screen lg:grid lg:grid-cols-2">
        <section className="relative hidden overflow-hidden flex-col justify-between border-r border-line bg-surface px-12 py-16 lg:flex">
          <div className="pointer-events-none absolute -left-10 top-10 h-56 w-56 rounded-full bg-violet/20 blur-3xl" />
          <p className="font-display text-sm tracking-[0.28em]">GLOBAL X ADMIN</p>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-mute">Institutional console</p>
            <h1 className="mt-3 font-display text-[40px] leading-[46px]">Operations, not wallets.</h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-secondary">
              Username and password only. This console never connects a member wallet.
            </p>
          </div>
          <p className="text-xs text-mute">Separate from the member application</p>
        </section>
        <section className="flex min-h-screen items-center justify-center px-4 py-16">
          <div className="w-full max-w-md rounded-modal border border-line bg-surface2 p-6 shadow-lift sm:p-8">
            <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet to-electric text-white shadow-glow">
              <Shield className="h-6 w-6" />
            </div>
            <h1 className="font-display text-[30px] leading-9">Sign in</h1>
            <p className="mt-2 text-sm text-secondary">Review members, payments, and network configuration.</p>
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
              <input className={fieldClass} value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoComplete="username" />
              <input type="password" className={fieldClass} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="current-password" />
              <Button className="w-full" type="submit">
                <Shield className="h-4 w-4" />
                Sign In
              </Button>
              {notice && (
                <Alert tone={notice.tone} title={notice.title}>
                  {notice.detail}
                </Alert>
              )}
            </form>
          </div>
        </section>
      </main>
    );
  }

  const s = stats ?? {};

  return (
    <AdminShell title="Dashboard" description="Live membership and payment snapshot from existing records.">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {HERO.map(({ key, label, icon: Icon, href }) => (
          <Link key={key} href={href} className="no-underline">
            <div className="group rounded-feature border border-line bg-surface2 p-5 shadow-card transition hover:border-violet/40 hover:shadow-lift">
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet/15 text-cream">
                  <Icon className="h-5 w-5" />
                </span>
                <ArrowUpRight className="h-4 w-4 text-mute group-hover:text-cream" />
              </div>
              <p className="mt-4 text-[11px] uppercase tracking-[0.16em] text-mute">{label}</p>
              <p className="mt-1 font-display text-[30px] leading-9 tabular text-cream">{s[key] ?? "—"}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            { label: "Wallets", value: s.connected_wallets, href: "/admin/wallets", icon: Wallet },
            { label: "Verified", value: s.verified_wallets, href: "/admin/wallets", icon: BadgeCheck },
            { label: "Pending", value: s.pending_payments, href: "/admin/transactions", icon: Receipt },
            { label: "Referrals", value: s.referral_count, href: "/admin/referrals", icon: Users },
          ] as const
        ).map(({ label, value, href, icon: Icon }) => (
            <Link key={label} href={href} className="no-underline">
              <Card className="flex items-center gap-3 p-4 transition hover:border-violet/40">
                <Icon className="h-4 w-4 text-violet" />
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-mute">{label}</p>
                  <p className="font-display text-xl tabular">{value ?? "—"}</p>
                </div>
              </Card>
            </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="p-5 sm:p-6">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Network health</p>
          <p className="mt-1 text-sm text-secondary">Ratios from current admin stats only.</p>
          <div className="mt-6 space-y-5">
            <Meter label="Registrations active" value={s.active_registrations ?? 0} total={s.total_users ?? 0} />
            <Meter label="Wallets verified" value={s.verified_wallets ?? 0} total={s.connected_wallets ?? 0} />
            <Meter label="Payments confirmed" value={s.confirmed_payments ?? 0} total={(s.confirmed_payments ?? 0) + (s.pending_payments ?? 0)} />
          </div>
        </Card>
        <Card className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Recent payments</p>
            <Link href="/admin/transactions" className="text-xs no-underline">
              View all
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {txs.length === 0 && <p className="text-sm text-mute">No transactions yet.</p>}
            {txs.map((t) => (
              <div key={t.tx_hash} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-elevated px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{t.payment_type}</p>
                  <p className="text-xs text-mute">
                    {formatTokenAmount(t.amount)} {t.token}
                  </p>
                </div>
                <StatusBadge status={t.status} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Recent members</p>
          <Link href="/admin/users" className="text-xs no-underline">
            View all
          </Link>
        </div>
        <div className="mt-4 divide-y divide-[rgba(154,168,199,0.14)]">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-mono text-sm">{shortAddr(u.id)}</p>
                <p className="text-xs text-mute">{shortAddr(u.wallet)}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={u.registration_status ?? ""} />
                <Button asChild variant="ghost" className="!min-h-11 !px-3 !text-xs">
                  <Link href={`/admin/users/${u.id}`} className="no-underline">
                    View
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </AdminShell>
  );
}
