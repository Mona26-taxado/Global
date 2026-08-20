import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ResponsiveDataList({
  table,
  cards,
}: {
  table: ReactNode;
  cards: ReactNode;
}) {
  return (
    <>
      <div className="hidden lg:block">{table}</div>
      <div className="space-y-3 lg:hidden">{cards}</div>
    </>
  );
}

export const fieldClass =
  "w-full min-h-12 rounded-xl border border-line bg-elevated px-4 text-sm text-cream placeholder:text-mute outline-none focus:border-violet/50";

export function AdminTable({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-feature border border-line bg-surface2 shadow-card", className)}>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function adminTableClass(extra = "") {
  return cn("w-full min-w-[720px] text-left text-sm", extra);
}

export function walletLabel(type?: string | null) {
  if (type === "trust") return "Trust Wallet";
  if (type === "tokenpocket") return "TokenPocket";
  if (type === "injected") return "Wallet";
  return type || "—";
}

export function formatTokenAmount(amount?: string | number | null) {
  if (amount === undefined || amount === null || amount === "") return "—";
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount);
  if (Number.isInteger(n) && Math.abs(n) >= 1_000_000) {
    return (n / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function Meter({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-secondary">{label}</span>
        <span className="tabular text-cream">
          {value}/{total || 0} · {pct}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-gradient-to-r from-violet to-electric" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
