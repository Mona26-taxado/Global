# Plan payment ($100 / $200 / $500 / $1000)

## 1. What it does

After **$5 registration is ACTIVE**, a member can buy a plan. Amounts come from the **plans** table.

Each plan has its own two-direct cycle (same rules for $100, $200, $500, $1000).

GLOBAL X **does not** hold user keys and **does not** silently move funds. There is **no escrow**. If the recipient cannot be named, **Pay is blocked**.

## 2. User flow ($100 example)

**X** already exists and has this plan ACTIVE.

### Direct #1 — X refers Y

Y pays $100. Backend sets the ERC-20 recipient to **X’s verified wallet** (not the company). Y confirms in the wallet. After chain verification, Y’s plan is ACTIVE.

### Direct #2 — X refers Z

X now has two directs on this plan. Z’s $100 does **not** go to X.

1. Backend places **X** in the Global tree: first empty **LEFT**, then **RIGHT**, under an ID that is already in the tree.
2. Recipient = **X’s Global parent** (`parent_id` → that user’s verified wallet).
3. If that parent wallet does not exist yet, Z **cannot Pay**. Nothing sits at the company “waiting”.

If the tree is empty, a company **root** is created from `PAYMENT_RECIPIENT_ADDRESS` so X can sit under an existing ID. Z then pays that upline wallet immediately — that is a real transfer, not escrow.

### Repeat

When Y has two directs on the same plan: Y’s first $100 goes to Y, the second to Y’s Global upline after Y is placed.

A **third** direct on the same plan is rejected.

### Genesis (no sponsor)

The first buyer with no referral pays the **company** address for their own plan only. That is not Y/Z’s money.

`$5` registration always goes to `PAYMENT_RECIPIENT_ADDRESS`.

## 3. Frontend files

- `app/dashboard/plans/page.tsx` — SELECT PLAN asks the server for the recipient; PAY NOW only if the server named one
- `hooks/use-pay.ts` — wallet transfer `to` is the server recipient

The user cannot edit the recipient address.

## 4. Backend files

- `payments/plan-routing.ts` — Direct #1 / Direct #2 / placement
- `payments/service.ts` — prepare + confirm
- `payments/verify.ts` — on-chain match of that recipient
- `services/users.ts` — `placeUser` (powerline LEFT-first)
- `network/placement.ts`

## 5. Database

`plans`, `transactions` (`recipient_wallet`, `recipient_role` = `SPONSOR` | `GLOBAL_UPLINE` | `COMPANY_GENESIS`, `routing_slot` 1|2), `network_positions`, `wallets`.

## 6. API

- `GET /api/payments/prepare?type=PLAN_100` — returns `recipient`, `recipientRole`, `slot`, `notice`
- `POST /api/payments/confirm` — verifies the **same** recipient on chain

## 7. Environment

USDT contract, RPC, `PAYMENT_RECIPIENT_ADDRESS` (registration + genesis + optional Global root).

## 8. Blockchain

ERC-20 `transfer(serverRecipient, amount)`. Connect never sends this.

## 9. Verification

Same as [PAYMENT-VERIFICATION.md](PAYMENT-VERIFICATION.md). Plan ACTIVE only after the receipt matches the quoted recipient/amount/token/chain.

## 10. How to test

1. X: register, pay $5, buy $100 (genesis if no sponsor).
2. Y: `?ref=X`, register, pay $5, buy $100 → wallet `to` = X.
3. Z: `?ref=X`, register, pay $5, buy $100 → X is placed in Global; wallet `to` = X’s Global parent (not X).
4. A fourth person under X on $100 → rejected.
5. If Direct #2 prepare says Global upline not ready → Pay hidden; no fake success.

## 11. Common errors

| Code | Meaning |
| --- | --- |
| `SPONSOR_PLAN_INACTIVE` | Sponsor has not confirmed this plan |
| `SPONSOR_WALLET_UNVERIFIED` | Direct #1 cannot start |
| `GLOBAL_UPLINE_NOT_READY` | Direct #2 waits; no escrow |
| `GLOBAL_UPLINE_WALLET_UNVERIFIED` | Parent has no verified wallet |
| `PLAN_DIRECTS_FULL` | Already two directs on this plan |

## 12. Before mainnet

Same USDT/RPC checklist as registration. Confirm every Direct #1/#2 on a real wallet and Polygonscan.
