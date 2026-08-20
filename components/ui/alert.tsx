import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { AlertTone } from "@/lib/user-errors";

const styles: Record<AlertTone, string> = {
  error: "border-danger/40 bg-danger/10 text-rose-100",
  success: "border-mint/40 bg-mint/10 text-emerald-100",
  warning: "border-amber-400/40 bg-amber-400/10 text-amber-50",
  info: "border-electric/40 bg-electric/10 text-sky-100",
};

const labels: Record<AlertTone, string> = {
  error: "Error",
  success: "Success",
  warning: "Please check",
  info: "In progress",
};

export function Alert({
  tone,
  title,
  children,
  className,
}: {
  tone: AlertTone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border px-4 py-3 text-sm leading-relaxed", styles[tone], className)} role="status">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">{labels[tone]}</p>
      {title && <p className="mt-1 font-semibold text-white">{title}</p>}
      {children && <div className={cn("text-[13px] text-slate-200", title ? "mt-1" : "mt-0.5")}>{children}</div>}
    </div>
  );
}
