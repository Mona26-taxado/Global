"use client";

import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/utils";
import { Badge, Card } from "@/components/ui/card";

type Node = {
  id: string;
  user_id: string;
  parent_id: string | null;
  position: string | null;
  depth: number;
  cycle?: number;
  user?: { referral_code: string; display_name: string; is_demo: boolean };
};

export function NetworkCanvas({ highlightUserId }: { highlightUserId?: string }) {
  const [tree, setTree] = useState<Node[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Node | null>(null);
  useEffect(() => {
    api<{ tree: Node[] }>("/api/network").then((r) => setTree(r.tree ?? []));
  }, []);
  const layout = useMemo(() => {
    const byDepth = new Map<number, Node[]>();
    for (const n of tree) {
      const arr = byDepth.get(n.depth) ?? [];
      arr.push(n);
      byDepth.set(n.depth, arr);
    }
    return { byDepth, max: Math.max(0, ...tree.map((n) => n.depth)) };
  }, [tree]);
  const filtered = q
    ? tree.filter(
        (n) =>
          n.user?.referral_code.toLowerCase().includes(q.toLowerCase()) ||
          n.user_id.includes(q),
      )
    : tree;

  return (
    <div>
      <Badge tone="mute">DEMO DATA · Prototype Business Logic — Configurable</Badge>
      <input
        className="mt-4 w-full min-h-12 rounded-xl border border-line bg-elevated px-4 text-sm"
        placeholder="Search referral code"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <Card className="mt-4 h-[520px] overflow-hidden">
        <TransformWrapper>
          <TransformComponent wrapperClass="!w-full !h-[520px]" contentClass="p-6">
            <div className="min-w-[900px] space-y-8">
              {Array.from({ length: layout.max + 1 }, (_, depth) => (
                <div key={depth} className="flex flex-wrap justify-center gap-2">
                  {(layout.byDepth.get(depth) ?? []).map((n) => (
                    <button
                      key={n.id}
                      onClick={() => setSel(n)}
                      className={`min-h-11 rounded-xl border px-3 py-2 text-xs ${
                        n.user_id === highlightUserId
                          ? "border-mint bg-mint/15 text-cream"
                          : n.user?.is_demo
                            ? "border-line text-mute"
                            : "border-violet/40 text-cream"
                      } ${sel?.id === n.id ? "bg-violet/20" : "bg-elevated"}`}
                    >
                      {n.user?.referral_code ?? n.user_id.slice(0, 8)}
                      <div className="text-[10px] uppercase text-mute">
                        {n.position ?? "ROOT"} · C{n.cycle ?? Math.floor(n.depth / 2)}
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </Card>
      {sel && (
        <Card className="mt-4 p-4 text-sm">
          {sel.user?.display_name} · {sel.user?.referral_code} · {sel.position ?? "ROOT"} ·{" "}
          {sel.user?.is_demo ? "DEMO" : "LIVE"}
        </Card>
      )}
      <p className="mt-3 text-xs text-mute">
        Showing {filtered.length} of {tree.length} positions. Zoom and pan the tree.
      </p>
    </div>
  );
}
