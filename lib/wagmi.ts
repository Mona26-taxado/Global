import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { polygon, polygonAmoy } from "wagmi/chains";
import { publicNetwork, rpcUrl } from "@/lib/network-config";

/**
 * Wagmi config for injected DApp browsers only.
 * Do not import wagmi/connectors from the app bundle — wagmi's barrel pulls
 * Coinbase/WalletConnect extras. Use this helper only in client code that
 * needs useConnect with injected(), or connect via wallet/dapp-browser.
 */
export function getWagmiConfig() {
  const url = rpcUrl(publicNetwork()) || "https://polygon-amoy.drpc.org";
  return createConfig({
    chains: [polygonAmoy, polygon],
    connectors: [injected({ shimDisconnect: true })],
    transports: {
      [polygonAmoy.id]: http(url),
      [polygon.id]: http(process.env.POLYGON_RPC_URL || url),
    },
    ssr: true,
  });
}
