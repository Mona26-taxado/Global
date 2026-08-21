import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <Card className="p-6 text-center">
      <p className="font-semibold text-[#F7F8FC]">{title}</p>
      <p className="mt-2 text-sm text-mute">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-white/5 ${className ?? "h-24"}`} />;
}

export function PageHeader({ eyebrow, title, body }: { eyebrow?: string; title: string; body?: string }) {
  return (
    <div>
      {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-mute">{eyebrow}</p>}
      <h1 className="mt-1 font-display text-[32px] font-bold leading-tight sm:text-4xl">{title}</h1>
      {body && <p className="mt-2 max-w-2xl text-sm text-mute sm:text-base">{body}</p>}
    </div>
  );
}
