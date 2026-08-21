"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GitBranch, Users } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { AdminKpi } from "@/components/ui/app-ui";
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
  const reservedSeats = useMemo(() => tree.filter((n) => n.status === "RESERVED"), [tree]);
  const kpis = [
    { label: "Active Seats", value: String(activeSeats.length), icon: GitBranch },
    { label: "Reserved Seats", value: String(reservedSeats.length), icon: GitBranch },
    { label: "Total Members", value: String(users.length), icon: Users },
  ];

  return (
    <AdminShell
      title="Global Network Tree"
      description="First-empty Global placement (top to bottom, LEFT then RIGHT). Sponsor is shown in node details, not as a tree edge."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kpis.map((k) => (
          <AdminKpi key={k.label} label={k.label} value={k.value} icon={k.icon} />
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
          plans={planRows}
          onPlanId={setPlanId}
        />
      </div>
    </AdminShell>
  );
}
