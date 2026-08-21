import { findFirstEmptyPlacement, occupiesSlot, type Node } from "@/network/placement";

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
  user?: { id?: string; referral_code: string; display_name: string; is_demo: boolean };
};

export const LEGACY_PLACEMENT_NOTE =
  "Created under a previous Global placement rule. Historical confirmed payment and position are preserved.";

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
