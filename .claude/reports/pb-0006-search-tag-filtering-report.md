# Implementation Report — PB-0006: Search + tag filtering

**Plan**: `.claude/plans/pb-0006-search-tag-filtering-architecture.md`
**Branch**: `feature/pb-0006-search-tag-filtering`
**Status**: COMPLETE — migration applied to the live Supabase project by the user; search verified working end-to-end

## Summary
The public post list page (`app/(public)/page.tsx`) now supports ranked full-text search (`q`) and
tag filtering (`tag`) via URL search params, composed with AND. The page moved from fully static
(`force-static`) to dynamically rendered per the plan's chosen approach (C), while the post detail
page is untouched and stays static/ISR. `getPublishedPosts` was extended to branch into a Postgres
full-text (`textSearch`) or array-contains (`contains`) query when filters are present, and a new
`getAllTags` query backs the tag-chip UI. CLAUDE.md's Rendering rule and architecture map were
updated to describe the new split rendering posture.

## Tasks completed
- New migration (generated `search_vector` tsvector column, title+content, GIN index) →
  `supabase/migrations/20260821120000_add_posts_search_vector.sql` (CREATE)
- `getPublishedPosts` extended with optional `{ search, tag }` filters branching into
  `textSearch`/`contains`; added `getAllTags` → `src/lib/posts/queries.ts` (UPDATE)
- `SearchBar.tsx`: debounced client input, syncs to/from the `q` URL param →
  `src/app/(public)/SearchBar.tsx` (CREATE)
- `TagFilter.tsx`: clickable tag chips driving the `tag` URL param →
  `src/app/(public)/TagFilter.tsx` (CREATE)
- `page.tsx`: dropped `force-static`/`revalidate`, added `dynamic = "force-dynamic"`, reads
  `searchParams`, renders `SearchBar`/`TagFilter`, empty-state message distinguishes "no posts yet"
  vs. "no matches" → `src/app/(public)/page.tsx` (UPDATE)
- CLAUDE.md: Rendering rule + `app/(public)/` and `lib/posts/` architecture-map entries updated to
  describe the list page as dynamic (search/tag-driven) while the detail page stays static/ISR →
  `CLAUDE.md` (UPDATE)

## Tests added
None — project has no test suite yet (per CLAUDE.md, manual verification is the current bar).

## Validation results
- `npm run lint` — pass (0 errors). One `react-hooks/set-state-in-effect` error was hit and fixed
  (see Deviations) before this passed clean.
- `npm run build` — pass. Route table confirms `/` is now `ƒ` (dynamic) and `/posts/[slug]` is
  still `●` (SSG), matching the plan's intended rendering split.
- Manual check against the project's live (external) Supabase instance via the existing dev server:
  - `GET /` — 200, renders `SearchBar` + tag chips built from real `tags` data.
  - `GET /?tag=Test` — 200, correct post narrowed, chip shows `aria-pressed="true"`.
  - `GET /?q=hello` — 500, `column posts.search_vector does not exist` at the time this was run
    (migration not yet applied to the live project — see Issues); after the user applied the
    migration, re-tested `GET /?q=test` — 200, correctly returned the matching "my test" post.

## Deviations from the plan
- **`getAllTags` added** — not explicitly named in the plan's "Missing pieces" list, but needed to
  populate `TagFilter`'s chips (the plan describes `TagFilter.tsx` rendering chips without naming
  the data source). Implemented as a small `cache()`-wrapped query alongside the other two, same
  pattern, no new privileged code path.
- **`react-hooks/set-state-in-effect` fix** — the first `SearchBar` draft resynced local input state
  from the URL inside a `useEffect`, which this project's lint config (via `eslint-config-next`)
  flags as an anti-pattern (cascading renders). Replaced with the React-recommended
  "adjust state during render" pattern (compare `urlQuery` to a tracked `syncedUrlQuery` state
  during render, not in an effect) — same behavior, passes lint clean.
- **Search vector weighting** — the migration weights title matches ('A') above content matches
  ('B') via `setweight`, which the plan didn't specify explicitly (it only said "title + content" +
  GIN index). This is a minor addition in service of the plan's stated goal of *ranked* full-text
  search, using standard Postgres FTS practice; it doesn't change the plan's chosen shape.
- **No `ts_rank` ordering** — results are still ordered by `published_at desc` (unchanged from
  before), not by search relevance, even when a search term is present. The plan's "Recommended
  approach" section didn't call for relevance-ordering via `supabase-js` (which has no built-in
  `ts_rank` order helper without a raw RPC), so this was left out to keep the single-query-path
  shape the plan asked for. Worth revisiting if ranked ordering (not just ranked matching) becomes
  a real requirement.

## Issues encountered
- **Migration not applied to the live Supabase project (resolved)**: this session had no
  `supabase login` session / project link (`supabase migration list` failed with
  `LegacyProjectNotLinkedError`), so the migration could only be added as a file, not pushed, from
  here. Confirmed via a live 500 (`column posts.search_vector does not exist`) that search wouldn't
  work until applied. The user ran the migration SQL directly against the live project; re-testing
  `GET /?q=test` afterward returned 200 with the correct match, confirming search is now fully
  functional end-to-end.
