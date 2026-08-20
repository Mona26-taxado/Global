import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { PlanRoutingError } from "@/payments/plan-routing";
import { preparePayment } from "@/payments/service";

export async function GET(req: NextRequest) {
  try {
    const session = await requireUser();
    const type = req.nextUrl.searchParams.get("type") ?? req.nextUrl.searchParams.get("plan") ?? "";
    const payment = await preparePayment(session.userId!, type);
    return jsonOk({ payment });
  } catch (error) {
    if (error instanceof PlanRoutingError) {
      return jsonError(error.message, 400, { code: error.code });
    }
    return jsonError(error instanceof Error ? error.message : "PREPARE_FAILED");
  }
}
