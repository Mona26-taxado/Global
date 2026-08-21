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

/** Left-descending DFS / powerline: never fill RIGHT until the LEFT subtree has no hole. */
function searchPowerline(current: Node, byParent: Map<string, { left?: Node; right?: Node }>, userId: string): Hole | null {
  const kids = byParent.get(current.id) ?? {};
  if (!kids.left) return makeHole(current, "LEFT", userId);
  const downLeft = searchPowerline(kids.left, byParent, userId);
  if (downLeft) return downLeft;
  if (!kids.right) return makeHole(current, "RIGHT", userId);
  return searchPowerline(kids.right, byParent, userId);
}

/**
 * Next-open Global seat for a newly qualified member.
 * Left-descending DFS (powerline): LEFT first, then the LEFT subtree, then RIGHT.
 * ACTIVE and RESERVED occupy slots. HISTORY does not.
 */
export function findPlacement(nodes: Node[], userId: string): Hole {
  const live = liveNodes(nodes);
  if (live.length === 0) {
    return { id: `pos_${userId}`, user_id: userId, parent_id: null, position: null, depth: 0 };
  }
  const byParent = childMap(live);
  const roots = placementRoots(live);
  if (!roots.length) throw new Error("NETWORK_CORRUPT");
  for (const root of roots) {
    const hole = searchPowerline(root, byParent, userId);
    if (hole) return hole;
  }
  throw new Error("NETWORK_FULL_UNEXPECTED");
}

/**
 * Re-entry hole under the completing seat's LEFT/first child:
 * fill that child's LEFT, then its RIGHT, then powerline in its subtrees.
 */
export function findReentryPlacement(nodes: Node[], frontlineId: string, userId: string): Hole {
  const live = liveNodes(nodes);
  const front = live.find((n) => n.id === frontlineId);
  if (!front) throw new Error("REENTRY_FRONTLINE_MISSING");
  const byParent = childMap(live);
  const kids = byParent.get(front.id) ?? {};
  if (!kids.left) return makeHole(front, "LEFT", userId);
  if (!kids.right) return makeHole(front, "RIGHT", userId);
  return searchPowerline(kids.left, byParent, userId) ?? searchPowerline(kids.right, byParent, userId) ?? makeHole(front, "LEFT", userId);
}

export function bothLegsFilled(nodes: Node[], parentPositionId: string) {
  const live = liveNodes(nodes).filter((n) => n.parent_id === parentPositionId);
  return live.some((n) => n.position === "LEFT") && live.some((n) => n.position === "RIGHT");
}

function activeChild(nodes: Node[], parentId: string, side: "LEFT" | "RIGHT") {
  return nodes.find(
    (n) => n.parent_id === parentId && n.position === side && isActiveNode(n),
  );
}

/**
 * Powerline 2-person cycle:
 * ACTIVE LEFT + ACTIVE LEFT.LEFT (two on the frontline), or
 * ACTIVE LEFT + ACTIVE RIGHT (after rotation sits on the first child's RIGHT).
 * RESERVED does not complete a cycle, so unpaid re-entry cannot fire the next rotation.
 */
export function cycleComplete(nodes: Node[], parentPositionId: string) {
  const left = activeChild(nodes, parentPositionId, "LEFT");
  const right = activeChild(nodes, parentPositionId, "RIGHT");
  if (left && right) return true;
  if (left && activeChild(nodes, left.id, "LEFT")) return true;
  return false;
}
