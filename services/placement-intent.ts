/**
 * Shared Global seat engine for every plan_id (catalog plans and admin-created plans).
 * PREPARE quotes only. Occupancy and cycle use ACTIVE seats. No amount or base-plan branch.
 */
import { cycleComplete, findFirstEmptyPlacement } from "@/network/placement";
import { newId } from "@/lib/store";
import type { Store as StoreShape } from "@/lib/store";
import type { NetworkPositionRow, PaymentIntentRow } from "@/types";

function positionsForPlan(positions: NetworkPositionRow[], planId: string) {
  return positions.filter((p) => p.plan_id === planId);
}

function currentPosition(positions: NetworkPositionRow[], userId: string, planId?: string) {
  return (
    positions.find(
      (p) =>
        p.user_id === userId &&
        (planId ? p.plan_id === planId : true) &&
        (p.status ?? "ACTIVE") === "ACTIVE",
    ) ?? null
  );
}

export class PlacementError extends Error {
  code: "STALE_ROUTE" | "RECIPIENT_CHANGED" | "REENTRY_NOT_REQUIRED" | "GLOBAL_UPLINE_NOT_READY" | "REENTRY_FUNDED_BY_DIRECT2" | "REENTRY_SELF_PAY" | "GLOBAL_UPLINE_WALLET_UNVERIFIED";
  constructor(code: PlacementError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function parentUserId(store: StoreShape, parentPositionId: string | null) {
  if (!parentPositionId) return null;
  return store.network_positions.find((p) => p.id === parentPositionId)?.user_id ?? null;
}

function verifiedWalletAddress(store: StoreShape, userId: string | null) {
  if (!userId) return null;
  const w = store.wallets.find((x) => x.user_id === userId && x.verified);
  return w?.address?.toLowerCase() ?? null;
}

export type SeatQuote = {
  parent_id: string | null;
  position: "LEFT" | "RIGHT" | null;
  depth: number;
  recipient_user_id: string | null;
  recipient_wallet: string | null;
};

export function firstEmptyQuote(store: StoreShape, planId: string, userId: string): SeatQuote {
  const scoped = positionsForPlan(store.network_positions, planId);
  const hole = findFirstEmptyPlacement(scoped, userId);
  const recipientUserId = parentUserId(store, hole.parent_id);
  return {
    parent_id: hole.parent_id,
    position: hole.position,
    depth: hole.depth,
    recipient_user_id: recipientUserId,
    recipient_wallet: verifiedWalletAddress(store, recipientUserId),
  };
}

function simulatedActive(
  store: StoreShape,
  planId: string,
  userId: string,
  quote: SeatQuote,
): NetworkPositionRow[] {
  const scoped = positionsForPlan(store.network_positions, planId);
  return [
    ...scoped,
    {
      id: "__sim__",
      user_id: userId,
      plan_id: planId,
      parent_id: quote.parent_id,
      position: quote.position,
      depth: quote.depth,
      cycle: Math.floor(quote.depth / 2),
      status: "ACTIVE",
      started_at: nowIso(),
    },
  ];
}

function planAmount(store: StoreShape, planId: string) {
  return store.plans.find((p) => p.id === planId)?.amount_usd ?? 0;
}

function upsertPendingIntent(store: StoreShape, patch: Omit<PaymentIntentRow, "id" | "quoted_at" | "status"> & { kind: PaymentIntentRow["kind"] }) {
  if (!store.payment_intents) store.payment_intents = [];
  const existing = store.payment_intents.find(
    (i) =>
      i.status === "PENDING" &&
      i.kind === patch.kind &&
      i.buyer_user_id === patch.buyer_user_id &&
      i.plan_id === patch.plan_id,
  );
  const quoted_at = nowIso();
  if (existing) {
    Object.assign(existing, patch, { quoted_at, status: "PENDING" as const, placement_status: null, tx_hash: null });
    return existing;
  }
  const row: PaymentIntentRow = {
    id: newId("intent"),
    status: "PENDING",
    quoted_at,
    ...patch,
  };
  store.payment_intents.push(row);
  return row;
}

export function findPendingIntent(
  store: StoreShape,
  kind: PaymentIntentRow["kind"],
  buyerId: string,
  planId: string,
): PaymentIntentRow | null {
  const list = store.payment_intents ?? [];
  return (
    [...list]
      .filter((i) => i.status === "PENDING" && i.kind === kind && i.buyer_user_id === buyerId && i.plan_id === planId)
      .sort((a, b) => b.quoted_at.localeCompare(a.quoted_at))[0] ?? null
  );
}

export function failPendingIntents(store: StoreShape, buyerId: string, planId?: string, status: "FAILED" | "CANCELLED" = "FAILED") {
  for (const row of store.payment_intents ?? []) {
    if (row.status !== "PENDING") continue;
    if (row.buyer_user_id !== buyerId) continue;
    if (planId && row.plan_id !== planId) continue;
    row.status = status;
  }
}

/** Expire one unpaid quote. No-op unless PENDING and tx_hash is empty. Does not touch seats or txs. */
export function expireUnpaidPendingIntent(store: StoreShape, intentId: string) {
  const row = (store.payment_intents ?? []).find((i) => i.id === intentId);
  if (!row || row.status !== "PENDING" || row.tx_hash) return false;
  row.status = "STALE_ROUTE";
  row.placement_status = "BLOCKED_STALE_ROUTE";
  return true;
}

function payeeWallet(intent: PaymentIntentRow) {
  return (intent.movement_recipient_wallet ?? intent.candidate_recipient_wallet)?.toLowerCase() ?? null;
}

function requireWallet(addr: string | null, message: string): `0x${string}` {
  if (!addr) throw new PlacementError("GLOBAL_UPLINE_NOT_READY", message);
  return addr as `0x${string}`;
}

/** Direct #2 PREPARE: quote only. Zero network_position rows. */
export function quoteDirect2InStore(
  store: StoreShape,
  sponsorId: string,
  planId: string,
  buyerId: string,
): PaymentIntentRow {
  const existing = currentPosition(store.network_positions, sponsorId, planId);
  if (existing) {
    const recipientUserId = parentUserId(store, existing.parent_id);
    const recipientWallet = verifiedWalletAddress(store, recipientUserId);
    return upsertPendingIntent(store, {
      kind: "DIRECT2_PLACEMENT",
      buyer_user_id: buyerId,
      mover_user_id: sponsorId,
      plan_id: planId,
      amount_usd: planAmount(store, planId),
      candidate_parent_position_id: existing.parent_id,
      candidate_position: existing.position,
      candidate_depth: existing.depth,
      candidate_recipient_user_id: recipientUserId,
      candidate_recipient_wallet: recipientWallet,
      skip_placement: true,
    });
  }

  const entry = firstEmptyQuote(store, planId, sponsorId);
  if (!entry.parent_id || !entry.recipient_user_id || !entry.recipient_wallet) {
    throw new PlacementError(
      "GLOBAL_UPLINE_NOT_READY",
      "Waiting for Global placement. Direct #2 cannot pay until your sponsor has a Global upline. Nothing is held in escrow.",
    );
  }

  let movement: Partial<PaymentIntentRow> = {};
  const parentPos = store.network_positions.find((p) => p.id === entry.parent_id);
  if (parentPos && (parentPos.status ?? "ACTIVE") === "ACTIVE") {
    const sim = simulatedActive(store, planId, sponsorId, entry);
    if (cycleComplete(sim, parentPos.id)) {
      const simStore = { ...store, network_positions: sim };
      const next = firstEmptyQuote(simStore, planId, parentPos.user_id);
      if (next.parent_id && next.recipient_wallet) {
        movement = {
          movement_user_id: parentPos.user_id,
          movement_from_position_id: parentPos.id,
          movement_parent_position_id: next.parent_id,
          movement_position: next.position,
          movement_depth: next.depth,
          movement_recipient_user_id: next.recipient_user_id,
          movement_recipient_wallet: next.recipient_wallet,
        };
      }
    }
  }

  return upsertPendingIntent(store, {
    kind: "DIRECT2_PLACEMENT",
    buyer_user_id: buyerId,
    mover_user_id: sponsorId,
    plan_id: planId,
    amount_usd: planAmount(store, planId),
    candidate_parent_position_id: entry.parent_id,
    candidate_position: entry.position,
    candidate_depth: entry.depth,
    candidate_recipient_user_id: movement.movement_recipient_user_id ?? entry.recipient_user_id,
    candidate_recipient_wallet: movement.movement_recipient_wallet ?? entry.recipient_wallet,
    skip_placement: false,
    ...movement,
  });
}

function insertActiveExact(
  store: StoreShape,
  userId: string,
  planId: string,
  quote: { parent_id: string | null; position: "LEFT" | "RIGHT" | null; depth: number },
  extra: Partial<NetworkPositionRow> = {},
): NetworkPositionRow {
  const row: NetworkPositionRow = {
    id: newId("pos"),
    user_id: userId,
    plan_id: planId,
    parent_id: quote.parent_id,
    position: quote.position,
    depth: quote.depth,
    cycle: Math.floor(quote.depth / 2),
    status: "ACTIVE",
    started_at: nowIso(),
    ended_at: null,
    from_position_id: extra.from_position_id ?? null,
    recipient_user_id: extra.recipient_user_id ?? null,
    recipient_wallet: extra.recipient_wallet ?? null,
    reentry_tx_hash: extra.reentry_tx_hash ?? null,
    funded_by_user_id: extra.funded_by_user_id ?? null,
  };
  store.network_positions.push(row);
  return row;
}

function insertActiveAt(
  store: StoreShape,
  userId: string,
  planId: string,
  quote: { parent_id: string | null; position: "LEFT" | "RIGHT" | null; depth: number },
  extra: Partial<NetworkPositionRow> = {},
): NetworkPositionRow {
  const current = firstEmptyQuote(store, planId, userId);
  if (current.parent_id !== quote.parent_id || current.position !== quote.position) {
    throw new PlacementError(
      "STALE_ROUTE",
      "This Global seat is no longer the first empty. Placement is blocked. Prepare a new payment route.",
    );
  }
  return insertActiveExact(store, userId, planId, quote, extra);
}

function markIntentStale(intent: PaymentIntentRow, code: "STALE_ROUTE" | "RECIPIENT_CHANGED") {
  intent.status = "STALE_ROUTE";
  intent.placement_status = code === "RECIPIENT_CHANGED" ? "RECIPIENT_CHANGED" : "BLOCKED_STALE_ROUTE";
}

function sameSeat(
  quotedParent: string | null | undefined,
  quotedPos: "LEFT" | "RIGHT" | null | undefined,
  current: SeatQuote,
) {
  return quotedParent === current.parent_id && quotedPos === current.position;
}

function walletsEqual(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

/** After chain verify: atomic first-empty check, then ACTIVE only. */
export function confirmDirect2FromIntent(
  store: StoreShape,
  buyerId: string,
  planId: string,
  txHash: string,
  onChainRecipient: string,
): { placed: NetworkPositionRow | null; intent: PaymentIntentRow } {
  const intent = findPendingIntent(store, "DIRECT2_PLACEMENT", buyerId, planId);
  if (!intent) {
    throw new PlacementError("STALE_ROUTE", "No pending Direct #2 placement quote. Prepare a new payment route.");
  }
  intent.tx_hash = txHash;
  const quotedPayee = payeeWallet(intent);
  if (!walletsEqual(quotedPayee, onChainRecipient)) {
    markIntentStale(intent, "RECIPIENT_CHANGED");
    throw new PlacementError(
      "RECIPIENT_CHANGED",
      "On-chain recipient does not match the quoted Global upline. No Global seat was created.",
    );
  }

  if (intent.skip_placement) {
    intent.status = "CONFIRMED";
    intent.placement_status = "OK";
    return { placed: currentPosition(store.network_positions, intent.mover_user_id, planId), intent };
  }

  const entryNow = firstEmptyQuote(store, planId, intent.mover_user_id);
  if (!sameSeat(intent.candidate_parent_position_id, intent.candidate_position, entryNow)) {
    markIntentStale(intent, "STALE_ROUTE");
    throw new PlacementError(
      "STALE_ROUTE",
      "This Global seat is no longer the first empty. Placement is blocked. Prepare a new payment route.",
    );
  }

  const quotedEntryPayee = intent.movement_recipient_wallet
    ? intent.candidate_recipient_wallet
    : intent.candidate_recipient_wallet;
  if (!intent.movement_parent_position_id && !walletsEqual(entryNow.recipient_wallet, quotedEntryPayee)) {
    markIntentStale(intent, "RECIPIENT_CHANGED");
    throw new PlacementError(
      "RECIPIENT_CHANGED",
      "The Global upline for this seat changed. No Global seat was created. Prepare a new payment route.",
    );
  }

  let movementNow: SeatQuote | null = null;
  if (intent.movement_parent_position_id) {
    const simStore = {
      ...store,
      network_positions: simulatedActive(store, planId, intent.mover_user_id, {
        parent_id: intent.candidate_parent_position_id,
        position: intent.candidate_position,
        depth: intent.candidate_depth,
        recipient_user_id: entryNow.recipient_user_id,
        recipient_wallet: entryNow.recipient_wallet,
      }),
    };
    const moveNow = firstEmptyQuote(simStore, planId, intent.movement_user_id!);
    if (!sameSeat(intent.movement_parent_position_id, intent.movement_position ?? null, moveNow)) {
      markIntentStale(intent, "STALE_ROUTE");
      throw new PlacementError(
        "STALE_ROUTE",
        "The cycle-movement seat changed. No Global seat was created. Prepare a new payment route.",
      );
    }
    if (!walletsEqual(moveNow.recipient_wallet, intent.movement_recipient_wallet)) {
      markIntentStale(intent, "RECIPIENT_CHANGED");
      throw new PlacementError(
        "RECIPIENT_CHANGED",
        "The cycle-movement upline changed. No Global seat was created. Prepare a new payment route.",
      );
    }
    movementNow = moveNow;
  }

  const placed = insertActiveAt(store, intent.mover_user_id, planId, {
    parent_id: intent.candidate_parent_position_id,
    position: intent.candidate_position,
    depth: intent.candidate_depth,
  }, { funded_by_user_id: buyerId });

  let moved: NetworkPositionRow | null = null;
  if (intent.movement_user_id && intent.movement_from_position_id && intent.movement_parent_position_id && movementNow) {
    const old = store.network_positions.find((p) => p.id === intent.movement_from_position_id);
    if (old && (old.status ?? "ACTIVE") === "ACTIVE") {
      old.status = "HISTORY";
      old.ended_at = nowIso();
    }
    moved = insertActiveExact(
      store,
      intent.movement_user_id,
      planId,
      {
        parent_id: movementNow.parent_id,
        position: movementNow.position,
        depth: movementNow.depth,
      },
      {
        from_position_id: intent.movement_from_position_id,
        recipient_user_id: intent.movement_recipient_user_id,
        recipient_wallet: intent.movement_recipient_wallet,
        reentry_tx_hash: txHash,
        funded_by_user_id: buyerId,
      },
    );
  }

  intent.status = "CONFIRMED";
  intent.placement_status = "OK";
  afterActiveSeatCreated(store, placed);
  if (moved) afterActiveSeatCreated(store, moved);
  return { placed, intent };
}

function cycleAlreadyFunded(store: StoreShape, planId: string, fromPositionId: string) {
  return (store.payment_intents ?? []).some(
    (i) =>
      i.plan_id === planId &&
      i.movement_from_position_id === fromPositionId &&
      (i.status === "CONFIRMED" || (i.status === "PENDING" && i.kind === "DIRECT2_PLACEMENT")),
  );
}

/** After any ACTIVE child insert (never PREPARE). Quotes re-entry for newly completed ancestors. */
export function afterActiveSeatCreated(store: StoreShape, child: NetworkPositionRow) {
  maybeQueueAncestorReentryIntents(store, child);
}

export function maybeQueueAncestorReentryIntents(store: StoreShape, child: NetworkPositionRow) {
  let parentId = child.parent_id;
  while (parentId) {
    const parentPos = store.network_positions.find((p) => p.id === parentId);
    if (!parentPos) return;
    if ((parentPos.status ?? "ACTIVE") === "ACTIVE") {
      const scoped = positionsForPlan(store.network_positions, child.plan_id);
      if (cycleComplete(scoped, parentPos.id) && !cycleAlreadyFunded(store, child.plan_id, parentPos.id)) {
        try {
          quoteReentryInStore(store, parentPos.user_id, child.plan_id);
        } catch {
          /* upline wallet missing: eligibility still via cycleComplete */
        }
      }
    }
    parentId = parentPos.parent_id;
  }
}

/** Backfill: every ACTIVE seat whose immediate LEFT+RIGHT are ACTIVE gets one pending quote. */
export function syncReentryQuotesForCompletedCycles(store: StoreShape, planId?: string) {
  const planIds = planId
    ? [planId]
    : [...new Set(store.network_positions.map((p) => p.plan_id))];
  for (const pid of planIds) {
    const scoped = positionsForPlan(store.network_positions, pid);
    for (const seat of scoped) {
      if ((seat.status ?? "ACTIVE") !== "ACTIVE") continue;
      if (!cycleComplete(scoped, seat.id)) continue;
      if (cycleAlreadyFunded(store, pid, seat.id)) continue;
      try {
        quoteReentryInStore(store, seat.user_id, pid);
      } catch {
        /* same as ancestor queue */
      }
    }
  }
}

export function quoteReentryInStore(store: StoreShape, userId: string, planId: string): PaymentIntentRow {
  const current = currentPosition(store.network_positions, userId, planId);
  if (!current) {
    throw new PlacementError("REENTRY_NOT_REQUIRED", "Global re-entry is not available.");
  }
  const scoped = positionsForPlan(store.network_positions, planId);
  if (!cycleComplete(scoped, current.id)) {
    throw new PlacementError(
      "REENTRY_NOT_REQUIRED",
      "This member has not completed both Global legs, so re-entry payment is not required.",
    );
  }
  const funded = cycleAlreadyFunded(store, planId, current.id);
  if (funded) {
    throw new PlacementError(
      "REENTRY_FUNDED_BY_DIRECT2",
      "This cycle is funded by the Direct #2 plan payment that completed it. A separate re-entry payment is not required.",
    );
  }
  const next = firstEmptyQuote(store, planId, userId);
  if (next.recipient_user_id === userId) {
    throw new PlacementError(
      "REENTRY_SELF_PAY",
      "Re-entry cannot pay the moving member. Recipient must be the new Global parent’s verified wallet.",
    );
  }
  if (!next.recipient_wallet) {
    throw new PlacementError(
      "GLOBAL_UPLINE_WALLET_UNVERIFIED",
      "New Global upline wallet is not verified. Re-entry pay is blocked. Funds are not sent to the company as a substitute.",
    );
  }
  if (!next.parent_id || !next.recipient_user_id) {
    throw new PlacementError(
      "GLOBAL_UPLINE_NOT_READY",
      "Re-entry is quoted but the new Global parent is not ready. Pay is blocked. Funds are not held by GLOBAL X.",
    );
  }
  return upsertPendingIntent(store, {
    kind: "GLOBAL_REENTRY",
    buyer_user_id: userId,
    mover_user_id: userId,
    plan_id: planId,
    amount_usd: planAmount(store, planId),
    candidate_parent_position_id: next.parent_id,
    candidate_position: next.position,
    candidate_depth: next.depth,
    candidate_recipient_user_id: next.recipient_user_id,
    candidate_recipient_wallet: next.recipient_wallet,
    movement_from_position_id: current.id,
  });
}

export function confirmReentryFromIntent(
  store: StoreShape,
  userId: string,
  planId: string,
  txHash: string,
  onChainRecipient: string,
): NetworkPositionRow {
  const intent = findPendingIntent(store, "GLOBAL_REENTRY", userId, planId);
  if (!intent) {
    throw new PlacementError("STALE_ROUTE", "No pending re-entry quote. Prepare a new payment route.");
  }
  intent.tx_hash = txHash;
  if (intent.candidate_recipient_user_id === userId) {
    markIntentStale(intent, "RECIPIENT_CHANGED");
    throw new PlacementError(
      "REENTRY_SELF_PAY",
      "Re-entry cannot pay the moving member. Recipient must be the new Global parent’s verified wallet.",
    );
  }
  if (!walletsEqual(intent.candidate_recipient_wallet, onChainRecipient)) {
    markIntentStale(intent, "RECIPIENT_CHANGED");
    throw new PlacementError(
      "RECIPIENT_CHANGED",
      "On-chain recipient does not match the quoted Global upline. No Global seat was created.",
    );
  }
  const now = firstEmptyQuote(store, planId, userId);
  if (!sameSeat(intent.candidate_parent_position_id, intent.candidate_position, now)) {
    markIntentStale(intent, "STALE_ROUTE");
    throw new PlacementError(
      "STALE_ROUTE",
      "This Global seat is no longer the first empty. Placement is blocked. Prepare a new payment route.",
    );
  }
  if (!walletsEqual(now.recipient_wallet, intent.candidate_recipient_wallet)) {
    markIntentStale(intent, "RECIPIENT_CHANGED");
    throw new PlacementError(
      "RECIPIENT_CHANGED",
      "The Global upline for this seat changed. No Global seat was created. Prepare a new payment route.",
    );
  }
  const fromId = intent.movement_from_position_id ?? currentPosition(store.network_positions, userId, planId)?.id;
  const old = fromId ? store.network_positions.find((p) => p.id === fromId) : null;
  if (old && (old.status ?? "ACTIVE") === "ACTIVE") {
    old.status = "HISTORY";
    old.ended_at = nowIso();
  }
  const placed = insertActiveExact(
    store,
    userId,
    planId,
    {
      parent_id: intent.candidate_parent_position_id,
      position: intent.candidate_position,
      depth: intent.candidate_depth,
    },
    {
      from_position_id: fromId ?? null,
      recipient_user_id: intent.candidate_recipient_user_id,
      recipient_wallet: intent.candidate_recipient_wallet,
      reentry_tx_hash: txHash,
    },
  );
  intent.status = "CONFIRMED";
  intent.placement_status = "OK";
  afterActiveSeatCreated(store, placed);
  return placed;
}

export function pendingPlacementsForPlan(store: StoreShape, planId: string): PaymentIntentRow[] {
  return (store.payment_intents ?? []).filter((i) => i.status === "PENDING" && i.plan_id === planId);
}

export function intentPayee(intent: PaymentIntentRow): `0x${string}` {
  return requireWallet(
    payeeWallet(intent),
    "Global upline wallet is not verified. Pay is blocked. Funds are not held by GLOBAL X.",
  );
}
