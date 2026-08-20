"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletModal } from "@/components/wallet/wallet-modal";
import { RegistrationPayCard } from "@/components/payments/registration-card";
import { PageHeader, Stepper } from "@/components/ui/app-ui";
import { api } from "@/lib/utils";

function RegisterInner() {
  const params = useSearchParams();
  const router = useRouter();
  const ref = params.get("ref") ?? "";
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<{
    address?: string;
    registration?: { status: string; tx_hash?: string | null };
  } | null | "loading">("loading");

  useEffect(() => {
    if (ref) localStorage.setItem("gx_referral", ref);
  }, [ref]);

  function loadMe() {
    api<{ me: { address?: string; registration?: { status: string; tx_hash?: string | null } } | null }>("/api/me").then((r) => {
      setMe(r.me);
      if (r.me?.registration?.status === "ACTIVE") router.replace("/plans");
    });
  }

  useEffect(() => {
    loadMe();
    const timer = setInterval(loadMe, 2000);
    return () => clearInterval(timer);
  }, []);

  if (me === "loading") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <div className="h-40 animate-pulse rounded-card bg-surface2" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:px-6 sm:py-16">
      <Link href="/" className="text-xs text-mute no-underline hover:text-cream">
        ← Home
      </Link>
      <div className="mt-6">
        <PageHeader
          kicker="Registration"
          title="Join GLOBAL X"
          description={
            me
              ? "Complete registration to unlock plans."
              : ref
                ? `Referral ${ref} is stored until you verify. Sponsor is set on the server.`
                : "Connect and verify your wallet. Connection never sends a payment."
          }
        />
      </div>
      <div className="mt-6">
        <Stepper steps={["Connect", "Verify", "Register"]} current={me ? 3 : 1} />
      </div>
      {me ? (
        <RegistrationPayCard
          status={me.registration?.status ?? "NOT_PAID"}
          txHash={me.registration?.tx_hash}
          wallet={me.address}
          onActive={() => router.replace("/plans")}
        />
      ) : (
        <div className="mt-8">
          <Button className="w-full" onClick={() => setOpen(true)}>
            <Wallet className="h-4 w-4" />
            Connect Wallet
          </Button>
        </div>
      )}
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
