import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { newId, readStore, withStore } from "@/lib/store";
import { publicNetwork } from "@/lib/network-config";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("ADMIN_REQUIRED", 401);
  }
  const resource = req.nextUrl.searchParams.get("resource") ?? "users";
  const q = (req.nextUrl.searchParams.get("q") ?? "").toLowerCase();
  const s = await readStore();
  const live = s.users.filter((u) => !u.is_demo);
  if (resource === "users") {
    const rows = live.map((u) => {
      const w = s.wallets.find((x) => x.user_id === u.id);
      const reg = s.registrations.find((r) => r.user_id === u.id);
      const plan = s.transactions.find((t) => t.user_id === u.id && t.payment_type === "PLAN_PURCHASE" && t.status === "CONFIRMED");
      const sponsor = live.find((x) => x.id === u.sponsor_id);
      return {
        ...u,
        wallet: w?.address,
        wallet_type: w?.wallet_type,
        registration_status: reg?.status ?? "NOT_PAID",
        current_plan: plan?.plan_code ?? null,
        sponsor: sponsor?.referral_code ?? null,
      };
    });
    return jsonOk({ rows });
  }
  if (resource === "wallets") {
    const rows = s.wallets
      .filter((w) => {
        const u = s.users.find((x) => x.id === w.user_id);
        return u && !u.is_demo;
      })
      .map((w) => {
        const u = s.users.find((x) => x.id === w.user_id);
        return {
          address: w.address,
          wallet_type: w.wallet_type,
          chain_id: w.chain_id,
          chain: w.chain_id === 137 ? "Polygon" : "Polygon Amoy",
          verified: w.verified,
          user: u?.id ?? null,
          connected_date: w.created_at,
        };
      });
    return jsonOk({ rows });
  }
  if (resource === "registrations") {
    const rows = s.registrations.map((r) => {
      const u = s.users.find((x) => x.id === r.user_id);
      return { ...r, user: u?.id, referral_code: u?.referral_code, fee: "$5", token: "USDT", network: publicNetwork() };
    });
    return jsonOk({ rows });
  }
  if (resource === "transactions") {
    let rows = s.transactions;
    const status = req.nextUrl.searchParams.get("status");
    const type = req.nextUrl.searchParams.get("type");
    const network = req.nextUrl.searchParams.get("network");
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    if (status) rows = rows.filter((t) => t.status === status);
    if (type) rows = rows.filter((t) => t.payment_type === type);
    if (network === "amoy") rows = rows.filter((t) => t.chain_id === 80002);
    if (network === "mainnet") rows = rows.filter((t) => t.chain_id === 137);
    if (from) rows = rows.filter((t) => t.created_at.slice(0, 10) >= from);
    if (to) rows = rows.filter((t) => t.created_at.slice(0, 10) <= to);
    return jsonOk({ rows });
  }
  if (resource === "plans") return jsonOk({ rows: s.plans });
  if (resource === "referrals") {
    let rows = s.referrals.map((r) => {
      const user = s.users.find((u) => u.id === r.user_id);
      const sponsor = s.users.find((u) => u.id === r.sponsor_id);
      const w = s.wallets.find((x) => x.user_id === r.user_id);
      const reg = s.registrations.find((x) => x.user_id === r.user_id);
      return {
        ...r,
        wallet: w?.address,
        registration_status: reg?.status,
        joined: user?.created_at,
        sponsor_code: sponsor?.referral_code,
      };
    });
    if (q) {
      rows = rows.filter(
        (r) =>
          r.user_id.toLowerCase().includes(q) ||
          r.referral_code.toLowerCase().includes(q) ||
          (r.wallet ?? "").toLowerCase().includes(q),
      );
    }
    return jsonOk({ rows });
  }
  if (resource === "user") {
    const id = req.nextUrl.searchParams.get("id") ?? "";
    const u = s.users.find((x) => x.id === id);
    if (!u) return jsonError("NOT_FOUND", 404);
    return jsonOk({
      user: u,
      wallet: s.wallets.find((w) => w.user_id === id),
      registration: s.registrations.find((r) => r.user_id === id),
      plans: s.transactions.filter((t) => t.user_id === id && t.payment_type === "PLAN_PURCHASE"),
      transactions: s.transactions.filter((t) => t.user_id === id),
      referrer: s.users.find((x) => x.id === u.sponsor_id),
      referrals: s.referrals
        .filter((r) => r.sponsor_id === id)
        .map((r) => {
          const person = s.users.find((x) => x.id === r.user_id);
          return { ...r, referral_code: person?.referral_code, display_name: person?.display_name };
        }),
      positions: s.network_positions
        .filter((p) => p.user_id === id)
        .map((p) => {
          const parentPos = p.parent_id ? s.network_positions.find((x) => x.id === p.parent_id) : null;
          const parentUser = parentPos ? s.users.find((x) => x.id === parentPos.user_id) : null;
          return { ...p, parent_code: parentUser?.referral_code ?? null };
        }),
      current_position: s.network_positions.find((p) => p.user_id === id && (p.status ?? "ACTIVE") === "ACTIVE") ?? null,
      current_global_parent_id: (() => {
        const cur = s.network_positions.find((p) => p.user_id === id && (p.status ?? "ACTIVE") === "ACTIVE");
        if (!cur?.parent_id) return null;
        return s.network_positions.find((p) => p.id === cur.parent_id)?.user_id ?? null;
      })(),
      current_global_parent_code: (() => {
        const cur = s.network_positions.find((p) => p.user_id === id && (p.status ?? "ACTIVE") === "ACTIVE");
        if (!cur?.parent_id) return null;
        const parentPos = s.network_positions.find((p) => p.id === cur.parent_id);
        return parentPos ? s.users.find((x) => x.id === parentPos.user_id)?.referral_code ?? null : null;
      })(),
    });
  }
  return jsonOk({ rows: [] });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("ADMIN_REQUIRED", 401);
  }
  const body = await req.json().catch(() => ({}));
  if (body.kind === "plan") {
    await withStore((store) => {
      if (body.create) {
        const id = body.code ? String(body.code) : newId("plan");
        store.plans.push({
          id,
          code: id,
          name: String(body.name ?? "Plan"),
          amount_usd: Number(body.amount_usd ?? 0),
          token: "USDT",
          network: publicNetwork(),
          description: String(body.description ?? ""),
          active: true,
          enabled: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        return;
      }
      const plan = store.plans.find((p) => p.id === body.id || p.code === body.code);
      if (!plan) return;
      if (body.name) plan.name = String(body.name);
      if (body.amount_usd !== undefined) plan.amount_usd = Number(body.amount_usd);
      if (body.description !== undefined) plan.description = String(body.description);
      if (body.active !== undefined) {
        plan.active = Boolean(body.active);
        plan.enabled = plan.active;
      }
      plan.updated_at = new Date().toISOString();
    });
  }
  return jsonOk();
}
