"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin-shell";
import { api } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Plan = {
  id: string;
  code: string;
  name: string;
  amount_usd: number;
  description: string;
  active: boolean;
};

export default function AdminPlans() {
  const [rows, setRows] = useState<Plan[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("100");
  const [description, setDescription] = useState("");

  function load() {
    api<{ rows: Plan[] }>("/api/admin/data?resource=plans").then((r) => setRows(r.rows ?? []));
  }
  useEffect(() => {
    load();
  }, []);

  async function save(body: Record<string, unknown>) {
    await api("/api/admin/data", { method: "POST", body: JSON.stringify({ kind: "plan", ...body }) });
    load();
  }

  return (
    <AdminShell title="Plans">
      <Card className="mb-6 space-y-3 p-4">
        <div className="text-sm text-mute">Create plan (stored in the database, not hardcoded in UI)</div>
        <input className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2" placeholder="Amount USD" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2" placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <Button
          onClick={() =>
            save({
              create: true,
              name,
              amount_usd: Number(amount),
              description,
            })
          }
        >
          Create Plan
        </Button>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((p) => (
          <Card key={p.id} className="space-y-2 p-4">
            <input
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
              defaultValue={p.name}
              onBlur={(e) => save({ id: p.id, name: e.target.value })}
            />
            <input
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
              defaultValue={p.amount_usd}
              onBlur={(e) => save({ id: p.id, amount_usd: Number(e.target.value) })}
            />
            <textarea
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2"
              defaultValue={p.description}
              onBlur={(e) => save({ id: p.id, description: e.target.value })}
            />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => save({ id: p.id, active: true })}>
                Activate
              </Button>
              <Button variant="ghost" onClick={() => save({ id: p.id, active: false })}>
                Deactivate
              </Button>
            </div>
            <p className="text-xs text-mute">
              {p.code} · {p.active ? "ACTIVE" : "INACTIVE"}
            </p>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
