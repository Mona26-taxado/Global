/** Official Trust Wallet mobile deeplink: open this dApp in Trust's browser. Not a payment link. */
// IMPORTANT: Connect Wallet only authenticates the wallet. It must never initiate a blockchain transaction.
export function trustOpenDapp(appUrl: string) {
  return `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(appUrl)}`;
}

export function isTrustInstalledHint() {
  if (typeof window === "undefined") return false;
  return Boolean((window as Window & { trustwallet?: unknown }).trustwallet || window.ethereum?.isTrust);
}
