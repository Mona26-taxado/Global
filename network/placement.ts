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

function childMap(live: Node[]) {
  const byParent = new Map<string, { left?: Node; right?: Node }>();
  for (const node of live) {
    if (!node.parent_id) continue;
    const slot = byParent.get(node.parent_id) ?? {};
    if (node.position === "LEFT") slot.left = node;
    if (node.position === "RIGHT") slot.right = node;
    byParent.set(node.parent_id, slot);
  }
  return byParent;
}

type Hole = Omit<Node, "user_id"> & { user_id: string };

function makeHole(current: Node, position: "LEFT" | "RIGHT", userId: string): Hole {
  return {
    id: `pos_${userId}`,
    user_id: userId,
    parent_id: current.id,
    position,
    depth: current.depth + 1,
  };
}

/**
 * First empty Global seat: top → bottom, LEFT before RIGHT.
 * Max 2 children per position. ACTIVE + RESERVED occupy; HISTORY does not.
 * Used for Direct #2 first entry and paid re-entry.
 */
export function findFirstEmptyPlacement(nodes: Node[], userId: string): Hole {
  const live = liveNodes(nodes);
  if (live.length === 0) {
    return { id: `pos_${userId}`, user_id: userId, parent_id: null, position: null, depth: 0 };
  }
  const byParent = childMap(live);
  const roots = placementRoots(live);
  if (!roots.length) throw new Error("NETWORK_CORRUPT");
  const queue = [...roots];
  while (queue.length) {
    const current = queue.shift()!;
    const kids = byParent.get(current.id) ?? {};
    if (!kids.left) return makeHole(current, "LEFT", userId);
    if (!kids.right) return makeHole(current, "RIGHT", userId);
    queue.push(kids.left, kids.right);
  }
  throw new Error("NETWORK_FULL_UNEXPECTED");
}

export const findPlacement = findFirstEmptyPlacement;
export const findPowerlinePlacement = findFirstEmptyPlacement;
export const findReentryPlacement = findFirstEmptyPlacement;

export function bothLegsFilled(nodes: Node[], parentPositionId: string) {
  const live = liveNodes(nodes).filter((n) => n.parent_id === parentPositionId);
  return live.some((n) => n.position === "LEFT") && live.some((n) => n.position === "RIGHT");
}

function activeChild(nodes: Node[], parentId: string, side: "LEFT" | "RIGHT") {
  return nodes.find(
    (n) => n.parent_id === parentId && n.position === side && isActiveNode(n),
  );
}

/** Cycle complete when the current seat has ACTIVE LEFT and ACTIVE RIGHT. RESERVED does not count. */
export function cycleComplete(nodes: Node[], parentPositionId: string) {
  return Boolean(activeChild(nodes, parentPositionId, "LEFT") && activeChild(nodes, parentPositionId, "RIGHT"));
}
