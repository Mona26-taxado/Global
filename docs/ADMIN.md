# Admin console

## 1. What it does

Password-protected `/admin` for operators. Normal members never see these APIs without `session.admin`.

## 2. User flow

1. Open `/admin`.
2. Sign in with `ADMIN_USERNAME` + `ADMIN_PASSWORD`.
3. Dashboard cards, then Users / Wallets / Registrations / Transactions / Plans / Referrals / Settings.

## 3. Frontend files

- `app/admin/page.tsx` (login + stats)
- `components/admin-shell.tsx`
- `app/admin/users/page.tsx`, `app/admin/users/[id]/page.tsx`
- `app/admin/wallets/page.tsx`
- `app/admin/registrations/page.tsx`
- `app/admin/transactions/page.tsx` (filters: status, type, network, date)
- `app/admin/plans/page.tsx`
- `app/admin/referrals/page.tsx`
- `app/admin/settings/page.tsx`

## 4. Backend files

- `app/api/admin/login/route.ts`
- `app/api/admin/logout/route.ts`
- `app/api/admin/stats/route.ts`
- `app/api/admin/data/route.ts`
- `app/api/admin/settings/route.ts`
- `lib/session.ts` (`requireAdmin`)

## 5. Database

Reads the same store as the app (`users`, `wallets`, `registrations`, `plans`, `transactions`, `referrals`).

## 6. API routes

- `POST /api/admin/login` `{ username, password }`
- `POST /api/admin/logout`
- `GET /api/admin/stats`
- `GET /api/admin/data?resource=users|wallets|registrations|transactions|plans|referrals|user&id=`
- `POST /api/admin/data` `{ kind: "plan", ... }`
- `GET /api/admin/settings` — CONFIGURED / NOT CONFIGURED only (no secrets)

## 7. Environment

`ADMIN_USERNAME`, `ADMIN_PASSWORD` (or `ADMIN_BOOTSTRAP_*`), `SESSION_SECRET`.

## 8. Blockchain

Admin does **not** mark payments paid. TX hashes link to the explorer.

## 9. Payment status

Never “Mark paid.” Status comes from `payments/verify.ts`.

## 10. How to test

Set admin env, sign in, open each route, View User, edit a plan, search referrals, check Settings badges.

## 11. Common errors

`ADMIN_PASSWORD is not set`, `ADMIN_INVALID`, redirect to `/admin` when session expired.

## 12. Before mainnet

Use a strong unique password. Do not reuse the bootstrap password. Restrict who can reach `/admin` (VPN / IP allowlist) in production hosting.
