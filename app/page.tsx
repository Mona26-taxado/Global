"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Globe2,
  Lock,
  Network,
  Shield,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WalletModal } from "@/components/wallet/wallet-modal";
import { api } from "@/lib/utils";

export default function LandingPage() {
  const [open, setOpen] = useState(false);
  const [network, setNetwork] = useState("Polygon");
  const [testnet, setTestnet] = useState(false);
  useEffect(() => {
    api<{ config: { chainName: string; testnet: boolean } }>("/api/config").then((r) => {
      if (!r.config) return;
      setNetwork(r.config.chainName);
      setTestnet(r.config.testnet);
    });
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <header className="flex items-center justify-between gap-3">
        <span className="font-display text-sm tracking-[0.28em] sm:text-lg">GLOBAL X</span>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/network" className="hidden items-center gap-1 text-sm text-mute no-underline sm:inline-flex">
            <Network className="h-4 w-4" />
            Network
          </Link>
          <Button className="!px-3 !py-2 text-xs sm:!px-4 sm:!py-3 sm:text-sm" onClick={() => setOpen(true)}>
            <Wallet className="h-4 w-4" />
            Connect
          </Button>
        </div>
      </header>

      <section className="mt-12 grid gap-10 lg:mt-16 lg:grid-cols-2">
        <div>
          <Badge>{testnet ? `TESTNET · ${network}` : `LIVE · ${network}`}</Badge>
          <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.08] sm:text-6xl">
            GLOBAL X
            <span className="mt-3 block bg-gradient-to-r from-violet to-electric bg-clip-text text-transparent">
              Connect. Participate. Go Global.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-sm text-mute sm:text-base">
            Trust Wallet and TokenPocket on Polygon. Connecting never creates a payment. GLOBAL X never asks for a recovery phrase or private key.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button asChild>
              <Link href="/register" className="no-underline">
                <ArrowRight className="h-4 w-4" />
                Get started
              </Link>
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Wallet className="h-4 w-4" />
              Connect wallet
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/network" className="no-underline">
                <Globe2 className="h-4 w-4" />
                Explore network
              </Link>
            </Button>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-panel p-6 shadow-glow sm:p-8">
          <div className="text-xs uppercase tracking-[0.3em] text-mute">How it works</div>
          <ol className="mt-4 space-y-3 text-sm text-slate-200">
            {[
              { icon: Wallet, text: "Connect Trust Wallet or TokenPocket" },
              { icon: Shield, text: "Approve login only — no transfer" },
              { icon: Lock, text: "Sign a message to verify your wallet" },
              { icon: BadgeCheck, text: "Pay $5 USDT registration (separate from Connect)" },
              { icon: Globe2, text: "Buy a plan and share your referral link" },
            ].map((step, i) => (
              <li key={step.text} className="flex gap-3">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-semibold">
                  {i + 1}
                </span>
                <span className="flex items-start gap-2">
                  <step.icon className="mt-0.5 h-4 w-4 shrink-0 text-violet-200" />
                  {step.text}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {[
          { icon: Wallet, t: "Wallet", d: "Official Trust and TokenPocket flows. DApp Browser uses the injected provider." },
          { icon: Globe2, t: "Polygon", d: `${network}. Connecting never sends USDT. Pay is a separate action.` },
          { icon: Shield, t: "Security", d: "Nonce signatures. Server-side payment verification. No seed phrases." },
        ].map((card) => (
          <div key={card.t} className="rounded-3xl border border-white/10 bg-panel p-6">
            <card.icon className="h-6 w-6 text-violet-200" />
            <h2 className="mt-3 font-display text-xl">{card.t}</h2>
            <p className="mt-2 text-sm text-mute">{card.d}</p>
          </div>
        ))}
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-panel p-6">
          <BadgeCheck className="h-6 w-6 text-mint" />
          <h2 className="mt-3 font-display text-xl">Plans</h2>
          <p className="mt-2 text-sm text-mute">$100 / $200 / $500 / $1000 membership plans in USDT on Polygon.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-panel p-6">
          <Network className="h-6 w-6 text-violet-200" />
          <h2 className="mt-3 font-display text-xl">Global network</h2>
          <p className="mt-2 text-sm text-mute">Two-branch LEFT then RIGHT placement. Not an income guarantee.</p>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-2xl">FAQ</h2>
        <p className="mt-3 max-w-2xl text-sm text-mute">
          Will GLOBAL X ever ask for my seed phrase? No. If TokenPocket shows Transaction Details during Connect, that is a bug — Connect uses login only, never transfer.
        </p>
      </section>
      <WalletModal open={open} onOpenChange={setOpen} onVerified={() => (window.location.href = "/dashboard")} />
    </main>
  );
}
