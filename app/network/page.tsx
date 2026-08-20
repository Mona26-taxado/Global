"use client";

import Link from "next/link";
import { NetworkCanvas } from "@/components/network/tree";

export default function PublicNetworkPage() {
  return (
    <main className="mx-auto max-w-content overflow-x-hidden px-4 py-10 sm:px-6 lg:px-8">
      <Link href="/" className="text-sm text-mute no-underline hover:text-cream">
        ← Home
      </Link>
      <h1 className="mt-6 font-display text-[34px] leading-10 sm:text-[40px] sm:leading-[46px]">Global Network</h1>
      <p className="mt-2 max-w-xl text-sm text-secondary">Existing LEFT / RIGHT placement. Prototype visualization.</p>
      <div className="mt-6">
        <NetworkCanvas />
      </div>
    </main>
  );
}
