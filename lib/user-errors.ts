export type AlertTone = "error" | "success" | "warning" | "info";

export function payNotice(phase: string, error?: string) {
  if (phase === "FAILED" || phase === "REJECTED") return friendlyMessage(error);
  if (phase === "CONFIRMED") {
    return { title: "Payment confirmed", detail: "Your payment is verified on Polygon.", tone: "success" as AlertTone };
  }
  if (phase === "PENDING" || phase === "SUBMITTED") {
    return { title: "Confirming payment", detail: "Almost done. You will open Plans as soon as Polygon confirms this payment.", tone: "info" as AlertTone };
  }
  if (phase === "WALLET_CONFIRMATION") {
    return { title: "Confirm in your wallet", detail: "Approve the payment in TokenPocket or Trust Wallet. Connecting never sends funds — only Pay does.", tone: "info" as AlertTone };
  }
  if (phase === "PAYMENT_REQUESTED") {
    return { title: "Preparing payment", detail: "Creating the $5 USDT transfer. This is not a login.", tone: "info" as AlertTone };
  }
  return null;
}

export function friendlyMessage(raw?: string | null): { title: string; detail: string; tone: AlertTone } {
  const text = unwrap(raw);
  const lower = text.toLowerCase();

  if (!text) return { title: "Something went wrong", detail: "Please try again.", tone: "error" };

  if (/reject|denied|4001/.test(lower)) {
    return { title: "Payment cancelled", detail: "You declined the request in your wallet. No funds were sent.", tone: "warning" };
  }
  if (/gaslimit is too low|gas was 0/.test(lower)) {
    return {
      title: "Wallet could not set a fee",
      detail: "Please try Pay again. Keep a little POL in this wallet for network fees.",
      tone: "error",
    };
  }
  if (/exceeds balance|insufficient/.test(lower)) {
    return {
      title: "Not enough USDT",
      detail: "This wallet needs at least $5 USDT on Polygon, plus a little POL for fees.",
      tone: "error",
    };
  }
  if (/on-chain transaction failed|tx_failed/.test(lower)) {
    return {
      title: "Payment did not go through",
      detail: "The blockchain rejected the transfer. Check your USDT and POL balances, then try again.",
      tone: "error",
    };
  }
  if (/not configured|token_not_configured/.test(lower)) {
    return { title: "Payments are not ready", detail: "The USDT contract is not set. Please try again later.", tone: "warning" };
  }
  if (/wrong_token|different token/.test(lower)) {
    return { title: "Wrong token", detail: "GLOBAL X only accepts the USDT contract configured for this site.", tone: "error" };
  }
  if (/wrong_sender/.test(lower)) {
    return { title: "Wrong wallet", detail: "Pay with the same wallet you used to sign in.", tone: "error" };
  }
  if (/wrong_amount/.test(lower)) {
    return { title: "Amount mismatch", detail: "The on-chain amount did not match the $5 registration fee.", tone: "error" };
  }
  if (/wrong_recipient/.test(lower)) {
    return { title: "Wrong destination", detail: "This payment did not go to the GLOBAL X registration address.", tone: "error" };
  }
  if (/pending|not mined|waiting for blockchain|rpc|authenticated/.test(lower)) {
    return { title: "Confirming payment", detail: "Please wait. Keep this page open while Polygon confirms the transaction.", tone: "info" };
  }
  if (/timed out/.test(lower)) {
    return { title: "Still waiting", detail: "If your wallet showed success, wait a moment and refresh this page.", tone: "warning" };
  }
  if (/unauthenticated|session/.test(lower)) {
    return { title: "Please sign in again", detail: "Connect your wallet and try Pay once more.", tone: "warning" };
  }
  if (/profile_required/.test(lower)) {
    return { title: "Your details are required", detail: "Enter your name, email, and mobile number before connecting a wallet.", tone: "warning" };
  }
  if (/registration is already/.test(lower)) {
    return { title: "Already registered", detail: "Your $5 registration is already active.", tone: "success" };
  }
  if (/complete \$5|complete registration/.test(lower)) {
    return { title: "Registration required", detail: "Pay the $5 registration fee before buying a plan.", tone: "warning" };
  }
  if (/reentry_not_required|not completed both/.test(lower)) {
    return { title: "Re-entry is not due", detail: "Re-entry pay is only required after both Global legs of your current seat are filled.", tone: "info" };
  }
  if (/reentry_recipient_mismatch|reentry_self_pay/.test(lower)) {
    return {
      title: "Re-entry recipient is blocked",
      detail: "This payment must go to the new Global parent’s verified wallet, not to your own wallet or the company.",
      tone: "error",
    };
  }

  if (/^[A-Z0-9_]{6,}$/.test(text) || text.length > 180 || text.includes("{") || text.includes("Signer Error")) {
    return { title: "Payment failed", detail: "Please try again. If it keeps failing, check USDT and POL in this wallet.", tone: "error" };
  }

  return { title: "Notice", detail: text, tone: "error" };
}

function unwrap(raw?: string | null) {
  if (!raw) return "";
  const nested = raw.match(/\{[\s\S]*"error"\s*:\s*"([^"]+)/);
  if (nested?.[1]) return nested[1].replace(/\\n/g, " ");
  return raw.replace(/\\n/g, " ").trim();
}
