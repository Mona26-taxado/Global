import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes, randomInt } from "crypto";
import type {
  GlobalConfig,
  NetworkPositionRow,
  NonceRow,
  PlanRow,
  ReferralRow,
  RegistrationRow,
  TransactionRow,
  UserRow,
  WalletRow,
} from "@/types";
import { DEFAULT_GLOBAL_CONFIG, DEFAULT_PLANS } from "@/lib/network-config";
import { supabaseProjectUrl } from "@/lib/supabase";

export type Store = {
  users: UserRow[];
  wallets: WalletRow[];
  nonces: NonceRow[];
  referrals: ReferralRow[];
  registrations: RegistrationRow[];
  plans: PlanRow[];
  transactions: TransactionRow[];
  network_positions: NetworkPositionRow[];
  tokenpocket_actions: {
    action_id: string;
    action: string;
    status: string;
    payload: unknown;
    result: unknown;
    expires_at: string;
  }[];
  global_config: GlobalConfig;
};

function dataPath() {
  if (process.env.GLOBALX_DATA_PATH) return process.env.GLOBALX_DATA_PATH;
  return process.env.VERCEL || process.env.NOW_REGION
    ? join("/tmp", "globalx.json")
    : join(process.cwd(), "data", "globalx.json");
}

const STATE_ID = "globalx";

function nowIso() {
  return new Date().toISOString();
}

function defaultPlans(): PlanRow[] {
  return DEFAULT_PLANS.map((p) => ({
    id: p.code,
    code: p.code,
    name: p.name,
    amount_usd: p.amount_usd,
    token: "USDT",
    network: "amoy",
    description: p.description,
    active: true,
    enabled: true,
    sort_order: p.sort_order,
    created_at: nowIso(),
    updated_at: nowIso(),
  }));
}

function emptyStore(): Store {
  return {
    users: [],
    wallets: [],
    nonces: [],
    referrals: [],
    registrations: [],
    plans: defaultPlans(),
    transactions: [],
    network_positions: [],
    tokenpocket_actions: [],
    global_config: DEFAULT_GLOBAL_CONFIG,
  };
}

function migrate(store: Store): Store {
  if (!store.registrations) store.registrations = [];
  if (!store.plans?.length) store.plans = defaultPlans();
  store.plans = store.plans.map((p, i) => ({
    ...p,
    token: p.token ?? "USDT",
    network: p.network ?? "amoy",
    description: p.description ?? "",
    active: p.active ?? p.enabled ?? true,
    enabled: p.enabled ?? p.active ?? true,
    sort_order: p.sort_order ?? DEFAULT_PLANS.find((d) => d.code === p.code)?.sort_order ?? i + 1,
    created_at: p.created_at ?? nowIso(),
    updated_at: p.updated_at ?? nowIso(),
  }));
  const baseId =
    [...store.plans].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.code.localeCompare(b.code))[0]?.id ??
    "PLAN_100";
  store.transactions = (store.transactions ?? []).map((t) => ({
    ...t,
    payment_type: t.payment_type ?? (t.plan_code === "REGISTRATION" ? "REGISTRATION" : "PLAN_PURCHASE"),
    plan_id: t.plan_id ?? (t.plan_code && t.plan_code !== "REGISTRATION" ? t.plan_code : null),
  }));
  store.network_positions = (store.network_positions ?? []).map((p) => ({
    ...p,
    plan_id: p.plan_id || baseId,
    status: p.status ?? "ACTIVE",
    started_at: p.started_at ?? nowIso(),
    ended_at: p.ended_at ?? null,
    funded_by_user_id: p.funded_by_user_id ?? null,
  }));
  const refs = store.referrals ?? [];
  const seen = new Map<string, number>();
  store.referrals = refs.map((r) => {
    if (r.direct_number === 1 || r.direct_number === 2) {
      return { ...r, status: r.status ?? "ACTIVE" };
    }
    const n = (seen.get(r.sponsor_id) ?? 0) + 1;
    seen.set(r.sponsor_id, n);
    return {
      ...r,
      direct_number: n === 1 || n === 2 ? (n as 1 | 2) : undefined,
      status: r.status ?? "ACTIVE",
    };
  });
  return store;
}

function readFileStore(): Store {
  const path = dataPath();
  if (!existsSync(path)) return emptyStore();
  return migrate(JSON.parse(readFileSync(path, "utf8")) as Store);
}

function writeFileStore(store: Store) {
  const path = dataPath();
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2));
}

export function supabaseEnabled() {
  return Boolean(supabaseProjectUrl() && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function supabaseAdmin(): SupabaseClient {
  return createClient(supabaseProjectUrl(), process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
}

async function readRemote(): Promise<Store> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("app_state").select("payload").eq("id", STATE_ID).maybeSingle();
  if (error) throw new Error(`Supabase read failed: ${error.message}`);
  if (!data?.payload || Object.keys(data.payload as object).length === 0) {
    const fresh = emptyStore();
    await writeRemote(fresh);
    return fresh;
  }
  return migrate(data.payload as Store);
}

async function writeRemote(store: Store) {
  const sb = supabaseAdmin();
  const { error } = await sb.from("app_state").upsert({
    id: STATE_ID,
    payload: store,
    updated_at: nowIso(),
  });
  if (error) throw new Error(`Supabase write failed: ${error.message}`);
}

export async function readStore(): Promise<Store> {
  if (supabaseEnabled()) return readRemote();
  return readFileStore();
}

export async function withStore<T>(fn: (store: Store) => T | Promise<T>): Promise<T> {
  const store = await readStore();
  const result = await fn(store);
  if (supabaseEnabled()) await writeRemote(store);
  else writeFileStore(store);
  return result;
}

/** @deprecated use withStore — kept for local-only call sites during migration */
export function withLocal<T>(fn: (store: Store) => T): T {
  const store = readFileStore();
  const result = fn(store);
  writeFileStore(store);
  return result;
}

/** @deprecated use readStore */
export function readOnlyLocal(): Store {
  return readFileStore();
}

export function newId(prefix = "gx") {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

export function makeReferralCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "GX";
  for (let i = 0; i < 6; i += 1) code += alphabet[randomInt(alphabet.length)];
  return code;
}
