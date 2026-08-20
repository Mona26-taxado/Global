export type InjectedKind = "trust" | "tokenpocket" | "evm" | "none";

export function detectWalletEnvironment() {
  if (typeof window === "undefined") {
    return { hasInjected: false, kind: "none" as InjectedKind, isMobile: false, isDappBrowser: false };
  }
  const eth = window.ethereum as { isTrust?: boolean; isTokenPocket?: boolean } | undefined;
  const trust = Boolean(eth?.isTrust || (window as Window & { trustwallet?: unknown }).trustwallet);
  const tokenpocket = Boolean(eth?.isTokenPocket || (window as Window & { tokenpocket?: unknown }).tokenpocket);
  const hasInjected = Boolean(eth);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const kind: InjectedKind = trust ? "trust" : tokenpocket ? "tokenpocket" : hasInjected ? "evm" : "none";
  return {
    hasInjected,
    kind,
    isMobile,
    isDappBrowser: hasInjected && (trust || tokenpocket),
  };
}

export function getInjectedProvider() {
  if (typeof window === "undefined") return null;
  return (window.ethereum as {
    request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
    removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  }) ?? null;
}
