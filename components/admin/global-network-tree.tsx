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
import { parentOf, routingLabel, type NetNode } from "@/lib/cycle-ui";
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

function buildChildMap(tree: NetNode[]) {
  const byParent = new Map<string, { left?: NetNode; right?: NetNode }>();
  for (const n of tree) {
    if (!n.parent_id) continue;
    const slot = byParent.get(n.parent_id) ?? {};
    if (n.position === "LEFT") slot.left = n;
    else if (n.position === "RIGHT") slot.right = n;
    byParent.set(n.parent_id, slot);
  }
  return byParent;
}

function toVis(node: NetNode, byParent: Map<string, { left?: NetNode; right?: NetNode }>, depth: number, maxDepth: number): VisNode {
  const vis: VisNode = {
    key: node.id,
    kind: "member",
    position: node.position === "RIGHT" ? "RIGHT" : node.position === "LEFT" ? "LEFT" : null,
    node,
  };
  if (maxDepth !== Infinity && depth >= maxDepth) return vis;
  const kids = byParent.get(node.id) ?? {};
  vis.left = kids.left
    ? toVis(kids.left, byParent, depth + 1, maxDepth)
    : { key: `${node.id}-empty-L`, kind: "empty", position: "LEFT" };
  vis.right = kids.right
    ? toVis(kids.right, byParent, depth + 1, maxDepth)
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
}: {
  placed: Placed;
  selected: boolean;
  user?: CycleUser;
  planId?: string;
  onSelect: () => void;
}) {
  if (placed.vis.kind === "empty") {
    return (
      <div
        className="absolute flex flex-col items-center justify-center rounded-[16px] border border-dashed border-white/10 bg-white/[0.02] text-center"
        style={{ left: placed.x - NODE_W / 2, top: placed.y, width: NODE_W, height: NODE_H }}
      >
        <span className="h-2 w-2 rounded-full bg-mute/50" />
        <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-mute">Empty</p>
        <p className="text-[10px] font-semibold text-mute/80">{placed.vis.position}</p>
      </div>
    );
  }
  const node = placed.vis.node!;
  const reserved = statusOf(node) === "RESERVED";
  const isRoot = !node.parent_id && !reserved;
  const code = node.user?.referral_code ?? shortAddr(node.user_id);
  const tail = walletTail(user?.wallet);
  const label = isRoot ? "ROOT" : tail ?? code;
  const st = statusOf(node);
  const plan = planLabel(planId) ?? planLabel(user?.current_plan);
  return (
    <button
      type="button"
      id={`gx-node-${node.id}`}
      onClick={onSelect}
      className={`absolute rounded-[16px] border px-2.5 py-2 text-left transition ${
        selected
          ? "border-violet bg-[#0D1424] shadow-[0_0_0_1px_rgba(124,92,255,0.45),0_0_28px_rgba(124,92,255,0.28)]"
          : reserved
            ? "border-dashed border-warning bg-[#0B1220]/70 hover:border-warning"
            : "border-line bg-[#0B1220] hover:-translate-y-0.5 hover:border-violet/35 hover:shadow-card"
      }`}
      style={{ left: placed.x - NODE_W / 2, top: placed.y, width: NODE_W, height: NODE_H }}
    >
      <div className="flex items-start gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${reserved ? "bg-warning/70" : "bg-gradient-to-br from-violet/80 to-electric/70"}`}>
          {initials(label)}
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
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">Payment Required</p>
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
}) {
  const [q, setQ] = useState("");
  const [levels, setLevels] = useState<3 | 5 | "all">(5);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [legend, setLegend] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<
    {
      id: string;
      status?: string;
      position?: string | null;
      parent_id?: string | null;
      parent_code?: string | null;
      started_at?: string;
      ended_at?: string | null;
      reentry_tx_hash?: string | null;
      recipient_wallet?: string | null;
      plan_id?: string;
    }[]
  >([]);
  const [searchNote, setSearchNote] = useState("");

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  const userByWallet = useMemo(() => {
    const m = new Map<string, CycleUser>();
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

  const liveTree = useMemo(() => tree.filter((n) => !n.user?.is_demo), [tree]);
  const maxDepth = levels === "all" ? Infinity : levels;
  const roots = useMemo(() => {
    const ids = new Set(liveTree.map((n) => n.id));
    return liveTree.filter((n) => !n.parent_id || !ids.has(n.parent_id)).sort((a, b) => a.depth - b.depth);
  }, [liveTree]);

  const visRoots = useMemo(() => {
    const byParent = buildChildMap(liveTree);
    return roots.map((r) => toVis(r, byParent, 0, maxDepth === Infinity ? 99 : maxDepth - 1));
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

  useEffect(() => {
    if (!selectedNode) {
      setHistoryRows([]);
      return;
    }
    let cancelled = false;
    api<{
      ok: boolean;
      positions?: typeof historyRows;
    }>(`/api/admin/data?resource=user&id=${encodeURIComponent(selectedNode.user_id)}`).then((r) => {
      if (!cancelled) {
        const rows = r.ok ? (r.positions ?? []) : [];
        setHistoryRows(planId ? rows.filter((p) => !("plan_id" in p) || p.plan_id === planId || !p.plan_id) : rows);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selectedNode]);

  function selectNode(node: NetNode, fromSearch = false) {
    setSelectedId(node.id);
    setHistoryOpen(false);
    const parent = parentOf(liveTree, node);
    if (fromSearch) {
      const branch = node.position ? `${node.position} branch` : "root";
      const under = parent?.user?.referral_code;
      setSearchNote(under ? `Found in ${branch} under ${under}` : `Found at ${branch}`);
    }
    requestAnimationFrame(() => {
      document.getElementById(`gx-node-${node.id}`)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    });
  }

  function runSearch(value: string) {
    const needle = value.trim().toLowerCase();
    setQ(value);
    if (!needle) {
      setSearchNote("");
      return;
    }
    const user =
      users.find(
        (u) =>
          u.referral_code.toLowerCase().includes(needle) ||
          (u.display_name ?? "").toLowerCase().includes(needle) ||
          u.id.toLowerCase().includes(needle) ||
          (u.wallet ?? "").toLowerCase().includes(needle),
      ) ?? userByWallet.get(needle);
    const node =
      (user
        ? liveTree.find((n) => n.user_id === user.id && (n.status ?? "ACTIVE") === "ACTIVE") ??
          liveTree.find((n) => n.user_id === user.id)
        : undefined) ??
      liveTree.find(
        (n) =>
          n.user_id.toLowerCase().includes(needle) ||
          (n.user?.referral_code ?? "").toLowerCase().includes(needle) ||
          (n.user?.display_name ?? "").toLowerCase().includes(needle),
      );
    if (node) selectNode(node, true);
    else setSearchNote("No matching member in the loaded Global tree.");
  }

  const myDirect = selectedNode ? refs.find((r) => r.user_id === selectedNode.user_id) : undefined;
  const memberTxs = selectedNode
    ? txs.filter(
        (t) =>
          t.user_id === selectedNode.user_id &&
          (!planId || t.plan_id === planId || t.plan_code === planId),
      )
    : [];
  const routeTx = [...memberTxs]
    .filter((t) => t.payment_type === "PLAN_PURCHASE" || t.payment_type === "GLOBAL_REENTRY")
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  const leftChild = selectedNode ? liveTree.find((n) => n.parent_id === selectedNode.id && n.position === "LEFT") : undefined;
  const rightChild = selectedNode ? liveTree.find((n) => n.parent_id === selectedNode.id && n.position === "RIGHT") : undefined;
  const reservedSelected = statusOf(selectedNode ?? undefined) === "RESERVED";
  const newParentUser = globalParent ? userById.get(globalParent.user_id) : undefined;
  const historySorted = [...historyRows].sort((a, b) => String(a.started_at ?? "").localeCompare(String(b.started_at ?? "")));

  function historyBlock() {
    if (historySorted.length === 0) return <p className="text-sm text-mute">No position history.</p>;
    return (
      <div className="space-y-3">
        {historySorted.map((p, i) => (
          <div key={p.id} className="relative border-l border-violet/30 pl-4">
            <span className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-violet" />
            <p className="text-sm font-semibold text-cream">Position #{i + 1}</p>
            <p className="mt-1 text-xs text-secondary">Parent: {p.parent_code ?? (p.parent_id ? "—" : "Root")}</p>
            <p className="text-xs text-secondary">{p.position ?? "ROOT"}</p>
            <p className="text-[11px] text-mute">
              {p.status === "HISTORY" ? "COMPLETED" : p.status ?? "ACTIVE"}
              {p.started_at ? ` · ${new Date(p.started_at).toLocaleString()}` : ""}
              {p.ended_at ? ` → ${new Date(p.ended_at).toLocaleString()}` : ""}
            </p>
            {p.reentry_tx_hash && <p className="font-mono text-[10px] text-mute">Tx: {shortAddr(p.reentry_tx_hash)}</p>}
          </div>
        ))}
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
        {reservedSelected && (
          <section>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mute">Re-entry payment</p>
            <p className="mt-2 text-secondary">Re-entry Payer</p>
            <p className="text-cream">{selectedNode.user?.referral_code ?? "—"}</p>
            <p className="mt-2 text-secondary">New Global Parent</p>
            <p className="text-cream">{walletTail(newParentUser?.wallet) ?? globalParent?.user?.referral_code ?? "—"}</p>
            <p className="mt-2 text-secondary">Recipient Wallet</p>
            <p className="font-mono text-xs text-cream">{newParentUser?.wallet ? shortAddr(newParentUser.wallet) : "—"}</p>
            <p className="mt-2 text-secondary">Plan</p>
            <p className="text-cream">{planLabel(planId) ?? "—"}</p>
            <p className="mt-2 text-secondary">Amount</p>
            <p className="text-cream">{planLabel(planId) ?? "—"}</p>
            <p className="mt-2 text-secondary">Payment Status</p>
            <p className="text-warning">PAYMENT REQUIRED / RESERVED</p>
          </section>
        )}
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
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-mute">Position history</p>
          <div className="mt-3">{historyBlock()}</div>
        </section>
      </div>
    </aside>
  );



  return (
    <div>
      <div className="flex flex-col gap-4">
        <label className="relative block w-full">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
          <input
            value={q}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Search wallet address or referral code…"
            className="min-h-12 w-full rounded-2xl border border-line bg-[#0D1424] pl-10 pr-4 text-sm text-cream outline-none placeholder:text-mute focus:border-violet/40"
          />
        </label>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-mute">Network</p>
          <h2 className="mt-1 font-display text-[28px] leading-8 text-cream sm:text-[32px]">Global Network Tree</h2>
          <p className="mt-1 max-w-xl text-sm text-secondary">
            First-empty Global placement (top to bottom, LEFT then RIGHT). Sponsor is shown in node details, not as a tree edge.
          </p>
        </div>
      </div>
      {searchNote && <p className="mt-2 text-sm text-secondary">{searchNote}</p>}

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
              Position history {historyOpen ? "▾" : "▸"}
            </button>
            {historyOpen && <div className="rounded-xl border border-line bg-[#0B1220] p-4">{historyBlock()}</div>}
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

      <div className="mt-5 hidden overflow-hidden rounded-[20px] border border-[rgba(124,92,255,0.18)] bg-[#080D19] shadow-card lg:block">
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
                backgroundImage: "radial-gradient(rgba(154,168,199,0.09) 1px, transparent 1px)",
                backgroundSize: "18px 18px",
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
                            return (
                              <g key={`${p.vis.key}-${c.vis.key}`}>
                                <path
                                  d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                                  fill="none"
                                  stroke={color}
                                  strokeWidth="2"
                                  strokeDasharray={c.vis.node?.status === "RESERVED" ? "6 4" : undefined}
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
                          key={p.vis.key}
                          placed={p}
                          selected={p.vis.node?.id === selectedId}
                          user={p.vis.node ? userById.get(p.vis.node.user_id) : undefined}
                          onSelect={() => p.vis.node && selectNode(p.vis.node)}
                          planId={planId}
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
                  <span className="h-2 w-4 border border-dashed border-warning" /> RESERVED
                </span>
                <span className="inline-flex items-center gap-1.5">HISTORY lives in the detail timeline</span>
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
