"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Clock3, GitBranch, Users, Wallet } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { formatTokenAmount } from "@/components/ui/data-list";
import { api } from "@/lib/utils";
import type { NetNode } from "@/lib/cycle-ui";
import {
  GlobalNetworkTree,
  type CycleRef,
  type CycleTx,
  type CycleUser,
} from "@/components/admin/global-network-tree";

type WalletRow = { address: string; user: string | null };

export default function AdminCyclePage() {
  const [users, setUsers] = useState<CycleUser[]>([]);
  const [wallets, setWallets] = useState<WalletRow[]>([]);
  const [txs, setTxs] = useState<CycleTx[]>([]);
  const [refs, setRefs] = useState<CycleRef[]>([]);
  const [planId, setPlanId] = useState<string>("");
  const [planRows, setPlanRows] = useState<{ id: string; code: string; name: string; amount_usd: number }[]>([]);
  const [tree, setTree] = useState<NetNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    void Promise.all([
      api<{ ok: boolean; rows: CycleUser[] }>("/api/admin/data?resource=users"),
      api<{ ok: boolean; rows: WalletRow[] }>("/api/admin/data?resource=wallets"),
      api<{ ok: boolean; rows: CycleTx[] }>("/api/admin/data?resource=transactions"),
      api<{ ok: boolean; rows: CycleRef[] }>("/api/admin/data?resource=referrals"),
      api<{ ok: boolean; rows: { id: string; code: string; name: string; amount_usd: number }[] }>("/api/admin/data?resource=plans"),
      api<{ ok: boolean; tree: NetNode[]; plan_id?: string }>(`/api/network${planId ? `?plan_id=${encodeURIComponent(planId)}` : ""}`),
    ])
      .then(([u, w, t, r, p, n]) => {
        if (!u.ok || !w.ok || !t.ok || !r.ok || !p.ok || !n.ok) {
          setError(true);
          return;
        }
        setUsers(u.rows ?? []);
        setWallets(w.rows ?? []);
        setTxs(t.rows ?? []);
        setRefs(r.rows ?? []);
        setPlanRows(p.rows ?? []);
        setTree(n.tree ?? []);
        if (!planId && n.plan_id) setPlanId(n.plan_id);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [planId]);

  useEffect(() => {
    load();
  }, [load]);

  const activeSeats = useMemo(
    () => tree.filter((n) => !n.user?.is_demo && (n.status ?? "ACTIVE") === "ACTIVE"),
    [tree],
  );
  const left = activeSeats.filter((n) => n.position === "LEFT").length;
  const right = activeSeats.filter((n) => n.position === "RIGHT").length;
  const planConfirmed = useMemo(
    () => txs.filter((t) => (t.payment_type === "PLAN_PURCHASE" || t.payment_type === "GLOBAL_REENTRY") && t.status === "CONFIRMED"),
    [txs],
  );
  const volume = useMemo(
    () => planConfirmed.reduce((sum, t) => sum + (Number.isFinite(Number(t.amount)) ? Number(t.amount) : 0), 0),
    [planConfirmed],
  );
  const pending = useMemo(() => txs.filter((t) => t.status === "PENDING"), [txs]);
  const pendingAmt = useMemo(
    () => pending.reduce((sum, t) => sum + (Number.isFinite(Number(t.amount)) ? Number(t.amount) : 0), 0),
    [pending],
  );

  const kpis = [
    { label: "Total Members", value: String(users.length), hint: "Registered members", icon: Users },
    { label: "Active Positions", value: String(activeSeats.length), hint: users.length ? `${((activeSeats.length / Math.max(users.length, 1)) * 100).toFixed(1)}% of members` : "In Global tree", icon: GitBranch },
    { label: "Left Leg", value: String(left), hint: activeSeats.length ? `${((left / Math.max(activeSeats.length, 1)) * 100).toFixed(1)}%` : undefined, icon: ArrowLeftRight },
    { label: "Right Leg", value: String(right), hint: activeSeats.length ? `${((right / Math.max(activeSeats.length, 1)) * 100).toFixed(1)}%` : undefined, icon: ArrowLeftRight },
    { label: "Total Volume", value: formatTokenAmount(volume), hint: "Confirmed plan / re-entry", icon: Wallet },
    { label: "Pending Payments", value: String(pending.length), hint: pending.length ? formatTokenAmount(pendingAmt) : "None pending", icon: Clock3 },
  ];

  return (
    <AdminShell title="Global Network Tree">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <Card key={k.label} className="border-line bg-[#0D1424] p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] uppercase tracking-[0.14em] text-mute">{k.label}</p>
              <k.icon className="h-3.5 w-3.5 text-violet/80" />
            </div>
            <p className="mt-2 font-display text-2xl tabular text-cream">{k.value}</p>
            {k.hint && <p className="mt-1 text-[11px] text-mute">{k.hint}</p>}
          </Card>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {planRows.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPlanId(p.id)}
            className={`rounded-xl border px-3 py-2 text-sm ${planId === p.id ? "border-violet bg-violet/20 text-cream" : "border-line text-secondary"}`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="mt-5">
        <GlobalNetworkTree
          tree={tree}
          users={users}
          wallets={wallets}
          txs={txs}
          refs={refs}
          loading={loading}
          error={error}
          onRetry={load}
          planId={planId}
        />
      </div>
    </AdminShell>
  );
}
