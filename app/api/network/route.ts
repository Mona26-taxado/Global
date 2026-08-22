import { NextRequest } from "next/server";
import { jsonOk } from "@/lib/http";
import { getNetwork } from "@/services/users";
import { readStore } from "@/lib/store";
import { basePlan } from "@/lib/plan-progress";

export async function GET(req: NextRequest) {
  const store = await readStore();
  const requested = req.nextUrl.searchParams.get("plan_id");
  const planId = requested || basePlan(store.plans)?.id;
  const net = await getNetwork(planId ?? undefined);
  return jsonOk({
    tree: net.tree,
    pending_placements: net.pending_placements,
    plan_id: planId ?? null,
    plans: store.plans,
    config: store.global_config,
  });
}
