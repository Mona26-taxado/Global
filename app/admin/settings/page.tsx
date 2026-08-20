"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { api } from "@/lib/utils";
import { Card } from "@/components/ui/card";

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
    usdt_configured: "Active USDT contract",
  };
  return (
    <AdminShell title="Settings">
      <p className="mb-4 text-sm text-mute">{notice}</p>
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(settings).map(([k, v]) => (
          <Card key={k} className="p-4">
            <div className="text-xs uppercase text-mute">{labels[k] ?? k}</div>
            <div className="mt-2 font-display text-xl">{v}</div>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
