"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { api } from "@/lib/utils";
import { friendlyMessage } from "@/lib/user-errors";

type Row = {
  user: string;
  fee: string;
  token: string;
  network: string;
  tx_hash: string | null;
  status: string;
  created_at: string;
};

function statusTone(status: string): "mint" | "danger" | "violet" | "mute" {
  if (status === "ACTIVE") return "mint";
  if (status === "FAILED") return "danger";
  if (status === "PENDING") return "violet";
  return "mute";
}

export default function AdminRegistrations() {
  const [rows, setRows] = useState<Row[]>([]);
  const [explorer, setExplorer] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  async function load() {
    const r = await api<{ rows: Row[] }>("/api/admin/data?resource=registrations");
    setRows(r.rows ?? []);
  }

  useEffect(() => {
    api<{ config: { explorer: string } }>("/api/config").then((r) => setExplorer(r.config.explorer));
    void load();
  }, []);

  async function verify(userId: string) {
    setBusy(userId);
    setNotice("");
    const r = await api<{ registration?: { status: string } }>("/api/admin/verify-registration", {
      method: "POST",
      body: JSON.stringify({ userId }),
    });
    setBusy(null);
    if (!r.ok) setNotice(r.error ?? "Could not verify");
    await load();
  }

  const alert = notice ? friendlyMessage(notice) : null;

  return (
    <AdminShell title="Registrations">
      {alert && (
        <Alert className="mb-4" tone={alert.tone} title={alert.title}>
          {alert.detail}
        </Alert>
      )}
      <div className="overflow-x-auto text-sm">
        <table className="w-full text-left">
          <thead className="text-xs uppercase text-mute">
            <tr>
              <th className="py-2">User</th>
              <th>Fee</th>
              <th>Token</th>
              <th>Network</th>
              <th>TX Hash</th>
              <th>Status</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.user}-${r.created_at}`} className="border-t border-white/10">
                <td className="py-2 font-mono text-xs">{r.user}</td>
                <td>{r.fee}</td>
                <td>{r.token}</td>
                <td>{r.network}</td>
                <td className="font-mono text-xs">
                  {r.tx_hash && explorer ? (
                    <a href={`${explorer}/tx/${r.tx_hash}`} target="_blank" rel="noreferrer">
                      {r.tx_hash.slice(0, 12)}…
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <Badge tone={statusTone(r.status)}>{r.status.replaceAll("_", " ")}</Badge>
                </td>
                <td>{String(r.created_at ?? "").slice(0, 10)}</td>
                <td>
                  {r.status === "PENDING" && r.tx_hash && (
                    <Button
                      variant="ghost"
                      className="!px-3 !py-1 text-xs"
                      disabled={busy === r.user}
                      onClick={() => verify(r.user)}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${busy === r.user ? "animate-spin" : ""}`} />
                      Verify
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
