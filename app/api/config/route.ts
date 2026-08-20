import { jsonOk } from "@/lib/http";
import {
  activeChainId,
  explorerBase,
  networkLabel,
  paymentRecipient,
  publicNetwork,
  recipientConfigured,
  usdtConfigured,
  usdtContract,
} from "@/lib/network-config";
import { supabaseEnabled } from "@/lib/store";

export async function GET() {
  const network = publicNetwork();
  return jsonOk({
    config: {
      appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
      network,
      chainId: activeChainId(network),
      chainName: networkLabel(network),
      explorer: explorerBase(network),
      testnet: network === "amoy",
      usdt: usdtContract(network) ?? "",
      usdtConfigured: usdtConfigured(network),
      recipientConfigured: recipientConfigured(),
      supabaseConfigured: supabaseEnabled(),
      rpcConfigured: Boolean(
        network === "mainnet" ? process.env.POLYGON_RPC_URL : process.env.POLYGON_AMOY_RPC_URL || true,
      ),
      eip155: `eip155:${activeChainId(network)}`,
      paymentRecipientSet: Boolean(paymentRecipient()),
    },
  });
}
