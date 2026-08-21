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
  session cookie. As of PB-0005, also used by the `(public)` pages' `lib/posts/queries.ts` — the
  first time this client is exercised with **no session** (logged-out/anon role) rather than only
  by the authenticated admin/login flows; same client, same RLS enforcement, just the anon role.
  `createClient()` tolerates `cookies()` throwing (build-time contexts like `generateStaticParams`
  have no request to read cookies from) by falling back to an empty cookie store, which is still
  correct RLS behavior since that context is always logged-out anyway.
- `lib/supabase/client.ts` — the browser-side counterpart (publishable key), the only key allowed
  client-side.

RLS policies are the actual enforcement layer underneath the app-level checks above: anonymous/public
reads are limited to rows where `status = 'published'`; full read/write access requires the
authenticated admin session. When adding a new query or mutation, check which key/context it runs in
before assuming RLS will cover it.
