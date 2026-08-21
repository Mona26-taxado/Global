"use client";

import type { ButtonHTMLAttributes, ComponentType, ReactNode } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { cn, shortAddr } from "@/lib/utils";
import { Badge } from "@/components/ui/card";

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {kicker && <p className="text-xs uppercase tracking-[0.18em] text-mute">{kicker}</p>}
        <h1 className="mt-1 font-display text-[34px] leading-10 text-cream sm:text-[40px] sm:leading-[46px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] leading-6 text-secondary">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-card border border-line bg-surface2 p-5 shadow-card">
      <p className="text-xs uppercase tracking-[0.16em] text-mute">{label}</p>
      <div className="mt-2 truncate font-display text-[22px] leading-8 text-cream tabular sm:text-[30px] sm:leading-9">{value}</div>
      {hint && <p className="mt-1 text-xs text-mute">{hint}</p>}
    </div>
  );
}

export function AdminKpi({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  icon?: ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-[16px] border border-line bg-surface2/90 p-4 shadow-card backdrop-blur-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-[0.14em] text-mute">{label}</p>
        {Icon && <Icon className="h-3.5 w-3.5 text-violet/80" />}
      </div>
      <div className="mt-2 font-display text-[22px] tabular leading-7 text-cream sm:text-[26px]">{value}</div>
    </div>
  );
}

export function ToolbarButton({
  children,
  active,
  onClick,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs transition",
        active ? "border-violet/40 bg-violet/15 text-cream" : "border-line bg-elevated/80 text-secondary hover:text-cream",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase().replaceAll("_", " ");
  const tone =
    s === "INACTIVE" || s === "NOT PAID" || s === "DISCONNECTED" || s === "LOCKED"
      ? "mute"
      : /NOT CONFIGURED|FAIL|ERROR|REJECT/.test(s)
        ? "danger"
        : /RESERVED|PAYMENT REQUIRED|QUALIFIED|CONFIRMING/.test(s)
          ? "warning"
          : /ACTIVE|CONFIRMED|CONNECTED|VERIFIED|SUCCESS|CURRENT|CONFIGURED/.test(s)
            ? "mint"
            : /PENDING|WAITING|UNVERIFIED/.test(s)
              ? "warning"
            : /TESTNET/.test(s)
              ? "warning"
              : "mute";
  return <Badge tone={tone}>{s}</Badge>;
}

export function EmptyState({
  icon: Icon,
  title,
  detail,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-surface2 px-6 py-12 text-center shadow-card">
      <Icon className="mx-auto h-8 w-8 text-mute" />
      <p className="mt-3 font-display text-xl text-cream">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-secondary">{detail}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={label || "Copy"}
      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border border-line px-3 text-xs font-semibold text-secondary hover:text-cream"
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check className="h-3.5 w-3.5 text-mint" /> : <Copy className="h-3.5 w-3.5" />}
      {label ? label : null}
    </button>
  );
}

export function WalletAddress({
  address,
  explorer,
}: {
  address?: string | null;
  explorer?: string;
}) {
  if (!address) return <span className="text-mute">—</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className="truncate font-mono text-sm text-cream" title={address}>
        {shortAddr(address)}
      </span>
      <CopyButton value={address} label="" />
      {explorer && (
        <a
          href={`${explorer}/address/${address}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line text-mute no-underline hover:text-cream"
          aria-label="View on explorer"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </span>
  );
}

export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <ol className="flex gap-2 sm:gap-3">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-2 py-2 sm:px-3", done || active ? "border-violet/30 bg-violet/10" : "border-line")}>
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                done || active ? "bg-violet text-white" : "bg-white/5 text-mute",
              )}
            >
              {n}
            </span>
            <span className={cn("truncate text-xs font-semibold", active || done ? "text-cream" : "text-mute")}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}
