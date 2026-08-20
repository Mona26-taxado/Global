# Registration payment ($5 USDT)

## 1. What it does

Collects a **$5 USDT** ERC-20 transfer on Polygon (default **Amoy testnet**) and marks the user’s registration **ACTIVE** only after the **server** verifies the on-chain transaction.

Connect Wallet never creates this payment.

## 2. User flow

1. Open `/register` (optional `?ref=CODE` stored locally).
2. Connect Trust Wallet or TokenPocket (no transfer).
3. Verify with a login signature.
4. See the GLOBAL X REGISTRATION card ($5 USDT, network, status).
5. Tap **PAY $5 REGISTRATION** only then does the wallet show a transfer.
6. User confirms in the wallet.
7. Frontend sends the **real** `txHash` to the API.
8. Backend verifies the chain, then `registration.status = ACTIVE`.
9. User is sent to `/dashboard`. Plans stay locked until ACTIVE.

Statuses: `NOT_PAID` → `PENDING` → `ACTIVE` or `FAILED`.

## 3. Frontend files

- `app/register/page.tsx`
- `components/payments/registration-card.tsx`
- `hooks/use-pay.ts` (shared pay state machine)
- `components/wallet/wallet-modal.tsx` (connect only)

## 4. Backend files

- `payments/service.ts` (`preparePayment`, `confirmPayment`)
- `payments/verify.ts` (`verifyTokenTransfer`)
- `lib/network-config.ts` (chain, token, recipient)

## 5. Database

Local JSON: `data/globalx.json` → `registrations[]`, `transactions[]`.

Supabase (optional): `registrations`, `transactions` in `supabase/schema.sql`.

## 6. API routes

- `GET /api/payments/prepare?type=REGISTRATION` — server amount, recipient, token
- `POST /api/payments/confirm` — `{ paymentType: "REGISTRATION", txHash }`
- `GET /api/me` — current registration
- `GET /api/config` — `usdtConfigured`, explorer, testnet flag

## 7. Environment variables

- `POLYGON_AMOY_USDT_CONTRACT` (required on Amoy)
- `PAYMENT_RECIPIENT_ADDRESS`
- `POLYGON_AMOY_RPC_URL`
- `NEXT_PUBLIC_NETWORK=amoy`

## 8. Blockchain interaction

ERC-20 `transfer(recipient, 5 * 10^6)` to the **configured** token contract. Recipient comes from the server, not a form field.

TokenPocket DApp browser: injected `eth_sendTransaction`.  
Phone without injected provider: TokenPocket **transfer** deeplink (Pay only, never Connect).

## 9. How payment is verified

See [PAYMENT-VERIFICATION.md](PAYMENT-VERIFICATION.md). Wallet “success” is ignored until RPC verification.

## 10. How to test

1. Set `POLYGON_AMOY_USDT_CONTRACT` to a token you control or a documented Amoy USDT/faucet token **you verified**.
2. Fund the wallet with Amoy POL (gas) and that token.
3. Connect + verify on `/register`.
4. Pay $5. Confirm in the wallet.
5. Wait for “Payment confirmed.” Status ACTIVE. Hash links to Amoy Polygonscan.

If the contract env is empty, you should see **USDT testnet contract is not configured.** Do not expect a fake success.

## 11. Common errors

| Message | Cause |
| --- | --- |
| USDT testnet contract is not configured | Empty `POLYGON_AMOY_USDT_CONTRACT` |
| PAYMENT_RECIPIENT_ADDRESS is not set | Empty recipient |
| PENDING / waiting for confirmation | Tx not mined yet |
| WRONG_SENDER / RECIPIENT / AMOUNT / TOKEN | On-chain data ≠ server quote |
| User rejected | Wallet declined |

## 12. Before mainnet

- `NEXT_PUBLIC_NETWORK=mainnet`
- `MAINNET_PAYMENTS=true`
- `POLYGON_USDT_CONTRACT` = official Polygon USDT you verified
- `POLYGON_RPC_URL` production RPC
- `PAYMENT_RECIPIENT_ADDRESS` production treasury
- Re-test amounts and explorer (`polygonscan.com`)
