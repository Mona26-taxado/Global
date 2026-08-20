"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/app-ui";
import { AdminTable, Pager, ResponsiveDataList, adminTableClass, formatTokenAmount, paginate } from "@/components/ui/data-list";
import { api, shortAddr } from "@/lib/utils";
import { parentOf, routingLabel, type NetNode } from "@/lib/cycle-ui";
import { NetworkCanvas } from "@/components/network/tree";

type UserRow = {
  id: string;
  referral_code: string;
  wallet?: string;
  sponsor?: string | null;
  registration_status?: string;
};

type WalletRow = { address: string; user: string | null };

type Tx = {
  user_id: string;
  payer_wallet: string;
  recipient_wallet: string;
  amount: string;
  token: string;
  payment_type: string;
  plan_code: string;
  status: string;
  recipient_role?: string | null;
  routing_slot?: number | null;
  tx_hash: string;
  created_at: string;
};

type ReferralRow = {
  user_id: string;
  sponsor_id: string;
  referral_code: string;
  sponsor_code?: string;
};

export default function AdminCyclePage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [refs, setRefs] = useState<ReferralRow[]>([]);
  const [tree, setTree] = useState<NetNode[]>([]);
  const [refPage, setRefPage] = useState(1);
  const [payPage, setPayPage] = useState(1);

  useEffect(() => {
    void Promise.all([
      api<{ rows: UserRow[] }>("/api/admin/data?resource=users"),
      api<{ rows: WalletRow[] }>("/api/admin/data?resource=wallets"),
      api<{ rows: Tx[] }>("/api/admin/data?resource=transactions"),
      api<{ rows: ReferralRow[] }>("/api/admin/data?resource=referrals"),
      api<{ tree: NetNode[] }>("/api/network"),
    ]).then(([u, w, t, r, n]) => {
      setUsers(u.rows ?? []);
      setWallets(w.rows ?? []);
      setTxs(t.rows ?? []);
      setRefs(r.rows ?? []);
      setTree(n.tree ?? []);
    });
  }, []);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const userByWallet = useMemo(() => {
    const m = new Map<string, UserRow>();
    for (const w of wallets) {
      if (!w.user || !w.address) continue;
      const u = userById.get(w.user);
      if (u) m.set(w.address.toLowerCase(), u);
    }
    for (const u of users) {
      if (u.wallet) m.set(u.wallet.toLowerCase(), u);
    }
    return m;
  }, [wallets, users, userById]);

  const plans = useMemo(
    () => txs.filter((t) => t.payment_type === "PLAN_PURCHASE" && t.status === "CONFIRMED"),
    [txs],
  );

  const received = useMemo(() => {
    const map = new Map<string, { code: string; token: string; total: number; count: number }>();
    for (const t of plans) {
      const rec = userByWallet.get(t.recipient_wallet?.toLowerCase() ?? "");
      const key = rec?.id ?? t.recipient_wallet;
      const cur = map.get(key) ?? { code: rec?.referral_code ?? shortAddr(t.recipient_wallet), token: t.token, total: 0, count: 0 };
      const n = Number(t.amount);
      cur.total += Number.isFinite(n) ? n : 0;
      cur.count += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [plans, userByWallet]);

  const cycles = useMemo(() => {
    const m = new Map<number, number>();
    for (const n of tree) {
      const c = n.cycle ?? Math.floor((n.depth ?? 0) / 2);
      m.set(c, (m.get(c) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [tree]);

  const planTxs = useMemo(() => txs.filter((t) => t.payment_type === "PLAN_PURCHASE"), [txs]);
  const pagedRefs = useMemo(() => paginate(refs, refPage), [refs, refPage]);
  const pagedPays = useMemo(() => paginate(planTxs, payPage), [planTxs, payPage]);

  return (
    <AdminShell
      title="Cycle"
      description="Who sponsored whom, Global LEFT/RIGHT placement, and confirmed plan payments. Amounts are existing on-chain records — not a separate profit ledger."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Referral links</p>
          <p className="mt-2 font-display text-3xl tabular">{refs.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Global positions</p>
          <p className="mt-2 font-display text-3xl tabular">{tree.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Confirmed plan pays</p>
          <p className="mt-2 font-display text-3xl tabular">{plans.length}</p>
        </Card>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cycles.map(([cycle, count]) => (
          <Card key={cycle} className="p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Cycle {cycle}</p>
            <p className="mt-1 font-display text-2xl tabular">{count}</p>
            <p className="text-xs text-mute">placed members</p>
          </Card>
        ))}
        {cycles.length === 0 && (
          <Card className="p-4 text-sm text-mute">No Global placements yet.</Card>
        )}
      </div>

      <h2 className="mt-8 font-display text-xl">Who received plan payments</h2>
      <p className="mt-1 text-sm text-secondary">Grouped by recipient wallet on CONFIRMED plan purchases only.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {received.length === 0 && <Card className="p-5 text-sm text-mute">No confirmed plan payments yet.</Card>}
        {received.map((row) => (
          <Card key={row.code} className="p-5">
            <p className="font-display text-lg">{row.code}</p>
            <p className="mt-2 font-display text-3xl tabular text-mint">{formatTokenAmount(row.total)}</p>
            <p className="text-xs text-mute">
              {row.token} · {row.count} payment{row.count === 1 ? "" : "s"}
            </p>
          </Card>
        ))}
      </div>

      <h2 className="mt-8 font-display text-xl">Sponsor map</h2>
      <div className="mt-4">
        <ResponsiveDataList
          table={
            <AdminTable>
              <table className={adminTableClass()}>
                <thead className="bg-elevated/80 text-[11px] uppercase tracking-[0.14em] text-mute">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Member</th>
                    <th className="font-semibold">Sponsored by</th>
                    <th className="pr-4 font-semibold">Registration</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRefs.slice.map((r) => (
                    <tr key={r.user_id} className="h-14 border-t border-line hover:bg-white/[0.03]">
                      <td className="px-4 font-semibold">{r.referral_code}</td>
                      <td className="text-secondary">{r.sponsor_code ?? shortAddr(r.sponsor_id)}</td>
                      <td className="pr-4">
                        <StatusBadge status={userById.get(r.user_id)?.registration_status ?? "—"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTable>
          }
          cards={pagedRefs.slice.map((r) => (
            <Card key={r.user_id} className="p-4">
              <p className="font-semibold">{r.referral_code}</p>
              <p className="mt-1 text-sm text-secondary">Sponsor {r.sponsor_code ?? shortAddr(r.sponsor_id)}</p>
            </Card>
          ))}
        />
        <Pager page={pagedRefs.page} pages={pagedRefs.pages} total={pagedRefs.total} onPage={setRefPage} />
      </div>

      <h2 className="mt-8 font-display text-xl">Payment routing</h2>
      <p className="mt-1 text-sm text-secondary">Payer → recipient for each plan transfer.</p>
      <div className="mt-4">
        <ResponsiveDataList
          table={
            <AdminTable>
              <table className={adminTableClass("min-w-[960px]")}>
                <thead className="bg-elevated/80 text-[11px] uppercase tracking-[0.14em] text-mute">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Payer</th>
                    <th className="font-semibold">Received by</th>
                    <th className="font-semibold">Route</th>
                    <th className="font-semibold">Amount</th>
                    <th className="font-semibold">Status</th>
                    <th className="pr-4 font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPays.slice.map((t) => {
                      const payer = userById.get(t.user_id);
                      const rec = userByWallet.get(t.recipient_wallet?.toLowerCase() ?? "");
                      return (
                        <tr key={t.tx_hash} className="h-14 border-t border-line hover:bg-white/[0.03]">
                          <td className="px-4">{payer?.referral_code ?? shortAddr(t.user_id)}</td>
                          <td>{rec?.referral_code ?? shortAddr(t.recipient_wallet)}</td>
                          <td className="text-xs text-secondary">{routingLabel(t.recipient_role, t.routing_slot)}</td>
                          <td className="tabular font-semibold">
                            {formatTokenAmount(t.amount)} {t.token}
                          </td>
                          <td>
                            <StatusBadge status={t.status} />
                          </td>
                          <td className="pr-4 text-mute">{String(t.created_at).slice(0, 10)}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </AdminTable>
          }
          cards={pagedPays.slice.map((t) => {
              const payer = userById.get(t.user_id);
              const rec = userByWallet.get(t.recipient_wallet?.toLowerCase() ?? "");
              return (
                <Card key={t.tx_hash} className="p-4">
                  <p className="text-sm">
                    {payer?.referral_code ?? shortAddr(t.user_id)} → {rec?.referral_code ?? shortAddr(t.recipient_wallet)}
                  </p>
                  <p className="mt-1 text-xs text-mute">{routingLabel(t.recipient_role, t.routing_slot)}</p>
                  <p className="mt-2 font-display text-xl tabular">{formatTokenAmount(t.amount)}</p>
                  <StatusBadge status={t.status} />
                </Card>
              );
            })}
        />
        <Pager page={pagedPays.page} pages={pagedPays.pages} total={pagedPays.total} onPage={setPayPage} />
      </div>

      <h2 className="mt-8 font-display text-xl">Global placement</h2>
      <div className="mt-4 overflow-x-auto">
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          {tree
            .filter((n) => !n.user?.is_demo)
            .map((n) => {
              const parent = parentOf(tree, n);
              return (
                <Card key={n.id} className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-semibold">{n.user?.referral_code ?? shortAddr(n.user_id)}</p>
                    <p className="text-xs text-mute">
                      {n.position ?? "ROOT"} · depth {n.depth} · cycle {n.cycle ?? Math.floor(n.depth / 2)}
                    </p>
                  </div>
                  <p className="text-xs text-secondary">Under {parent?.user?.referral_code ?? (n.parent_id ? "parent" : "root")}</p>
                </Card>
              );
            })}
        </div>
        <NetworkCanvas />
      </div>

      <p className="mt-6">
        <Link href="/admin/transactions" className="text-sm">
          Open raw transactions
        </Link>
      </p>
    </AdminShell>
  );
}
