# Supabase Access Control

Admin routes (`/admin/*`) are gated by Next.js middleware that checks two things: an active Supabase
session, AND that the session's email matches the single allowlisted admin address. Session presence
alone is not enough — Supabase Auth's public sign-up defaults to on and must stay explicitly disabled
in the Supabase Auth config, so a stray sign-up could otherwise pass a session-only check.

Two Supabase keys exist and must stay on their respective sides, each behind its own client module
in `lib/supabase/`:

- `lib/supabase/admin.ts` — secret key (`sb_secret_...`), bypasses Row-Level Security, guarded by
  `import "server-only"`. Synchronous `createClient()`. Used for privileged reads/writes (e.g. the
  admin dashboard's post queries) — never sent to the client or embedded in client components.
- `lib/supabase/server.ts` — publishable key (`sb_publishable_...`), cookie-aware via `@supabase/ssr`,
  respects RLS. Async `createClient()` (must be awaited) — used by `proxy.ts`'s inline client build,
  the `(protected)` layout's session check, and the login/logout Server Actions to read/write the
  session cookie.
- `lib/supabase/client.ts` — the browser-side counterpart (publishable key), the only key allowed
  client-side.

RLS policies are the actual enforcement layer underneath the app-level checks above: anonymous/public
reads are limited to rows where `status = 'published'`; full read/write access requires the
authenticated admin session. When adding a new query or mutation, check which key/context it runs in
before assuming RLS will cover it.
