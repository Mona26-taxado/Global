"use client";

import { NetworkCanvas } from "@/components/network/tree";
import { DashShell } from "@/components/dash-shell";

export default function NetworkPage() {
  return (
    <DashShell title="Network">
      <div className="mt-6">
        <NetworkCanvas />
      </div>
    </DashShell>
  );
}
