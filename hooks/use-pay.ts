"use client";

import { encodeFunctionData, erc20Abi } from "viem";
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

export function usePay() {
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
        hash = (await provider.request({
          method: "eth_sendTransaction",
          params: [{ from: accounts[0], to: prep.payment.tokenContract, data }],
        })) as string;
      } else {
        const started = await api<{ deepLink: string; actionId: string }>("/api/wallet/tokenpocket/start", {
          method: "POST",
          body: JSON.stringify({ kind: "transfer", paymentType }),
        });
        if (!started.ok) throw new Error(started.error);
        localStorage.setItem("gx_tp_pay", started.actionId);
        localStorage.setItem("gx_tp_pay_type", paymentType);
        setPhase("WALLET_CONFIRMATION");
        window.location.href = started.deepLink!;
        return;
      }

      setTxHash(hash);
      setPhase("SUBMITTED");
      await confirmOnServer(paymentType, hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Payment failed";
      setError(msg);
      setPhase(msg.toLowerCase().includes("reject") ? "REJECTED" : "FAILED");
    }
  }

  useEffect(() => {
    const pending = localStorage.getItem("gx_tp_pay");
    const type = localStorage.getItem("gx_tp_pay_type");
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
        localStorage.removeItem("gx_tp_pay_type");
        setTxHash(hash);
        setPhase("SUBMITTED");
        await confirmOnServer(type, hash);
      }
      if (Date.now() - startedAt > 5 * 60 * 1000) {
        clearInterval(timer);
        setPhase("FAILED");
        setError("Payment timed out.");
      }
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  async function confirmOnServer(paymentType: string, hash: string) {
    // IMPORTANT: Registration/plan become ACTIVE only after server-side chain verification.
    for (let i = 0; i < 24; i += 1) {
      const confirmed = await api<{ code?: string }>("/api/payments/confirm", {
        method: "POST",
        body: JSON.stringify({ paymentType, txHash: hash }),
      });
      if (confirmed.code === "PENDING") {
        setPhase("PENDING");
        await new Promise((r) => setTimeout(r, 4000));
        continue;
      }
      if (!confirmed.ok) {
        setPhase("FAILED");
        setError(confirmed.error ?? "Verification failed");
        return;
      }
      setPhase("CONFIRMED");
      return;
    }
    setPhase("PENDING");
    setError("Still waiting for blockchain confirmation. Refresh later.");
  }

  return { phase, error, txHash, message: error || payPhaseMessage(phase), pay, setPhase, setTxHash };
}
