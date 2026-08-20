import { AMOY_HEX, MAINNET_HEX, activeChainHex, networkLabel, publicNetwork, rpcUrl } from "@/lib/network-config";
import { getInjectedProvider } from "@/wallet/dapp-browser/detect";

export async function requestInjectedAccount() {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("NO_PROVIDER");
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  if (!accounts?.[0]) throw new Error("REJECTED");
  return accounts[0];
}

export async function ensurePolygon(rpc = rpcUrl()) {
  const provider = getInjectedProvider();
  if (!provider) throw new Error("NO_PROVIDER");
  const wanted = activeChainHex();
  const chainId = String(await provider.request({ method: "eth_chainId" }));
  if (chainId.toLowerCase() === wanted.toLowerCase()) return true;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: wanted }] });
    return true;
  } catch (error) {
    const code = (error as { code?: number })?.code;
    if (code === 4902 || code === -32603) {
      const network = publicNetwork();
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: wanted,
            chainName: networkLabel(network),
            nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
            rpcUrls: [rpc],
            blockExplorerUrls: [
              network === "mainnet" ? "https://polygonscan.com" : "https://amoy.polygonscan.com",
            ],
          },
        ],
      });
      return true;
    }
    throw error;
  }
}

export function isPolygonChain(hex: string) {
  const n = hex.toLowerCase();
  return n === AMOY_HEX || n === MAINNET_HEX;
}
