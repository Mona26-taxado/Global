# Environment variables

Copy `.env.example` to `.env.local` (or `.env`). Never commit secrets.

| Variable | Where it comes from | Used for |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Your deployed URL or `http://localhost:3000` | Referral links, TokenPocket callback |
| `NEXT_PUBLIC_NETWORK` | You choose `amoy` (default) or `mainnet` | Chain id 80002 vs 137, TESTNET badge |
| `NEXT_PUBLIC_DEMO_MODE` | Optional `true`/`false` | Demo labels only |
| `MAINNET_PAYMENTS` | Must be `true` to pay on mainnet | Safety gate |
| `SESSION_SECRET` | Generate 32+ random chars | Login cookie |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | You choose | `/admin` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase dashboard → API | Optional hosted DB |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page | Client (if used) |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page, **secret** | Server (if used) |
| `POLYGON_AMOY_RPC_URL` | dRPC / Alchemy / Infura Amoy endpoint | Read chain, verify txs |
| `POLYGON_RPC_URL` | Same for Polygon mainnet | Mainnet RPC |
| `POLYGON_AMOY_USDT_CONTRACT` | A contract **you verified** on Amoy | Test USDT (empty = no fake pay) |
| `POLYGON_USDT_CONTRACT` | Official Polygon USDT **you verified** | Mainnet token |
| `PAYMENT_RECIPIENT_ADDRESS` | Your treasury wallet | ERC-20 `to` |
| `POLYGON_AMOY_EXPLORER_URL` | Default Amoy Polygonscan | TX links |
| `POLYGON_EXPLORER_URL` | Default Polygonscan | Mainnet TX links |

Do **not** invent a USDT address. If you do not have one yet, leave it empty. The app will show: **USDT testnet contract is not configured.**

`NEXT_PUBLIC_*` values are public. Recipient is server-side (`PAYMENT_RECIPIENT_ADDRESS` is not required in the browser).

See also `.env.example` comments.
