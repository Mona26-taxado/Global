"use client";

import { encodeFunctionData, erc20Abi, isHash } from "viem";
import { useEffect, useState } from "react";
import { api } from "@/lib/utils";
import { getInjectedProvider } from "@/wallet/dapp-browser/detect";
import { ensurePolygon } from "@/wallet/dapp-browser/provider";

export type PayPhase =
  | "IDLE"
  | "PAYMENT_REQUESTED"
  | "WALLET_CONFIRMATION"
  | "SUBMITTED"
  | "PENDING"
  | "CONFIRMED"
  | "FAILED"
  | "REJECTED";

const PAY_HASH_KEY = "gx_pay_hash";
const PAY_TYPE_KEY = "gx_pay_type";

export function payPhaseMessage(phase: PayPhase) {
  switch (phase) {
    case "PAYMENT_REQUESTED":
      return "Preparing payment…";
    case "WALLET_CONFIRMATION":
      return "Waiting for wallet confirmation...";
    case "SUBMITTED":
      return "Transaction submitted.";
    case "PENDING":
      return "Waiting for blockchain confirmation...";
    case "CONFIRMED":
      return "Payment confirmed.";
    case "FAILED":
      return "Payment failed.";
    case "REJECTED":
      return "Payment rejected.";
    default:
      return "";
  }
}

function walletErrorMessage(err: unknown): string {
  let msg = "";
  if (typeof err === "string" && err.trim()) msg = err;
  else if (err && typeof err === "object") {
    const o = err as { code?: number; message?: string; data?: { message?: string } };
    if (o.code === 4001 || o.code === 5000) return "Payment rejected.";
    msg = o.data?.message || o.message || "";
  } else if (err instanceof Error && err.message) msg = err.message;
  const nested = msg.match(/\{[\s\S]*"error"\s*:\s*"([^"]+)"/);
  if (nested?.[1]) msg = nested[1];
  if (/gasLimit is too low/i.test(msg)) {
    return "Wallet gas was 0. Open the site again after the next update and retry Pay — gas is now set on the transaction.";
  }
  return msg || "Payment failed";
}

function toHex(n: bigint) {
  return `0x${n.toString(16)}`;
}

async function withGas(
  provider: { request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown> },
  tx: { from: string; to: string; data: string; value: string },
) {
  let gas = 100000n;
  try {
    const estimated = await provider.request({
      method: "eth_estimateGas",
      params: [tx],
    });
    if (typeof estimated === "string" && estimated.startsWith("0x")) {
      const n = BigInt(estimated);
      if (n > 0n) gas = (n * 13n) / 10n;
    }
  } catch {
    /* TokenPocket sometimes returns 0 without a limit; ERC-20 transfer still needs gas. */
  }
  if (gas < 65000n) gas = 65000n;
  const gasHex = toHex(gas);
  let gasPrice: string | undefined;
  try {
    const price = await provider.request({ method: "eth_gasPrice" });
    if (typeof price === "string" && price.startsWith("0x") && BigInt(price) > 0n) gasPrice = price;
  } catch {
    /* wallet will fill if supported */
  }
  return {
    ...tx,
    gas: gasHex,
    gasLimit: gasHex,
    ...(gasPrice ? { gasPrice } : {}),
  };
}

function extractSendHash(raw: unknown): `0x${string}` {
  const candidates: unknown[] = [raw];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    candidates.push(o.hash, o.txHash, o.txid, o.transactionHash, o.result);
  }
  for (const value of candidates) {
    if (typeof value === "string" && isHash(value)) return value;
  }
  throw new Error("Wallet did not return a transaction hash.");
}

export function usePay(resume?: { txHash?: string | null; paymentType?: string }) {
  const [phase, setPhase] = useState<PayPhase>("IDLE");
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");

  async function pay(paymentType: string) {
    setError("");
    setTxHash("");
    setPhase("PAYMENT_REQUESTED");
    try {
      const prep = await api<{
        payment: { tokenContract: string; recipient: string; amountUnits: string };
      }>(`/api/payments/prepare?type=${paymentType}`);
      if (!prep.ok || !prep.payment) {
        throw new Error(prep.error ?? "USDT testnet contract is not configured.");
      }

      const provider = getInjectedProvider();
      let hash: string;
      if (provider) {
        setPhase("WALLET_CONFIRMATION");
        await ensurePolygon();
        const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
        // IMPORTANT: ERC-20 transfer is created only after the user taps Pay.
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [prep.payment.recipient as `0x${string}`, BigInt(prep.payment.amountUnits)],
        });
        const tx = await withGas(provider, {
          from: accounts[0],
          to: prep.payment.tokenContract,
          data,
          value: "0x0",
        });
        const raw = await provider.request({
          method: "eth_sendTransaction",
          params: [tx],
        });
        hash = extractSendHash(raw);
      } else {
        const started = await api<{ deepLink: string; actionId: string }>("/api/wallet/tokenpocket/start", {
          method: "POST",
          body: JSON.stringify({ kind: "transfer", paymentType }),
        });
        if (!started.ok) throw new Error(started.error);
        localStorage.setItem("gx_tp_pay", started.actionId);
        localStorage.setItem(PAY_TYPE_KEY, paymentType);
        setPhase("WALLET_CONFIRMATION");
        window.location.href = started.deepLink!;
        return;
      }

      localStorage.setItem(PAY_HASH_KEY, hash);
      localStorage.setItem(PAY_TYPE_KEY, paymentType);
      setTxHash(hash);
      setPhase("SUBMITTED");
      await confirmOnServer(paymentType, hash);
    } catch (err) {
      const msg = walletErrorMessage(err);
      setError(msg);
      setPhase(msg.toLowerCase().includes("reject") ? "REJECTED" : "FAILED");
    }
  }

  useEffect(() => {
    const savedHash = localStorage.getItem(PAY_HASH_KEY) || resume?.txHash || "";
    const savedType = localStorage.getItem(PAY_TYPE_KEY) || resume?.paymentType || "REGISTRATION";
    if (savedHash && savedType && isHash(savedHash)) {
      setTxHash(savedHash);
      setPhase("PENDING");
      void confirmOnServer(savedType, savedHash);
    }

    const pending = localStorage.getItem("gx_tp_pay");
    const type = localStorage.getItem(PAY_TYPE_KEY);
    if (!pending || !type) return;
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      const st = await api<{ status: string; result: Record<string, string> | null }>(
        `/api/wallet/tokenpocket/status?actionId=${pending}`,
      );
      const hash = String(st.result?.txHash ?? st.result?.hash ?? st.result?.txid ?? "");
      if (st.status === "CALLBACK_RECEIVED" && hash.startsWith("0x")) {
        clearInterval(timer);
        localStorage.removeItem("gx_tp_pay");
        localStorage.setItem(PAY_HASH_KEY, hash);
        setTxHash(hash);
        setPhase("SUBMITTED");
        await confirmOnServer(type, hash);
      }
      if (Date.now() - startedAt > 5 * 60 * 1000) {
        clearInterval(timer);
        setPhase("FAILED");
        setError("Payment timed out. If the wallet showed success, wait and tap Pay again to retry verification.");
      }
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  async function confirmOnServer(paymentType: string, hash: string) {
    // IMPORTANT: Registration/plan become ACTIVE only after server-side chain verification.
    for (let i = 0; i < 20; i += 1) {
      const confirmed = await api<{ code?: string }>("/api/payments/confirm", {
        method: "POST",
        body: JSON.stringify({ paymentType, txHash: hash }),
      });
      if (confirmed.code === "PENDING" || (confirmed.error && /not mined|not readable|RPC|authenticated/i.test(confirmed.error))) {
        const me = await api<{ me?: { registration?: { status: string } } | null }>("/api/me");
        if (me.me?.registration?.status === "ACTIVE") {
          localStorage.removeItem(PAY_HASH_KEY);
          localStorage.removeItem(PAY_TYPE_KEY);
          setPhase("CONFIRMED");
          return;
        }
        setPhase("PENDING");
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      if (!confirmed.ok) {
        const me = await api<{ me?: { registration?: { status: string } } | null }>("/api/me");
        if (me.me?.registration?.status === "ACTIVE") {
          localStorage.removeItem(PAY_HASH_KEY);
          localStorage.removeItem(PAY_TYPE_KEY);
          setPhase("CONFIRMED");
          return;
        }
        setPhase("FAILED");
        setError(confirmed.error ?? "Verification failed");
        localStorage.removeItem(PAY_HASH_KEY);
        return;
      }
      localStorage.removeItem(PAY_HASH_KEY);
      localStorage.removeItem(PAY_TYPE_KEY);
      setPhase("CONFIRMED");
      return;
    }
    setPhase("PENDING");
    setError("Still waiting for blockchain confirmation. Keep this page open or refresh.");
  }

  return { phase, error, txHash, message: error || payPhaseMessage(phase), pay, setPhase, setTxHash };
}
