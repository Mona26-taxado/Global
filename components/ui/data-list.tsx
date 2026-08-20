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

export function paginate<T>(rows: T[], page: number, size = 10) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, page), pages);
  return { page: p, pages, total: rows.length, slice: rows.slice((p - 1) * size, p * size) };
}

export function Pager({
  page,
  pages,
  total,
  onPage,
}: {
  page: number;
  pages: number;
  total: number;
  onPage: (n: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-mute">
        {total} record{total === 1 ? "" : "s"} · page {page} of {pages}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line text-sm disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Prev
        </button>
        <button
          type="button"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line text-sm disabled:opacity-40"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-44 items-end gap-1.5 sm:gap-2">
      {data.map((d) => (
        <div key={d.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
          <span className="text-[10px] tabular text-mute">{d.value}</span>
          <div
            className="w-full min-h-[4px] rounded-t-lg bg-gradient-to-t from-violet to-electric"
            style={{ height: `${Math.max(6, (d.value / max) * 100)}%` }}
          />
          <span className="w-full truncate text-center text-[10px] text-mute">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

export function StatusBars({
  items,
}: {
  items: { label: string; value: number; color: string }[];
}) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  return (
    <div className="space-y-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-white/5">
        {items.map((i) => (
          <div key={i.label} className={i.color} style={{ width: `${(i.value / total) * 100}%` }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        {items.map((i) => (
          <div key={i.label} className="flex justify-between gap-2">
            <span className="text-secondary">{i.label}</span>
            <span className="tabular text-cream">{i.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
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
