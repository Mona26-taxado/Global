export type Node = {
  id: string;
  user_id: string;
  parent_id: string | null;
  position: "LEFT" | "RIGHT" | null;
  depth: number;
  status?: "ACTIVE" | "HISTORY" | "RESERVED";
};

/** Occupies a Global slot for allocation. ACTIVE only. RESERVED/HISTORY/intents do not occupy. */
export function occupiesSlot(node: Node) {
  return isActiveNode(node);
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

function isForestRoot(node: Node, ids: Set<string>) {
  return !node.parent_id || !ids.has(node.parent_id);
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

/**
 * Tree ROOT only: ROOT.RIGHT is locked until some ROOT.LEFT seat (ACTIVE or HISTORY)
 * has cycleComplete (ACTIVE LEFT + ACTIVE RIGHT). That is a one-time unlock for the
 * plan tree: if the old left-head later moves, do not relock. An invalid ROOT.RIGHT
 * occupant does not unlock an empty ROOT.RIGHT. Not recursive to other parents.
 */
export function rootSecondLegUnlocked(nodes: Node[], rootId: string) {
  return nodes.some(
    (n) => n.parent_id === rootId && n.position === "LEFT" && cycleComplete(nodes, n.id),
  );
}

function rootRightIsLegalHole(current: Node, nodes: Node[], ids: Set<string>) {
  if (!isForestRoot(current, ids)) return true;
  return rootSecondLegUnlocked(nodes, current.id);
}

type WalkMaps = {
  nodes: Node[];
  ids: Set<string>;
  byOcc: Map<string, { left?: Node; right?: Node }>;
  byAll: Map<string, { left?: Node; right?: Node }>;
};

/**
 * After a node’s own LEFT then RIGHT holes: entire LEFT subtree, then RIGHT subtree.
 * Not level-order BFS. Tree ROOT still gates ROOT.RIGHT via rootRightIsLegalHole.
 */
function visitPreorder<T>(
  current: Node,
  seen: Set<string>,
  maps: WalkMaps,
  onActive: (current: Node, kids: { left?: Node; right?: Node }) => T | undefined,
): T | undefined {
  if (seen.has(current.id)) return undefined;
  seen.add(current.id);
  if (occupiesSlot(current)) {
    const hit = onActive(current, maps.byOcc.get(current.id) ?? {});
    if (hit !== undefined) return hit;
  }
  const walk = maps.byAll.get(current.id) ?? {};
  if (walk.left) {
    const hit = visitPreorder(walk.left, seen, maps, onActive);
    if (hit !== undefined) return hit;
  }
  if (walk.right) {
    const hit = visitPreorder(walk.right, seen, maps, onActive);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

function walkMaps(nodes: Node[]): WalkMaps {
  return {
    nodes,
    ids: new Set(nodes.map((n) => n.id)),
    byOcc: childMap(liveNodes(nodes)),
    byAll: childMap(nodes),
  };
}

/**
 * First empty Global seat. Non-root parents: LEFT then RIGHT.
 * Tree ROOT: LEFT first; RIGHT only after one-time first-leg unlock.
 * Then left subtree before right subtree. Walk HISTORY for order only.
 * Holes attach under ACTIVE.
 */
export function findFirstEmptyPlacement(nodes: Node[], userId: string): Hole {
  const occupying = liveNodes(nodes);
  if (occupying.length === 0) {
    return { id: `pos_${userId}`, user_id: userId, parent_id: null, position: null, depth: 0 };
  }
  const maps = walkMaps(nodes);
  const roots = placementRoots(nodes);
  if (!roots.length) throw new Error("NETWORK_CORRUPT");
  const seen = new Set<string>();
  for (const root of roots) {
    const hole = visitPreorder(root, seen, maps, (current, kids) => {
      if (!kids.left) return makeHole(current, "LEFT", userId);
      if (!kids.right && rootRightIsLegalHole(current, maps.nodes, maps.ids)) {
        return makeHole(current, "RIGHT", userId);
      }
      return undefined;
    });
    if (hole) return hole;
  }
  throw new Error("NETWORK_FULL_UNEXPECTED");
}

/**
 * Occupying seats that sit after an earlier empty hole in allocator order.
 * Display-only: do not rewrite those rows if their plan payment is CONFIRMED.
 */
export function occupyingSeatsAfterEarlierHole(nodes: Node[]): Set<string> {
  const occupying = liveNodes(nodes);
  if (occupying.length === 0) return new Set();
  const maps = walkMaps(nodes);
  const roots = placementRoots(nodes);
  const seen = new Set<string>();
  const legacy = new Set<string>();
  let holeSeen = false;
  for (const root of roots) {
    visitPreorder(root, seen, maps, (current, kids) => {
      if (!kids.left) holeSeen = true;
      else if (holeSeen) legacy.add(kids.left.id);
      if (!kids.right) {
        if (rootRightIsLegalHole(current, maps.nodes, maps.ids)) holeSeen = true;
      } else if (holeSeen) legacy.add(kids.right.id);
      return undefined;
    });
  }
  return legacy;
}

export const findPlacement = findFirstEmptyPlacement;
export const findPowerlinePlacement = findFirstEmptyPlacement;
export const findReentryPlacement = findFirstEmptyPlacement;

export function bothLegsFilled(nodes: Node[], parentPositionId: string) {
  const live = liveNodes(nodes).filter((n) => n.parent_id === parentPositionId);
  return live.some((n) => n.position === "LEFT") && live.some((n) => n.position === "RIGHT");
}
