import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AlertTone } from "@/lib/user-errors";

const styles: Record<AlertTone, string> = {
  error: "border-danger/30 bg-danger/10 text-cream",
  success: "border-mint/30 bg-mint/10 text-cream",
  warning: "border-warning/30 bg-warning/10 text-cream",
  info: "border-info/30 bg-info/10 text-cream",
};

const icons: Record<AlertTone, typeof Info> = {
  error: XCircle,
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
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
  const Icon = icons[tone];
  return (
    <div className={cn("flex gap-3 rounded-card border px-4 py-3 text-sm leading-6", styles[tone], className)} role="status">
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0">
        {title && <p className="font-semibold text-cream">{title}</p>}
        {children && <div className={cn("text-[13px] text-secondary", title ? "mt-0.5" : "")}>{children}</div>}
      </div>
    </div>
  );
}
