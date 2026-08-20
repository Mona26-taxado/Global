"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronRight, Copy, Globe2, Loader2, Shield, ShieldCheck, Smartphone, Wallet, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { useWalletConnection } from "@/hooks/use-wallet-connection";
import { friendlyMessage } from "@/lib/user-errors";
import { api, shortAddr } from "@/lib/utils";

export function WalletModal({
  open,
  onOpenChange,
  onVerified,
  referralCode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onVerified?: () => void;
  referralCode?: string;
}) {
  const w = useWalletConnection();
  const waiting =
    w.phase === "OPENING_WALLET" || w.phase === "WAITING_FOR_APPROVAL" || w.phase === "CONNECTING";
  const showChooser = !w.env.isDappBrowser && !w.address && !waiting;
  const [chainName, setChainName] = useState("Polygon");
  useEffect(() => {
    api<{ config: { chainName: string } }>("/api/config").then((r) => {
      if (r.config?.chainName) setChainName(r.config.chainName);
    });
  }, []);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && waiting) w.reset();
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(calc(100%-32px),480px)] max-h-[min(90vh,720px)] overflow-y-auto -translate-x-1/2 -translate-y-1/2 rounded-modal border border-line bg-elevated p-6 shadow-lift">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-display text-[22px] leading-8 text-cream">Connect Wallet</Dialog.Title>
              <p className="mt-2 text-sm text-secondary">Choose a wallet to securely sign in to GLOBAL X.</p>
            </div>
            <Dialog.Close className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-mute hover:bg-white/10 hover:text-cream" aria-label="Close">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          <div className="mt-5 rounded-card border border-info/30 bg-info/10 px-4 py-3">
            <p className="text-sm font-semibold text-cream">Login only</p>
            <p className="mt-0.5 text-sm text-secondary">Connecting your wallet does not transfer tokens.</p>
          </div>

          {w.env.isDappBrowser && !w.address && (
            <Button className="mt-6 w-full" onClick={() => w.connectInjected()}>
              <Wallet className="h-4 w-4" />
              Connect Wallet
            </Button>
          )}

          {showChooser && (
            <div className="mt-6 grid gap-3">
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-between rounded-xl border border-line bg-surface2 px-4 text-left"
                onClick={w.connectTrust}
              >
                <span className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-cream" />
                  <span>
                    <span className="block text-sm font-semibold text-cream">Trust Wallet</span>
                    <span className="block text-xs text-mute">Open Trust Wallet to sign in</span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-mute" />
              </button>
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-between rounded-xl border border-line bg-surface2 px-4 text-left"
                onClick={w.connectTokenPocket}
              >
                <span className="flex items-center gap-3">
                  <Smartphone className="h-5 w-5 text-cream" />
                  <span>
                    <span className="block text-sm font-semibold text-cream">TokenPocket</span>
                    <span className="block text-xs text-mute">Open TokenPocket to sign in</span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 text-mute" />
              </button>
            </div>
          )}

          {waiting && !w.address && (
            <div className="mt-6 space-y-3 rounded-card border border-line bg-surface2 p-4">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-violet" />
                <p className="text-sm text-cream">{w.message}</p>
              </div>
              {w.desktopHint && (
                <p className="text-sm text-secondary">Approve the connection in your wallet. This screen waits until the request is approved.</p>
              )}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  if (typeof window !== "undefined") navigator.clipboard.writeText(window.location.origin);
                }}
              >
                <Copy className="h-4 w-4" />
                Copy site URL
              </Button>
              <Button variant="ghost" className="w-full" onClick={w.reset}>
                Cancel / try another wallet
              </Button>
            </div>
          )}

          {w.address && (
            <div className="mt-6 space-y-3">
              <Badge tone={w.phase === "WRONG_NETWORK" ? "danger" : "mint"}>
                {w.phase === "WRONG_NETWORK" ? "Wrong network" : "Connected"}
              </Badge>
              <p className="font-mono text-sm text-cream">{shortAddr(w.address)}</p>
              {w.phase === "WRONG_NETWORK" ? (
                <Button className="w-full" onClick={w.switchPolygon}>
                  <Globe2 className="h-4 w-4" />
                  Switch to {chainName}
                </Button>
              ) : (
                <Button
                  className="w-full"
                  onClick={async () => {
                    const ok = await w.verify(referralCode);
                    if (ok) onVerified?.();
                  }}
                >
                  <ShieldCheck className="h-4 w-4" />
                  Verify wallet
                </Button>
              )}
            </div>
          )}

          {w.error && !waiting && (() => {
            const n = friendlyMessage(w.error);
            return (
              <Alert className="mt-4" tone={n.tone} title={n.title}>
                {n.detail}
              </Alert>
            );
          })()}
          {!w.error && w.message && !waiting && w.phase !== "AUTHENTICATED" && (
            <p className="mt-4 text-sm text-secondary">{w.message}</p>
          )}
          <p className="mt-6 text-xs leading-5 text-mute">
            GLOBAL X never asks for your seed phrase or private key.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
