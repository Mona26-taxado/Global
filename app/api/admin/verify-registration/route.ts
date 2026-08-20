import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import { retryPendingRegistration } from "@/payments/service";
import { ChainVerifyError } from "@/payments/verify";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return jsonError("ADMIN_REQUIRED", 401);
  }
  const body = await req.json().catch(() => ({}));
  const userId = String(body.userId ?? "");
  if (!userId) return jsonError("USER_REQUIRED");
  try {
    const result = await retryPendingRegistration(userId);
    return jsonOk({ registration: result.registration });
  } catch (error) {
    if (error instanceof ChainVerifyError) {
      return jsonError(error.message, error.code === "PENDING" ? 202 : 400, { code: error.code });
    }
    return jsonError(error instanceof Error ? error.message : "VERIFY_FAILED");
  }
}
