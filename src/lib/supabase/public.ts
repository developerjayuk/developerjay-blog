import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Anon-key client with no cookie/session handling — used for public reads so a stray
// admin session cookie (or a JWT temporarily rejected during Supabase's free-tier
// cold-start clock skew) never gets forwarded as an Authorization header on public queries.
export function createClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
