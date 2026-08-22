/** Display-only binary tree geometry. Does not mutate seats or parent_id. */

import type { NetNode } from "@/lib/cycle-ui";

export const TREE_NODE_W = 148;
export const TREE_NODE_H = 152;
export const TREE_LEVEL_GAP = 112;
export const TREE_SIBLING_GAP = 64;
export const TREE_CONTENT_PAD = 56;

export type LayoutVis = {
  key: string;
  kind: "member" | "empty";
  position: "LEFT" | "RIGHT" | null;
  node?: NetNode;
  left?: LayoutVis;
  right?: LayoutVis;
  was?: LayoutVis;
};

export type PlacedNode = { vis: LayoutVis; x: number; y: number; depth: number };

export function subtreeWidth(v: LayoutVis): number {
  if (v.was) return Math.max(TREE_NODE_W, subtreeWidth(v.was));
  const left = v.left ? subtreeWidth(v.left) : 0;
  const right = v.right ? subtreeWidth(v.right) : 0;
  if (!v.left && !v.right) return TREE_NODE_W;
  const gap = v.left && v.right ? TREE_SIBLING_GAP : 0;
  return Math.max(TREE_NODE_W, left + gap + right);
}

function layoutAt(v: LayoutVis, originX: number, depth: number, out: PlacedNode[]): { x: number; width: number } {
  const y = depth * (TREE_NODE_H + TREE_LEVEL_GAP);
  if (v.was) {
    const inner = layoutAt(v.was, originX, depth + 1, out);
    const width = Math.max(TREE_NODE_W, inner.width);
    const x = inner.x;
    out.push({ vis: v, x, y, depth });
    return { x, width };
  }
  const lw = v.left ? subtreeWidth(v.left) : TREE_NODE_W;
  const rw = v.right ? subtreeWidth(v.right) : TREE_NODE_W;
  const gap = v.left && v.right ? TREE_SIBLING_GAP : 0;
  const width = Math.max(TREE_NODE_W, (v.left ? lw : 0) + gap + (v.right ? rw : 0) || TREE_NODE_W);
  let leftX = originX + lw / 2;
  let rightX = originX + (v.left ? lw + gap : 0) + rw / 2;
  if (v.left) leftX = layoutAt(v.left, originX, depth + 1, out).x;
  if (v.right) rightX = layoutAt(v.right, originX + (v.left ? lw + gap : 0), depth + 1, out).x;
  const x = v.left && v.right ? (leftX + rightX) / 2 : v.left ? leftX : v.right ? rightX : originX + TREE_NODE_W / 2;
  out.push({ vis: v, x, y, depth });
  return { x, width };
}

export function placedBounds(placed: Pick<PlacedNode, "x" | "y">[], nodeW = TREE_NODE_W, nodeH = TREE_NODE_H) {
  if (!placed.length) return { minX: 0, minY: 0, maxX: nodeW, maxY: nodeH };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of placed) {
    minX = Math.min(minX, p.x - nodeW / 2);
    maxX = Math.max(maxX, p.x + nodeW / 2);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y + nodeH);
  }
  return { minX, minY, maxX, maxY };
}

export function layoutBinaryForest(roots: LayoutVis[]): {
  placed: PlacedNode[];
  width: number;
  height: number;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
} {
  const raw: PlacedNode[] = [];
  let x = 0;
  for (const root of roots) {
    const w = subtreeWidth(root);
    layoutAt(root, x, 0, raw);
    x += w + TREE_SIBLING_GAP * 1.5;
  }
  const box = placedBounds(raw);
  const dx = TREE_CONTENT_PAD - box.minX;
  const dy = TREE_CONTENT_PAD - box.minY;
  const placed = raw.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
  const bounds = placedBounds(placed);
  return {
    placed,
    width: bounds.maxX + TREE_CONTENT_PAD,
    height: bounds.maxY + TREE_CONTENT_PAD,
    bounds,
  };
}

export function visLayoutChildren(v: LayoutVis): LayoutVis[] {
  if (v.was) return [v.was];
  return [v.left, v.right].filter((c): c is LayoutVis => Boolean(c));
}

export type SearchableSeat = {
  id: string;
  user_id: string;
  status?: string;
  user?: { referral_code?: string; display_name?: string };
};

/** All seats matching a wallet/code needle. Does not change tree data. */
export function searchTreeSeats<T extends SearchableSeat>(
  seats: T[],
  needle: string,
  extra?: { userId?: string; referralCode?: string; wallet?: string; displayName?: string },
): T[] {
  const q = needle.trim().toLowerCase();
  if (!q) return [];
  const hitUser =
    extra?.userId ||
    extra?.referralCode?.toLowerCase().includes(q) ||
    extra?.wallet?.toLowerCase().includes(q) ||
    extra?.displayName?.toLowerCase().includes(q);
  return seats.filter((n) => {
    if (hitUser && extra?.userId && n.user_id === extra.userId) return true;
    return (
      n.user_id.toLowerCase().includes(q) ||
      (n.user?.referral_code ?? "").toLowerCase().includes(q) ||
      (n.user?.display_name ?? "").toLowerCase().includes(q)
    );
  });
}
