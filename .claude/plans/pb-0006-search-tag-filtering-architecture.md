# Architecture — PB-0006: Search + tag filtering (public)

## Problem & goals

A reader (primarily future-Jason, secondarily recruiters/peers per the PRD's target user) needs to
narrow the public post list by search term or tag. Every decision below is judged against: does it
deliver ranked full-text search + tag filtering on the existing post list page, staying inside the
Next.js + Supabase stack, without over-building for a single-admin blog with a small, slow-growing
post count.

## Approaches considered

The PRD/architecture already settled the top-level approach — Postgres full-text search via Supabase,
not a separate search service or client-side-only search (rejected at PRD stage, not reopened here).
What this ticket actually had to decide was how search/tag filtering, which is inherently a
per-request concern, coexists with the post list page's current fully-static rendering
(`dynamic = "force-static"`, `revalidate = false`).

Three shapes were weighed:

- **A — Client-driven progressive search**: keep `page.tsx` fully static; a Client Component fetches
  a separate JSON endpoint after hydration and swaps the rendered list in React state. Preserves the
  page's static rendering untouched, but adds a second data-fetching path (initial static list vs.
  client-fetched results) and a manual fetch/abort/state-merge layer to maintain.
- **B — Separate dynamic `/search` route**: leave `/` untouched; add a new dynamically-rendered page
  that reads `searchParams`. Clean and idiomatic, but a second route/page — a bigger departure from
  the ticket's framing of "search on the list page" than needed.
- **C — `page.tsx` itself becomes dynamic** *(chosen)*: drop `force-static`, read `searchParams`
  directly in the existing list page, query Supabase server-side. Single code path, matches the
  ticket's actual file estimate (no new route file — just `SearchBar.tsx`, `TagFilter.tsx`, and edits
  to `page.tsx`), and works without JavaScript for the base case (real URL, real server render).

**Chosen: C.** The user explicitly accepted breaking the current CLAUDE.md ISR rule for this page in
exchange for the simpler, single-code-path shape — see Key decisions and Missing pieces below for
what that requires updating.

## Recommended approach

`app/(public)/page.tsx` drops `dynamic = "force-static"` / `revalidate = false` and becomes
dynamically rendered (`export const dynamic = "force-dynamic"`), reading `q` (search term) and `tag`
query params from `searchParams`. It calls an extended version of `getPublishedPosts` (in
`lib/posts/queries.ts`) that, when params are present, runs the Postgres full-text search /
array-contains query instead of the plain unfiltered select — same anon client, same RLS enforcement
(published-only), no new privileged code path.

`SearchBar.tsx` is a Client Component: a debounced text input that calls `router.replace()` to update
the URL's `q` param. `TagFilter.tsx` renders tag chips as links/click-handlers that do the same for
`tag`. Both go through the same URL-driven mechanism, so search and tag filtering share one query path
and compose naturally as URL params — no separate JSON API, no manual client-side result-merging.
Next.js's own client-side navigation (re-rendering the Server Component for the new URL) does the
"fetch and swap" work a dedicated Route Handler would otherwise do by hand.

## Key decisions

- **Stack & libraries:** No new libraries needed — Supabase JS client's full-text search support
  (`textSearch()` against a `tsvector` column) and the existing `@supabase/ssr` server client cover
  this. Debounce can be a small hand-rolled `useEffect`/`setTimeout` in `SearchBar.tsx`; not worth a
  dependency for one input.
- **Data model:** New `tsvector` generated column (or trigger-maintained column) on `posts`, covering
  **title + content**, with a GIN index — resolves the PRD's open question ("title/tags only vs.
  both") in favor of the ticket's stated default: searching the actual write-up text is more useful
  for a technical blog than metadata-only search, and is cheap to narrow later if it proves too broad.
  `tags` already has a GIN index (PB-0001) and needs no schema change for array-contains filtering.
- **Boundaries & contracts:** No change to the access-control model — search/filter queries run
  through `lib/supabase/server.ts` (publishable key, RLS-enforced, anon role for logged-out readers),
  exactly like today's `getPublishedPosts`/`getPublishedPostBySlug`. No privileged (`lib/supabase/
  admin.ts`) code path is introduced by this ticket.
- **Rendering posture (the significant trade-off):** `/` moves from static/ISR to dynamic
  (server-rendered on every request, including the default no-filter view). This directly changes the
  CLAUDE.md rule "Public post pages use ISR (revalidated on publish), not per-request SSR." The user
  explicitly accepted this trade for the simpler single-code-path shape, given this is a low-traffic,
  non-audience-growth personal blog (PRD non-goals) where per-request Supabase reads are cheap at this
  scale. **CLAUDE.md's Rendering rule and the `app/(public)/` architecture-map entry must be updated
  as part of implementing this ticket** to reflect that the list page is now dynamic while the post
  detail page (`posts/[slug]/page.tsx`) remains static/ISR, unchanged — this ticket does not touch
  detail-page rendering.
- **Filter composition:** search term and tag combine with **AND** (a post must match both, when both
  are present) — matches the ticket's "compose" language literally, and is the more intuitive behavior
  for a narrowing filter UI.
- **Query mechanism:** no dedicated Route Handler. URL-param-driven server re-render (via
  `router.replace` + the dynamic page) does the job with fewer moving parts. Revisit only if a future
  feature needs search decoupled from full-page navigation (e.g., a search widget living outside the
  list page).

## Missing pieces

- New migration: `tsvector` column (title + content) + GIN index on `posts`.
- `lib/posts/queries.ts`: extend `getPublishedPosts` (or add a sibling function) to accept optional
  `{ search?: string; tag?: string }` and branch into the FTS/array-contains query path.
- `SearchBar.tsx`, `TagFilter.tsx` (both under `app/(public)/`) as described above.
- `page.tsx`: drop `force-static`/`revalidate`, read `searchParams`, wire in the new query params.
- CLAUDE.md: update the Rendering ground rule and the `app/(public)/` architecture-map line to
  describe the list page as dynamic (search/tag-driven) while the detail page stays ISR.

## Spikes & experiments

None needed — every piece here (Next.js dynamic rendering via `searchParams`, Supabase `textSearch()`,
a debounced client input) is a well-documented, reversible pattern at this project's scale.

## Open questions

None remaining for this ticket — all four forking decisions (rendering shape, tsvector scope, filter
composition, query mechanism) were resolved above with the user.
