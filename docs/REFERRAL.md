# Referral (who invited whom)

## 1. What it does

Records **sponsor attribution** only. No binary matrix, no cycle payouts, no guaranteed earnings.

Every user gets a code like `GX7F82K1` and a link:

`{NEXT_PUBLIC_APP_URL}/register?ref=GX7F82K1`

## 2. User flow

1. User A copies the link from `/dashboard/referral`.
2. User B opens `/register?ref=GX…`. The code is stored in `localStorage` (`gx_referral`).
3. B connects and verifies. The **server** looks up the code and sets `B.sponsor_id = A.id`.
4. The frontend never sends a `sponsor_id`.
5. After it is set, sponsor cannot change (`SPONSOR_LOCKED`).
6. Self-referral and unknown codes are rejected (`SELF_REFERRAL`, `INVALID_REFERRAL`).

## 3. Frontend files

- `app/register/page.tsx`
- `app/dashboard/referral/page.tsx`
- `hooks/use-wallet-connection.ts` (passes `referralCode` into `/api/auth/verify`)

## 4. Backend files

- `services/auth.ts`
- `services/users.ts` (`findSponsorByCode`, `assignSponsor`)

## 5. Database

- `users.referral_code`, `users.sponsor_id`
- `referrals` rows: `user_id`, `sponsor_id`, `referral_code`

## 6. API routes

- `POST /api/auth/verify` with `{ referralCode }`
- `GET /api/me` (`referral_link`, `directs`, `active_referrals`, `total_referrals`, `referrals[]`)
- Admin: `/api/admin/data?resource=referrals&q=`

## 7. Environment

`NEXT_PUBLIC_APP_URL` — used to build the shareable link.

## 8. Blockchain

None. Referral is off-chain attribution.

## 9. Verification of sponsor

Lookup by referral **code** in the store. Invalid codes fail **before** a new user is created.

## 10. How to test

1. User A: note code on `/dashboard/referral`. Copy link.
2. Different wallet as User B: open the link, connect, verify.
3. A’s table shows B (real wallet only).
4. B cannot change sponsor.
5. B opening `?ref=` their own code after they exist: locked or self-referral depending on timing; new users cannot self-refer because their code does not exist yet.
6. `?ref=NOTREAL` → verify fails with `INVALID_REFERRAL`.

## 11. Common errors

`INVALID_REFERRAL`, `SELF_REFERRAL`, `SPONSOR_LOCKED`.

## 12. Before mainnet

Set production `NEXT_PUBLIC_APP_URL`. No payout logic should be added without a separate spec.
