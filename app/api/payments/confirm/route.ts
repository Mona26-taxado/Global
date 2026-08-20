import { NextRequest } from "next/server";
import { isHash } from "viem";
import { jsonError, jsonOk } from "@/lib/http";
import { requireUser } from "@/lib/session";
import { PlanRoutingError } from "@/payments/plan-routing";
import { confirmPayment } from "@/payments/service";
import { ChainVerifyError } from "@/payments/verify";

export async function POST(req: NextRequest) {
  try {
    const session = await requireUser();
    const body = await req.json().catch(() => ({}));
    const txHash = String(body.txHash ?? "");
    if (!isHash(txHash)) return jsonError("A real transaction hash is required. Hashes are never invented.");
    const paymentType = String(body.paymentType ?? body.planCode ?? "");
    const result = await confirmPayment({
      userId: session.userId!,
      payerWallet: session.address!,
      paymentType,
      txHash,
    });
    return jsonOk(result);
  } catch (error) {
    if (error instanceof PlanRoutingError) {
      return jsonError(error.message, 400, { code: error.code });
    }
    if (error instanceof ChainVerifyError) {
      const status = error.code === "PENDING" ? 202 : 400;
      return jsonError(error.message, status, { code: error.code });
    }
    return jsonError(error instanceof Error ? error.message : "CONFIRM_FAILED");
  }
}
