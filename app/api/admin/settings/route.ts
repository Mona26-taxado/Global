import { jsonError, jsonOk } from "@/lib/http";
import { requireAdmin } from "@/lib/session";
import {
  paymentRecipient,
  publicNetwork,
  recipientConfigured,
  usdtConfigured,
  usdtContract,
} from "@/lib/network-config";
import { supabaseEnabled } from "@/lib/store";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return jsonError("ADMIN_REQUIRED", 401);
  }
  const network = publicNetwork();
  return jsonOk({
    settings: {
      supabase: supabaseEnabled() ? "CONFIGURED" : "NOT CONFIGURED",
      polygon_rpc:
        (network === "mainnet" ? process.env.POLYGON_RPC_URL : process.env.POLYGON_AMOY_RPC_URL)
          ? "CONFIGURED"
          : "NOT CONFIGURED",
      payment_recipient: recipientConfigured() ? "CONFIGURED" : "NOT CONFIGURED",
      amoy_token: usdtContract("amoy") ? "CONFIGURED" : "NOT CONFIGURED",
      mainnet_token: usdtContract("mainnet") ? "CONFIGURED" : "NOT CONFIGURED",
      network,
      usdt_configured: usdtConfigured(network) ? "CONFIGURED" : "NOT CONFIGURED",
    },
    notice: "Secret keys are never displayed. payment_recipient shows status only.",
    recipientPreview: paymentRecipient() ? `${paymentRecipient()!.slice(0, 6)}…` : null,
  });
}
