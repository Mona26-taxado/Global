"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WalletModal } from "@/components/wallet/wallet-modal";

export default function LandingPage() {
  const [open, setOpen] = useState(false);
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <header className="flex items-center justify-between">
        <span className="font-display text-lg tracking-[0.28em]">GLOBAL X</span>
        <div className="flex gap-3">
          <Link href="/network" className="text-sm text-mute no-underline">
            Explore Network
          </Link>
          <Button onClick={() => setOpen(true)}>Connect Wallet</Button>
        </div>
      </header>

      <section className="mt-20 grid gap-10 lg:grid-cols-2">
        <div>
          <Badge>TESTNET / DEMO · Polygon Amoy</Badge>
          <h1 className="mt-6 font-display text-6xl font-semibold leading-[1.05]">
            GLOBAL X
            <span className="mt-3 block bg-gradient-to-r from-violet to-electric bg-clip-text text-transparent">
              Connect. Participate. Go Global.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-mute">
            Trust Wallet and TokenPocket on Polygon. Connecting never creates a payment. GLOBAL X never asks for a recovery phrase or private key.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/register" className="no-underline">
                Get Started
              </Link>
            </Button>
            <Button onClick={() => setOpen(true)}>Connect Wallet</Button>
            <Button variant="ghost" asChild>
              <Link href="/network" className="no-underline">
                Explore Network
              </Link>
            </Button>
          </div>
        </div>
        <div className="rounded-3xl border border-white/10 bg-panel p-8 shadow-glow">
          <div className="text-xs uppercase tracking-[0.3em] text-mute">How it works</div>
          <ol className="mt-4 space-y-3 text-sm text-slate-200">
            <li>1. Get Started → Connect Trust Wallet or TokenPocket</li>
            <li>2. Approve authorization only — no transfer</li>
            <li>3. Sign a login message</li>
            <li>4. Pay $5 registration (separate from Connect)</li>
            <li>5. After ACTIVE, buy a plan and share your referral link</li>
          </ol>
        </div>
      </section>

      <section className="mt-20 grid gap-4 md:grid-cols-3">
        {[
          ["Wallet", "Official Trust and TokenPocket flows. DApp Browser uses the injected provider."],
          ["Polygon", "Development on Amoy (80002). Production config for Mainnet (137) stays gated."],
          ["Security", "Nonce signatures. Server-side payment verification. No seed phrases."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-3xl border border-white/10 bg-panel p-6">
            <h2 className="font-display text-xl">{t}</h2>
            <p className="mt-2 text-sm text-mute">{d}</p>
          </div>
        ))}
      </section>

      <section className="mt-16 grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-panel p-6">
          <h2 className="font-display text-xl">Plans</h2>
          <p className="mt-2 text-sm text-mute">$100 / $200 / $500 / $1000 demo plans. Testnet only by default.</p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-panel p-6">
          <h2 className="font-display text-xl">Global Network</h2>
          <p className="mt-2 text-sm text-mute">Two-branch LEFT/RIGHT prototype with 250 DEMO users. Not an income guarantee.</p>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-2xl">FAQ</h2>
        <p className="mt-3 max-w-2xl text-sm text-mute">
          Will GLOBAL X ever ask for my seed phrase? No. If TokenPocket shows Transaction Details during Connect, that is a bug — Connect uses login/authorize only, never transfer.
        </p>
      </section>
      <WalletModal open={open} onOpenChange={setOpen} onVerified={() => (window.location.href = "/dashboard")} />
    </main>
  );
}
