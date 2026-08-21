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

export const GHOST_W = 92;
export const GHOST_H = 72;
const GHOST_GAP = 48;

export type GhostHistorySpot = {
  id: string;
  index: number;
  x: number;
  y: number;
  row: JourneyPosition;
};

/**
 * Overlay coordinates for HISTORY seats of one selected member.
 * Display-only: does not occupy live LEFT/RIGHT slots.
 */
export function layoutGhostHistory(
  rows: JourneyPosition[],
  selected: { x: number; y: number } | null,
): GhostHistorySpot[] {
  if (!selected) return [];
  const history = rows
    .filter((r) => r.status === "HISTORY")
    .sort((a, b) => String(a.started_at ?? "").localeCompare(String(b.started_at ?? "")));
  const n = history.length;
  return history.map((row, i) => ({
    id: row.id,
    index: i + 1,
    row,
    x: selected.x - (n - i) * (GHOST_W + GHOST_GAP),
    y: row.parent_id ? selected.y + 20 : Math.max(12, selected.y - 8),
  }));
}


