export type NetworkId = "amoy" | "mainnet";

export const AMOY_CHAIN_ID = 80002;
export const MAINNET_CHAIN_ID = 137;
export const AMOY_HEX = "0x13882";
export const MAINNET_HEX = "0x89";

export function publicNetwork(): NetworkId {
  return process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "amoy";
}

export function demoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
}

export function mainnetPaymentsEnabled(): boolean {
  return process.env.MAINNET_PAYMENTS === "true";
}

export function activeChainId(network = publicNetwork()): number {
  return network === "mainnet" ? MAINNET_CHAIN_ID : AMOY_CHAIN_ID;
}

export function activeChainHex(network = publicNetwork()): string {
  return network === "mainnet" ? MAINNET_HEX : AMOY_HEX;
}

export function rpcUrl(network = publicNetwork()): string {
  if (network === "mainnet") {
    return process.env.POLYGON_RPC_URL || process.env.NEXT_PUBLIC_POLYGON_RPC_URL || "";
  }
  return (
    process.env.POLYGON_AMOY_RPC_URL ||
    process.env.NEXT_PUBLIC_POLYGON_AMOY_RPC_URL ||
    "https://polygon-amoy.drpc.org"
  );
}

export function usdtContract(network = publicNetwork()): `0x${string}` | undefined {
  const raw =
    network === "mainnet"
      ? process.env.POLYGON_USDT_CONTRACT
      : process.env.POLYGON_AMOY_USDT_CONTRACT;
  return raw && raw.startsWith("0x") ? (raw as `0x${string}`) : undefined;
}

export function paymentRecipient(): `0x${string}` | undefined {
  const raw = process.env.PAYMENT_RECIPIENT_ADDRESS;
  return raw && raw.startsWith("0x") ? (raw as `0x${string}`) : undefined;
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function isPrivateLanHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

/** TokenPocket callbacks must hit an address the phone can reach — not localhost. */
export function requestAppUrl(headers: Headers) {
  if (process.env.NODE_ENV === "production") return appUrl();
  const origin = headers.get("origin");
  if (origin) {
    try {
      const url = new URL(origin);
      if (isPrivateLanHost(url.hostname)) return origin.replace(/\/$/, "");
    } catch {
      /* ignore */
    }
  }
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host) {
    const hostname = host.split(":")[0];
    if (isPrivateLanHost(hostname)) {
      const proto = headers.get("x-forwarded-proto") || "http";
      return `${proto}://${host}`.replace(/\/$/, "");
    }
  }
  return appUrl();
}

export function explorerBase(network = publicNetwork()): string {
  if (network === "mainnet") {
    return (process.env.POLYGON_EXPLORER_URL || "https://polygonscan.com").replace(/\/$/, "");
  }
  return (process.env.POLYGON_AMOY_EXPLORER_URL || "https://amoy.polygonscan.com").replace(/\/$/, "");
}

export function networkLabel(network = publicNetwork()): string {
  return network === "mainnet" ? "Polygon" : "Polygon Amoy";
}

export function explorerTxUrl(txHash: string, network = publicNetwork()) {
  return `${explorerBase(network)}/tx/${txHash}`;
}

export function usdtConfigured(network = publicNetwork()) {
  return Boolean(usdtContract(network));
}

export function recipientConfigured() {
  return Boolean(paymentRecipient());
}

export const REGISTRATION_USD = 5;

/** Configured genesis/admin Global root (GXGLOBAL / wallet tail 2575). Not a normal member. */
export const DEFAULT_GENESIS_REFERRAL_CODE = "GXGLOBAL";
export const DEFAULT_GENESIS_WALLET = "0x4C914838613a605b1eF256816C1Ac8912c172575";

export function genesisReferralCode() {
  const raw = process.env.GENESIS_REFERRAL_CODE?.trim();
  return raw || DEFAULT_GENESIS_REFERRAL_CODE;
}

export function genesisWalletAddress() {
  const raw = process.env.GENESIS_WALLET_ADDRESS?.trim();
  return (raw || DEFAULT_GENESIS_WALLET).toLowerCase();
}

export const DEFAULT_PLANS = [
  {
    code: "PLAN_100",
    name: "$100 PLAN",
    amount_usd: 100,
    sort_order: 1,
    description: "GLOBAL X $100 membership plan.",
  },
  {
    code: "PLAN_200",
    name: "$200 PLAN",
    amount_usd: 200,
    sort_order: 2,
    description: "GLOBAL X $200 membership plan.",
  },
  {
    code: "PLAN_500",
    name: "$500 PLAN",
    amount_usd: 500,
    sort_order: 3,
    description: "GLOBAL X $500 membership plan.",
  },
  {
    code: "PLAN_1000",
    name: "$1000 PLAN",
    amount_usd: 1000,
    sort_order: 4,
    description: "GLOBAL X $1000 membership plan.",
  },
];

export const DEFAULT_GLOBAL_CONFIG = {
  qualification_rule: "Direct #2 of a member with this plan ACTIVE places that member in Global.",
  global_entry_condition: "Enter Global on Direct #2. Direct #1 pays the sponsor; Direct #2 pays the new Global parent.",
  two_branch_cycle: "Each Global position has LEFT and RIGHT. PHASE 1 fills ROOT.LEFT, then that member’s immediate LEFT and RIGHT, then ROOT.RIGHT unlocks. PHASE 2 is level-order across the opened tree (top to bottom, LEFT then RIGHT). Same for every plan.",
  placement_rule: "PHASE 1: ROOT.LEFT first, then that member’s immediate ACTIVE LEFT and RIGHT, then unlock ROOT.RIGHT once (do not relock if the old left-head re-enters). PHASE 2: after unlock, fill the opened tree row by row LEFT to RIGHT. Paid re-entry uses the same allocator for every plan_id.",
  cycle_completion: "A Global cycle completes when the current seat has ACTIVE LEFT and ACTIVE RIGHT.",
  position_movement: "When both Global legs complete, the member’s current seat is history and a new active seat is opened. Old rows are never deleted.",
};
