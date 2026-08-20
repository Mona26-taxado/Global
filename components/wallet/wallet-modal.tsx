"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/card";
import { useWalletConnection } from "@/hooks/use-wallet-connection";

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
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/10 bg-[#0b1228] p-6 shadow-glow">
          <Dialog.Title className="font-display text-2xl tracking-wide">Connect your wallet</Dialog.Title>
          {/* IMPORTANT: Connect Wallet only authenticates. It must never initiate a transfer. */}
          <p className="mt-2 text-sm text-mute">Trust Wallet or TokenPocket. Connection never sends a payment.</p>

          {w.env.isDappBrowser && !w.address && (
            <Button className="mt-6 w-full" onClick={() => w.connectInjected()}>
              Connect Wallet
            </Button>
          )}

          {showChooser && (
            <div className="mt-6 grid gap-3">
              <Button variant="ghost" className="w-full justify-between" onClick={w.connectTrust}>
                Trust Wallet
              </Button>
              <Button variant="ghost" className="w-full justify-between" onClick={w.connectTokenPocket}>
                TokenPocket
              </Button>
            </div>
          )}

          {waiting && !w.address && (
            <div className="mt-6 space-y-3 rounded-2xl border border-white/10 bg-white/5 p-4">
              <Badge>TokenPocket</Badge>
              <p className="text-sm text-slate-200">{w.message}</p>
              {w.desktopHint && (
                <p className="text-sm text-mute">
                  Mac/Windows Chrome TokenPocket app open nahi karta. Phone par TokenPocket kholo → DApp browser mein{" "}
                  <span className="text-violet-200">{typeof window !== "undefined" ? window.location.origin : ""}</span>{" "}
                  open karo, phir Connect. Laptop par ye screen waiting mein rahegi jab tak phone approve na kare.
                </p>
              )}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  if (typeof window !== "undefined") navigator.clipboard.writeText(window.location.origin);
                }}
              >
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
                  Verify Wallet
                </Button>
              )}
            </div>
          )}

          {w.message && !waiting && <p className="mt-4 text-sm text-slate-200">{w.message}</p>}
          <p className="mt-6 text-xs leading-relaxed text-mute">
            GLOBAL X will never ask for your recovery phrase or private key.
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
