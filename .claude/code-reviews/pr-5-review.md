# PR #5 Review — feat: add search + tag filtering to the public post list

**Ticket**: PB-0006 · **Branch**: `feature/pb-0006-search-tag-filtering` → `main`
**Reviewed by**: automated PR review (fresh-eyes pass via `code-reviewer` agent + validation run)

## Summary

The list page moves from static to `dynamic = "force-dynamic"` and gains URL-param-driven search
(Postgres full-text via a new generated `search_vector` column) and tag filtering, composed with AND
— matching the accepted plan (approach C: single code path, no new route). Validation passes clean
and the implementation matches the plan and its documented deviations. Two real, reproducible bugs
surfaced in the new client-side URL-sync logic and should be fixed before merge.

## Validation

| Check | Result |
|---|---|
| `npm run lint` | ✅ pass, 0 errors |
| `npm run build` | ✅ pass — route table confirms `/` is `ƒ` (dynamic), `/posts/[slug]` stays `●` (SSG) |
| Manual (per PR description / report) | ✅ base list, tag filter, search all verified against the live Supabase project after migration was applied |

## What's good

- `page.tsx` stays a server component and correctly parallelizes `getPublishedPosts`/`getAllTags`
  via `Promise.all`; only the interactive bits (`SearchBar`, `TagFilter`) are client islands —
  matches the "dynamic only where needed" rendering posture.
- `type: "websearch"` for `.textSearch()` is the right call: `websearch_to_tsquery` never raises on
  malformed input, so no query-string hardening is needed there.
- Migration is safe and idempotent: `title`/`content` are `not null` in the base schema, so the
  generated `search_vector` column can't silently null out; `IF NOT EXISTS` on both column and index.
- `TagFilter.toggleTag` reads `useSearchParams()` fresh at click time — correct, and highlights the
  contrasting bug in `SearchBar` below.
- CLAUDE.md's updated Rendering rule and architecture-map entries accurately describe the new split
  rendering posture (dynamic list page, static detail page).
- Documented deviations (`getAllTags` added beyond the plan's file list, resync-during-render instead
  of `useEffect`, title-weighted `search_vector`, no `ts_rank` ordering) are all consistent with the
  implementation and reasonably justified — not flagged as issues.

## Issues

### High — `SearchBar.tsx` drops a tag click made while a search debounce is pending
**File**: `src/app/(public)/SearchBar.tsx:22-37`

The debounce `useEffect`'s dependency array is `[query]` only, so the scheduled `setTimeout` closes
over the `searchParams` snapshot from the render where it was *scheduled*, not the render at the
moment it *fires*.

Repro (ordinary usage, not a crafted edge case):
1. User types "foo" → `query` becomes `"foo"`; effect schedules `router.replace` in 300ms using the
   `searchParams` snapshot from that render (no `tag` in it yet).
2. Before the timeout fires, user clicks a tag chip. `TagFilter` reads the *current* URL and does
   `router.replace('/?tag=react')`. `SearchBar` re-renders (its `searchParams` changed), but `q`
   itself didn't change, so the render-phase resync block (`urlQuery !== syncedUrlQuery`) is a no-op
   — `query` state doesn't change, so the effect does **not** re-run, and the stale timeout is never
   cleared or rescheduled.
3. The stale timeout fires, rebuilds `params` from its *old* closed-over `searchParams` (no `tag`),
   sets `q=foo`, and calls `router.replace('/?q=foo')` — silently dropping the tag the user just
   selected.

**Fix**: read the freshest `searchParams` inside the timeout instead of the closure, e.g. via a ref
kept current every render:
```tsx
const searchParamsRef = useRef(searchParams);
searchParamsRef.current = searchParams;
// ...
const timeout = setTimeout(() => {
  const params = new URLSearchParams(searchParamsRef.current.toString());
  // ...
}, DEBOUNCE_MS);
```
(Rapid typing and browser back/forward were traced and are handled correctly by the same render-phase
resync block — only the cross-component race is broken.)

### High — `searchParams` prop type doesn't match Next.js's runtime contract; unsanitized value reaches the Supabase query builders
**File**: `src/app/(public)/page.tsx:8-17`, `src/lib/posts/queries.ts:18-27`

`page.tsx` declares `searchParams: Promise<{ q?: string; tag?: string }>`, but Next.js's actual
contract is `string | string[] | undefined` per key — a repeated query key (`?tag=a&tag=b`) produces
an array at runtime despite the declared type. That value flows straight into
`getPublishedPosts({ search: q, tag })` with no runtime narrowing.

Traced through the actual `postgrest-js` builder (not hypothetical — doesn't crash, but silently
changes behavior):
- `.contains("tags", [filters.tag])`: if `tag` is actually `["a","b"]`, this becomes `[["a","b"]]`;
  the array branch stringifies the inner array, producing `cs.{a,b}` — silently turning "posts tagged
  X" into "posts tagged both a AND b."
- `.textSearch("search_vector", filters.search, ...)`: an array `search` gets implicitly stringified
  via template interpolation into a comma-joined string before reaching `websearch_to_tsquery`.

**Fix**: normalize before use:
```ts
const raw = await searchParams;
const q = typeof raw.q === "string" ? raw.q : undefined;
const tag = typeof raw.tag === "string" ? raw.tag : undefined;
```
and widen the declared type (`{ q?: string | string[]; tag?: string | string[] }`) so the gap isn't
silently reintroduced later.

*(Note: `admin/login/page.tsx` has the same narrow-typing pattern feeding `sanitizeRedirect`, which
would throw on an array — pre-existing, out of scope for this PR, worth a follow-up ticket since it
shares the same root cause.)*

## Recommendation

**Request changes.** Both issues are contained, well-scoped fixes in the new client-sync logic — not
a wrong approach. No critical/security/data-loss issues; validation is clean; the plan and its
documented deviations are followed faithfully otherwise. Fix the two High issues, re-verify the
type/click race manually, and this is ready to merge.
