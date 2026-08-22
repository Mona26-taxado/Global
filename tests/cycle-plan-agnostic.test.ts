import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { cycleComplete } from "../network/placement";
import {
  finalizeConfirmedDirect2InStore,
  provisionDirect2SponsorInStore,
  qualifyForReentryInStore,
  reservedPosition,
} from "../services/users";
import type { Store } from "../lib/store";
import type { NetworkPositionRow } from "../types";

const PLANS = ["PLAN_100", "PLAN_200", "PLAN_500", "PLAN_1000", "PLAN_SYNTH"] as const;

function pos(
  plan: string,
  id: string,
  user_id: string,
  parent_id: string | null,
  position: "LEFT" | "RIGHT" | null,
  depth: number,
  status: NetworkPositionRow["status"],
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

function trio(
  plan: string,
  left: NetworkPositionRow["status"],
  right: NetworkPositionRow["status"],
): NetworkPositionRow[] {
  return [
    pos(plan, "root", "u-root", null, null, 0, "ACTIVE"),
    pos(plan, "left", "u-left", "root", "LEFT", 1, left),
    pos(plan, "right", "u-right", "root", "RIGHT", 1, right),
  ];
}

function storeFor(plan: string, positions: NetworkPositionRow[]): Store {
  return {
    payment_intents: [],
    network_positions: positions,
    wallets: [
      { id: "wal-root", user_id: "u-root", address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", wallet_type: "injected", chain_id: 80002, verified: true, created_at: "2026-08-22T12:00:00.000Z" },
      { id: "wal-left", user_id: "u-left", address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", wallet_type: "injected", chain_id: 80002, verified: true, created_at: "2026-08-22T12:00:00.000Z" },
      { id: "wal-right", user_id: "u-right", address: "0xcccccccccccccccccccccccccccccccccccccccc", wallet_type: "injected", chain_id: 80002, verified: true, created_at: "2026-08-22T12:00:00.000Z" },
    ],
    users: [
      { id: "u-root", referral_code: "GXROOTAA", sponsor_id: null, is_demo: false, display_name: "root", created_at: "2026-08-22T12:00:00.000Z" },
      { id: "u-left", referral_code: "GXLEFTAA", sponsor_id: null, is_demo: false, display_name: "left", created_at: "2026-08-22T12:00:00.000Z" },
      { id: "u-right", referral_code: "GXRIGHTA", sponsor_id: null, is_demo: false, display_name: "right", created_at: "2026-08-22T12:00:00.000Z" },
      { id: "u-sponsor", referral_code: "GXSPONSR", sponsor_id: null, is_demo: false, display_name: "sponsor", created_at: "2026-08-22T12:00:00.000Z" },
      { id: "u-d2", referral_code: "GXD2AAAA", sponsor_id: "u-sponsor", is_demo: false, display_name: "d2", created_at: "2026-08-22T12:00:00.000Z" },
    ],
    plans: PLANS.map((id) => ({ id })),
    referrals: [
      {
        id: "ref-d2",
        user_id: "u-d2",
        sponsor_id: "u-sponsor",
        referral_code: "GXSPONSR",
        direct_number: 2,
        status: "ACTIVE",
      },
    ],
  } as unknown as Store;
}

describe("cycleComplete is plan-agnostic (ACTIVE LEFT + ACTIVE RIGHT only)", () => {
  it.each(PLANS)("%s: LEFT RESERVED + RIGHT ACTIVE => cycle false; no re-entry", (plan) => {
    const nodes = trio(plan, "RESERVED", "ACTIVE");
    expect(cycleComplete(nodes, `${plan}-root`)).toBe(false);
    const store = storeFor(plan, nodes);
    qualifyForReentryInStore(store, "u-root", plan);
    expect(reservedPosition(store.network_positions, "u-root", plan)).toBeNull();
  });

  it.each(PLANS)("%s: LEFT ACTIVE + RIGHT RESERVED => cycle false; no re-entry", (plan) => {
    const nodes = trio(plan, "ACTIVE", "RESERVED");
    expect(cycleComplete(nodes, `${plan}-root`)).toBe(false);
    const store = storeFor(plan, nodes);
    qualifyForReentryInStore(store, "u-root", plan);
    expect(reservedPosition(store.network_positions, "u-root", plan)).toBeNull();
  });

  it.each(PLANS)("%s: LEFT ACTIVE + RIGHT ACTIVE => cycle true; re-entry intent not occupying", (plan) => {
    const nodes = trio(plan, "ACTIVE", "ACTIVE");
    expect(cycleComplete(nodes, `${plan}-root`)).toBe(true);
    const store = storeFor(plan, nodes);
    const before = store.network_positions.length;
    qualifyForReentryInStore(store, "u-root", plan);
    expect(store.network_positions).toHaveLength(before);
    expect(reservedPosition(store.network_positions, "u-root", plan)).toBeNull();
    expect(store.payment_intents.some((i) => i.kind === "GLOBAL_REENTRY" && i.status === "PENDING" && i.plan_id === plan)).toBe(true);
  });

  it("one plan both-ACTIVE does not complete another plan's mixed RESERVED/ACTIVE seat", () => {
    const positions = [
      ...trio("PLAN_100", "RESERVED", "ACTIVE"),
      ...trio("PLAN_200", "ACTIVE", "RESERVED"),
      ...trio("PLAN_500", "ACTIVE", "ACTIVE"),
      ...trio("PLAN_1000", "RESERVED", "ACTIVE"),
      ...trio("PLAN_SYNTH", "ACTIVE", "RESERVED"),
    ];
    const store = storeFor("PLAN_500", positions);
    expect(cycleComplete(positions.filter((p) => p.plan_id === "PLAN_100"), "PLAN_100-root")).toBe(false);
    expect(cycleComplete(positions.filter((p) => p.plan_id === "PLAN_200"), "PLAN_200-root")).toBe(false);
    expect(cycleComplete(positions.filter((p) => p.plan_id === "PLAN_500"), "PLAN_500-root")).toBe(true);
    qualifyForReentryInStore(store, "u-root", "PLAN_100");
    qualifyForReentryInStore(store, "u-root", "PLAN_200");
    qualifyForReentryInStore(store, "u-root", "PLAN_500");
    qualifyForReentryInStore(store, "u-root", "PLAN_1000");
    qualifyForReentryInStore(store, "u-root", "PLAN_SYNTH");
    expect(reservedPosition(store.network_positions, "u-root", "PLAN_100")).toBeNull();
    expect(reservedPosition(store.network_positions, "u-root", "PLAN_200")).toBeNull();
    expect(reservedPosition(store.network_positions, "u-root", "PLAN_500")).toBeNull();
    expect(store.payment_intents.some((i) => i.plan_id === "PLAN_500" && i.kind === "GLOBAL_REENTRY" && i.status === "PENDING")).toBe(true);
    expect(reservedPosition(store.network_positions, "u-root", "PLAN_1000")).toBeNull();
    expect(reservedPosition(store.network_positions, "u-root", "PLAN_SYNTH")).toBeNull();
  });

  it.each(PLANS)("%s: Direct #2 PREPARE quotes only — no occupying seat", (plan) => {
    const store = storeFor(plan, [
      pos(plan, "root", "u-root", null, null, 0, "ACTIVE"),
      pos(plan, "left", "u-left", "root", "LEFT", 1, "ACTIVE"),
    ]);
    const before = JSON.stringify(store.network_positions);
    const intent = provisionDirect2SponsorInStore(store, "u-sponsor", plan, "u-d2");
    expect(intent.status).toBe("PENDING");
    expect(intent.plan_id).toBe(plan);
    expect(JSON.stringify(store.network_positions)).toBe(before);
    expect(cycleComplete(store.network_positions.filter((p) => p.plan_id === plan), `${plan}-root`)).toBe(false);
    expect(reservedPosition(store.network_positions, "u-root", plan)).toBeNull();
  });

  it.each(PLANS)("%s: Direct #2 CONFIRM ACTIVE; cycle movement if bound, else re-entry intent", (plan) => {
    const store = storeFor(plan, [
      pos(plan, "root", "u-root", null, null, 0, "ACTIVE"),
      pos(plan, "left", "u-left", "root", "LEFT", 1, "ACTIVE"),
    ]);
    provisionDirect2SponsorInStore(store, "u-sponsor", plan, "u-d2");
    finalizeConfirmedDirect2InStore(store, "u-d2", plan, `0xd2-${plan}`);
    expect(store.network_positions.find((p) => p.user_id === "u-sponsor" && p.plan_id === plan)?.status).toBe("ACTIVE");
    expect(reservedPosition(store.network_positions, "u-root", plan)).toBeNull();
    const rootActive = store.network_positions.find((p) => p.user_id === "u-root" && p.plan_id === plan && (p.status ?? "ACTIVE") === "ACTIVE");
    expect(rootActive).toBeTruthy();
  });
});

describe("authoritative cycleComplete callers (no occupyingOk bypass)", () => {
  const root = join(__dirname, "..");

  it("occupyingOk is gone from production and tests", () => {
    const files = [
      "services/users.ts",
      "network/placement.ts",
      "payments/plan-routing.ts",
      "payments/service.ts",
      "app/api/me/route.ts",
    ];
    for (const file of files) {
      const src = readFileSync(join(root, file), "utf8");
      expect(src, file).not.toMatch(/occupyingOk/);
    }
  });

  it("re-entry and cycle status callers use cycleComplete, not bothLegsFilled", () => {
    const users = readFileSync(join(root, "services/users.ts"), "utf8");
    expect(users).toMatch(/if \(!cycleComplete\(scoped, current\.id\)\) return current;/);
    expect(users).not.toMatch(/bothLegsFilled\(scoped/);

    const intentSrc = readFileSync(join(root, "services/placement-intent.ts"), "utf8");
    expect(intentSrc).toMatch(/cycleComplete\(scoped, parentPos\.id\)/);
    expect(intentSrc).not.toMatch(/bothLegsFilled/);

    const routing = readFileSync(join(root, "payments/plan-routing.ts"), "utf8");
    expect(routing).toMatch(/quoteDirect2InStore|quoteReentryInStore/);
    expect(routing).not.toMatch(/cycleComplete\(/);
    expect(routing).not.toMatch(/bothLegsFilled\(/);

    const service = readFileSync(join(root, "payments/service.ts"), "utf8");
    expect(service).toMatch(/cycleComplete\(positionsForPlan\(store\.network_positions, plan\.id\), pos\.id\)/);

    const me = readFileSync(join(root, "app/api/me/route.ts"), "utf8");
    expect(me).toMatch(/cycleComplete\(store\.network_positions\.filter\(\(n\) => n\.plan_id === p\.id\), currentPos\.id\)/);
  });

  it("seat engine has no plan-id or amount occupancy branch", () => {
    const files = ["services/placement-intent.ts", "network/placement.ts"];
    for (const file of files) {
      const src = readFileSync(join(root, file), "utf8");
      expect(src, file).not.toMatch(/PLAN_100|PLAN_200|PLAN_500|PLAN_1000/);
      expect(src, file).not.toMatch(/isBase|basePlan/);
      expect(src, file).not.toMatch(/amount_usd\s*===/);
    }
    const routing = readFileSync(join(root, "payments/plan-routing.ts"), "utf8");
    expect(routing).not.toMatch(/isBase/);
    expect(routing).toMatch(/if \(!qualifiesForPlanGlobal\(store, sponsor\.id, planId, buyer\.id\)\)/);
  });
});
