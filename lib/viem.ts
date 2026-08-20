import { createPublicClient, fallback, http } from "viem";
import { polygon, polygonAmoy } from "viem/chains";
import { activeChainId, publicNetwork, rpcUrl } from "@/lib/network-config";

const PUBLIC_MAINNET_RPCS = ["https://polygon-bor.publicnode.com", "https://polygon.drpc.org"];

export function publicClient() {
  const network = publicNetwork();
  const primary = rpcUrl(network);
  const urls = (network === "mainnet" ? [primary, ...PUBLIC_MAINNET_RPCS] : [primary]).filter(Boolean);
  if (!urls.length) throw new Error("RPC URL is not configured.");
  return createPublicClient({
    chain: network === "mainnet" ? polygon : polygonAmoy,
    transport: fallback(urls.map((u) => http(u))),
  });
}

export function expectedChainId() {
  return activeChainId();
}
