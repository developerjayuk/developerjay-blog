# PR #1 Review — feat(admin): implement admin authentication with proxy gating

**Branch**: `feature/pb-0002-admin-authentication` → `main`
**Plan**: `.claude/plans/pb-0002-admin-authentication.md`   **Report**: `.claude/reports/pb-0002-admin-authentication-report.md`

## Summary

Implements real access control for `/admin/*`: a two-layer session+email-allowlist check (`proxy.ts` edge gate + an
independent `(protected)` layout check), a login page/form/Server Action, a logout action, and a two-client
Supabase split (`admin.ts` privileged/secret-key, `server.ts` cookie-aware/publishable-key). Matches the ticket's
intent and the plan closely — its one documented deviation (route-group layout instead of a flat `admin/layout.tsx`)
is pre-authorized in the plan's Open Questions and is not flagged here.

## Validation

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Pass, zero errors |
| `npm run lint` | ✅ Pass, zero errors/warnings |
| `npm run build` | ✅ Pass — `/admin`, `/admin/login` render as dynamic (ƒ) routes, proxy active, `/` still static |

## Issues

### Critical

**1. Open redirect via the unauthenticated `?redirect=` query param**
`src/app/admin/login/page.tsx:8,13`, `src/app/admin/login/login-form.tsx:11`, `src/app/admin/login/actions.ts:11,25`

`/admin/login` is reachable while logged out by design. The `redirect` value is read straight off the public URL's
query string in `page.tsx`, echoed into a hidden form field by `login-form.tsx`, and passed verbatim to
`redirect(redirectTo)` in `actions.ts:25` after a **successful, real login**. Next.js's `redirect()` honors absolute
external URLs, so a crafted link like `/admin/login?redirect=https://evil.example.com` sends the admin to an
attacker-controlled page immediately after authenticating for real — a phishing vector against the one account this
whole ticket exists to protect.

The plan's Task 8 Gotcha #1 assumed this was safe because the value "only ever comes from `proxy.ts`'s own
`searchParams.set(...)`, which is always same-origin" — that assumption doesn't hold in the shipped code, since
nothing stops an attacker from supplying the param directly on the public login page.

**Fix**: validate `redirectTo` is an internal path (starts with `/`, not `//` — protocol-relative bypass) both where
it's rendered in `page.tsx` and again defensively in `actions.ts` before calling `redirect()`; fall back to `/admin`
otherwise.

### High

**2. Unsafe `formData.get(...) as string` casts bypass the intended error UX**
`src/app/admin/login/actions.ts:9-10`

`FormData.get()` returns `string | File | null`; the `as string` cast discards `null`/`File`. Server Actions are
directly POST-able public endpoints independent of the client form's `required` attributes — a malformed/missing
field yields `null` typed as `string`, handed straight to `signInWithPassword(...)`, bypassing the `{ error }` state
path entirely.

**Fix**: runtime-validate both fields (`typeof email === "string" && email.length > 0`, same for password) and
return `{ error: "..." }` early on failure instead of relying on the cast.

### Medium

**3. `proxy.ts` drops the query string on redirect, contradicting the plan's stated round-trip behavior**
`src/proxy.ts:39`

`url.searchParams.set("redirect", request.nextUrl.pathname)` preserves only `pathname`, not `request.nextUrl.search`.
The plan's edge-case list explicitly expects `/admin?foo=bar` (unauthenticated) → login → back to `/admin?foo=bar`;
as written it round-trips to `/admin` only. Silent today (no admin page uses query params yet) but it's an
undocumented gap versus the plan's stated behavior — the manual test for this flow was also skipped per the report.

**Fix**: `url.searchParams.set("redirect", request.nextUrl.pathname + request.nextUrl.search)`.

**4. CLAUDE.md overstates `proxy.ts`'s relationship to `lib/supabase/server.ts`**
`CLAUDE.md:22-25`

"server.ts: ... used by `proxy.ts`, the `(protected)` layout, and login/logout Server Actions" reads as `proxy.ts`
importing that module. It doesn't — per the plan's Phase 2 note, `proxy.ts` builds its own inline
`createServerClient` call with a `NextRequest`/`NextResponse` cookie adapter, deliberately incompatible with
`server.ts`'s `next/headers`-based adapter. `.claude/references/supabase-access-control.md:15-16` phrases this
correctly; CLAUDE.md's architecture map doesn't carry the nuance.

**Fix**: reword to "...used by the `(protected)` layout and login/logout Server Actions; `proxy.ts` builds an
equivalent inline client (different cookie adapter, not this module)."

### Low

**5. Fail-open if `ADMIN_EMAIL` is ever unset**
`src/proxy.ts:33`, `src/app/admin/(protected)/layout.tsx:14`, `src/app/admin/login/actions.ts:20`

`user?.email === process.env.ADMIN_EMAIL` degrades to `undefined === undefined` → `true` if the env var is unset and
a user with no email exists. Not exploitable via this app's password-only flow today, but a misconfigured deploy
would silently fail open rather than fail closed/loud. Consider asserting `ADMIN_EMAIL` is a non-empty string at
module load.

**6. Login form inputs have no associated `<label>`**
`src/app/admin/login/login-form.tsx:12-13`

Placeholder-only inputs — accessibility polish, not a functional bug.

## What's done well

- The two-client split matches CLAUDE.md's convention exactly: `admin.ts` is `server-only`-guarded, synchronous, and
  never imported from a Client Component.
- `proxy.ts` correctly implements the `@supabase/ssr` cookie-refresh contract — no code between
  `createServerClient(...)` and `getUser()`, `setAll` reassigns `supabaseResponse` and mirrors cookies onto both the
  request and the new response.
- Route-group nesting is correct: only the dashboard lives under `(protected)`; `admin/login/` is a genuine sibling,
  so the layout's independent check can't (and doesn't) wrap the login page.
- Both of the plan's documented proxy gotchas are implemented exactly as specified: the login-path special-case that
  avoids an infinite redirect loop, and the already-authorized-admin-visiting-`/admin/login` bounce to `/admin`.
- The `user?.email === process.env.ADMIN_EMAIL` check is applied consistently across all three enforcement points
  (proxy, layout, login action) — correctly implementing the "session alone isn't enough" invariant given the RLS
  policy trusts any authenticated session.
- Server Actions each build their own independent session client rather than trusting state threaded from the
  proxy — matches the plan's defense-in-depth rationale.
- `getUser()` (not `getSession()`) is used at every server-side check point, per the plan's cited Supabase guidance.
- The `"use client"` surface stays minimal, following the `theme-toggle.tsx` precedent.

## Recommendation

**Request changes.** The Critical open-redirect issue sits directly in the auth flow this ticket exists to build —
CLAUDE.md flags auth as one of the areas worth pausing on, and this is exactly the kind of gap that scrutiny is for.
The High-severity unsafe-cast issue should also be fixed before merge. The two Medium issues (dropped query string,
CLAUDE.md wording) are worth fixing in the same pass since they're small and already understood. Lows are optional
polish.
