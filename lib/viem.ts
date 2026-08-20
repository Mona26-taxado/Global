import { createPublicClient, http } from "viem";
import { polygon, polygonAmoy } from "viem/chains";
import { activeChainId, publicNetwork, rpcUrl } from "@/lib/network-config";

export function publicClient() {
  const network = publicNetwork();
  const url = rpcUrl(network);
  if (!url) throw new Error("RPC URL is not configured.");
  return createPublicClient({
    chain: network === "mainnet" ? polygon : polygonAmoy,
    transport: http(url),
  });
}

export function expectedChainId() {
  return activeChainId();
}
