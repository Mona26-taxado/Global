import { createClient } from "@supabase/supabase-js";

export function supabaseProjectUrl(raw = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  return (raw ?? "")
    .trim()
    .replace(/\/rest\/v1\/?$/i, "")
    .replace(/\/+$/, "");
}

export function createBrowserSupabase() {
  const url = supabaseProjectUrl();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}
