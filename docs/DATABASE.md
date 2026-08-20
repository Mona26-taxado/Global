# Database

See `prisma/schema.prisma`.

Tables: `users`, `wallets`, `auth_nonces` (model AuthNonce), `registrations`, `plan_purchases` (plans), `payment_transactions`, `referrals`, `network_positions`, `position_history`, `admin_users`, plus `token_pocket_actions` for H5 callbacks and `app_settings`.

Foreign keys: wallets/registrations/plans/transactions → users; network parent → network_positions; sponsor → users.

Authorization is enforced in API routes (`requireUser`, `requireAdmin`), not in the database engine alone.
