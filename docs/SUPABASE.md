# SUPABASE

Optional hosted Postgres + API.

1. Create a project at https://supabase.com/dashboard (free tier exists; confirm current plan on their site).
2. Run `supabase/schema.sql` in the SQL editor.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Until then, GLOBAL X uses the local JSON store so `npm run dev` works without an account.
