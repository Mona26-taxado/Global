"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { api } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/app-ui";

type Settings = Record<string, string>;

export default function AdminSettings() {
  const [settings, setSettings] = useState<Settings>({});
  const [notice, setNotice] = useState("");
  useEffect(() => {
    api<{ settings: Settings; notice: string }>("/api/admin/settings").then((r) => {
      setSettings(r.settings ?? {});
      setNotice(r.notice ?? "");
    });
  }, []);
  const labels: Record<string, string> = {
    supabase: "Supabase",
    polygon_rpc: "Polygon RPC",
    payment_recipient: "Payment Recipient",
    amoy_token: "Amoy Token Contract",
    mainnet_token: "Mainnet Token Contract",
    network: "Network",
    usdt_configured: "Active payment token",
  };

  function badgeFor(value: string) {
    const v = value.toUpperCase();
    if (v.includes("NOT CONFIGURED") || v === "NO" || v === "FALSE") return "NOT CONFIGURED";
    if (v.includes("CONFIGURED") || v === "YES" || v === "TRUE") return "CONFIGURED";
    return "";
  }

  return (
    <AdminShell title="Settings" description={notice || "Secret keys are never displayed. Recipient shows status only."}>
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(settings).map(([k, v]) => {
          const badge = badgeFor(v);
          return (
            <Card key={k} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-mute">{labels[k] ?? k}</p>
                {badge && <StatusBadge status={badge} />}
              </div>
              <p className="mt-3 font-display text-xl text-cream">{v}</p>
            </Card>
          );
        })}
      </div>
    </AdminShell>
  );
}
