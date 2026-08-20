export {};

declare global {
  interface Window {
    ethereum?: {
      isTrust?: boolean;
      isTokenPocket?: boolean;
      request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
    trustwallet?: unknown;
    tokenpocket?: unknown;
  }
}
