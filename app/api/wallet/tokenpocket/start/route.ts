import { NextRequest } from "next/server";
import { jsonError, jsonOk } from "@/lib/http";
import { activeChainId, requestAppUrl } from "@/lib/network-config";
import { requireUser } from "@/lib/session";
import { parsePaymentType } from "@/payments/payment-type";
import { preparePayment } from "@/payments/service";
import {
  createLoginAction,
  tokenPocketDeepLink,
  tokenPocketLoginParam,
  tokenPocketSignParam,
  tokenPocketTransferParam,
} from "@/wallet/tokenpocket/deeplink";
import { newId, withStore } from "@/lib/store";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind ?? "login");
  const origin = requestAppUrl(req.headers);

  // IMPORTANT: Connect Wallet only authenticates the wallet. It must never initiate a blockchain transaction.
  if (kind === "pushTransaction") {
    return jsonError("Connect Wallet cannot start a contract write.");
  }

  if (kind === "transfer") {
    let session;
    try {
      session = await requireUser();
    } catch {
      return jsonError("UNAUTHENTICATED", 401);
    }
    const paymentType = String(body.paymentType ?? "REGISTRATION");
    const parsed = parsePaymentType(paymentType);
    const payment = await preparePayment(session.userId!, paymentType, { planId: parsed.planId });
    const actionId = newId("pay");
    const callbackUrl = `${origin}/api/wallet/tokenpocket/callback?actionId=${actionId}`;
    await withStore((store) => {
      store.tokenpocket_actions.push({
        action_id: actionId,
        action: "transfer",
        status: "PENDING",
        payload: {
          paymentType,
          kind: payment.paymentType,
          plan_id: "planId" in payment ? payment.planId ?? parsed.planId ?? null : parsed.planId ?? null,
          recipient: payment.recipient,
          positionId: payment.positionId,
          amountUsd: payment.amountUsd,
        },
        result: null,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });
    });
    const param = tokenPocketTransferParam({
      actionId,
      callbackUrl,
      dappName: "GLOBAL X",
      dappIcon: `${origin}/icon.svg`,
      chainId: String(activeChainId()),
      from: session.address!,
      to: payment.recipient,
      contract: payment.tokenContract,
      amount: String(payment.amountUsd),
      decimal: payment.decimals,
      symbol: payment.symbol,
    });
    return jsonOk({ actionId, deepLink: tokenPocketDeepLink(param), notice: "Pay transfer. Not used for Connect Wallet." });
  }

  if (kind === "sign") {
    const actionId = newId("sign");
    const callbackUrl = `${origin}/api/wallet/tokenpocket/callback?actionId=${actionId}`;
    await withStore((store) => {
      store.tokenpocket_actions.push({
        action_id: actionId,
        action: "sign",
        status: "PENDING",
        payload: body,
        result: null,
        expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });
    });
    const param = tokenPocketSignParam({
      actionId,
      callbackUrl,
      dappName: "GLOBAL X",
      dappIcon: `${origin}/icon.svg`,
      chainId: String(activeChainId()),
      message: String(body.message ?? ""),
    });
    return jsonOk({ actionId, deepLink: tokenPocketDeepLink(param), notice: "Sign only. Not a payment." });
  }

  const actionId = await createLoginAction(body);
  const callbackUrl = `${origin}/api/wallet/tokenpocket/callback?actionId=${actionId}`;
  const param = tokenPocketLoginParam({
    actionId,
    callbackUrl,
    dappName: "GLOBAL X",
    dappIcon: `${origin}/icon.svg`,
    chainId: String(activeChainId()),
  });
  return jsonOk({
    actionId,
    deepLink: tokenPocketDeepLink(param),
    notice: "TokenPocket login/authorize only. No transfer fields are included.",
  });
}
