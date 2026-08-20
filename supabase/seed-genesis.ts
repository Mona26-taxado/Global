import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getAddress, isAddress } from "viem";
import { activeChainId } from "@/lib/network-config";
import { newId, readStore, withStore } from "@/lib/store";
import { findPlacement } from "@/network/placement";
import type { Store } from "@/lib/store";

function loadEnv() {
  const p = join(process.cwd(), ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim();
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

loadEnv();

const REFERRAL_WALLET = "0xD77eC55Eb56ace50456515F018b82a6de187e8E1";
const GLOBAL_WALLET = "0x4C914838613a605b1eF256816C1Ac8912c172575";

function upsertMember(
  store: Store,
  input: { address: string; display_name: string; referral_code: string; role: "referral" | "global" },
) {
  const address = getAddress(input.address as `0x${string}`).toLowerCase();
  const wallet = store.wallets.find((w) => w.address.toLowerCase() === address);
  let user = wallet ? store.users.find((u) => u.id === wallet.user_id) : undefined;
  if (!user) {
    user = {
      id: newId("user"),
      referral_code: input.referral_code,
      sponsor_id: null,
      is_demo: false,
      display_name: input.display_name,
      created_at: new Date().toISOString(),
    };
    while (store.users.some((u) => u.referral_code === user!.referral_code && u.id !== user!.id)) {
      user.referral_code = `${input.referral_code}${Math.floor(Math.random() * 9)}`;
    }
    store.users.push(user);
  } else {
    user.display_name = input.display_name;
  }
  if (!wallet) {
    store.wallets.push({
      id: newId("wal"),
      user_id: user.id,
      address,
      wallet_type: "injected",
      chain_id: activeChainId(),
      verified: true,
      created_at: new Date().toISOString(),
    });
  } else {
    wallet.verified = true;
    wallet.user_id = user.id;
  }
  let reg = store.registrations.find((r) => r.user_id === user.id);
  if (!reg) {
    store.registrations.push({
      id: newId("reg"),
      user_id: user.id,
      status: "ACTIVE",
      amount: "5000000",
      tx_hash: null,
      created_at: new Date().toISOString(),
      activated_at: new Date().toISOString(),
    });
  } else {
    reg.status = "ACTIVE";
    if (!reg.activated_at) reg.activated_at = new Date().toISOString();
  }
  const plan = store.plans.find((p) => p.code === "PLAN_100") ?? store.plans[0];
  const hasPlan = store.transactions.some(
    (t) => t.user_id === user.id && t.plan_id === plan?.id && t.status === "CONFIRMED",
  );
  if (!hasPlan && plan) {
    store.transactions.push({
      id: newId("tx"),
      user_id: user.id,
      payer_wallet: address,
      recipient_wallet: address,
      amount: String(BigInt(plan.amount_usd) * 10n ** 6n),
      token: "USDT",
      token_contract: "bootstrap",
      chain_id: activeChainId(),
      tx_hash: `bootstrap_${user.id}_plan`,
      payment_type: "PLAN_PURCHASE",
      plan_id: plan.id,
      plan_code: plan.code,
      status: "CONFIRMED",
      recipient_role: "COMPANY_GENESIS",
      routing_slot: null,
      created_at: new Date().toISOString(),
    });
  }
  if (input.role === "global") {
    const existing = store.network_positions.find((p) => p.user_id === user!.id);
    if (!existing) {
      const livePositions = store.network_positions.filter((p) => {
        const owner = store.users.find((u) => u.id === p.user_id);
        return owner && !owner.is_demo;
      });
      const placement = findPlacement(livePositions.length ? livePositions : [], user.id);
      store.network_positions.push({
        id: placement.id,
        user_id: user.id,
        parent_id: placement.parent_id,
        position: placement.position,
        depth: placement.depth,
        cycle: Math.floor(placement.depth / 2),
      });
    }
  }
  return user;
}

async function main() {
  if (!isAddress(REFERRAL_WALLET) || !isAddress(GLOBAL_WALLET)) {
    throw new Error("Invalid bootstrap wallet");
  }
  const { referral, global } = await withStore((store) => {
    const referral = upsertMember(store, {
      address: REFERRAL_WALLET,
      display_name: "Genesis referral",
      referral_code: "GXFOUNDER",
      role: "referral",
    });
    const global = upsertMember(store, {
      address: GLOBAL_WALLET,
      display_name: "Global seat",
      referral_code: "GXGLOBAL",
      role: "global",
    });
    return { referral, global };
  });
  const after = await readStore();
  const pos = after.network_positions.find((p) => p.user_id === global.id);
  console.log("Referral wallet:", REFERRAL_WALLET);
  console.log("Referral code:", referral.referral_code);
  console.log("Share: /register?ref=" + referral.referral_code);
  console.log("Global wallet:", GLOBAL_WALLET);
  console.log("Global code:", global.referral_code);
  console.log("Global placement:", pos ? `${pos.position ?? "ROOT"} parent=${pos.parent_id ?? "none"}` : "MISSING");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
