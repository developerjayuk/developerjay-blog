import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  // `cookies()` throws synchronously (not a rejected promise) when called outside a request
  // scope — e.g. from `generateStaticParams`, which runs at build time with no incoming request.
  // The `(public)` routes set `dynamic = "force-static"` precisely so this doesn't happen at
  // runtime, but this fallback keeps `createClient()` safe to call from any build-time context.
  // A missing/empty cookie store is always the anon role, which is correct RLS behavior here.
  let cookieStore: Awaited<ReturnType<typeof cookies>> | null;
  try {
    cookieStore = await cookies();
  } catch {
    cookieStore = null;
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore?.getAll() ?? [];
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore?.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — proxy.ts refreshes the session instead.
          }
        },
      },
    },
  );
}
