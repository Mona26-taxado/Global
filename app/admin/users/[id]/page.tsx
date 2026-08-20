"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminShell } from "@/components/admin-shell";
import { api } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export default function AdminUserView() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    api<Record<string, unknown>>(`/api/admin/data?resource=user&id=${params.id}`).then((r) => setData(r));
  }, [params.id]);
  return (
    <AdminShell title="User">
      <Card className="p-4">
        <pre className="overflow-auto text-xs">{JSON.stringify(data, null, 2)}</pre>
      </Card>
    </AdminShell>
  );
}
