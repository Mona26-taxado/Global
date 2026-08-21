import { NextRequest } from "next/server";
import { jsonOk } from "@/lib/http";
import { extractAddress, getAction } from "@/wallet/tokenpocket/deeplink";

export async function GET(req: NextRequest) {
  const actionId = req.nextUrl.searchParams.get("actionId") ?? "";
  const row = await getAction(actionId);
  if (!row) return jsonOk({ status: "UNKNOWN", result: null });
  return jsonOk({
    status: row.status,
    action: row.action,
    result: row.result,
    payload: row.payload,
    address: extractAddress(row.result),
  });
}
