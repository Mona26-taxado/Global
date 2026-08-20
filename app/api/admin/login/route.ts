import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { getSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = String(body.username ?? "");
  const password = String(body.password ?? "");
  if (!process.env.ADMIN_PASSWORD && !process.env.ADMIN_BOOTSTRAP_PASSWORD) {
    return jsonError("ADMIN_PASSWORD is not set.", 500);
  }
  const expected = process.env.ADMIN_PASSWORD || process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (username !== (process.env.ADMIN_USERNAME ?? process.env.ADMIN_BOOTSTRAP_USERNAME ?? "admin") || password !== expected) {
    return jsonError("ADMIN_INVALID", 401);
  }
  const session = await getSession();
  session.admin = true;
  await session.save();
  return jsonOk({ admin: true });
}
