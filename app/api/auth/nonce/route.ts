import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { issueNonce } from "@/services/auth";

export async function POST(req: NextRequest) {
  if (!rateLimit(req.headers.get("x-forwarded-for") ?? "nonce")) {
    return jsonError("Too many requests.", 429);
  }
  const body = await req.json().catch(() => ({}));
  try {
    return jsonOk(await issueNonce(String(body.address ?? "")));
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "NONCE_FAILED");
  }
}
