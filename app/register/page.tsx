"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { WalletModal } from "@/components/wallet/wallet-modal";
import { RegistrationPayCard } from "@/components/payments/registration-card";
import { api } from "@/lib/utils";

function RegisterInner() {
  const params = useSearchParams();
  const router = useRouter();
  const ref = params.get("ref") ?? "";
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<{
    registration?: { status: string; tx_hash?: string | null };
  } | null | "loading">("loading");

  useEffect(() => {
    if (ref) localStorage.setItem("gx_referral", ref);
  }, [ref]);

  function loadMe() {
    api<{ me: { registration?: { status: string; tx_hash?: string | null } } | null }>("/api/me").then((r) => {
      setMe(r.me);
      if (r.me?.registration?.status === "ACTIVE") router.replace("/plans");
    });
  }

  useEffect(() => {
    loadMe();
  }, []);

  useEffect(() => {
    if (me === "loading" || !me?.registration || me.registration.status === "ACTIVE") return;
    if (me.registration.status !== "PENDING") return;
    const timer = setInterval(loadMe, 2000);
    return () => clearInterval(timer);
  }, [me === "loading" ? "loading" : me?.registration?.status]);

  if (me === "loading") return <p className="p-10 text-mute">Loading…</p>;

  if (me) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="font-display text-4xl">Registration</h1>
        <RegistrationPayCard
          status={me.registration?.status ?? "NOT_PAID"}
          txHash={me.registration?.tx_hash}
          onActive={() => router.replace("/plans")}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <Badge>Register</Badge>
      <h1 className="mt-4 font-display text-4xl">Join GLOBAL X</h1>
      <p className="mt-3 text-sm text-mute">
        {ref ? `Referral ${ref} is stored until you verify. Sponsor is set on the server.` : "Connect and verify your wallet. Connection never sends a payment."}
      </p>
      <Button className="mt-8 w-full" onClick={() => setOpen(true)}>
        Connect Wallet
      </Button>
      <p className="mt-6 text-center text-xs text-mute">
        <Link href="/">Back home</Link>
      </p>
      <WalletModal
        open={open}
        onOpenChange={setOpen}
        referralCode={ref || (typeof window !== "undefined" ? localStorage.getItem("gx_referral") ?? "" : "")}
        onVerified={() => loadMe()}
      />
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterInner />
    </Suspense>
  );
}
