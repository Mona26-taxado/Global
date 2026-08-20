"use client";

// IMPORTANT:
// Connect Wallet only authenticates the wallet.
// It must never initiate a blockchain transaction.
// TokenPocket Connect uses action: "login" only. Transfer is Pay-only.

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/utils";
import type { WalletKind, WalletPhase } from "@/types";
import { detectWalletEnvironment } from "@/wallet/dapp-browser/detect";
import { ensurePolygon, requestInjectedAccount } from "@/wallet/dapp-browser/provider";
import { trustOpenDapp } from "@/wallet/trust/deeplink";

const TP_KEY = "gx_tp_login";

export function phaseMessage(phase: WalletPhase, wallet?: WalletKind | null) {
  switch (phase) {
    case "OPENING_WALLET":
      return wallet === "tokenpocket" ? "Opening TokenPocket..." : "Opening Trust Wallet...";
    case "WAITING_FOR_APPROVAL":
      return "Approve the connection in your wallet.";
    case "CONNECTING":
      return "Waiting for wallet approval...";
    case "CONNECTED":
      return "Wallet connected.";
    case "VERIFYING":
      return "Verifying wallet ownership...";
    case "AUTHENTICATED":
      return "Wallet verified.";
    case "WRONG_NETWORK":
      return "Wrong network. Switch to Polygon.";
    case "REJECTED":
      return "Connection rejected.";
    case "TIMEOUT":
      return "Connection timed out.";
    case "DISCONNECTED":
      return "Disconnected.";
    case "ERROR":
      return "Something went wrong.";
    default:
      return "";
  }
}

export function useWalletConnection() {
  const env = useMemo(() => detectWalletEnvironment(), []);
  const [phase, setPhase] = useState<WalletPhase>("IDLE");
  const [address, setAddress] = useState("");
  const [wallet, setWallet] = useState<WalletKind | null>(
    env.isDappBrowser ? (env.kind === "tokenpocket" ? "tokenpocket" : env.kind === "trust" ? "trust" : "injected") : null,
  );
  const [error, setError] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [desktopHint, setDesktopHint] = useState(false);

  const reset = useCallback(() => {
    localStorage.removeItem(TP_KEY);
    localStorage.removeItem("gx_tp_sign");
    localStorage.removeItem("gx_tp_pay");
    setPhase("IDLE");
    setError("");
    setAuthenticated(false);
    setWallet(env.isDappBrowser ? (env.kind === "tokenpocket" ? "tokenpocket" : env.kind === "trust" ? "trust" : "injected") : null);
    setDesktopHint(false);
  }, [env]);

  const finishConnect = useCallback(async (addr: string, kind: WalletKind) => {
    setAddress(addr);
    setWallet(kind);
    try {
      const { getInjectedProvider } = await import("@/wallet/dapp-browser/detect");
      if (getInjectedProvider()) await ensurePolygon();
      setPhase("CONNECTED");
    } catch {
      setPhase("WRONG_NETWORK");
    }
  }, []);

  const connectInjected = useCallback(async (kind: WalletKind) => {
    setPhase("CONNECTING");
    setError("");
    try {
      const addr = await requestInjectedAccount();
      await finishConnect(addr, kind);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ERROR";
      setPhase(msg === "REJECTED" || msg.includes("reject") ? "REJECTED" : "ERROR");
      setError(msg);
    }
  }, [finishConnect]);

  const connectTrust = useCallback(async () => {
    if (env.hasInjected) {
      await connectInjected(env.kind === "trust" ? "trust" : "injected");
      return;
    }
    setPhase("OPENING_WALLET");
    setWallet("trust");
    const url = trustOpenDapp(window.location.origin);
    window.location.href = url;
  }, [connectInjected, env]);

  const connectTokenPocket = useCallback(async () => {
    if (env.kind === "tokenpocket" || env.isDappBrowser) {
      await connectInjected("tokenpocket");
      return;
    }
    setPhase("OPENING_WALLET");
    setWallet("tokenpocket");
    setError("");
    const started = await api<{ actionId: string; deepLink: string }>("/api/wallet/tokenpocket/start", {
      method: "POST",
      body: JSON.stringify({ kind: "login" }),
    });
    if (!started.ok || !started.deepLink) {
      setPhase("ERROR");
      setError(started.error ?? "Could not start TokenPocket login.");
      return;
    }
    localStorage.setItem(TP_KEY, started.actionId);
    setPhase("WAITING_FOR_APPROVAL");
    // Desktop Chrome cannot open tpoutside:// (TokenPocket is a phone app).
    // Keep polling; the user must approve inside TokenPocket on the phone.
    if (!env.isMobile) {
      setDesktopHint(true);
      return;
    }
    window.location.href = started.deepLink;
  }, [connectInjected, env]);

  useEffect(() => {
    const pending = localStorage.getItem(TP_KEY);
    if (!pending) return;
    setPhase("WAITING_FOR_APPROVAL");
    setWallet("tokenpocket");
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - startedAt > 3 * 60 * 1000) {
        clearInterval(timer);
        localStorage.removeItem(TP_KEY);
        setPhase("TIMEOUT");
        return;
      }
      const st = await api<{ status: string; result: unknown; address?: string }>(
        `/api/wallet/tokenpocket/status?actionId=${pending}`,
      );
      if (st.status === "CALLBACK_RECEIVED") {
        clearInterval(timer);
        localStorage.removeItem(TP_KEY);
        const addr = st.address;
        if (!addr) {
          setPhase("ERROR");
          setError("TokenPocket returned no account. Address in a URL is not trusted without a callback result.");
          return;
        }
        void finishConnect(addr, "tokenpocket");
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [finishConnect]);

  const switchPolygon = useCallback(async () => {
    try {
      await ensurePolygon();
      setPhase(address ? "CONNECTED" : "IDLE");
    } catch {
      setPhase("WRONG_NETWORK");
    }
  }, [address]);

  const verify = useCallback(async (referralCode?: string, profile?: { display_name: string; email: string; mobile: string }) => {
    if (!address) return false;
    setPhase("VERIFYING");
    const nonceRes = await api<{ message: string; nonce: string }>("/api/auth/nonce", {
      method: "POST",
      body: JSON.stringify({ address }),
    });
      if (!nonceRes.ok) {
        setPhase("ERROR");
        setError(nonceRes.error ?? "Nonce failed");
        return false;
      }
    const provider = (await import("@/wallet/dapp-browser/detect")).getInjectedProvider();
    try {
      let signature: string;
      if (provider) {
        signature = (await provider.request({
          method: "personal_sign",
          params: [nonceRes.message, address],
        })) as string;
      } else {
        const started = await api<{ actionId: string; deepLink: string }>("/api/wallet/tokenpocket/start", {
          method: "POST",
          body: JSON.stringify({ kind: "sign", address, message: nonceRes.message, nonce: nonceRes.nonce }),
        });
        if (!started.ok) throw new Error(started.error);
        localStorage.setItem("gx_tp_sign", started.actionId);
        window.location.href = started.deepLink!;
        return false;
      }
      const verifyRes = await api("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({
          address,
          signature,
          referralCode,
          walletType: wallet,
          display_name: profile?.display_name,
          email: profile?.email,
          mobile: profile?.mobile,
        }),
      });
      if (!verifyRes.ok) throw new Error(verifyRes.error);
      setAuthenticated(true);
      setPhase("AUTHENTICATED");
      return true;
    } catch (err) {
      const msg = String(err instanceof Error ? err.message : err);
      setPhase(msg.toLowerCase().includes("reject") ? "REJECTED" : "ERROR");
      setError(msg);
      return false;
    }
  }, [address, wallet]);

  const disconnect = useCallback(async () => {
    await api("/api/auth/logout", { method: "POST" });
    setAddress("");
    setAuthenticated(false);
    setPhase("DISCONNECTED");
  }, []);

  return {
    env,
    phase,
    address,
    wallet,
    error,
    authenticated,
    message: error || phaseMessage(phase, wallet),
    connectTrust,
    connectTokenPocket,
    connectInjected: () => connectInjected(env.kind === "tokenpocket" ? "tokenpocket" : env.kind === "trust" ? "trust" : "injected"),
    switchPolygon,
    verify,
    disconnect,
    desktopHint,
    reset,
  };
}
