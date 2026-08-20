# ARCHITECTURE

Wallet connect, auth, payments, referrals, network, and admin are separate folders.

Connect path never calls `eth_sendTransaction`. Only `app/dashboard/plans/page.tsx` Pay does.

TokenPocket Connect uses `action: "login"` only (`wallet/tokenpocket/deeplink.ts`).
