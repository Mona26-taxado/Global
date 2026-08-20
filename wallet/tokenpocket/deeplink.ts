import { newId, withStore } from "@/lib/store";

export async function createLoginAction(payload: Record<string, unknown>) {
  const action_id = `gx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await withStore((store) => {
    store.tokenpocket_actions.push({
      action_id,
      action: "login",
      status: "PENDING",
      payload,
      result: null,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  });
  return action_id;
}

export async function storeCallback(actionId: string, result: unknown) {
  return withStore((store) => {
    const row = store.tokenpocket_actions.find((a) => a.action_id === actionId);
    if (!row) throw new Error("TP_ACTION_UNKNOWN");
    if (new Date(row.expires_at) < new Date()) throw new Error("TP_ACTION_EXPIRED");
    row.status = "CALLBACK_RECEIVED";
    row.result = result;
    return row;
  });
}

export async function getAction(actionId: string) {
  return withStore((store) => store.tokenpocket_actions.find((a) => a.action_id === actionId) ?? null);
}

/** Official TokenPocket H5 DeepLink — login/authorize ONLY. Never include transfer fields. */
export function tokenPocketLoginParam(input: {
  actionId: string;
  callbackUrl: string;
  dappName: string;
  dappIcon: string;
  chainId: string;
}) {
  return {
    protocol: "TokenPocket",
    version: "v1.0",
    dappName: input.dappName,
    dappIcon: input.dappIcon,
    action: "login",
    actionId: input.actionId,
    callbackUrl: input.callbackUrl,
    memo: "GLOBAL X wallet authorization. This is not a payment and does not transfer funds.",
    expired: Math.floor(Date.now() / 1000) + 15 * 60,
    blockchains: [{ chainId: input.chainId, network: "ethereum" }],
  };
}

export function tokenPocketSignParam(input: {
  actionId: string;
  callbackUrl: string;
  dappName: string;
  dappIcon: string;
  chainId: string;
  message: string;
}) {
  return {
    protocol: "TokenPocket",
    version: "1.1.8",
    dappName: input.dappName,
    dappIcon: input.dappIcon,
    action: "sign",
    actionId: input.actionId,
    callbackUrl: input.callbackUrl,
    hash: false,
    memo: "GLOBAL X login signature. This does not transfer funds.",
    message: input.message,
    signType: "ethPersonalSign",
    expired: Math.floor(Date.now() / 1000) + 15 * 60,
    blockchains: [{ chainId: input.chainId, network: "ethereum" }],
  };
}

// IMPORTANT: Transfer DeepLink is only for Pay (registration/plan). Never use on Connect Wallet.
export function tokenPocketTransferParam(input: {
  actionId: string;
  callbackUrl: string;
  dappName: string;
  dappIcon: string;
  chainId: string;
  from: string;
  to: string;
  contract: string;
  amount: string;
  decimal: number;
  symbol: string;
}) {
  return {
    protocol: "TokenPocket",
    version: "1.0",
    dappName: input.dappName,
    dappIcon: input.dappIcon,
    action: "transfer",
    actionId: input.actionId,
    callbackUrl: input.callbackUrl,
    from: input.from,
    to: input.to,
    contract: input.contract,
    amount: input.amount,
    decimal: input.decimal,
    symbol: input.symbol,
    memo: "GLOBAL X payment. Confirm only if you pressed Pay.",
    expired: Math.floor(Date.now() / 1000) + 15 * 60,
    blockchains: [{ chainId: input.chainId, network: "ethereum" }],
  };
}

export function tokenPocketDeepLink(param: Record<string, unknown>) {
  return `tpoutside://pull.activity?param=${encodeURIComponent(JSON.stringify(param))}`;
}

export function extractTxHash(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const hash = r.txHash ?? r.hash ?? r.txid;
  return typeof hash === "string" && hash.startsWith("0x") ? hash : null;
}

export function extractAddress(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  const addr = r.address ?? r.wallet ?? r.from ?? r.account;
  return typeof addr === "string" && addr.startsWith("0x") ? addr : null;
}
