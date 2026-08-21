# Implementation Report — PB-0005 Public post list + detail pages

**Plan**: `.claude/plans/pb-0005-public-post-pages.md`   **Branch**: `feature/pb-0005-public-post-pages`   **Status**: COMPLETE

## Summary

Built the public-facing half of the blog: a post list at `/` and a post detail page at
`/posts/[slug]`, both statically generated (`revalidate = false` + `dynamic = "force-static"`)
and reading via `lib/supabase/server` with no app-level `status` filter — published-only is
enforced purely by the existing RLS policy, verified with a direct anon-key REST call. Post
`content` is rendered server-side to HTML via a `unified`/`rehype-pretty-code` pipeline with
dual light/dark Shiki themes and copy-buttoned code blocks, displayed through a small
`"use client"` wrapper. The old `src/app/page.tsx` placeholder is removed in favor of the new
route group.

## Tasks completed

- Install markdown/highlighting dependencies → `package.json`/`package-lock.json` (UPDATE)
- `lib/posts/queries.ts` (`getPublishedPosts`/`getPublishedPostBySlug`, `cache()`-wrapped) → CREATE
- `lib/markdown/rehype-copy-button.ts` (hand-rolled rehype plugin) → CREATE
- `lib/markdown/render.ts` (unified pipeline) → CREATE
- `next.config.ts` — `images.remotePatterns` for the Supabase Storage host → UPDATE
- `src/app/globals.css` — Shiki dual-theme vars, `.markdown-content`, copy-button CSS → UPDATE
- `src/app/(public)/TagList.tsx` → CREATE
- `src/app/(public)/PostCard.tsx` → CREATE
- `src/app/(public)/MarkdownContent.tsx` → CREATE
- `src/app/(public)/layout.tsx` (header + `ThemeToggle`) → CREATE
- `src/app/(public)/page.tsx` (post list) → CREATE; `src/app/page.tsx` (PB-0001 placeholder) → DELETE
- `src/app/(public)/posts/[slug]/page.tsx` (detail, `generateStaticParams`/`generateMetadata`) → CREATE
- `CLAUDE.md` — architecture map + markdown-rendering ground rule → UPDATE
- `.claude/references/supabase-access-control.md` — anon-context note → UPDATE
- `src/lib/supabase/server.ts` — build-time `cookies()` resilience (not in original file list; see Deviations) → UPDATE

## Tests added

None — no automated test suite exists yet for this project (per CLAUDE.md/prior tickets'
precedent). Validation was `npm run lint`, `npx tsc --noEmit`, `npm run build`, and manual
verification against a `next start` production server with seeded DB rows (inserted and removed
via the secret key for this session only — no seed data left in the DB).

## Validation results

- `npm run lint` — pass, zero output.
- `npx tsc --noEmit` — pass, zero errors.
- `npm run build` — pass. `/` and `/posts/[slug]` both build as `○ (Static)`; a seeded published
  slug prerendered as `● (SSG, via generateStaticParams)` during the manual-verification build.
- Manual verification (production server, `next start` on a separate port so as not to disturb an
  already-running dev server on :3000):
  - `/` → 200, lists the seeded published post (cover image via `next/image`, excerpt, tags, date); the seeded draft does not appear.
  - `/posts/<published-slug>` → 200; table (remark-gfm), blockquote, fenced code block with a
    language tag, fenced code block with no language tag (`defaultLang: "plaintext"`), and an
    inline image all render correctly; both `--shiki-light`/`--shiki-dark` and
    `--shiki-light-bg`/`--shiki-dark-bg` CSS variables present on the highlighted `<pre>` and
    per-token `<span>`s; copy button markup (`data-code-block`/`data-copy-button`) present.
  - `/posts/<draft-slug>` and `/posts/<nonexistent-slug>` → both 404.
  - Direct anon-key REST call for the draft's slug → `[]`, confirming RLS (not app code) is what
    hides drafts — the ticket's specific AC ask.
  - `next/image`'s `/_next/image?...` optimization endpoint → 200 for the Supabase Storage cover
    image, confirming `next.config.ts`'s `remotePatterns` is correctly scoped.
  - `<title>`/`og:title`/`og:description`/`og:image`/`og:type` all present and correct on the
    detail page's response HTML.
- Not verified live (no admin credentials available in this session): clicking "Copy" in an
  actual browser (clipboard API — markup and click-delegation logic were verified, but this needs
  a real browser, not curl); the theme-toggle visually switching code-block colors; the
  admin-publish → `revalidatePath` → public-page-updates round trip through the actual `/admin`
  UI (AC5's live flow). The direct-REST RLS check (the AC's specific, non-visual ask) was done
  and passed. Recommend a quick manual pass in a browser once logged into `/admin` to confirm the
  visual/interactive pieces.

## Deviations from the plan

1. **`hast` package swap.** The plan's Task 1 install list included `hast` for `Root`/`Element`
   types. The npm package named `hast` is actually an unrelated, deprecated 2015-era package
   (v0.0.2, built on `unified@2.x`) — not the modern hast type definitions. The real types
   (`@types/hast@3.0.5`) are already pulled in transitively by `rehype-pretty-code`/`shiki`/etc.
   Uninstalled `hast`, added `@types/hast` as an explicit devDependency instead. This also
   resolved 2 high-severity audit warnings that came from the old package's ancient sub-deps.

2. **`keepBackground: true`, not `false`, in `render.ts`.** The plan's Task 4 GOTCHA #2 argued
   `keepBackground: false` was needed to let `globals.css`'s `.dark`-keyed rules control the code
   block background. Verified against the installed `rehype-pretty-code@0.14.5`/`shiki@4.4.3`
   source: with a dual-theme `theme` object, `rehype-pretty-code` already forces Shiki's
   `defaultColor: false` internally, so `<pre>`'s `style` attribute contains *only* the four CSS
   custom properties (`--shiki-light`, `--shiki-dark`, `--shiki-light-bg`, `--shiki-dark-bg`) —
   never a literal baked-in color. `keepBackground: false` doesn't strip a redundant literal
   color; it wipes that entire `style` attribute (`pre.properties.style = void 0`), deleting the
   very variables Task 6's CSS depends on. Flipped to `keepBackground: true`, which preserves the
   variables and still bakes in no fixed color — achieving the plan's actual stated intent.
   Confirmed by inspecting the rendered HTML: `<pre style="--shiki-light:...;--shiki-dark:...;
   --shiki-light-bg:...;--shiki-dark-bg:...">`.

3. **`export const dynamic = "force-static";` added to both `(public)/page.tsx` and
   `(public)/posts/[slug]/page.tsx`** (not in the plan). Without it, `npm run build` classified
   both routes as `ƒ (Dynamic)` instead of `○ (Static)`/`● (SSG)`, despite `revalidate = false` —
   because `lib/supabase/server.ts`'s `createClient()` calls `next/headers`'s `cookies()`
   unconditionally, and merely *calling* `cookies()` (even to find no session) is itself a
   dynamic-rendering signal in Next.js 16's static analysis, independent of the `revalidate`
   export. `dynamic = "force-static"` makes `cookies()` resolve to an empty jar instead of
   opting the route into dynamic rendering — semantically correct here since these routes have no
   session-dependent behavior by design. This is exactly the "critical gotcha" the plan flagged
   in principle (Next 15+'s uncached-by-default `fetch`) but didn't fully trace through for this
   specific `cookies()`-touching client; confirmed by rebuilding before/after and observing the
   route table change from `ƒ` to `○`/`●`.

4. **`lib/supabase/server.ts` made resilient to `cookies()` throwing at build time** (file not
   listed as "Files to Update" in the plan). `generateStaticParams` runs at build time with no
   request context; calling `cookies()` there throws synchronously (not a rejected promise, so
   `.catch()` chaining doesn't work — confirmed by testing both forms) regardless of
   `dynamic = "force-static"` being set on a *different* export in the same file — actually, once
   `force-static` was added, this stopped being hit in practice, but it's kept as a documented
   defensive fallback (empty cookie store → anon role → still-correct RLS behavior) for any other
   build-time caller of `createClient()`. Wrapped the `await cookies()` call in try/catch;
   `getAll()`/`setAll()` null-guard the possibly-absent store.

5. **`index === undefined` instead of `index === null`** in `rehype-copy-button.ts`'s guard
   clause. The plan's snippet checked `index === null`, but the installed `unist-util-visit@5.1.0`
   types the visitor's `index` parameter as `number | undefined` (not `| null`), so the `null`
   check didn't narrow the type and `tsc --noEmit` failed at `parent.children[index]`. One-word
   fix once traced to the actual installed types.

6. **CLAUDE.md's `react-markdown` mention corrected.** The pre-existing Ground Rules line said
   post content is "rendered with `react-markdown` + `shiki`/`rehype-pretty-code`" — inaccurate
   given the plan's own (correct) decision to use a `unified` pipeline instead of the
   `react-markdown` component (see the plan's Notes section). Updated the line to describe what
   was actually built, so a future agent doesn't reach for `react-markdown` on the strength of a
   stale rule.

None of these change the ticket's scope or user-facing behavior — they're corrections needed to
make the plan's own explicitly-stated goals (static rendering, dual-theme code blocks, a clean
`tsc`/`npm ls`) actually hold against the real installed package versions and Next.js 16 runtime
behavior, exactly the kind of verification the plan's Task 1/4 GOTCHAs asked for.

## Issues encountered

- **Stale `.next` Data Cache masked a real bug during manual testing, not implementation.** An
  early production build ran against an empty `posts` table (before seed data was inserted); with
  `revalidate = false`, Next's persistent Data Cache cached that empty list "forever" (until
  on-demand revalidation). A subsequent build, run without clearing `.next` first, reused that
  stale cache for `/` even after seed data existed, while `generateStaticParams`'s first-ever
  successful execution (blocked by the `cookies()` issue in earlier failed builds) picked up fresh
  data. A full `rm -rf .next && npm run build` resolved it. This isn't an app bug — it's a
  reminder for future debugging: an empty-looking list after seeding data is likely a stale build
  cache, not a query bug, given how aggressively `revalidate = false` caches.
- A stray `node.exe` process was already listening on port 3000 (not started by me this session).
  Left it untouched and ran manual verification on port 3001 instead, to avoid disturbing whatever
  it's serving.

## Follow-ups for the user

- Log into `/admin` in a browser to do the visual/interactive checks this session couldn't reach
  without credentials: the copy-button's clipboard behavior, the theme toggle's live color switch
  on a code block, and the full publish/unpublish → `revalidatePath` → public-page-update round
  trip (AC5).
