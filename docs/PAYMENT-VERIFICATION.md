# Payment verification

## 1. What it does

The server loads the transaction from Polygon RPC and checks it matches the **quoted** payment. Frontend “tx sent” is not trust.

## 2. User flow (status machine)

`IDLE` → `PAYMENT_REQUESTED` → `WALLET_CONFIRMATION` → `SUBMITTED` → `PENDING` → `CONFIRMED`  
or `FAILED` / `REJECTED`.

UI copy lives in `hooks/use-pay.ts` (`payPhaseMessage`).

## 3. Frontend files

`hooks/use-pay.ts` posts `txHash` only. It does not set registration ACTIVE itself.

## 4. Backend files

`payments/verify.ts`, `payments/service.ts`, `lib/viem.ts`.

## 5. Database

`transactions.status`: PENDING while unmined; CONFIRMED after success; FAILED after mismatch or reverted receipt.

`registrations.status`: PENDING / ACTIVE / FAILED in parallel for $5.

## 6. API

`POST /api/payments/confirm` returns HTTP 202 + `code: "PENDING"` if not mined. The UI retries.

## 7. Environment

RPC URL for the active network. Token + recipient must match the tx.

## 8. Blockchain checks

1. `txHash` is a real `0x` hash (never invented).
2. RPC `chainId` equals configured chain (80002 or 137).
3. Transaction `from` = authenticated wallet.
4. Transaction `to` = configured USDT contract.
5. Calldata is ERC-20 `transfer`.
6. Transfer `to` = the **server-quoted** recipient (company for $5; sponsor or Global upline for plans).
7. Amount equals quoted units.
8. Receipt `status` success.
9. Receipt contains a `Transfer` event on that token with matching from/to/value.

## 9. How this maps to ACTIVE

Only after the checks pass does `confirmPayment` set registration ACTIVE or plan transaction CONFIRMED.

## 10. How to test

Submit a real Amoy transfer. Confirm Polygonscan. Force a wrong amount (should FAILED). Confirm a pending hash returns PENDING.

## 11. Common errors

See codes in `ChainVerifyError`: `PENDING`, `WRONG_CHAIN`, `WRONG_SENDER`, `WRONG_TOKEN`, `WRONG_RECIPIENT`, `WRONG_AMOUNT`, `TX_FAILED`, `NO_TRANSFER_EVENT`, `TOKEN_NOT_CONFIGURED`.

## 12. Before mainnet

Use a paid RPC. Confirm official USDT decimals (Polygon USDT is typically 6 — if a token uses 18, the unit math in `amountToUnits` must be updated to match that token; do not assume).
