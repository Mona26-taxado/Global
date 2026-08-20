"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/utils";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Badge>Admin</Badge>
        <h1 className="mt-4 font-display text-4xl">Control center</h1>
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
          <input className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input type="password" className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button className="w-full" type="submit">
            Sign in
          </Button>
          {error && <p className="text-sm text-danger">{error}</p>}
        </form>
      </main>
    );
  }

  const links = [
    ["/admin/users", "Users"],
    ["/admin/wallets", "Wallets"],
    ["/admin/registrations", "Registrations"],
    ["/admin/transactions", "Transactions"],
    ["/admin/plans", "Plans"],
    ["/admin/referrals", "Referrals"],
    ["/admin/settings", "Settings"],
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl">Admin</h1>
        <Button variant="ghost" onClick={() => api("/api/admin/logout", { method: "POST" }).then(() => setAuthed(false))}>
          Logout
        </Button>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats &&
          Object.entries(stats).map(([k, v]) => (
            <Card key={k} className="p-4">
              <div className="text-[11px] uppercase text-mute">{k.replaceAll("_", " ")}</div>
              <div className="font-display text-2xl">{v}</div>
            </Card>
          ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="no-underline">
            <Button variant="ghost">{label}</Button>
          </Link>
        ))}
      </div>
    </main>
  );
}
