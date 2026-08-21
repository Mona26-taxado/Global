import { cycleComplete, findFirstEmptyPlacement, occupiesSlot, type Node } from "@/network/placement";

export function routingLabel(role?: string | null, slot?: number | null) {
  if (role === "SPONSOR" || slot === 1) return "DIRECT FIRST";
  if (role === "GLOBAL_UPLINE" || slot === 2) return "GLOBAL SECOND";
  if (role === "GLOBAL_REENTRY") return "GLOBAL REENTRY";
  if (role === "COMPANY_GENESIS") return "Genesis → Company";
  return "Plan payment";
}

export type NetNode = {
  id: string;
  user_id: string;
  parent_id: string | null;
  position: string | null;
  depth: number;
  cycle?: number;
  status?: "ACTIVE" | "HISTORY" | "RESERVED";
  started_at?: string;
  recipient_wallet?: string | null;
  reentry_tx_hash?: string | null;
  from_position_id?: string | null;
  source_is_root?: boolean;
  user?: { id?: string; referral_code: string; display_name: string; is_demo: boolean };
};

export const LEGACY_PLACEMENT_NOTE =
  "This position was created under a previous placement rule and is preserved for transaction history.";

export const CURRENT_PLACEMENT_MODEL_LABEL = "Current Placement Model";

type LockTx = {
  user_id: string;
  payment_type: string;
  status: string;
  recipient_role?: string | null;
  routing_slot?: number | null;
  recipient_wallet: string;
  tx_hash: string;
  created_at: string;
};

type LockRef = { user_id: string; sponsor_id: string; direct_number?: 1 | 2 };

export type PlacementLock = {
  recipient: string;
  txHash: string;
  createdAt: string;
};

function sideOf(node: NetNode): "LEFT" | "RIGHT" | null {
  if (node.position === "RIGHT") return "RIGHT";
  if (node.position === "LEFT") return "LEFT";
  return null;
}

function asAllocatorNode(node: NetNode): Node {
  return {
    id: node.id,
    user_id: node.user_id,
    parent_id: node.parent_id,
    position: sideOf(node),
    depth: node.depth,
    status: node.status,
  };
}

/** Confirmed Direct #2 / re-entry payment that locked this seat’s parent (display only). */
export function placementLockTx(node: NetNode, txs: LockTx[], refs: LockRef[]): PlacementLock | null {
  const downlineIds = new Set(refs.filter((r) => r.sponsor_id === node.user_id).map((r) => r.user_id));
  const rows = txs
    .filter((t) => t.status === "CONFIRMED")
    .filter((t) => {
      if (t.payment_type === "GLOBAL_REENTRY" && t.user_id === node.user_id) return true;
      if (t.payment_type !== "PLAN_PURCHASE") return false;
      if (t.recipient_role !== "GLOBAL_UPLINE" && t.routing_slot !== 2) return false;
      return downlineIds.has(t.user_id);
    })
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const t = rows[0];
  if (!t) return null;
  return { recipient: t.recipient_wallet, txHash: t.tx_hash, createdAt: t.created_at };
}

/**
 * Live seats whose persisted parent/side would not be chosen by the current first-empty
 * allocator at creation time, and that have a confirmed payment locking that history.
 * Display-only: does not move or rewrite rows.
 */
export function legacyPlacementIds(tree: NetNode[], txs: LockTx[], refs: LockRef[]): Set<string> {
  const live = tree.filter((n) => occupiesSlot(asAllocatorNode(n)));
  const sorted = [...live].sort((a, b) => {
    const ta = a.started_at ?? "";
    const tb = b.started_at ?? "";
    if (ta !== tb) return ta.localeCompare(tb);
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.id.localeCompare(b.id);
  });
  const ids = new Set<string>();
  for (let i = 0; i < sorted.length; i++) {
    const node = sorted[i];
    if (!node.parent_id) continue;
    const prior = sorted.slice(0, i).map(asAllocatorNode);
    if (!prior.length) continue;
    const hole = findFirstEmptyPlacement(prior, node.user_id);
    const mismatch = hole.parent_id !== node.parent_id || hole.position !== sideOf(node);
    if (mismatch && placementLockTx(node, txs, refs)) ids.add(node.id);
  }
  return ids;
}

export function parentOf(tree: NetNode[], node: NetNode | undefined) {
  if (!node?.parent_id) return null;
  return tree.find((n) => n.id === node.parent_id) ?? null;
}

function chronoActive(nodes: NetNode[]): NetNode[] {
  return nodes
    .filter((n) => (n.status ?? "ACTIVE") === "ACTIVE")
    .sort((a, b) => {
      const ta = a.started_at ?? "";
      const tb = b.started_at ?? "";
      if (ta !== tb) return ta.localeCompare(tb);
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.id.localeCompare(b.id);
    });
}

/**
 * Read-only visualization of the current first-empty rule applied to existing ACTIVE seats.
 * Does not mutate persisted parent_id. Unpaid re-entry is shown only when a cycle is complete.
 */
export function logicalCurrentTree(persisted: NetNode[]): NetNode[] {
  const live = persisted.filter((n) => !n.user?.is_demo);
  const out: NetNode[] = [];

  const occupy = () => out.map(asAllocatorNode);

  const addReserved = (from: NetNode) => {
    if (out.some((n) => n.user_id === from.user_id && n.status === "RESERVED")) return;
    const apiReserved = live.find((p) => p.user_id === from.user_id && p.status === "RESERVED");
    if (!apiReserved) return;
    out.push({
      ...apiReserved,
      from_position_id: apiReserved.from_position_id ?? from.id,
      source_is_root: !from.parent_id,
    });
  };

  const maybeReserveAncestors = (child: NetNode) => {
    let parentId = child.parent_id;
    while (parentId) {
      const parentPos = out.find((p) => p.id === parentId);
      if (!parentPos) return;
      if ((parentPos.status ?? "ACTIVE") === "ACTIVE" && cycleComplete(occupy(), parentPos.id)) {
        addReserved(parentPos);
      }
      parentId = parentPos.parent_id;
    }
  };

  for (const n of chronoActive(live)) {
    const hole = findFirstEmptyPlacement(occupy(), n.user_id);
    const placed: NetNode = {
      ...n,
      parent_id: hole.parent_id,
      position: hole.position,
      depth: hole.depth,
      cycle: Math.floor(hole.depth / 2),
      status: "ACTIVE",
    };
    out.push(placed);
    maybeReserveAncestors(placed);
  }

  for (const r of live.filter((p) => p.status === "RESERVED")) {
    if (out.some((n) => n.user_id === r.user_id && n.status === "RESERVED")) continue;
    const current = out.find((n) => n.user_id === r.user_id && (n.status ?? "ACTIVE") === "ACTIVE");
    if (current && cycleComplete(occupy(), current.id)) addReserved(current);
  }

  return out;
}

/** Persisted ACTIVE seats whose stored parent/side differ from the current-rule visualization. */
export function legacyRecordIds(persisted: NetNode[], logical: NetNode[]): Set<string> {
  const ids = new Set<string>();
  for (const row of persisted) {
    if ((row.status ?? "ACTIVE") !== "ACTIVE") continue;
    const vis = logical.find((n) => n.id === row.id && (n.status ?? "ACTIVE") === "ACTIVE");
    if (!vis) continue;
    if (vis.parent_id !== row.parent_id || sideOf(vis) !== sideOf(row)) ids.add(row.id);
  }
  return ids;
}
