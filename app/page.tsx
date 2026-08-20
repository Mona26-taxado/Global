"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Globe2,
  Layers,
  Lock,
  Network,
  Shield,
  ShieldCheck,
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
    <main className="overflow-x-hidden">
      <header className="sticky top-0 z-20 border-b border-line bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-content items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <span className="font-display text-sm tracking-[0.28em] sm:text-lg">GLOBAL X</span>
          <div className="flex items-center gap-2">
            <Link href="/network" className="hidden min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-mute no-underline hover:text-cream sm:inline-flex">
              <Network className="h-4 w-4" />
              Network
            </Link>
            <Button variant="ghost" className="!min-h-11 !px-3 !text-xs sm:!px-4 sm:!text-sm" onClick={() => setOpen(true)}>
              <Wallet className="h-4 w-4" />
              Login
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-content px-4 pb-10 pt-10 sm:px-6 sm:pt-16 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-[58%_42%]">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="info">Polygon Membership Network</Badge>
              {testnet && <Badge tone="warning">TESTNET</Badge>}
            </div>
            <h1 className="mt-5 font-display text-[34px] font-semibold leading-10 text-cream sm:text-[52px] sm:leading-[58px]">
              GLOBAL X
              <span className="mt-2 block bg-gradient-to-r from-violet to-electric bg-clip-text text-transparent">
                Connect. Participate. Go Global.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-[23px] text-secondary sm:text-[17px] sm:leading-[27px]">
              Membership on {network} with Trust Wallet and TokenPocket. Connecting never sends a payment. We never ask for a recovery phrase or private key.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/register" className="no-underline">
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="ghost" onClick={() => setOpen(true)}>
                <Wallet className="h-4 w-4" />
                Login
              </Button>
            </div>
            <p className="mt-4 flex items-start gap-2 text-xs text-mute">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Wallet connection never transfers funds.
            </p>
          </div>

          <div className="rounded-feature border border-line bg-surface2 p-5 shadow-card sm:p-6">
            <p className="text-[11px] uppercase tracking-[0.2em] text-mute">Membership snapshot</p>
            <div className="mt-4 space-y-3">
              {[
                ["Wallet", "Connected"],
                ["Membership", "Registration"],
                ["Network", network],
                ["Plan", "Choose after register"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-elevated px-4 py-3">
                  <span className="text-sm text-mute">{k}</span>
                  <span className="truncate text-sm font-semibold text-cream">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { n: "01", t: "Connect & Verify", d: "Sign in with Trust Wallet or TokenPocket." },
            { n: "02", t: "Register", d: "Complete the one-time registration payment." },
            { n: "03", t: "Choose Plan", d: "Unlock membership plans after registration is active." },
          ].map((s) => (
            <div key={s.n} className="rounded-card border border-line bg-surface2 p-5 shadow-card">
              <p className="font-display text-sm text-violet">{s.n}</p>
              <h2 className="mt-2 font-display text-xl text-cream sm:text-[22px] sm:leading-[30px]">{s.t}</h2>
              <p className="mt-2 text-sm text-secondary">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { icon: Wallet, t: "Official wallets", d: "Trust Wallet and TokenPocket. In-app browsers use the wallet already open." },
            { icon: Globe2, t: network, d: "Connecting never sends tokens. You only pay when you tap Pay." },
            { icon: Shield, t: "Built for safety", d: "Signed login, on-chain verification, no seed phrases — ever." },
          ].map((card) => (
            <div key={card.t} className="rounded-feature border border-line bg-surface2 p-6 shadow-card">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet/15 text-cream">
                <card.icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-display text-xl">{card.t}</h2>
              <p className="mt-2 text-sm leading-6 text-secondary">{card.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-content px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-mute">Membership</p>
            <h2 className="mt-1 font-display text-[26px] leading-8 sm:text-[30px] sm:leading-[38px]">Plans</h2>
          </div>
          <Button variant="ghost" asChild className="!text-xs">
            <Link href="/plans" className="no-underline">
              View plans
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {["$100", "$200", "$500", "$1000"].map((name) => (
            <Link key={name} href="/register" className="no-underline">
              <div className="rounded-feature border border-line bg-surface2 p-5 shadow-card transition hover:border-violet/40">
                <p className="text-[11px] uppercase tracking-wider text-mute">Plan</p>
                <p className="mt-2 font-display text-3xl tabular text-cream">{name}</p>
                <p className="mt-1 text-xs text-mute">{network}</p>
              </div>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-mute">Plans unlock after registration is ACTIVE. Not an income guarantee.</p>
      </section>

      <section className="mx-auto max-w-content px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-feature border border-line bg-surface2 p-6 shadow-card">
            <Network className="h-6 w-6 text-cream" />
            <h2 className="mt-3 font-display text-xl">Global placement</h2>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Two-branch network fills LEFT, then RIGHT. Direct referral limits are enforced by the network — not by this page.
            </p>
            <Button variant="ghost" asChild className="mt-4">
              <Link href="/network" className="no-underline">
                <Globe2 className="h-4 w-4" />
                Open network map
              </Link>
            </Button>
          </div>
          <div className="rounded-feature border border-line bg-surface2 p-6 shadow-card">
            <ShieldCheck className="h-6 w-6 text-mint" />
            <h2 className="mt-3 font-display text-xl">FAQ</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-xl bg-elevated p-3">
                <p className="font-semibold">Will you ask for my seed phrase?</p>
                <p className="mt-1 text-secondary">No. Never. If a wallet shows a transfer during Connect, close it — Connect is login only.</p>
              </div>
              <div className="rounded-xl bg-elevated p-3">
                <p className="font-semibold">When do I pay?</p>
                <p className="mt-1 text-secondary">Only after you tap Pay on Register or Plans. Connecting and signing in do not send tokens.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-content px-4 py-10 text-center text-xs text-mute sm:px-6 lg:px-8">
        GLOBAL X · {network} · Connect never pays
      </footer>

      <WalletModal open={open} onOpenChange={setOpen} onVerified={() => (window.location.href = "/dashboard")} />
    </main>
  );
}
