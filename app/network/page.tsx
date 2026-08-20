"use client";

import { NetworkCanvas } from "@/components/network/tree";
import Link from "next/link";

export default function PublicNetworkPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <Link href="/" className="text-sm text-mute">
        ← Home
      </Link>
      <h1 className="mt-6 font-display text-4xl">Global Network</h1>
      <div className="mt-6">
        <NetworkCanvas />
      </div>
    </main>
  );
}
