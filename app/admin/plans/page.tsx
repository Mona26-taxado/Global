"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { api } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/app-ui";
import { fieldClass } from "@/components/ui/data-list";

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
    <AdminShell title="Plans" description="Membership products stored in application data. Editing uses the existing admin save path.">
      <Card className="mb-6 p-5 sm:p-6">
        <p className="text-[11px] uppercase tracking-[0.16em] text-mute">Create plan</p>
        <p className="mt-1 text-sm text-secondary">Saved through the existing admin API — not hardcoded in the UI.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input className={fieldClass} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={fieldClass} placeholder="Amount USD" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <input className={`${fieldClass} sm:col-span-2`} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <Button
          className="mt-4"
          onClick={() =>
            save({
              create: true,
              name,
              amount_usd: Number(amount),
              description,
            })
          }
        >
          <Plus className="h-4 w-4" />
          Create Plan
        </Button>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((p) => (
          <Card key={p.id} className="overflow-hidden p-0">
            <div className="border-b border-line bg-gradient-to-r from-violet/15 to-electric/10 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-mute">{p.code}</p>
                  <h2 className="mt-1 font-display text-[22px] text-cream">{p.name}</h2>
                </div>
                <StatusBadge status={p.active ? "ACTIVE" : "INACTIVE"} />
              </div>
              <p className="mt-3 font-display text-3xl tabular">${p.amount_usd}</p>
            </div>
            <div className="space-y-3 p-5">
              <p className="text-sm text-secondary">{p.description}</p>
              <input
                className={fieldClass}
                defaultValue={p.name}
                onBlur={(e) => save({ id: p.id, name: e.target.value })}
              />
              <input
                className={fieldClass}
                defaultValue={p.amount_usd}
                onBlur={(e) => save({ id: p.id, amount_usd: Number(e.target.value) })}
              />
              <textarea
                className={`${fieldClass} py-3`}
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
            </div>
          </Card>
        ))}
      </div>
    </AdminShell>
  );
}
