import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-3xl border border-white/10 bg-panel shadow-card backdrop-blur-xl", className)} {...props} />;
}

export function Badge({ children, tone = "violet" }: { children: React.ReactNode; tone?: "violet" | "mint" | "mute" | "danger" }) {
  const map = {
    violet: "border-violet/30 bg-violet/10 text-violet-200",
    mint: "border-mint/30 bg-mint/10 text-mint",
    mute: "border-white/10 bg-white/5 text-mute",
    danger: "border-danger/30 bg-danger/10 text-danger",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider ${map[tone]}`}>
      {children}
    </span>
  );
}
