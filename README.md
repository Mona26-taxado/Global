# GLOBAL X

Trust Wallet + TokenPocket on Polygon Amoy (testnet by default). Connect never sends a payment. Registration ($5), plans, referrals, and admin are verified against the chain / store.

## Quick start

```bash
cp .env.example .env.local
# set SESSION_SECRET (32+ chars), ADMIN_PASSWORD, PAYMENT_RECIPIENT_ADDRESS
# optionally POLYGON_AMOY_USDT_CONTRACT (do not invent an address)
npm install
npm run dev
```

Open http://localhost:3000 → Get Started → `/register`.

Do **not** run `npm run seed` unless you explicitly want the old demo network data.

## Docs

- [docs/REGISTRATION-PAYMENT.md](docs/REGISTRATION-PAYMENT.md)
- [docs/PLAN-PAYMENT.md](docs/PLAN-PAYMENT.md)
- [docs/REFERRAL.md](docs/REFERRAL.md)
- [docs/ADMIN.md](docs/ADMIN.md)
- [docs/PAYMENT-VERIFICATION.md](docs/PAYMENT-VERIFICATION.md)
- [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
