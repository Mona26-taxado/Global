"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Globe2,
  Layers,
  Lock,
  Network,
  Shield,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WalletModal } from "@/components/wallet/wallet-modal";
import { api } from "@/lib/utils";

const STEPS = [
  { icon: Wallet, title: "Connect", text: "Trust Wallet or TokenPocket. Login only — no transfer." },
  { icon: Shield, title: "Authorize", text: "Approve the connection in your wallet." },
  { icon: Lock, title: "Sign in", text: "Sign a message. This never moves USDT." },
  { icon: BadgeCheck, title: "Register", text: "Pay $5 USDT on Polygon. Separate from Connect." },
  { icon: Users, title: "Grow", text: "Choose a plan and share your referral link." },
];

const PLANS = [
  { name: "$100", hint: "Starter" },
  { name: "$200", hint: "Builder" },
  { name: "$500", hint: "Pro" },
  { name: "$1000", hint: "Elite" },
];

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
    <main className="overflow-x-hidden">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#04060f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <span className="font-display text-sm tracking-[0.28em] sm:text-lg">GLOBAL X</span>
          <div className="flex items-center gap-2">
            <Link href="/network" className="hidden items-center gap-1.5 rounded-2xl px-3 py-2 text-sm text-mute no-underline hover:text-white sm:inline-flex">
              <Network className="h-4 w-4" />
              Network
            </Link>
            <Button className="!px-3 !py-2 text-xs sm:!px-4 sm:!py-2.5 sm:text-sm" onClick={() => setOpen(true)}>
              <Wallet className="h-4 w-4" />
              Connect wallet
            </Button>
          </div>
        </div>
      </header>

      <section className="relative mx-auto max-w-6xl px-4 pb-8 pt-10 sm:pt-16">
        <div className="pointer-events-none absolute -left-20 top-0 h-64 w-64 rounded-full bg-violet/20 blur-3xl" />
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <Badge tone={testnet ? "violet" : "mint"}>{testnet ? `TESTNET · ${network}` : `LIVE · ${network}`}</Badge>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.08] sm:text-6xl">
              GLOBAL X
              <span className="mt-3 block bg-gradient-to-r from-violet to-electric bg-clip-text text-transparent">
                Connect. Participate. Go Global.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-relaxed text-mute sm:text-base">
              Membership on Polygon with Trust Wallet and TokenPocket. Connecting never sends a payment. We never ask for a recovery phrase or private key.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/register" className="no-underline">
                  <Sparkles className="h-4 w-4" />
                  Get started
                  <ArrowRight className="h-4 w-4" />
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

          <div className="rounded-[28px] border border-white/10 bg-panel p-5 shadow-glow sm:p-6">
            <div className="flex items-center justify-between">
              <p className="text-[11px] uppercase tracking-[0.28em] text-mute">How it works</p>
              <Layers className="h-4 w-4 text-violet-200" />
            </div>
            <div className="mt-4 space-y-2">
              {STEPS.map((step, i) => (
                <div key={step.title} className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet/40 to-electric/30 text-white">
                    <step.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">
                      {i + 1}. {step.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-mute">{step.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Wallet, t: "Official wallets", d: "Trust Wallet and TokenPocket. DApp browser uses the in-app provider." },
            { icon: Globe2, t: network, d: "Connecting never sends USDT. You only pay when you tap Pay." },
            { icon: Shield, t: "Built for safety", d: "Signed login, on-chain verification, no seed phrases — ever." },
          ].map((card) => (
            <div key={card.t} className="rounded-[28px] border border-white/10 bg-panel p-6 transition hover:border-violet/40">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet/15 text-violet-200">
                <card.icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-display text-xl">{card.t}</h2>
              <p className="mt-2 text-sm leading-relaxed text-mute">{card.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-mute">Membership</p>
            <h2 className="mt-1 font-display text-3xl">Plans</h2>
          </div>
          <Button variant="ghost" asChild className="!py-2 text-xs">
            <Link href="/plans" className="no-underline">
              View plans
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {PLANS.map((p) => (
            <Link key={p.name} href="/register" className="no-underline">
              <div className="rounded-[28px] border border-white/10 bg-panel p-5 transition hover:border-violet/50 hover:shadow-glow">
                <p className="text-[11px] uppercase tracking-wider text-mute">{p.hint}</p>
                <p className="mt-2 font-display text-3xl text-white">{p.name}</p>
                <p className="mt-1 text-xs text-mute">USDT · {network}</p>
              </div>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-mute">Not an income guarantee. Plans unlock after $5 registration is ACTIVE.</p>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-8">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[28px] border border-white/10 bg-panel p-6">
            <Network className="h-6 w-6 text-violet-200" />
            <h2 className="mt-3 font-display text-xl">Global placement</h2>
            <p className="mt-2 text-sm leading-relaxed text-mute">
              Two-branch network fills LEFT, then RIGHT. Direct #2 sits under the Global root. Prototype placement — not a promise of earnings.
            </p>
            <Button variant="ghost" asChild className="mt-4">
              <Link href="/network" className="no-underline">
                <Globe2 className="h-4 w-4" />
                Open network map
              </Link>
            </Button>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-panel p-6">
            <Shield className="h-6 w-6 text-mint" />
            <h2 className="mt-3 font-display text-xl">FAQ</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-2xl bg-white/5 p-3">
                <p className="font-semibold">Will you ask for my seed phrase?</p>
                <p className="mt-1 text-mute">No. Never. If a wallet shows a transfer during Connect, close it — Connect is login only.</p>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <p className="font-semibold">When do I pay $5?</p>
                <p className="mt-1 text-mute">Only after you tap Pay $5 registration. Connecting and signing in do not send USDT.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 py-10 text-center text-xs text-mute">
        GLOBAL X · Polygon · Connect never pays
      </footer>

      <WalletModal open={open} onOpenChange={setOpen} onVerified={() => (window.location.href = "/dashboard")} />
    </main>
  );
}
