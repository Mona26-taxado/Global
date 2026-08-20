# GO LIVE — what you must do (I cannot log into your accounts)

App is production-structured. **Vercel cannot keep `data/globalx.json`.** You must add Supabase.

## 1. Supabase (required for live)

1. Open https://supabase.com/dashboard → your project (or create one).
2. SQL Editor → paste **entire** `supabase/schema.sql` → Run.
3. Settings → API copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (secret, never in git)

If a service role was ever committed, **rotate it** in Supabase.

## 2. Vercel (public HTTPS URL)

1. https://vercel.com → Add New → this folder (GitHub) or `npx vercel`.
2. Environment variables (Production):

```
NEXT_PUBLIC_APP_URL=https://YOUR-DOMAIN.vercel.app
NEXT_PUBLIC_NETWORK=amoy
MAINNET_PAYMENTS=false
SESSION_SECRET=   (32+ random chars)
ADMIN_USERNAME=
ADMIN_PASSWORD=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
POLYGON_AMOY_RPC_URL=
PAYMENT_RECIPIENT_ADDRESS=0x...
POLYGON_AMOY_USDT_CONTRACT=
```

3. After first deploy, set `NEXT_PUBLIC_APP_URL` to the real `https://….vercel.app` and **Redeploy**.

TokenPocket only works on that HTTPS URL, not localhost.

## 3. USDT contract (required for Pay)

I will not invent this.

- Testnet live: paste a token **you verified** on Amoy Polygonscan → `POLYGON_AMOY_USDT_CONTRACT`
- Real money later: official Polygon USDT from polygonscan.com → `POLYGON_USDT_CONTRACT` plus:
  `NEXT_PUBLIC_NETWORK=mainnet`
  `MAINNET_PAYMENTS=true`
  `POLYGON_RPC_URL=` (Alchemy/Infura/QuickNode)

Until the contract is set, Pay shows: **USDT testnet contract is not configured.**

## 4. Session + admin

Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Put in `SESSION_SECRET`. Choose a new `ADMIN_PASSWORD`.

## 5. $5 recipient

Already `PAYMENT_RECIPIENT_ADDRESS` — that one wallet receives every $5.

## After Vercel URL exists

Open TokenPocket DApp browser → your HTTPS site → Connect → Pay.
