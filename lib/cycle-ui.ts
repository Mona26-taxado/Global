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
  ended_at?: string | null;
  recipient_wallet?: string | null;
  recipient_user_id?: string | null;
  reentry_tx_hash?: string | null;
  from_position_id?: string | null;
  plan_id?: string;
  user?: { id?: string; referral_code: string; display_name: string; is_demo: boolean };
};

export function parentOf(tree: NetNode[], node: NetNode | undefined) {
  if (!node?.parent_id) return null;
  return tree.find((n) => n.id === node.parent_id) ?? null;
}

export type JourneyPosition = {
  id: string;
  user_id?: string;
  parent_id?: string | null;
  parent_code?: string | null;
  position?: string | null;
  status?: "ACTIVE" | "HISTORY" | "RESERVED";
  started_at?: string;
  ended_at?: string | null;
  plan_id?: string;
  from_position_id?: string | null;
  recipient_wallet?: string | null;
  recipient_user_id?: string | null;
  reentry_tx_hash?: string | null;
};

export type JourneyPayment = {
  tx_hash?: string | null;
  recipient_wallet?: string | null;
  status?: string | null;
  payment_type?: string | null;
  amount?: string | null;
};

export type JourneyStep =
  | {
      kind: "position";
      title: string;
      row: JourneyPosition;
      payment: JourneyPayment | null;
    }
  | {
      kind: "reentry";
      title: string;
      row: JourneyPosition;
      payment: JourneyPayment | null;
    };

function statusRank(status?: string) {
  if (status === "HISTORY") return 0;
  if (status === "RESERVED") return 1;
  return 2;
}

/** Display-only: order a member’s stored seats for one plan (from_position_id chain, then started_at). */
export function chainPlanPositions(rows: JourneyPosition[]): JourneyPosition[] {
  const scoped = [...rows];
  const byId = new Map(scoped.map((r) => [r.id, r]));
  const nextByFrom = new Map<string, JourneyPosition>();
  for (const r of scoped) {
    if (r.from_position_id && byId.has(r.from_position_id)) nextByFrom.set(r.from_position_id, r);
  }
  const starts = scoped
    .filter((r) => !r.from_position_id || !byId.has(r.from_position_id))
    .sort((a, b) => {
      const t = String(a.started_at ?? "").localeCompare(String(b.started_at ?? ""));
      if (t !== 0) return t;
      return statusRank(a.status) - statusRank(b.status);
    });
  const out: JourneyPosition[] = [];
  const seen = new Set<string>();
  for (const start of starts) {
    let cur: JourneyPosition | undefined = start;
    while (cur && !seen.has(cur.id)) {
      out.push(cur);
      seen.add(cur.id);
      cur = nextByFrom.get(cur.id);
    }
  }
  for (const r of scoped.sort((a, b) => String(a.started_at ?? "").localeCompare(String(b.started_at ?? "")))) {
    if (!seen.has(r.id)) out.push(r);
  }
  return out;
}

export function matchPositionPayment(
  row: JourneyPosition,
  txs: {
    tx_hash: string;
    position_id?: string | null;
    recipient_wallet?: string;
    status?: string;
    payment_type?: string;
    amount?: string;
    plan_id?: string | null;
    plan_code?: string;
  }[],
): JourneyPayment | null {
  const byPos = txs.find((t) => t.position_id && t.position_id === row.id);
  const byHash = row.reentry_tx_hash
    ? txs.find((t) => t.tx_hash?.toLowerCase() === row.reentry_tx_hash!.toLowerCase())
    : undefined;
  const t = byPos ?? byHash;
  if (!t && !row.recipient_wallet && !row.reentry_tx_hash) return null;
  return {
    tx_hash: t?.tx_hash ?? row.reentry_tx_hash ?? null,
    recipient_wallet: t?.recipient_wallet ?? row.recipient_wallet ?? null,
    status: t?.status ?? (row.status === "RESERVED" && !row.reentry_tx_hash ? "PENDING" : null),
    payment_type: t?.payment_type ?? null,
    amount: t?.amount ?? null,
  };
}

/** Display-only journey from persisted positions. Never invents seats. */
export function buildPositionJourney(
  rows: JourneyPosition[],
  planId: string | undefined,
  txs: Parameters<typeof matchPositionPayment>[1],
): JourneyStep[] {
  const scoped = planId ? rows.filter((r) => !r.plan_id || r.plan_id === planId) : rows;
  const chained = chainPlanPositions(scoped);
  const steps: JourneyStep[] = [];
  let posN = 0;
  let reN = 0;
  for (const row of chained) {
    const payment = matchPositionPayment(row, txs);
    if (row.from_position_id || row.status === "RESERVED") {
      reN += 1;
      steps.push({ kind: "reentry", title: `Re-entry #${reN}`, row, payment });
    }
    if (row.status === "RESERVED") continue;
    posN += 1;
    steps.push({ kind: "position", title: `Position #${posN}`, row, payment });
  }
  return steps;
}

export function journeyCounts(steps: JourneyStep[]) {
  return {
    positions: steps.filter((s) => s.kind === "position").length,
    reentries: steps.filter((s) => s.kind === "reentry").length,
    previous: steps.filter((s) => s.kind === "position" && s.row.status === "HISTORY").length,
  };
}

/** Live admin-tree seats: every ACTIVE + RESERVED row, keyed by position id (same user may appear twice). */
export function liveApiSeats(tree: NetNode[]): NetNode[] {
  return tree.filter((n) => {
    const st = n.status ?? "ACTIVE";
    return st === "ACTIVE" || st === "RESERVED";
  });
}

export type ChildSlots = { left?: NetNode; right?: NetNode };

function occupyRank(n: NetNode) {
  const st = n.status ?? "ACTIVE";
  if (st === "ACTIVE" || st === "RESERVED") return 2;
  return 1;
}

/** Attach children by parent position id + LEFT/RIGHT. Live seats win over HISTORY. HISTORY does not hide ACTIVE/RESERVED. */
export function childSlotsByParent(tree: NetNode[]): Map<string, ChildSlots> {
  const ids = new Set(tree.map((n) => n.id));
  const byParent = new Map<string, ChildSlots>();
  for (const n of tree) {
    if (!n.parent_id || !ids.has(n.parent_id)) continue;
    const slot = byParent.get(n.parent_id) ?? {};
    if (n.position === "LEFT") {
      if (!slot.left || occupyRank(n) >= occupyRank(slot.left)) slot.left = n;
    } else if (n.position === "RIGHT") {
      if (!slot.right || occupyRank(n) >= occupyRank(slot.right)) slot.right = n;
    }
    byParent.set(n.parent_id, slot);
  }
  return byParent;
}

/** Roots plus any live seat that did not attach as a LEFT/RIGHT child (must still render). */
export function liveForestRoots(tree: NetNode[]): NetNode[] {
  const ids = new Set(tree.map((n) => n.id));
  const attached = new Set<string>();
  for (const slot of childSlotsByParent(tree).values()) {
    if (slot.left) attached.add(slot.left.id);
    if (slot.right) attached.add(slot.right.id);
  }
  return tree
    .filter((n) => !n.parent_id || !ids.has(n.parent_id) || !attached.has(n.id))
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
}

/** HISTORY seats behind a live node, oldest first. Uses stored from_position_id only — never invents rows. */
export function previousHistoryChain(
  live: Pick<NetNode, "id" | "from_position_id">,
  rows: JourneyPosition[],
): JourneyPosition[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const walked: JourneyPosition[] = [];
  const seen = new Set<string>();
  let id: string | null | undefined = live.from_position_id;
  while (id && !seen.has(id) && id !== live.id) {
    seen.add(id);
    const row = byId.get(id);
    if (!row) break;
    if ((row.status ?? "ACTIVE") !== "HISTORY") break;
    walked.push(row);
    id = row.from_position_id;
  }
  return walked.reverse();
}

function historyToDisplayNode(row: JourneyPosition, live: NetNode[]): NetNode {
  const mover =
    live.find((n) => n.from_position_id === row.id) ??
    live.find((n) => n.user_id && n.user_id === row.user_id);
  return {
    id: row.id,
    user_id: row.user_id ?? mover?.user_id ?? "",
    parent_id: row.parent_id ?? null,
    position: row.position ?? null,
    depth: row.parent_id ? (mover?.depth ?? 1) : 0,
    status: "HISTORY",
    started_at: row.started_at,
    ended_at: row.ended_at,
    from_position_id: row.from_position_id,
    plan_id: row.plan_id,
    user: mover?.user,
  };
}

/**
 * Live ACTIVE/RESERVED plus stored HISTORY seats that belong in the picture
 * (from_position_id chain or missing live parent). Display-only; liveApiSeats stays unchanged.
 */
export function displayForestSeats(live: NetNode[], historyRows: JourneyPosition[]): NetNode[] {
  const byId = new Map(live.map((n) => [n.id, { ...n }]));
  const needed = new Set<string>();
  for (const n of live) {
    if (n.from_position_id) needed.add(n.from_position_id);
    if (n.parent_id && !byId.has(n.parent_id)) needed.add(n.parent_id);
    for (const h of previousHistoryChain(n, historyRows)) needed.add(h.id);
  }
  for (const row of historyRows) {
    if ((row.status ?? "ACTIVE") !== "HISTORY") continue;
    if (!needed.has(row.id) || byId.has(row.id)) continue;
    byId.set(row.id, historyToDisplayNode(row, live));
  }
  return [...byId.values()];
}

