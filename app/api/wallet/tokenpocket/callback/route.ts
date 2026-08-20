import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { extractAddress, storeCallback } from "@/wallet/tokenpocket/deeplink";

function resultFromRequest(req: NextRequest, body: Record<string, unknown>) {
  const params = Object.fromEntries(req.nextUrl.searchParams.entries());
  return { ...params, ...body };
}

export async function POST(req: NextRequest) {
  const actionId = req.nextUrl.searchParams.get("actionId") ?? "";
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const row = await storeCallback(actionId, resultFromRequest(req, body));
    return jsonOk({ stored: true, address: extractAddress(row.result) });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "CALLBACK_FAILED");
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
