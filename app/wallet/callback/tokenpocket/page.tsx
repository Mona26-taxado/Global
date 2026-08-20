"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { api } from "@/lib/utils";

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const [msg, setMsg] = useState("Validating TokenPocket authorization…");

  useEffect(() => {
    const actionId = params.get("actionId") ?? localStorage.getItem("gx_tp_login");
    if (!actionId) {
      setMsg("Missing authorization session. Do not trust a raw address in the URL.");
      return;
    }
    const payload = Object.fromEntries(params.entries());
    void (async () => {
      await api("/api/wallet/tokenpocket/callback?actionId=" + actionId, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const st = await api<{ address?: string; status: string }>(
        `/api/wallet/tokenpocket/status?actionId=${actionId}`,
      );
      if (!st.address) {
        setMsg("No wallet account in the official callback result. URL address alone is not accepted as login.");
        return;
      }
      localStorage.setItem("gx_tp_login", actionId);
      setMsg("Authorization received. Returning…");
      router.replace("/register");
    })();
  }, [params, router]);

  return <p className="p-10 text-sm text-mute">{msg}</p>;
}

export default function TokenPocketCallbackPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
