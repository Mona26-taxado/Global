import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-card border border-line bg-surface2 shadow-card", className)}
      {...props}
    />
  );
}

export function Badge({
  children,
  tone = "violet",
}: {
  children: React.ReactNode;
  tone?: "violet" | "mint" | "mute" | "danger" | "warning" | "info";
}) {
  const map = {
    violet: "border-violet/30 bg-violet/10 text-violet-200",
    mint: "border-mint/30 bg-mint/10 text-mint",
    mute: "border-line bg-white/5 text-mute",
    danger: "border-danger/30 bg-danger/10 text-danger",
    warning: "border-warning/30 bg-warning/10 text-warning",
    info: "border-info/30 bg-info/10 text-info",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${map[tone]}`}>
      {children}
    </span>
  );
}
