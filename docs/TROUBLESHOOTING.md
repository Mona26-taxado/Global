# Troubleshooting

## Wallet

**TokenPocket shows a transfer on Connect**  
Connect must use `action: "login"` only. Check `wallet/tokenpocket/deeplink.ts` and `/api/wallet/tokenpocket/start` (`kind` default login; `transfer` requires a logged-in user and Pay).

**TokenPocket callback stays PENDING / status polls forever**  
The phone cannot call `localhost` on your laptop. Open the app as `http://YOUR_LAN_IP:3000` (same Wi‑Fi). Dev server must allow that host (`allowedDevOrigins` is filled from this machine’s LAN IPs — **restart `npm run dev`** after config change). Set `NEXT_PUBLIC_APP_URL=http://192.168.x.x:3000` to match. Connect again so a **new** TokenPocket `actionId` is created; an old PENDING poll will never complete.

**Blocked cross-origin request from 192.168.x.x to /_next/**  
Next.js blocks phone access to HMR/assets unless that LAN IP is in `allowedDevOrigins`. Restart the dev server after changing `next.config.ts`.

**Trust Wallet did not open the site**  
Connect uses `open_url` (not a payment deeplink). After the DApp browser loads, use Connect + Verify.

**Wrong network**  
Switch the wallet to Polygon Amoy (80002) in development.

## Session / admin

**SESSION_SECRET must be at least 32 characters**  
Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

**Cannot open /admin**  
Set `ADMIN_PASSWORD`. Username defaults to `ADMIN_USERNAME` or `admin`.

## Payments

**USDT testnet contract is not configured**  
Set `POLYGON_AMOY_USDT_CONTRACT` to a token you verified. The app will not fake success.

**Payment stays PENDING**  
Tx not mined, RPC lag, or hash not posted. Use Amoy Polygonscan with the real hash.

**WRONG_AMOUNT / WRONG_RECIPIENT**  
Wallet sent a different token/amount/to than `/api/payments/prepare`. Frontend cannot choose the recipient.

**Insufficient funds**  
Need Amoy POL for gas plus enough of the configured ERC-20.

## Referrals

**INVALID_REFERRAL**  
Code does not exist. Do not type a `sponsor_id`.

**SPONSOR_LOCKED**  
Already attributed; cannot change.

## Build

**wagmi connectors / Coinbase x402**  
Do not mount `WagmiProvider` from `wagmi/connectors`. Connect is custom (Trust / TokenPocket / injected).
