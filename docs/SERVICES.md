# SERVICES

| SERVICE | PURPOSE | REQUIRED? | CREDENTIAL | WHERE TO GET IT | FREE/PAID | ENV |
| --- | --- | --- | --- | --- | --- | --- |
| None (local JSON) | Local prototype database | For `npm run dev` without Supabase | No | This repo `data/globalx.json` | Free | — |
| Supabase | Hosted DB | Optional | URL + anon + service role | https://supabase.com/dashboard | See their current pricing | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Polygon RPC | Read chain, verify txs | Yes for balances/payments | RPC URL | Polygon docs or an infra provider | Public RPC is limited; providers vary | `POLYGON_AMOY_RPC_URL`, `POLYGON_RPC_URL` |
| Amoy explorer | View address/tx | No | No | https://amoy.polygonscan.com | Free | — |
| Trust Wallet | Mobile wallet | For Test A | No app key | App stores + Trust developer docs | Wallet is free | — |
| TokenPocket | Mobile wallet | For Test B | No app key | App stores + TokenPocket H5 docs | Wallet is free | `NEXT_PUBLIC_APP_URL` for callbacks |
| iron-session | Cookie session | Yes | `SESSION_SECRET` | Generate locally | Free | `SESSION_SECRET` |

Do not invent USDT contract addresses or third-party pricing.
