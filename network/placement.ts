export type Node = {
  id: string;
  user_id: string;
  parent_id: string | null;
  position: "LEFT" | "RIGHT" | null;
  depth: number;
};

export function findPlacement(nodes: Node[], userId: string): Omit<Node, "user_id"> & { user_id: string } {
  if (nodes.length === 0) {
    return { id: `pos_${userId}`, user_id: userId, parent_id: null, position: null, depth: 0 };
  }
  const root = nodes.find((n) => n.parent_id === null);
  if (!root) throw new Error("NETWORK_CORRUPT");
  const byParent = new Map<string, { left?: Node; right?: Node }>();
  for (const node of nodes) {
    if (!node.parent_id) continue;
    const slot = byParent.get(node.parent_id) ?? {};
    if (node.position === "LEFT") slot.left = node;
    if (node.position === "RIGHT") slot.right = node;
    byParent.set(node.parent_id, slot);
  }
  const queue = [root];
  while (queue.length) {
    const current = queue.shift()!;
    const kids = byParent.get(current.id) ?? {};
    if (!kids.left) {
      return { id: `pos_${userId}`, user_id: userId, parent_id: current.id, position: "LEFT", depth: current.depth + 1 };
    }
    if (!kids.right) {
      return { id: `pos_${userId}`, user_id: userId, parent_id: current.id, position: "RIGHT", depth: current.depth + 1 };
    }
    queue.push(kids.left, kids.right);
  }
  throw new Error("NETWORK_FULL_UNEXPECTED");
}
