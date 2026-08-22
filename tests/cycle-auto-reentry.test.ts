import { describe, expect, it } from "vitest";
import type { Store } from "../lib/store";
import { cycleComplete, findFirstEmptyPlacement, isActiveNode } from "../network/placement";
import {
  afterActiveSeatCreated,
  confirmDirect2FromIntent,
  confirmReentryFromIntent,
  firstEmptyQuote,
  intentPayee,
  quoteDirect2InStore,
  quoteReentryInStore,
  syncReentryQuotesForCompletedCycles,
} from "../services/placement-intent";
import { applyGenesisReconciliation } from "../services/genesis-reconciliation";
import { DEFAULT_GENESIS_WALLET } from "../lib/network-config";
import { occupyingPosition, placeUserInStore, UNPAID_ACTIVE_INSERT_BLOCKED } from "../services/users";
import type { NetworkPositionRow } from "../types";

const PLANS = ["PLAN_100", "PLAN_200", "PLAN_500", "PLAN_1000", "PLAN_SYNTH"] as const;

function pos(
  plan: string,
  id: string,
  user_id: string,
  parent_id: string | null,
  position: "LEFT" | "RIGHT" | null,
  depth: number,
  status: NetworkPositionRow["status"] = "ACTIVE",
): NetworkPositionRow {
  return {
    id: `${plan}-${id}`,
    user_id,
    plan_id: plan,
    parent_id: parent_id ? `${plan}-${parent_id}` : null,
    position,
    depth,
    cycle: Math.floor(depth / 2),
    status,
    started_at: "2026-08-22T12:00:00.000Z",
  };
}

function wallet(id: string, user: string, address: string) {
  return {
    id,
    user_id: user,
    address,
    wallet_type: "injected" as const,
    chain_id: 137,
    verified: true,
    created_at: "2026-08-22T12:00:00.000Z",
  };
}

function user(id: string, code: string) {
  return {
    id,
    referral_code: code,
    sponsor_id: null,
    is_demo: false,
    display_name: id,
    created_at: "2026-08-22T12:00:00.000Z",
  };
}

function storeFor(positions: NetworkPositionRow[]): Store {
  return {
    payment_intents: [],
    network_positions: positions,
    wallets: [
      wallet("w-g", "u-genesis", DEFAULT_GENESIS_WALLET),
      wallet("w-a", "u-a", "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
      wallet("w-l", "u-left", "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
      wallet("w-r", "u-right", "0xcccccccccccccccccccccccccccccccccccccccc"),
      wallet("w-n", "u-new", "0xdddddddddddddddddddddddddddddddddddddddd"),
    ],
    users: [
      user("u-genesis", "GXGLOBAL"),
      user("u-a", "GXAAAAAA"),
      user("u-left", "GXLEFTAA"),
      user("u-right", "GXRIGHTA"),
      user("u-new", "GXNEWAAA"),
    ],
    plans: PLANS.map((id, i) => ({
      id,
      code: id,
      name: id,
      amount_usd: id === "PLAN_SYNTH" ? 777 : Number(id.replace("PLAN_", "")) || 100,
      token: "USDT",
      network: "mainnet",
      description: "",
      active: true,
      enabled: true,
      sort_order: i + 1,
      created_at: "2026-08-22T12:00:00.000Z",
      updated_at: "2026-08-22T12:00:00.000Z",
    })),
    referrals: [],
    transactions: [],
  } as unknown as Store;
}

function pendingReentry(store: Store, userId: string, plan: string) {
  return (store.payment_intents ?? []).filter(
    (i) => i.kind === "GLOBAL_REENTRY" && i.status === "PENDING" && i.mover_user_id === userId && i.plan_id === plan,
  );
}

describe("auto-queue re-entry when a cycle completes", () => {
  it.each(PLANS)("%s: LEFT+RIGHT ACTIVE queues exactly one pending quote; second run does not duplicate", (plan) => {
    const store = storeFor([
      pos(plan, "root", "u-a", null, null, 0),
      pos(plan, "left", "u-left", "root", "LEFT", 1),
    ]);
    const right = pos(plan, "right", "u-right", "root", "RIGHT", 1);
    store.network_positions.push(right);
    const beforeSeats = JSON.stringify(store.network_positions);
    afterActiveSeatCreated(store, right);
    expect(cycleComplete(store.network_positions.filter((p) => p.plan_id === plan), `${plan}-root`)).toBe(true);
    expect(pendingReentry(store, "u-a", plan)).toHaveLength(1);
    const intent = pendingReentry(store, "u-a", plan)[0]!;
    const hole = findFirstEmptyPlacement(
      store.network_positions.filter((p) => p.plan_id === plan),
      "u-a",
    );
    expect(intent.candidate_parent_position_id).toBe(hole.parent_id);
    expect(intent.candidate_position).toBe(hole.position);
    expect(JSON.stringify(store.network_positions)).toBe(beforeSeats);

    afterActiveSeatCreated(store, right);
    syncReentryQuotesForCompletedCycles(store, plan);
    expect(pendingReentry(store, "u-a", plan)).toHaveLength(1);
    expect(JSON.stringify(store.network_positions)).toBe(beforeSeats);
  });

  it.each(PLANS)("%s: unpaid quote does not occupy; confirm moves ACTIVE", (plan) => {
    const store = storeFor([
      pos(plan, "root", "u-a", null, null, 0),
      pos(plan, "left", "u-left", "root", "LEFT", 1),
      pos(plan, "right", "u-right", "root", "RIGHT", 1),
    ]);
    afterActiveSeatCreated(store, store.network_positions[2]!);
    const intent = pendingReentry(store, "u-a", plan)[0]!;
    const quote = firstEmptyQuote(store, plan, "u-a");
    expect(intent.candidate_parent_position_id).toBe(quote.parent_id);
    expect(store.network_positions.filter((p) => p.user_id === "u-a" && p.plan_id === plan && (p.status ?? "ACTIVE") === "ACTIVE")).toHaveLength(1);

    const placed = confirmReentryFromIntent(store, "u-a", plan, `0xre-${plan}`, intent.candidate_recipient_wallet!);
    expect(store.network_positions.find((p) => p.id === `${plan}-root`)?.status).toBe("HISTORY");
    expect(placed.status).toBe("ACTIVE");
    expect(placed.parent_id).toBe(intent.candidate_parent_position_id);
    expect(placed.position).toBe(intent.candidate_position);
    expect(pendingReentry(store, "u-a", plan)).toHaveLength(0);
  });

  it.each(PLANS)(
    "%s: X.LEFT ACTIVE + Direct #2 CONFIRM at X.RIGHT moves X on that payment; no GLOBAL_REENTRY",
    (plan) => {
      const store = storeFor([
        pos(plan, "root", "u-a", null, null, 0),
        pos(plan, "x", "u-x", "root", "LEFT", 1),
        pos(plan, "xleft", "u-xl", "x", "LEFT", 2),
      ]);
      store.users.push(user("u-x", "GXXXXXXX"), user("u-xl", "GXXLEFTX"), user("u-sp", "GXSPONXX"), user("u-by", "GXBUYERX"));
      store.wallets.push(
        wallet("w-x", "u-x", "0x1111111111111111111111111111111111111111"),
        wallet("w-xl", "u-xl", "0x2222222222222222222222222222222222222222"),
        wallet("w-sp", "u-sp", "0x3333333333333333333333333333333333333333"),
      );
      const scoped = () => store.network_positions.filter((p) => p.plan_id === plan);
      const xOld = `${plan}-x`;
      expect(store.network_positions.find((p) => p.id === `${plan}-xleft`)?.parent_id).toBe(xOld);
      expect(store.network_positions.find((p) => p.id === `${plan}-xleft`)?.position).toBe("LEFT");
      expect(cycleComplete(scoped(), xOld)).toBe(false);

      const hole = firstEmptyQuote(store, plan, "u-sp");
      expect(hole.parent_id).toBe(xOld);
      expect(hole.position).toBe("RIGHT");

      const beforeSeats = store.network_positions.length;
      const quoted = quoteDirect2InStore(store, "u-sp", plan, "u-by");
      expect(store.network_positions).toHaveLength(beforeSeats);
      expect(quoted.kind).toBe("DIRECT2_PLACEMENT");
      expect(quoted.status).toBe("PENDING");
      expect(quoted.candidate_parent_position_id).toBe(xOld);
      expect(quoted.candidate_position).toBe("RIGHT");
      expect(quoted.movement_user_id).toBe("u-x");
      expect(quoted.movement_from_position_id).toBe(xOld);
      expect(quoted.movement_parent_position_id).toBeTruthy();
      expect(pendingReentry(store, "u-x", plan)).toHaveLength(0);
      expect((store.payment_intents ?? []).filter((i) => i.kind === "GLOBAL_REENTRY" && i.plan_id === plan)).toHaveLength(0);

      const nextParent = quoted.movement_parent_position_id;
      const nextSide = quoted.movement_position;
      confirmDirect2FromIntent(store, "u-by", plan, `0xd2-cycle-${plan}`, intentPayee(quoted));

      const xOldRow = store.network_positions.find((p) => p.id === xOld)!;
      expect(xOldRow.status).toBe("HISTORY");
      const xLive = occupyingPosition(store.network_positions, "u-x", plan);
      expect(xLive?.status).toBe("ACTIVE");
      expect(xLive?.id).not.toBe(xOld);
      expect(xLive?.parent_id).toBe(nextParent);
      expect(xLive?.position).toBe(nextSide);
      expect(store.network_positions.filter((p) => p.user_id === "u-x" && p.plan_id === plan && isActiveNode(p))).toHaveLength(1);

      const sponsorSeat = occupyingPosition(store.network_positions, "u-sp", plan);
      expect(sponsorSeat?.status).toBe("ACTIVE");
      expect(sponsorSeat?.parent_id).toBe(xOld);
      expect(sponsorSeat?.position).toBe("RIGHT");
      expect(cycleComplete(scoped(), xOld)).toBe(true);

      const d2 = (store.payment_intents ?? []).find(
        (i) => i.kind === "DIRECT2_PLACEMENT" && i.buyer_user_id === "u-by" && i.plan_id === plan,
      );
      expect(d2?.status).toBe("CONFIRMED");
      expect(d2?.movement_user_id).toBe("u-x");
      expect((store.payment_intents ?? []).filter((i) => i.kind === "GLOBAL_REENTRY" && i.mover_user_id === "u-x")).toHaveLength(0);
      expect((store.payment_intents ?? []).filter((i) => i.kind === "GLOBAL_REENTRY" && i.plan_id === plan)).toHaveLength(0);
      expect(store.transactions.filter((t) => t.payment_type === "GLOBAL_REENTRY" && t.user_id === "u-x")).toHaveLength(0);
    },
  );

  it.each(PLANS)("%s: PREPARE does not queue; Direct #2 that funds the cycle does not add GLOBAL_REENTRY", (plan) => {
    const store = storeFor([
      pos(plan, "root", "u-a", null, null, 0),
      pos(plan, "left", "u-left", "root", "LEFT", 1),
    ]);
    store.users.push(user("u-sx", "GXSPONX"), user("u-bx", "GXBUYERX"));
    store.wallets.push(wallet("w-sx", "u-sx", "0x1111111111111111111111111111111111111111"));
    const before = JSON.stringify(store.network_positions);
    quoteDirect2InStore(store, "u-sx", plan, "u-bx");
    expect(JSON.stringify(store.network_positions)).toBe(before);
    expect(pendingReentry(store, "u-a", plan)).toHaveLength(0);

    confirmDirect2FromIntent(store, "u-bx", plan, `0xd2-${plan}`, "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    const funded = (store.payment_intents ?? []).some(
      (i) => i.kind === "DIRECT2_PLACEMENT" && i.status === "CONFIRMED" && i.plan_id === plan && i.movement_user_id === "u-a",
    );
    if (funded) {
      expect(pendingReentry(store, "u-a", plan)).toHaveLength(0);
    }
  });

  it("genesis ACTIVE child that completes a parent queues that parent on every plan_id", () => {
    for (const plan of PLANS) {
      const store = storeFor([
        pos(plan, "root", "u-genesis", null, null, 0),
        pos(plan, "left", "u-left", "root", "LEFT", 1),
        pos(plan, "right", "u-right", "root", "RIGHT", 1),
        pos(plan, "lr", "u-new", "left", "RIGHT", 2),
      ]);
      const before = store.network_positions.length;
      applyGenesisReconciliation(store, plan);
      expect(store.network_positions.length).toBe(before + 1);
      expect(pendingReentry(store, "u-left", plan)).toHaveLength(1);
      expect(store.network_positions.filter((p) => p.plan_id === plan && (p.status ?? "ACTIVE") === "ACTIVE" && p.user_id === "u-genesis")).toHaveLength(1);
    }
  });

  it("placeUserInStore without allowUnpaidInsert does not insert ACTIVE", () => {
    const store = storeFor([pos("PLAN_100", "root", "u-a", null, null, 0)]);
    const before = store.network_positions.length;
    expect(() => placeUserInStore(store, "u-new", "PLAN_100")).toThrow(UNPAID_ACTIVE_INSERT_BLOCKED);
    expect(store.network_positions).toHaveLength(before);
  });

  it.each(PLANS)("%s: re-entry quote refreshes when the legal hole changes; old payee cannot confirm", (plan) => {
    const store = storeFor([
      pos(plan, "root", "u-a", null, null, 0),
      pos(plan, "left", "u-left", "root", "LEFT", 1),
      pos(plan, "right", "u-right", "root", "RIGHT", 1),
    ]);
    afterActiveSeatCreated(store, store.network_positions[2]!);
    const first = quoteReentryInStore(store, "u-a", plan);
    const oldWallet = first.candidate_recipient_wallet;
    const quotedParent = first.candidate_parent_position_id;
    const quotedSide = first.candidate_position;
    let steal = 0;
    const occupyQuotedHole = () => {
      const hole = firstEmptyQuote(store, plan, "u-a");
      steal += 1;
      const id = `u-steal${steal}`;
      store.users.push(user(id, `GXST${steal}`));
      store.wallets.push(wallet(`w-${id}`, id, `0x${(10 + steal).toString(16).padStart(40, "1")}`));
      store.network_positions.push({
        id: `${plan}-steal${steal}`,
        user_id: id,
        plan_id: plan,
        parent_id: hole.parent_id,
        position: hole.position,
        depth: hole.depth,
        cycle: Math.floor(hole.depth / 2),
        status: "ACTIVE",
        started_at: "2026-08-22T12:00:00.000Z",
      });
    };
    occupyQuotedHole();
    while (firstEmptyQuote(store, plan, "u-a").recipient_wallet === oldWallet && steal < 8) {
      occupyQuotedHole();
    }
    const live = firstEmptyQuote(store, plan, "u-a");
    expect(live.parent_id !== quotedParent || live.position !== quotedSide).toBe(true);
    expect(live.recipient_wallet).not.toBe(oldWallet);
    const refreshed = quoteReentryInStore(store, "u-a", plan);
    expect(refreshed.id).toBe(first.id);
    expect(refreshed.candidate_parent_position_id !== quotedParent || refreshed.candidate_position !== quotedSide).toBe(
      true,
    );
    expect(refreshed.candidate_recipient_wallet).not.toBe(oldWallet);
    expect(() => confirmReentryFromIntent(store, "u-a", plan, `0xold-${plan}`, oldWallet!)).toThrow(
      /does not match the quoted Global upline|no longer the first empty/,
    );
    expect(occupyingPosition(store.network_positions, "u-a", plan)?.id).toBe(`${plan}-root`);
  });

  it.each(PLANS)("%s: four sequential complete → re-entry confirm cycles", (plan) => {
    const store = storeFor([pos(plan, "root", "u-a", null, null, 0)]);
    let n = 0;
    const ensure = (id: string) => {
      if (!store.users.some((u) => u.id === id)) {
        store.users.push(user(id, `GX${id.replace(/\W/g, "").slice(0, 6).toUpperCase().padEnd(6, "X")}`));
        store.wallets.push(wallet(`w-${id}`, id, `0x${(n + 20).toString(16).padStart(40, "e")}`));
      }
    };
    const addAtHole = () => {
      n += 1;
      const id = `u-fill${n}`;
      ensure(id);
      const hole = findFirstEmptyPlacement(
        store.network_positions.filter((p) => p.plan_id === plan),
        id,
      );
      const row: NetworkPositionRow = {
        id: `${plan}-fill${n}`,
        user_id: id,
        plan_id: plan,
        parent_id: hole.parent_id,
        position: hole.position,
        depth: hole.depth,
        cycle: Math.floor(hole.depth / 2),
        status: "ACTIVE",
        started_at: "2026-08-22T12:00:00.000Z",
      };
      store.network_positions.push(row);
      afterActiveSeatCreated(store, row);
      return row;
    };
    const pendingAny = () =>
      (store.payment_intents ?? []).filter((i) => i.kind === "GLOBAL_REENTRY" && i.status === "PENDING" && i.plan_id === plan);

    const hops: { mover: string; newParent: string | null; parentIntent: boolean }[] = [];
    for (let cycle = 0; cycle < 4; cycle++) {
      let guard = 0;
      while (pendingAny().length === 0 && guard < 30) {
        addAtHole();
        guard += 1;
      }
      expect(pendingAny().length).toBeGreaterThan(0);
      const intent = pendingAny()[0]!;
      const mover = intent.mover_user_id;
      const old = occupyingPosition(store.network_positions, mover, plan)!;
      const dupBefore = pendingReentry(store, mover, plan).length;
      expect(dupBefore).toBe(1);
      const placed = confirmReentryFromIntent(store, mover, plan, `0xchain${cycle}-${plan}`, intent.candidate_recipient_wallet!);
      expect(old.status).toBe("HISTORY");
      expect(placed.status).toBe("ACTIVE");
      expect(placed.parent_id).toBe(intent.candidate_parent_position_id);
      expect(store.network_positions.filter((p) => p.user_id === mover && p.plan_id === plan && isActiveNode(p))).toHaveLength(1);
      expect(pendingReentry(store, mover, plan)).toHaveLength(0);
      const newParent = store.network_positions.find((p) => p.id === placed.parent_id);
      const parentComplete = Boolean(newParent && cycleComplete(store.network_positions.filter((p) => p.plan_id === plan), newParent.id));
      if (parentComplete && newParent && isActiveNode(newParent)) {
        expect(pendingReentry(store, newParent.user_id, plan)).toHaveLength(1);
      }
      hops.push({ mover, newParent: newParent?.user_id ?? null, parentIntent: parentComplete && Boolean(newParent && isActiveNode(newParent)) });
    }
    expect(hops).toHaveLength(4);
  });
});
