import { NextRequest } from "next/server";
import { isAddress } from "viem";
import { jsonError, jsonOk } from "@/lib/http";
import { getSession } from "@/lib/session";
import { verifyLogin } from "@/services/auth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const address = String(body.address ?? "");
  const signature = String(body.signature ?? "") as `0x${string}`;
  if (!isAddress(address) || !signature.startsWith("0x")) {
    return jsonError("Wallet signature is required. A URL wallet address is never login.");
  }
  try {
    const user = await verifyLogin({
      address,
      signature,
      referralCode: body.referralCode ? String(body.referralCode) : undefined,
      walletType: body.walletType ? String(body.walletType) : undefined,
    });
    const session = await getSession();
    session.userId = user.id;
    session.address = address.toLowerCase();
    session.walletType = body.walletType ? String(body.walletType) : undefined;
    await session.save();
    return jsonOk({ userId: user.id, referralCode: user.referral_code });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "VERIFY_FAILED", 401);
  }
}
