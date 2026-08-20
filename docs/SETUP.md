# SETUP

1. Node.js 20+.
2. Copy `.env.example` to `.env.local`.
3. Generate `SESSION_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. Set `ADMIN_PASSWORD` to a password you choose (not committed).
5. `NEXT_PUBLIC_APP_URL` must be reachable from your phone (LAN IP or HTTPS) for TokenPocket callbacks.
6. `npm install && npm run seed && npm run dev`

Supabase is optional. If `NEXT_PUBLIC_SUPABASE_URL` is empty, data lives in `data/globalx.json`.

Do not paste USDT addresses you did not verify. See POLYGON.md.
