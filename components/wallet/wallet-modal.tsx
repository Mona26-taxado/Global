"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Copy, Globe2, Shield, Smartphone, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { useWalletConnection } from "@/hooks/use-wallet-connection";
import { friendlyMessage } from "@/lib/user-errors";

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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-white/10 bg-[#0b1228] p-6 shadow-glow">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-display text-2xl tracking-wide">Connect your wallet</Dialog.Title>
              <p className="mt-2 text-sm text-mute">Trust Wallet or TokenPocket. Connection never sends a payment.</p>
            </div>
            <Dialog.Close className="rounded-xl p-1 text-mute hover:bg-white/10 hover:text-white" aria-label="Close">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>

          {w.env.isDappBrowser && !w.address && (
            <Button className="mt-6 w-full" onClick={() => w.connectInjected()}>
              <Wallet className="h-4 w-4" />
              Connect wallet
            </Button>
          )}

          {showChooser && (
            <div className="mt-6 grid gap-3">
              <Button variant="ghost" className="w-full justify-between" onClick={w.connectTrust}>
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-violet-200" />
                  Trust Wallet
                </span>
                <Wallet className="h-4 w-4" />
              </Button>
              <Button variant="ghost" className="w-full justify-between" onClick={w.connectTokenPocket}>
                <span className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-violet-200" />
                  TokenPocket
                </span>
                <Wallet className="h-4 w-4" />
              </Button>
            </div>
          )}

          {waiting && !w.address && (
            <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <Badge>TokenPocket</Badge>
              <p className="text-sm text-slate-200">{w.message}</p>
              {w.desktopHint && (
                <p className="text-sm text-mute">
                  TokenPocket on Mac/Windows Chrome does not open the app. On your phone, open TokenPocket → DApp browser →{" "}
                  <span className="text-violet-200">{typeof window !== "undefined" ? window.location.origin : ""}</span>
                  , then Connect. This screen waits until the phone approves.
                </p>
              )}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  if (typeof window !== "undefined") navigator.clipboard.writeText(window.location.origin);
                }}
              >
                <Copy className="h-4 w-4" />
                Copy site URL for phone
              </Button>
              <Button variant="ghost" className="w-full" onClick={w.reset}>
                Cancel / try another wallet
              </Button>
            </div>
          )}

          {w.address && (
            <div className="mt-6 space-y-3">
              <Badge tone={w.phase === "WRONG_NETWORK" ? "danger" : "mint"}>
                {w.phase === "WRONG_NETWORK" ? "Wrong Network" : "Connected"}
              </Badge>
              <p className="font-mono text-sm text-violet-200">
                {w.address.slice(0, 6)}…{w.address.slice(-4)}
              </p>
              {w.phase === "WRONG_NETWORK" ? (
                <Button className="w-full" onClick={w.switchPolygon}>
                  <Globe2 className="h-4 w-4" />
                  Switch to Polygon
                </Button>
              ) : (
                <Button
                  className="w-full"
                  onClick={async () => {
                    const ok = await w.verify(referralCode);
                    if (ok) onVerified?.();
                  }}
                >
                  <Wallet className="h-4 w-4" />
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
            <p className="mt-4 text-sm text-slate-200">{w.message}</p>
          )}
          <p className="mt-6 text-xs leading-relaxed text-mute">
            GLOBAL X will never ask for your recovery phrase or private key.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
