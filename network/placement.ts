export type Node = {
  id: string;
  user_id: string;
  parent_id: string | null;
  position: "LEFT" | "RIGHT" | null;
  depth: number;
  status?: "ACTIVE" | "HISTORY" | "RESERVED";
};

/** Occupies a Global slot for placement (current seat or unpaid reserved re-entry). */
export function occupiesSlot(node: Node) {
  const status = node.status ?? "ACTIVE";
  return status === "ACTIVE" || status === "RESERVED";
}

export function isActiveNode(node: Node) {
  return (node.status ?? "ACTIVE") === "ACTIVE";
}

export function liveNodes<T extends Node>(nodes: T[]): T[] {
  return nodes.filter(occupiesSlot);
}

/** Forest roots: no parent, or parent is not in the live set (historical parent). Prefer LEFT at the same depth. */
export function placementRoots(nodes: Node[]): Node[] {
  const ids = new Set(nodes.map((n) => n.id));
  const roots = nodes.filter((n) => !n.parent_id || !ids.has(n.parent_id));
  return roots.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    if (a.position === "LEFT" && b.position !== "LEFT") return -1;
    if (b.position === "LEFT" && a.position !== "LEFT") return 1;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Deterministic next-open Global seat.
 * Breadth-first / level-order: at each node LEFT then RIGHT, then the next level
 * (LEFT child before RIGHT child). ACTIVE and RESERVED seats occupy slots.
 */
export function findPlacement(nodes: Node[], userId: string): Omit<Node, "user_id"> & { user_id: string } {
  const live = liveNodes(nodes);
  if (live.length === 0) {
    return { id: `pos_${userId}`, user_id: userId, parent_id: null, position: null, depth: 0 };
  }
  const byParent = new Map<string, { left?: Node; right?: Node }>();
  for (const node of live) {
    if (!node.parent_id) continue;
    const slot = byParent.get(node.parent_id) ?? {};
    if (node.position === "LEFT") slot.left = node;
    if (node.position === "RIGHT") slot.right = node;
    byParent.set(node.parent_id, slot);
  }

  const hole = (
    current: Node,
    position: "LEFT" | "RIGHT",
  ): Omit<Node, "user_id"> & { user_id: string } => ({
    id: `pos_${userId}`,
    user_id: userId,
    parent_id: current.id,
    position,
    depth: current.depth + 1,
  });

  const roots = placementRoots(live);
  if (!roots.length) throw new Error("NETWORK_CORRUPT");
  const queue = [...roots];
  while (queue.length) {
    const current = queue.shift()!;
    const kids = byParent.get(current.id) ?? {};
    if (!kids.left) return hole(current, "LEFT");
    if (!kids.right) return hole(current, "RIGHT");
    queue.push(kids.left, kids.right);
  }
  throw new Error("NETWORK_FULL_UNEXPECTED");
}

export function bothLegsFilled(nodes: Node[], parentPositionId: string) {
  const live = liveNodes(nodes).filter((n) => n.parent_id === parentPositionId);
  return live.some((n) => n.position === "LEFT") && live.some((n) => n.position === "RIGHT");
}
