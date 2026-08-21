"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Maximize2,
  Hand,
  Minus,
  Network,
  Plus,
  Search,
  X,
} from "lucide-react";
import { TransformComponent, TransformWrapper, useControls, useTransformEffect } from "react-zoom-pan-pinch";
import { CopyButton, EmptyState, StatusBadge } from "@/components/ui/app-ui";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatTokenAmount } from "@/components/ui/data-list";
import { buildPositionJourney, childSlotsByParent, journeyCounts, liveApiSeats, liveForestRoots, matchesWalletOrCode, parentOf, previousHistoryChain, routingLabel, searchTreePositions, type JourneyPosition, type NetNode } from "@/lib/cycle-ui";
import { explorerTxUrl } from "@/lib/network-config";
import { api, shortAddr } from "@/lib/utils";

export type CycleUser = {
  id: string;
  referral_code: string;
  display_name?: string;
  wallet?: string;
  sponsor?: string | null;
  sponsor_id?: string | null;
  registration_status?: string;
  current_plan?: string | null;
  created_at?: string;
};

export type CycleTx = {
  user_id: string;
  payer_wallet: string;
  recipient_wallet: string;
  amount: string;
  token: string;
  payment_type: string;
  plan_code: string;
  plan_id?: string | null;
  status: string;
  recipient_role?: string | null;
  routing_slot?: number | null;
  position_id?: string | null;
  tx_hash: string;
  created_at: string;
};

export type CycleRef = {
  user_id: string;
  sponsor_id: string;
  referral_code: string;
  sponsor_code?: string;
  direct_number?: 1 | 2;
};

type SearchHit = {
  key: string;
  positionId: string | null;
  userId: string;
  planId?: string;
  planName: string;
  member: string;
  wallet: string;
  status: string;
  parentLabel: string;
  position: string | null;
  previous: number;
  reentries: number;
  paymentRequired: boolean;
  live: boolean;
};

type VisKind = "member" | "empty";

type VisNode = {
  key: string;
  kind: VisKind;
  position: "LEFT" | "RIGHT" | null;
  node?: NetNode;
  left?: VisNode;
  right?: VisNode;
};

type Placed = { vis: VisNode; x: number; y: number };

const NODE_W = 122;
const NODE_H = 128;
const H_GAP = 40;
const V_GAP = 96;

function planLabel(code?: string | null) {
  if (!code) return null;
  const n = code.match(/(\d+)/);
  return n ? `$${n[1]}` : code.replaceAll("_", " ");
}

function statusOf(node?: NetNode) {
  return node?.status ?? "ACTIVE";
}

function initials(code?: string) {
  const c = (code ?? "GX").replace(/^GX/i, "") || "GX";
  return c.slice(0, 2).toUpperCase();
}

function toVis(node: NetNode, byParent: Map<string, { left?: NetNode; right?: NetNode }>, depth: number, maxDepth: number, visited: Set<string>): VisNode {
  const vis: VisNode = {
    key: node.id,
    kind: "member",
    position: node.position === "RIGHT" ? "RIGHT" : node.position === "LEFT" ? "LEFT" : null,
    node,
  };
  if (visited.has(node.id)) return vis;
  visited.add(node.id);
  if (maxDepth !== Infinity && depth >= maxDepth) return vis;
  const kids = byParent.get(node.id) ?? {};
  vis.left = kids.left
    ? toVis(kids.left, byParent, depth + 1, maxDepth, visited)
    : { key: `${node.id}-empty-L`, kind: "empty", position: "LEFT" };
  vis.right = kids.right
    ? toVis(kids.right, byParent, depth + 1, maxDepth, visited)
    : { key: `${node.id}-empty-R`, kind: "empty", position: "RIGHT" };
  return vis;
}

function measure(v: VisNode): number {
  if (!v.left && !v.right) return NODE_W;
  const lw = v.left ? measure(v.left) : 0;
  const rw = v.right ? measure(v.right) : 0;
  const gap = v.left && v.right ? H_GAP : 0;
  return Math.max(NODE_W, lw + gap + rw);
}

function place(v: VisNode, originX: number, depth: number, out: Placed[]) {
  const w = measure(v);
  out.push({ vis: v, x: originX + w / 2, y: depth * (NODE_H + V_GAP) });
  const lw = v.left ? measure(v.left) : 0;
  if (v.left) place(v.left, originX, depth + 1, out);
  if (v.right) place(v.right, originX + lw + (v.left ? H_GAP : 0), depth + 1, out);
}

function TreeFocus({ nodeId, nonce }: { nodeId: string | null; nonce: number }) {
  const { zoomToElement } = useControls();
  useEffect(() => {
    if (!nodeId) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(`gx-node-${nodeId}`);
      if (el) zoomToElement(el, 1.2, 380);
    }, 40);
    return () => window.clearTimeout(t);
  }, [nodeId, nonce, zoomToElement]);
  return null;
}

function Toolbar({ legendOpen, onLegend }: { legendOpen: boolean; onLegend: () => void }) {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  const [pct, setPct] = useState(100);
  useTransformEffect(({ state }) => {
    setPct(Math.round((state.scale ?? 1) * 100));
  });
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="flex items-center gap-1 rounded-xl border border-line bg-elevated/80 p-1">
        <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-secondary hover:bg-white/5 hover:text-cream" onClick={() => zoomOut()} aria-label="Zoom out">
          <Minus className="h-4 w-4" />
        </button>
        <span className="min-w-[3.25rem] text-center text-xs tabular text-mute">{pct}%</span>
        <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-secondary hover:bg-white/5 hover:text-cream" onClick={() => zoomIn()} aria-label="Zoom in">
          <Plus className="h-4 w-4" />
        </button>
      </div>
        <button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-line bg-elevated/80 px-3 text-xs text-secondary hover:text-cream" onClick={() => resetTransform()} aria-label="Fit to screen">
        <Maximize2 className="h-3.5 w-3.5" />
        Fit
      </button>
      <span className="hidden items-center gap-1.5 rounded-xl border border-line bg-elevated/80 px-3 py-2 text-xs text-mute sm:inline-flex">
        <Hand className="h-3.5 w-3.5" />
        Pan
      </span>
      <button
        type="button"
        className={`inline-flex h-9 items-center rounded-xl border px-3 text-xs ${legendOpen ? "border-violet/40 bg-violet/15 text-cream" : "border-line bg-elevated/80 text-secondary"}`}
        onClick={onLegend}
      >
        Legend
      </button>
    </div>
  );
}

function walletTail(addr?: string | null) {
  if (!addr) return null;
  return addr.slice(-4);
}

function MemberCard({
  placed,
  selected,
  user,
  planId,
  onSelect,
  showAsRoot,
}: {
  placed: Placed;
  selected: boolean;
  user?: CycleUser;
  planId?: string;
  onSelect: () => void;
  showAsRoot?: boolean;
}) {
  if (placed.vis.kind === "empty") {
    return (
      <div
        className="absolute flex flex-col items-center justify-center rounded-[16px] border border-dashed border-white/10 bg-white/[0.02] text-center"
        style={{ left: placed.x - NODE_W / 2, top: placed.y, width: NODE_W, height: NODE_H }}
      >
        <span className="h-2 w-2 rounded-full bg-mute/50" />
        <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-mute">Empty</p>
        <p className="text-[10px] font-semibold uppercase text-mute/80">{placed.vis.position}</p>
      </div>
    );
  }
  const node = placed.vis.node!;
  const reserved = statusOf(node) === "RESERVED";
  const isRoot = (!node.parent_id && !reserved) || Boolean(showAsRoot && reserved);
  const code = node.user?.referral_code ?? shortAddr(node.user_id);
  const tail = walletTail(user?.wallet);
  const label = isRoot ? "ROOT" : reserved ? code : tail ?? code;
  const st = statusOf(node);
  const plan = planLabel(planId) ?? planLabel(user?.current_plan);
  return (
    <button
      type="button"
      id={`gx-node-${node.id}`}
      onClick={onSelect}
      className={`absolute rounded-[16px] border px-2.5 py-2 text-left transition ${
        selected
          ? "z-10 border-violet bg-[#0d1322] shadow-[0_0_0_2px_rgba(124,92,255,0.85),0_0_28px_rgba(59,130,246,0.45),0_0_48px_rgba(124,92,255,0.35)]"
          : reserved
            ? "border-dashed border-warning bg-[#0d1322]/80 hover:border-warning"
            : "border-line bg-[#0d1322] hover:-translate-y-0.5 hover:border-violet/35 hover:shadow-card"
      }`}
      style={{ left: placed.x - NODE_W / 2, top: placed.y, width: NODE_W, height: NODE_H }}
    >
      <div className="flex items-start gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${reserved ? "bg-warning/80" : "bg-gradient-to-br from-violet/80 to-electric/70"}`}>
          {initials(label === "ROOT" ? code : label)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-mono text-[12px] font-semibold tracking-wide text-cream">{label}</p>
          {reserved && <p className="text-[10px] font-semibold uppercase tracking-wide text-warning">Reserved</p>}
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-1">
        <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${node.position === "RIGHT" ? "bg-electric/20 text-electric" : node.position === "LEFT" ? "bg-violet/20 text-violet" : "bg-white/10 text-mute"}`}>
          {node.position ?? "ROOT"}
        </span>
        <StatusBadge status={st} />
      </div>
      {reserved ? (
        <>
          {plan && <p className="mt-1 text-[10px] text-secondary">{plan}</p>}
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">PAYMENT REQUIRED</p>
        </>
      ) : (
        plan && <p className="mt-1 text-[10px] text-secondary">{plan}</p>
      )}
    </button>
  );
}

export function GlobalNetworkTree({
  tree,
  users,
  wallets,
  txs,
  refs,
  loading,
  error,
  onRetry,
  planId,
  plans = [],
  onPlanId,
}: {
  tree: NetNode[];
  users: CycleUser[];
  wallets: { address: string; user: string | null }[];
  txs: CycleTx[];
  refs: CycleRef[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  planId?: string;
  plans?: { id: string; code: string; name: string; amount_usd: number }[];
  onPlanId?: (planId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [searchAllPlans, setSearchAllPlans] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [levels, setLevels] = useState<3 | 5 | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [legend, setLegend] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyByUser, setHistoryByUser] = useState<Map<string, JourneyPosition[]>>(new Map());
  const [matchedUserIds, setMatchedUserIds] = useState<string[]>([]);
  const [focusNonce, setFocusNonce] = useState(0);
  const [pendingFocus, setPendingFocus] = useState<{ positionId: string | null; userId: string } | null>(null);

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const enrichedUsers = useMemo(() => {
    const walletOf = new Map<string, string>();
    for (const w of wallets) {
      if (w.user && w.address) walletOf.set(w.user, w.address);
    }
    return users.map((u) => ({
      ...u,
      wallet: u.wallet || walletOf.get(u.id) || undefined,
    }));
  }, [users, wallets]);

  const liveTree = useMemo(() => liveApiSeats(tree), [tree]);
  const activeRootUserIds = useMemo(
    () => new Set(liveTree.filter((n) => !n.parent_id && (n.status ?? "ACTIVE") === "ACTIVE").map((n) => n.user_id)),
    [liveTree],
  );
  const maxDepth = levels === "all" ? Infinity : levels;
  const roots = useMemo(() => liveForestRoots(liveTree), [liveTree]);

  const visRoots = useMemo(() => {
    const byParent = childSlotsByParent(liveTree);
    const visited = new Set<string>();
    return roots.map((r) => toVis(r, byParent, 0, maxDepth === Infinity ? 99 : maxDepth - 1, visited));
  }, [liveTree, roots, maxDepth]);

  const placed = useMemo(() => {
    const out: Placed[] = [];
    let x = 24;
    for (const vis of visRoots) {
      const w = measure(vis);
      place(vis, x, 0, out);
      x += w + 80;
    }
    return out;
  }, [visRoots]);

  const canvasW = useMemo(() => Math.max(640, ...placed.map((p) => p.x + NODE_W), 24), [placed]);
  const canvasH = useMemo(() => Math.max(420, ...placed.map((p) => p.y + NODE_H + 40), 120), [placed]);

  const selectedNode = liveTree.find((n) => n.id === selectedId) ?? null;
  const selectedUser = selectedNode ? userById.get(selectedNode.user_id) : undefined;
  const globalParent = parentOf(liveTree, selectedNode ?? undefined);
  const historyRows = selectedNode
    ? (historyByUser.get(selectedNode.user_id) ?? []).filter((p) => !planId || !p.plan_id || p.plan_id === planId)
    : [];
  const positionFetchKey = useMemo(() => {
    const ids = new Set<string>();
    for (const n of liveTree) {
      if (n.from_position_id) ids.add(n.user_id);
    }
    for (const id of matchedUserIds) ids.add(id);
    return [...ids].sort().join(",");
  }, [liveTree, matchedUserIds]);

  useEffect(() => {
    if (!positionFetchKey) {
      setHistoryByUser(new Map());
      return;
    }
    const ids = positionFetchKey.split(",");
    let cancelled = false;
    void Promise.all(
      ids.map((id) =>
        api<{ ok: boolean; positions?: JourneyPosition[] }>(`/api/admin/data?resource=user&id=${encodeURIComponent(id)}`)
          .then((r) => [id, r.ok ? (r.positions ?? []) : []] as const)
          .catch(() => [id, [] as JourneyPosition[]] as const),
      ),
    ).then((entries) => {
      if (cancelled) return;
      const next = new Map<string, JourneyPosition[]>();
      for (const [id, rows] of entries) next.set(id, rows);
      setHistoryByUser(next);
    });
    return () => {
      cancelled = true;
    };
  }, [positionFetchKey]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const needle = debouncedQ.trim();
    if (!needle) {
      setMatchedUserIds([]);
      return;
    }
    const ids = enrichedUsers.filter((u) => matchesWalletOrCode(needle, u)).map((u) => u.id);
    for (const n of searchTreePositions(needle, liveTree, enrichedUsers)) {
      if (!ids.includes(n.user_id)) ids.push(n.user_id);
    }
    setMatchedUserIds(ids.slice(0, 12));
  }, [debouncedQ, enrichedUsers, liveTree]);

  const planNameOf = (id?: string | null) => plans.find((p) => p.id === id)?.name ?? planLabel(id) ?? id ?? "—";

  const searchHits = useMemo(() => {
    const needle = debouncedQ.trim();
    if (!needle) return [] as SearchHit[];
    const liveHits = searchTreePositions(needle, liveTree, enrichedUsers);
    const userIds = new Set<string>(matchedUserIds);
    for (const n of liveHits) userIds.add(n.user_id);

    const countsFor = (userId: string, scopedPlan?: string) => {
      const rows = (historyByUser.get(userId) ?? []).filter((r) => !scopedPlan || !r.plan_id || r.plan_id === scopedPlan);
      return journeyCounts(
        buildPositionJourney(
          rows,
          scopedPlan,
          txs.map((t) => ({
            tx_hash: t.tx_hash,
            position_id: t.position_id,
            recipient_wallet: t.recipient_wallet,
            status: t.status,
            payment_type: t.payment_type,
            amount: t.amount,
            plan_id: t.plan_id,
            plan_code: t.plan_code,
          })),
        ),
      );
    };

    const parentFromLive = (node: NetNode) => {
      if (!node.parent_id) return "ROOT";
      const p = parentOf(liveTree, node);
      return p?.user?.referral_code ?? walletTail(userById.get(p?.user_id ?? "")?.wallet) ?? "—";
    };

    const toHit = (opts: {
      key: string;
      positionId: string | null;
      userId: string;
      planId?: string;
      status: string;
      parentLabel: string;
      position: string | null;
      live: boolean;
    }): SearchHit => {
      const u = userById.get(opts.userId);
      const c = countsFor(opts.userId, searchAllPlans ? opts.planId : planId);
      return {
        ...opts,
        planName: planNameOf(opts.planId ?? planId),
        member: u?.referral_code ?? liveTree.find((n) => n.user_id === opts.userId)?.user?.referral_code ?? shortAddr(opts.userId),
        wallet: u?.wallet ?? "—",
        previous: c.previous,
        reentries: c.reentries,
        paymentRequired: opts.status === "RESERVED",
      };
    };

    const out: SearchHit[] = [];
    const seen = new Set<string>();

    if (!searchAllPlans) {
      for (const n of liveHits) {
        seen.add(n.id);
        out.push(
          toHit({
            key: n.id,
            positionId: n.id,
            userId: n.user_id,
            planId,
            status: statusOf(n),
            parentLabel: parentFromLive(n),
            position: n.position,
            live: true,
          }),
        );
      }
      for (const uid of userIds) {
        for (const row of historyByUser.get(uid) ?? []) {
          if (row.plan_id && planId && row.plan_id !== planId) continue;
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          const live = liveTree.find((n) => n.id === row.id);
          out.push(
            toHit({
              key: row.id,
              positionId: row.id,
              userId: uid,
              planId: row.plan_id ?? planId,
              status: row.status ?? "ACTIVE",
              parentLabel: live ? parentFromLive(live) : row.parent_code ?? (row.parent_id ? "—" : "ROOT"),
              position: live?.position ?? row.position ?? null,
              live: Boolean(live),
            }),
          );
        }
      }
    } else {
      for (const uid of userIds) {
        const rows = historyByUser.get(uid) ?? [];
        const planList = plans.length ? plans : [{ id: planId ?? "", code: planId ?? "", name: planNameOf(planId), amount_usd: 0 }];
        for (const plan of planList) {
          const scoped = rows.filter((r) => !r.plan_id || r.plan_id === plan.id);
          const liveForPlan = plan.id === planId ? liveTree.filter((n) => n.user_id === uid) : [];
          const seats = new Map<string, { id: string; status?: string; parent_id?: string | null; parent_code?: string | null; position?: string | null }>();
          for (const n of liveForPlan) seats.set(n.id, n);
          for (const r of scoped) seats.set(r.id, r);
          if (seats.size === 0) {
            if (!historyByUser.has(uid)) continue;
            out.push(
              toHit({
                key: `${uid}:${plan.id}:none`,
                positionId: null,
                userId: uid,
                planId: plan.id,
                status: "no position",
                parentLabel: "—",
                position: null,
                live: false,
              }),
            );
            continue;
          }
          for (const seat of seats.values()) {
            if (seen.has(seat.id)) continue;
            seen.add(seat.id);
            const live = liveTree.find((n) => n.id === seat.id);
            out.push(
              toHit({
                key: seat.id,
                positionId: seat.id,
                userId: uid,
                planId: plan.id,
                status: seat.status ?? live?.status ?? "ACTIVE",
                parentLabel: live ? parentFromLive(live) : seat.parent_code ?? (seat.parent_id ? "—" : "ROOT"),
                position: live?.position ?? seat.position ?? null,
                live: Boolean(live),
              }),
            );
          }
        }
      }
      for (const n of liveHits) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        out.push(
          toHit({
            key: n.id,
            positionId: n.id,
            userId: n.user_id,
            planId,
            status: statusOf(n),
            parentLabel: parentFromLive(n),
            position: n.position,
            live: true,
          }),
        );
      }
    }

    const rank = (s: string) => (s === "ACTIVE" ? 0 : s === "RESERVED" ? 1 : s === "HISTORY" ? 2 : 3);
    return out.sort((a, b) => a.member.localeCompare(b.member) || rank(a.status) - rank(b.status) || a.key.localeCompare(b.key));
  }, [debouncedQ, liveTree, enrichedUsers, matchedUserIds, historyByUser, searchAllPlans, planId, plans, txs, userById]);

  const waitingHistory = matchedUserIds.some((id) => !historyByUser.has(id));
  const noMatch = Boolean(debouncedQ.trim()) && searchHits.length === 0 && !waitingHistory;

  function selectNode(node: NetNode, fromSearch = false) {
    setSelectedId(node.id);
    setHistoryOpen(fromSearch);
    if (fromSearch) setFocusNonce((n) => n + 1);
    requestAnimationFrame(() => {
      document.getElementById(`gx-node-${node.id}`)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    });
  }

  function applyHit(hit: SearchHit) {
    setSearchOpen(false);
    const live = hit.positionId ? liveTree.find((n) => n.id === hit.positionId) : undefined;
    const fallback =
      liveTree.find((n) => n.user_id === hit.userId && (n.status ?? "ACTIVE") === "ACTIVE") ??
      liveTree.find((n) => n.user_id === hit.userId);
    const node = live ?? fallback;
    if (node) selectNode(node, true);
    else setHistoryOpen(true);
  }

  function focusHit(hit: SearchHit) {
    if (hit.planId && hit.planId !== planId && onPlanId) {
      setPendingFocus({ positionId: hit.positionId, userId: hit.userId });
      setHistoryOpen(true);
      onPlanId(hit.planId);
      setSearchOpen(false);
      return;
    }
    applyHit(hit);
  }

  useEffect(() => {
    if (!pendingFocus) return;
    const node =
      (pendingFocus.positionId ? liveTree.find((n) => n.id === pendingFocus.positionId) : undefined) ??
      liveTree.find((n) => n.user_id === pendingFocus.userId && (n.status ?? "ACTIVE") === "ACTIVE") ??
      liveTree.find((n) => n.user_id === pendingFocus.userId);
    if (node) {
      selectNode(node, true);
      setPendingFocus(null);
      return;
    }
    if (!loading) setPendingFocus(null);
  }, [liveTree, pendingFocus, loading]);

  const myDirect = selectedNode ? refs.find((r) => r.user_id === selectedNode.user_id) : undefined;
  const planTxs = useMemo(
    () => txs.filter((t) => !planId || t.plan_id === planId || t.plan_code === planId),
    [txs, planId],
  );
  const memberTxs = selectedNode
    ? planTxs.filter((t) => t.user_id === selectedNode.user_id)
    : [];
  const routeTx = [...memberTxs]
    .filter((t) => t.payment_type === "PLAN_PURCHASE" || t.payment_type === "GLOBAL_REENTRY")
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  const leftChild = selectedNode ? liveTree.find((n) => n.parent_id === selectedNode.id && n.position === "LEFT") : undefined;
  const rightChild = selectedNode ? liveTree.find((n) => n.parent_id === selectedNode.id && n.position === "RIGHT") : undefined;
  const reservedSelected = statusOf(selectedNode ?? undefined) === "RESERVED";
  const newParentUser = globalParent ? userById.get(globalParent.user_id) : undefined;
  const journey = useMemo(
    () =>
      buildPositionJourney(
        historyRows,
        planId,
        planTxs.map((t) => ({
          tx_hash: t.tx_hash,
          position_id: t.position_id,
          recipient_wallet: t.recipient_wallet,
          status: t.status,
          payment_type: t.payment_type,
          amount: t.amount,
          plan_id: t.plan_id,
          plan_code: t.plan_code,
        })),
      ),
    [historyRows, planId, planTxs],
  );
  const counts = journeyCounts(journey);
  const previousHistory = [...historyRows].filter((p) => p.status === "HISTORY").sort((a, b) => String(a.started_at ?? "").localeCompare(String(b.started_at ?? ""))).at(-1);
  const userLiveSeats = selectedNode ? liveTree.filter((n) => n.user_id === selectedNode.user_id) : [];
  const activeSeat = userLiveSeats.find((n) => statusOf(n) === "ACTIVE");
  const reservedSeat = userLiveSeats.find((n) => statusOf(n) === "RESERVED");
  const positionHistory = [...historyRows].sort((a, b) => String(a.started_at ?? "").localeCompare(String(b.started_at ?? "")));

  function seatCaption(node?: NetNode | null, row?: JourneyPosition) {
    const n = node;
    const parent = n ? parentOf(liveTree, n) : null;
    const parentLabel = n
      ? n.parent_id
        ? parent?.user?.referral_code ?? "—"
        : "ROOT"
      : row
        ? row.parent_code ?? (row.parent_id ? "—" : "ROOT")
        : "—";
    const leg = n?.position ?? row?.position ?? "ROOT";
    const st = n ? statusOf(n) : row?.status ?? "—";
    return `${parentLabel} · ${leg} · ${st}`;
  }

  function journeyBlock() {
    if (journey.length === 0) return <p className="text-sm text-mute">No stored positions for this plan.</p>;
    return (
      <div className="space-y-0" id="gx-journey">
        {journey.map((step, i) => {
          const st = step.row.status ?? "ACTIVE";
          const reserved = step.kind === "reentry" || st === "RESERVED";
          return (
            <div key={`${step.kind}-${step.row.id}-${i}`}>
              {i > 0 && (
                <div className="flex items-center gap-2 py-2 pl-3">
                  <span className="h-6 w-px border-l border-dashed border-mute/50" />
                  <span className="text-[10px] uppercase tracking-wide text-mute">↓</span>
                </div>
              )}
              <div className={`rounded-xl border p-3 ${reserved ? "border-dashed border-warning/60 bg-warning/5" : st === "HISTORY" ? "border-white/10 bg-white/[0.02]" : "border-violet/30 bg-violet/5"}`}>
                <p className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${reserved ? "text-warning" : st === "HISTORY" ? "text-mute" : "text-violet"}`}>
                  {step.title}
                </p>
                <p className="mt-2 text-xs text-secondary">Parent: {step.row.parent_code ?? (step.row.parent_id ? "—" : "Root")}</p>
                <p className="text-xs text-secondary">Leg: {step.row.position ?? "ROOT"}</p>
                <p className="mt-1">
                  <StatusBadge status={st} />
                  {st === "HISTORY" && <span className="ml-2 text-[10px] uppercase text-mute">Previous</span>}
                </p>
                {step.row.started_at && (
                  <p className="mt-1 text-[11px] text-mute">Started: {new Date(step.row.started_at).toLocaleString()}</p>
                )}
                {step.row.ended_at && (
                  <p className="text-[11px] text-mute">Ended: {new Date(step.row.ended_at).toLocaleString()}</p>
                )}
                {planId && <p className="mt-1 text-[11px] text-secondary">Plan: {planLabel(planId)}</p>}
                {step.payment?.recipient_wallet && (
                  <p className="mt-1 font-mono text-[11px] text-cream">Recipient: {shortAddr(step.payment.recipient_wallet)}</p>
                )}
                {step.payment?.status && <p className="text-[11px] text-mute">Payment: {step.payment.status}</p>}
                {step.payment?.tx_hash ? (
                  <a className="mt-1 inline-flex items-center gap-1 font-mono text-[10px] text-electric no-underline" href={explorerTxUrl(step.payment.tx_hash)} target="_blank" rel="noreferrer">
                    Tx: {shortAddr(step.payment.tx_hash)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : reserved ? (
                  <p className="mt-1 text-[11px] text-warning">Tx: pending</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const drawer: ReactNode = selectedNode && (
    <aside className="flex h-full min-h-0 w-full flex-col border-line bg-[#0B1220] lg:w-[340px] lg:border-l">
      <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-4">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-mute">Selected node</p>
          <p className="mt-2 truncate font-display text-lg text-cream">{selectedNode.user?.referral_code ?? shortAddr(selectedNode.user_id)}</p>
          <p className="mt-2">
            <StatusBadge status={statusOf(selectedNode)} />
          </p>
        </div>
        <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line text-mute hover:text-cream" onClick={() => setSelectedId(null)} aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 text-sm">
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mute">Identity</p>
          <p className="mt-2 text-cream">{selectedUser?.display_name || selectedNode.user?.referral_code}</p>
          <p className="mt-1 font-mono text-xs text-secondary">{selectedUser?.wallet ? shortAddr(selectedUser.wallet) : "—"}</p>
          {selectedUser?.wallet && <CopyButton value={selectedUser.wallet} label="Copy wallet" />}
          <p className="mt-2 text-cream">Referral code: {selectedNode.user?.referral_code ?? "—"}</p>
        </section>
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mute">Referral</p>
          <p className="mt-2 text-secondary">Sponsor (not Global parent)</p>
          <p className="text-cream">{selectedUser?.sponsor ?? "—"}</p>
          <p className="mt-2 text-secondary">Direct #</p>
          <p className="text-cream">{myDirect?.direct_number ?? "—"}</p>
        </section>
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mute">Current Global Position</p>
          <p className="mt-2 text-secondary">Plan</p>
          <p className="text-cream">{planLabel(planId) ?? planLabel(selectedUser?.current_plan) ?? "—"}</p>
          <p className="mt-2 text-secondary">Global parent</p>
          <p className="text-cream">
            {globalParent ? walletTail(userById.get(globalParent.user_id)?.wallet) ?? globalParent.user?.referral_code : selectedNode.parent_id ? "—" : "Root"}
          </p>
          <p className="mt-2 text-secondary">LEFT / RIGHT</p>
          <p className="text-cream">{selectedNode.position ?? "ROOT"}</p>
          <p className="mt-2 text-secondary">Status</p>
          <StatusBadge status={statusOf(selectedNode)} />
          <p className="mt-2 text-secondary">Current cycle</p>
          <p className="text-cream">
            {reservedSelected ? "Re-entry reserved — payment required" : `${leftChild ? "LEFT filled" : "LEFT empty"} · ${rightChild ? "RIGHT filled" : "RIGHT empty"}`}
          </p>
          <p className="mt-3 text-secondary">LEFT child</p>
          <p className="text-cream">
            {leftChild ? (statusOf(leftChild) === "RESERVED" ? "RESERVED" : walletTail(userById.get(leftChild.user_id)?.wallet) ?? leftChild.user?.referral_code) : "Empty"}
          </p>
          <p className="mt-2 text-secondary">RIGHT child</p>
          <p className="text-cream">
            {rightChild ? (statusOf(rightChild) === "RESERVED" ? "RESERVED" : walletTail(userById.get(rightChild.user_id)?.wallet) ?? rightChild.user?.referral_code) : "Empty"}
          </p>
        </section>
        {selectedNode.from_position_id && (
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mute">Previous position</p>
            <p className="mt-2 text-secondary">Previous position</p>
            <p className="text-cream">
              {previousHistory
                ? `${previousHistory.parent_id ? previousHistory.position ?? "—" : "ROOT"} · HISTORY`
                : selectedNode.from_position_id}
            </p>
            <p className="mt-2 text-secondary">Previous parent</p>
            <p className="text-cream">{previousHistory ? previousHistory.parent_code ?? (previousHistory.parent_id ? "—" : "Root") : "—"}</p>
            <p className="mt-2 text-secondary">Previous leg</p>
            <p className="text-cream">{previousHistory?.position ?? (previousHistory && !previousHistory.parent_id ? "ROOT" : "—")}</p>
            <p className="mt-2 text-secondary">Re-entry date</p>
            <p className="text-cream">
              {selectedNode.started_at
                ? new Date(selectedNode.started_at).toLocaleString()
                : previousHistory?.ended_at
                  ? new Date(previousHistory.ended_at).toLocaleString()
                  : "—"}
            </p>
            <p className="mt-2 text-secondary">Re-entry recipient</p>
            <p className="font-mono text-xs text-cream">
              {selectedNode.recipient_wallet
                ? shortAddr(selectedNode.recipient_wallet)
                : selectedNode.recipient_user_id
                  ? userById.get(selectedNode.recipient_user_id)?.referral_code ?? shortAddr(selectedNode.recipient_user_id)
                  : "—"}
            </p>
            <p className="mt-2 text-secondary">Plan amount</p>
            <p className="text-cream">{planLabel(planId) ?? planLabel(selectedUser?.current_plan) ?? "—"}</p>
            <p className="mt-2 text-secondary">Tx hash</p>
            {selectedNode.reentry_tx_hash ? (
              <a className="inline-flex items-center gap-1 font-mono text-[11px] text-electric no-underline" href={explorerTxUrl(selectedNode.reentry_tx_hash)} target="_blank" rel="noreferrer">
                {shortAddr(selectedNode.reentry_tx_hash)}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <p className="text-cream">—</p>
            )}
            <p className="mt-2 text-secondary">Current parent</p>
            <p className="text-cream">
              {globalParent ? walletTail(userById.get(globalParent.user_id)?.wallet) ?? globalParent.user?.referral_code : selectedNode.parent_id ? "—" : "Root"}
            </p>
            <p className="mt-2 text-secondary">Current status</p>
            <StatusBadge status={statusOf(selectedNode)} />
          </section>
        )}
        {reservedSelected && (
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mute">Re-entry (this seat)</p>
            <p className="mt-2 text-secondary">Mover</p>
            <p className="text-cream">{selectedNode.user?.referral_code ?? "—"}</p>
            <p className="mt-2 text-secondary">Previous position</p>
            <p className="text-cream">
              {previousHistory
                ? `${previousHistory.parent_code ?? (previousHistory.parent_id ? "—" : "Root")} · ${previousHistory.position ?? "ROOT"} · HISTORY`
                : "No prior stored seat for this plan"}
            </p>
            <p className="mt-2 text-secondary">New reserved parent</p>
            <p className="text-cream">{walletTail(newParentUser?.wallet) ?? globalParent?.user?.referral_code ?? "—"}</p>
            <p className="mt-2 text-secondary">LEFT / RIGHT</p>
            <p className="text-cream">{selectedNode.position ?? "ROOT"}</p>
            <p className="mt-2 text-secondary">Recipient wallet</p>
            <p className="font-mono text-xs text-cream">{selectedNode.recipient_wallet ? shortAddr(selectedNode.recipient_wallet) : newParentUser?.wallet ? shortAddr(newParentUser.wallet) : "—"}</p>
            <p className="mt-2 text-secondary">Plan / amount</p>
            <p className="text-cream">{planLabel(planId) ?? "—"}</p>
            <p className="mt-2 text-secondary">Payment status</p>
            <p className="text-warning">{selectedNode.reentry_tx_hash ? "Reserved — tx on file" : "PAYMENT REQUIRED / RESERVED"}</p>
          </section>
        )}
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mute">Global Position Summary</p>
          <p className="mt-2 text-secondary">Current Active Position</p>
          <p className="text-cream">{activeSeat ? seatCaption(activeSeat) : "—"}</p>
          <p className="mt-2 text-secondary">Reserved Position</p>
          <p className="text-cream">{reservedSeat ? `${seatCaption(reservedSeat)}${reservedSeat.reentry_tx_hash ? "" : " · Payment Required"}` : "—"}</p>
          <p className="mt-2 text-secondary">Previous Positions</p>
          <p className="text-cream">{counts.previous}</p>
          <p className="mt-2 text-secondary">Total Re-entries</p>
          <p className="text-cream">{counts.reentries}</p>
        </section>
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mute">Position History</p>
          {positionHistory.length === 0 ? (
            <p className="mt-2 text-sm text-mute">No stored positions for this plan.</p>
          ) : (
            <div className="mt-2 space-y-2">
              {positionHistory.map((row, i) => (
                <div key={row.id} className="rounded-xl border border-line bg-white/[0.02] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-violet">#{i + 1}</p>
                  <p className="mt-1 text-xs text-secondary">Parent</p>
                  <p className="text-cream">{row.parent_code ?? (row.parent_id ? "—" : "ROOT")}</p>
                  <p className="mt-1 text-xs text-secondary">LEFT / RIGHT</p>
                  <p className="text-cream">{row.position ?? "ROOT"}</p>
                  <p className="mt-1 text-xs text-secondary">Status</p>
                  <StatusBadge status={row.status ?? "ACTIVE"} />
                  <p className="mt-1 text-xs text-secondary">Started</p>
                  <p className="text-cream">{row.started_at ? new Date(row.started_at).toLocaleString() : "—"}</p>
                  <p className="mt-1 text-xs text-secondary">Ended</p>
                  <p className="text-cream">{row.ended_at ? new Date(row.ended_at).toLocaleString() : "—"}</p>
                </div>
              ))}
            </div>
          )}
        </section>
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mute">Plan</p>
          <p className="mt-2 text-cream">{planLabel(selectedUser?.current_plan) ?? "—"}</p>
          <p className="mt-1 text-secondary">{selectedUser?.current_plan ?? "No confirmed plan"}</p>
        </section>
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mute">Payment route</p>
          {routeTx ? (
            <>
              <p className="mt-2 text-secondary">Payer</p>
              <p className="text-cream">{selectedNode.user?.referral_code ?? shortAddr(routeTx.payer_wallet)}</p>
              <p className="mt-2 text-secondary">Recipient</p>
              <p className="font-mono text-xs text-cream">{shortAddr(routeTx.recipient_wallet)}</p>
              <p className="mt-2 text-secondary">Route</p>
              <p className="text-cream">{routingLabel(routeTx.recipient_role, routeTx.routing_slot)}</p>
              <p className="mt-2 tabular text-cream">
                {formatTokenAmount(routeTx.amount)} {routeTx.token}
              </p>
              <a className="mt-2 inline-flex items-center gap-1 text-[11px] text-electric no-underline" href={explorerTxUrl(routeTx.tx_hash)} target="_blank" rel="noreferrer">
                {shortAddr(routeTx.tx_hash)}
                <ExternalLink className="h-3 w-3" />
              </a>
              <div className="mt-2">
                <StatusBadge status={routeTx.status} />
              </div>
            </>
          ) : (
            <p className="mt-2 text-mute">No plan / re-entry payment on file for this member as payer.</p>
          )}
        </section>
        <section>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mute">Global Position Journey</p>
          <p className="mt-1 text-[11px] text-mute">
            {planLabel(planId) ?? "This plan"} · previous {counts.previous} · re-entries {counts.reentries}
          </p>
          <div className="mt-3">{journeyBlock()}</div>
        </section>
      </div>
    </aside>
  );



  function HitList({ compact }: { compact: boolean }) {
    return (
      <ul className={compact ? "divide-y divide-line" : "space-y-2"}>
        {searchHits.map((hit) => (
          <li key={hit.key}>
            <button
              type="button"
              onClick={() => focusHit(hit)}
              className={`w-full text-left ${compact ? "px-3 py-2.5 hover:bg-white/5" : "rounded-xl border border-line bg-[#0B1220] p-3"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-cream">{hit.member}</p>
                {hit.status === "no position" ? (
                  <span className="text-[10px] uppercase tracking-wide text-mute">no position</span>
                ) : (
                  <StatusBadge status={hit.status} />
                )}
              </div>
              <p className="mt-0.5 font-mono text-[11px] text-mute">{hit.wallet === "—" ? "—" : shortAddr(hit.wallet)}</p>
              <p className="mt-1 text-[11px] text-secondary">
                {hit.planName} · {hit.status}
                {hit.paymentRequired ? " · Payment Required" : ""}
              </p>
              <p className="text-[11px] text-mute">
                Parent: {hit.parentLabel} · {hit.position ?? "ROOT"} · Previous {hit.previous} · Re-entries {hit.reentries}
              </p>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div>
      <div className="relative flex flex-col gap-3">
        <label className="relative block w-full">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search wallet address or referral code..."
            className="min-h-12 w-full rounded-2xl border border-line bg-surface2 pl-10 pr-4 text-sm text-cream outline-none placeholder:text-mute focus:border-violet/40"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-xs text-secondary">
          <input
            type="checkbox"
            checked={searchAllPlans}
            onChange={(e) => setSearchAllPlans(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-line"
          />
          Search all plans
        </label>
        {searchOpen && debouncedQ.trim() && (
          <>
            <div className="space-y-2 lg:hidden">
              {noMatch ? (
                <p className="rounded-xl border border-line bg-[#0B1220] p-3 text-sm text-secondary">No matching wallet or referral code found.</p>
              ) : (
                <HitList compact={false} />
              )}
            </div>
            <div className="z-30 hidden overflow-hidden rounded-2xl border border-line bg-[#0B1220] shadow-card lg:block">
              {noMatch ? (
                <p className="p-3 text-sm text-secondary">No matching wallet or referral code found.</p>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <HitList compact />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="mt-4 space-y-3 lg:hidden">
        {selectedNode ? (
          <>
            <div className="rounded-2xl border border-violet/30 bg-[#0B1220] p-4">
              <p className="text-[10px] uppercase tracking-[0.16em] text-mute">Selected user</p>
              <p className="mt-1 font-display text-xl text-cream">{selectedNode.user?.referral_code}</p>
              <p className="font-mono text-xs text-mute">{selectedUser?.wallet ? shortAddr(selectedUser.wallet) : ""}</p>
              <div className="mt-2">
                <StatusBadge status={statusOf(selectedNode)} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              <div className="rounded-xl border border-line bg-[#0B1220] p-3">
                <p className="text-[10px] uppercase text-mute">Parent</p>
                <p className="text-sm text-cream">{globalParent?.user?.referral_code ?? (selectedNode.parent_id ? "—" : "Root")}</p>
              </div>
              <div className="rounded-xl border border-violet/40 bg-[#0B1220] p-3">
                <p className="text-[10px] uppercase text-mute">Current node</p>
                <p className="text-sm text-cream">
                  {selectedNode.user?.referral_code} · {selectedNode.position ?? "ROOT"}
                </p>
              </div>
              <div className="rounded-xl border border-line bg-[#0B1220] p-3">
                <p className="text-[10px] uppercase text-mute">LEFT child</p>
                <p className="text-sm text-cream">{leftChild?.user?.referral_code ?? "Empty"}</p>
              </div>
              <div className="rounded-xl border border-line bg-[#0B1220] p-3">
                <p className="text-[10px] uppercase text-mute">RIGHT child</p>
                <p className="text-sm text-cream">{rightChild?.user?.referral_code ?? "Empty"}</p>
              </div>
            </div>
            <button
              type="button"
              className="w-full rounded-xl border border-line px-3 py-3 text-left text-sm text-cream"
              onClick={() => setHistoryOpen((v) => !v)}
            >
              Position journey {historyOpen ? "▾" : "▸"}
            </button>
            {historyOpen && <div className="rounded-xl border border-line bg-[#0B1220] p-4">{journeyBlock()}</div>}
          </>
        ) : (
          <p className="text-sm text-secondary">Search a wallet or referral code to inspect a Global seat. The full tree is on desktop.</p>
        )}
      </div>

      {error && (
        <div className="mt-4">
          <Alert tone="error" title="Unable to load network">
            The Global tree could not be loaded. Please try again.
            <div className="mt-3">
              <Button type="button" variant="ghost" className="!min-h-10 !text-xs" onClick={onRetry}>
                Retry
              </Button>
            </div>
          </Alert>
        </div>
      )}

      <div className="mt-5 hidden overflow-hidden rounded-[20px] border border-[rgba(124,92,255,0.16)] bg-[#050811] shadow-card lg:block">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[11px] text-mute">
              View Level
              <select
                className="min-h-9 rounded-lg border border-line bg-elevated px-2 text-xs text-cream"
                value={String(levels)}
                onChange={(e) => setLevels(e.target.value === "all" ? "all" : (Number(e.target.value) as 3 | 5))}
              >
                <option value="3">3 Levels</option>
                <option value="5">5 Levels</option>
                <option value="all">All</option>
              </select>
            </label>
            <span className="rounded-lg border border-line bg-elevated px-2.5 py-2 text-[11px] text-mute">Binary (Left → Right)</span>
          </div>
        </div>

        <div className={`relative min-h-[560px] lg:min-h-[640px] ${selectedNode ? "lg:flex" : ""}`}>
          <div className="min-w-0 flex-1">
            <div
              className="relative min-h-[560px] overflow-hidden lg:min-h-[640px]"
              style={{
                backgroundImage: "radial-gradient(rgba(148,163,184,0.10) 1px, transparent 1px)",
                backgroundSize: "18px 18px",
                backgroundColor: "#050811",
              }}
            >
              {loading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-8 px-8">
                  <div className="h-16 w-28 animate-pulse rounded-2xl bg-white/5" />
                  <div className="flex gap-16">
                    <div className="h-24 w-[122px] animate-pulse rounded-2xl bg-white/5" />
                    <div className="h-24 w-[122px] animate-pulse rounded-2xl bg-white/5" />
                  </div>
                  <p className="text-xs text-mute">Loading Global tree…</p>
                </div>
              )}
              {!loading && !error && liveTree.length === 0 && (
                <div className="flex min-h-[560px] items-center justify-center p-6">
                  <EmptyState icon={Network} title="No Global positions yet" detail="Members will appear here after Global placement." />
                </div>
              )}
              {!loading && liveTree.length > 0 && (
                <TransformWrapper minScale={0.25} maxScale={2.2} centerOnInit>
                  <TreeFocus nodeId={selectedId} nonce={focusNonce} />
                  <div className="absolute right-3 top-3 z-10">
                    <Toolbar legendOpen={legend} onLegend={() => setLegend((v) => !v)} />
                  </div>
                  <TransformComponent wrapperClass="!w-full !h-[560px] lg:!h-[640px]" contentClass="p-8">
                    <div className="relative" style={{ width: canvasW, height: canvasH }}>
                      <svg className="absolute inset-0" width={canvasW} height={canvasH}>
                        {placed.map((p) => {
                          if (p.vis.kind !== "member" || !p.vis.node) return null;
                          const kids = placed.filter((c) => {
                            if (c.vis.kind === "member") return c.vis.node?.parent_id === p.vis.node?.id;
                            return c.vis.key.startsWith(`${p.vis.node?.id}-empty`);
                          });
                          return kids.map((c) => {
                            const x1 = p.x;
                            const y1 = p.y + NODE_H;
                            const x2 = c.x;
                            const y2 = c.y;
                            const midY = (y1 + y2) / 2;
                            const isRight = c.vis.position === "RIGHT";
                            const color = isRight ? "rgba(59,130,246,0.75)" : "rgba(124,92,255,0.75)";
                            const reservedChild = c.vis.node?.status === "RESERVED";
                            return (
                              <g key={`${p.vis.key}-${c.vis.key}`}>
                                <path
                                  d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                                  fill="none"
                                  stroke={color}
                                  strokeWidth="2"
                                  strokeDasharray={reservedChild ? "6 4" : undefined}
                                />
                                {Math.abs(x2 - x1) > 20 && (
                                  <text x={(x1 + x2) / 2} y={midY - 6} textAnchor="middle" fill={color} fontSize="9" letterSpacing="0.12em">
                                    {c.vis.position ?? ""}
                                  </text>
                                )}
                              </g>
                            );
                          });
                        })}
                      </svg>
                      {placed.map((p) => (
                        <MemberCard
                          key={p.vis.node?.id ?? p.vis.key}
                          placed={p}
                          selected={p.vis.node?.id === selectedId}
                          user={p.vis.node ? userById.get(p.vis.node.user_id) : undefined}
                          onSelect={() => p.vis.node && selectNode(p.vis.node)}
                          planId={planId}
                          showAsRoot={Boolean(
                            p.vis.node &&
                              (activeRootUserIds.has(p.vis.node.user_id) ||
                                liveTree.some((n) => n.id === p.vis.node?.from_position_id && !n.parent_id) ||
                                previousHistoryChain(p.vis.node, historyByUser.get(p.vis.node.user_id) ?? []).some(
                                  (h) => !h.parent_id && statusOf(p.vis.node) === "RESERVED",
                                )),
                          )}
                        />
                      ))}
                    </div>
                  </TransformComponent>
                </TransformWrapper>
              )}
            </div>
            {legend && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-2.5 text-[11px] text-mute">
                <span className="font-semibold uppercase tracking-[0.14em]">Legend</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-5 bg-violet" /> Left Position
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-5 bg-electric" /> Right Position
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-mint" /> ACTIVE
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-warning" /> RESERVED
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-mute/50" /> EMPTY
                </span>
              </div>
            )}
          </div>
          {selectedNode && <div className="hidden h-[640px] lg:block">{drawer}</div>}
        </div>
      </div>

      <p className="mt-4">
        <Link href="/admin/transactions" className="text-sm text-electric no-underline hover:underline">
          View Transactions →
        </Link>
      </p>
    </div>
  );
}
