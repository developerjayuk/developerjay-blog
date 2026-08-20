# Feature: PB-0005 — Public post list + detail pages (ISR + markdown rendering)

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils, types, and clients. Import from the right files — this is the first ticket to render anything at `/` for a logged-out visitor, the first to use `lib/supabase/server` from a context with **no session** (previously it was only used by an authenticated admin or the login flow — same RLS-respecting client, but this is the first time it's exercised as the anon read path), and the first ticket to add a real Next.js Route Segment Config (`revalidate`) anywhere in the app.

## Feature Description

The public-facing half of the blog: a post list at `/` and a post detail page at `/posts/[slug]`, both statically generated and revalidated only on-demand (via the `revalidatePath` calls PB-0003's `actions.ts` already makes on publish/unpublish/delete — this ticket doesn't add new revalidation triggers, it builds the pages those calls were already written to target). Post `content` is Markdown, rendered server-side to HTML with syntax-highlighted, copy-buttoned code blocks, and displayed via a small client-side wrapper. Cover images and tags render on both pages; the existing `ThemeToggle` is wired into a new public layout.

## User Story

As a reader (recruiter, peer, or Jason himself later)
I want to browse and read Jason's published posts, with code snippets clearly highlighted
So that the blog works as a legible, linkable portfolio artifact, not just a database with no way to read it.

## Problem Statement

The `posts` table, its RLS policies, the Supabase clients, and the theme system all exist (PB-0001), and posts can be authored end-to-end through the admin (PB-0002-0004) — but there is no public route in the app at all. `src/app/page.tsx` is still a PB-0001 placeholder that shows a raw post count using the **privileged** admin client. Nobody outside `/admin` can read a single post.

## Solution Statement

Add an `app/(public)/` route group with its own layout (site title linking home + `ThemeToggle`), a list page at `/` and a detail page at `/posts/[slug]`, both reading through `lib/supabase/server` (RLS-respecting, anon-equivalent when logged out) with **no app-level `status` filter** — published-only is enforced purely by the `"public read published posts"` RLS policy already in `20260819181837_init_schema.sql`, which is the thing the ticket's AC explicitly asks to be verified. Both pages set `export const revalidate = false`, which in this Next.js version (16.3.1, where `fetch` is uncached by default since v15) is what actually makes them static-until-explicitly-revalidated rather than accidentally dynamic per-request — without it, the existing `revalidatePath` calls in `actions.ts` would have nothing to invalidate. Markdown goes through a small `unified` pipeline (`remark-parse` → `remark-gfm` → `remark-rehype` → `rehype-pretty-code` with dual light/dark Shiki themes → a custom copy-button-wrapping plugin → `rehype-stringify`) producing an HTML string, rendered via a `"use client"` wrapper (`MarkdownContent.tsx`) that attaches a single delegated click handler for the copy buttons. `next.config.ts` gets `images.remotePatterns` (derived from `NEXT_PUBLIC_SUPABASE_URL` at config-load time) so cover images can go through `next/image`. Two shared components (`PostCard.tsx`, `TagList.tsx`) are used by both pages; a `lib/posts/queries.ts` module (wrapped in React's `cache()`) is the single source of truth for the two Supabase reads (`getPublishedPosts`, `getPublishedPostBySlug`), reused by `generateStaticParams`, `generateMetadata`, and the page bodies without triplicating the query.

## Out of Scope / Non-Goals

- **Search and tag filtering** — PB-0006's scope entirely. Tags render here as static, non-clickable pills (`TagList.tsx`); no `SearchBar.tsx`/`TagFilter.tsx`, no query-param handling on the list page. Don't build clickable tag links even as a "nice to have" — PB-0006 owns that file (`app/(public)/page.tsx` edits) and doing it here risks conflicting with how it wires query params.
- **Pagination** — the list page fetches and renders every published post, unsorted-by-anything-but-date, no `limit`/cursor. At ~1 post/week this is a non-issue for a long time; revisit only if it actually becomes one.
- **Time-based ISR fallback / stale-data safety net** — `revalidate = false` relies entirely on the on-demand `revalidatePath` calls already in `actions.ts`. If a post is ever edited directly in the Supabase dashboard (bypassing the app), the public page will not pick it up until the next app-driven write. Accepted per CLAUDE.md's "revalidated on publish" framing — not adding a background time-based fallback.
- **Sitemap / robots.txt / RSS** — RSS is an explicit PRD non-goal; sitemap/robots aren't mentioned in this ticket and are deferred to PB-0007 (deploy) if wanted at all.
- **`@tailwindcss/typography`** — markdown content styling is done with a small hand-written `.markdown-content` CSS block in `globals.css`, not a new Tailwind plugin dependency, consistent with this project's otherwise-zero extra Tailwind plugins. Flagged as an easy swap later if hand-styling becomes tedious (see Notes).
- **OG image cropping/dimensions enforcement** — `cover_image_url` is passed straight through to `openGraph.images` as-is; no dedicated 1200×630 asset pipeline.
- **`metadataBase` / canonical production URL** — the real domain doesn't exist yet (PB-0007). Not set here; OG `images` use the already-absolute Supabase Storage URL so this doesn't produce broken relative-URL metadata, but revisit once PB-0007 lands.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium — no new architectural seam (reuses `lib/supabase/server`, existing RLS, existing theme system), but touches a library combination (`rehype-pretty-code` + dual Shiki themes + a hand-rolled copy-button rehype plugin) with no local precedent, plus a genuinely easy-to-get-wrong Next.js 16 caching default.
**Primary Systems Affected**: `src/app/(public)/*` (new route group), `src/lib/markdown/*` (new), `src/lib/posts/queries.ts` (new), `next.config.ts`, `src/app/globals.css`, `src/app/page.tsx` (removed).
**Dependencies (new)**: `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-pretty-code`, `rehype-stringify`, `shiki`, `unist-util-visit`, `hast` (for plugin types).

## Related Work

**Implements**: `docs/tickets/pb-0005.md`   ·   **Epic**: `docs/tickets/personal-blog-platform.md` (decisions inherited from `personal-blog-platform.prd.md`'s Architecture section — no separate architecture page)

**Back-references** (plans this builds on or inherits decisions from):

- `.claude/plans/pb-0001-project-scaffold-and-supabase-schema.md` — Why: the `posts` table, its RLS policies (`"public read published posts"` on `status = 'published'`, GIN-indexed `tags`), and `ThemeProvider`/`ThemeToggle` this ticket wires into a real public layout for the first time.
- `.claude/plans/pb-0003-admin-post-crud.md` — Why: `actions.ts`'s `revalidatePublicPaths()` (`revalidatePath("/")`, `revalidatePath(\`/posts/${slug}\`)`) already targets the exact two routes this ticket creates — the route paths are not a free choice, they're fixed by that existing code.
- `.claude/plans/pb-0004-image-upload.md` — Why: that plan's Open Questions explicitly deferred "image renders correctly when viewed publicly" to this ticket; the cover-image / content-image rendering here is what finally closes that loop.

**Forward-references** (plans that extend or supersede this — append as follow-ups get created):

- PB-0006 (search + tag filtering) extends `app/(public)/page.tsx` directly — its plan should re-read this one's Patterns section before touching that file.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ THESE BEFORE IMPLEMENTING

- `src/app/admin/(protected)/posts/actions.ts` (lines 19-22, `revalidatePublicPaths`) — Why: fixes this ticket's route paths exactly (`"/"` and `\`/posts/${slug}\``); if the new pages live anywhere else, publish-time revalidation silently does nothing.
- `src/app/admin/(protected)/posts/page.tsx` (whole file) — Why: the exact list-query pattern to mirror (`.from("posts").select("*").order(...).overrideTypes<Post[], { merge: false }>()`), and the "empty state" convention (`text-sm text-zinc-500`, "No posts yet.").
- `src/app/admin/(protected)/posts/[id]/edit/page.tsx` (whole file) — Why: the exact single-row-fetch pattern to mirror for `getPublishedPostBySlug` — `.eq(...).maybeSingle<Post>()`, then `if (error) throw error; if (!post) notFound();`. Also the canonical `params: Promise<{ id: string }>` typing for a dynamic segment in this codebase (manual type, not a generated `PageProps` helper).
- `src/lib/supabase/server.ts` (whole file) — Why: the client every new query in this ticket uses. Async factory (`await createClient()`), cookie-aware, RLS-respecting — when there's no session (the public-visitor case), it behaves as the anon role, which is exactly what makes the RLS-only-filtering AC meaningful here.
- `src/lib/posts/types.ts`, `src/lib/posts/slugify.ts` — Why: `Post`/`PostStatus` types reused as-is; `slugify` is not needed by this ticket (slugs already exist on rows) but confirms the module's existing shape/location convention for the new `src/lib/posts/queries.ts` sibling file.
- `src/lib/theme/theme-provider.tsx`, `src/lib/theme/theme-toggle.tsx` (whole files) — Why: reused verbatim in the new `(public)/layout.tsx`; already mounted globally via `ThemeProvider` in `src/app/layout.tsx`, so the public layout only needs to place `<ThemeToggle />`, not re-wrap anything.
- `src/app/layout.tsx` (whole file) — Why: confirms `ThemeProvider` (`attribute="class"`) is already global — the `.dark` class convention this ticket's new CSS (Shiki dual-theme variables) must key off, and confirms `<body className="min-h-full flex flex-col">` — the new public layout's outer div should be `flex flex-1 flex-col` to fit that existing flex-column body.
- `src/app/globals.css` (whole file) — Why: the exact dark-mode mechanism (`@custom-variant dark (&:where(.dark, .dark *));`, Tailwind v4 `@theme inline`) this ticket's markdown/Shiki CSS additions must be consistent with — a `.dark` class selector, not `prefers-color-scheme` or a `data-theme` attribute.
- `src/app/admin/(protected)/posts/PostForm.tsx` (whole file) — Why: the Tailwind styling vocabulary to reuse in `PostCard.tsx`/`TagList.tsx` (`rounded border px-3 py-2`, `text-sm`, `text-zinc-500`) — don't invent a new visual language for the public pages.
- `next.config.ts` (whole file) — Why: currently only sets `agentRules: false`; this ticket adds `images.remotePatterns`, must preserve the existing key.
- `supabase/migrations/20260819181837_init_schema.sql` (lines 33-52) — Why: confirms the exact RLS policy this ticket's AC is about (`using (status = 'published')` for `anon`/unauthenticated reads) and that `posts_status_idx` already exists to back that filter efficiently — no new migration needed for this ticket.
- `.claude/references/data-model.md` (whole file) — Why: confirms `excerpt` is a separate, optional plain-text field (not derived from `content`) — `PostCard.tsx` must handle `excerpt: null` by omitting it, not by auto-summarizing `content`.
- `.claude/references/supabase-access-control.md` (whole file) — Why: the RLS/key-boundary rules this ticket must stay inside (never use `lib/supabase/admin` for these public reads).
- `.claude/plans/pb-0004-image-upload.md` (Task 1, GOTCHA notes on Supabase client usage) — Why: same "which client, sync vs async" care applies here; `server.ts`'s `createClient()` is **async**, must be awaited (unlike `admin.ts`, not used in this ticket at all).
- `tsconfig.json` (lines 21-23) — Why: `@/*` → `./src/*`, used by every new import in this plan.

### New Files to Create

- `src/lib/posts/queries.ts` — `getPublishedPosts()` / `getPublishedPostBySlug(slug)`, both wrapped in React `cache()`, both reading via `lib/supabase/server` with no `status` filter (RLS-only).
- `src/lib/markdown/rehype-copy-button.ts` — custom rehype plugin: wraps each `<pre>` in a `<div data-code-block>` with a `<button data-copy-button>` sibling.
- `src/lib/markdown/render.ts` — `renderMarkdown(markdown: string): Promise<string>`, the unified pipeline described in Solution Statement.
- `src/app/(public)/layout.tsx` — header (site title → `/`, `ThemeToggle`) + `<main>`.
- `src/app/(public)/page.tsx` — post list, `revalidate = false`.
- `src/app/(public)/posts/[slug]/page.tsx` — post detail, `revalidate = false`, `generateStaticParams`, `generateMetadata`.
- `src/app/(public)/PostCard.tsx` — cover image + title + excerpt + `TagList` + date, links to `/posts/[slug]`.
- `src/app/(public)/TagList.tsx` — non-clickable tag pills, shared by `PostCard` and the detail page.
- `src/app/(public)/MarkdownContent.tsx` — `"use client"` wrapper: `dangerouslySetInnerHTML` + delegated click handler for copy buttons.

### Files to Update

- `next.config.ts` — add `images.remotePatterns` derived from `NEXT_PUBLIC_SUPABASE_URL`.
- `src/app/globals.css` — Shiki dual-theme CSS variables (keyed on `.dark`), `.markdown-content` element styling, `.copy-code-button`/`.code-block` styling.
- `package.json` / `package-lock.json` — new dependencies (via `npm install`, not hand-edited).
- `CLAUDE.md` — Architecture map: expand the `(public)/` bullet to list the new files, same way `(protected)/posts/` was expanded in PB-0004.
- `.claude/references/supabase-access-control.md` — one-line note that `lib/supabase/server` is now also exercised in a **no-session** (anon) context by the public pages, not just by the authenticated admin/login flows.

### Files to Remove

- `src/app/page.tsx` — the PB-0001 placeholder (post count via the privileged admin client). It occupies the same route (`/`) that `app/(public)/page.tsx` now owns; a route group and a top-level file can't both resolve `/`.

### Relevant Documentation — READ THESE BEFORE IMPLEMENTING

- [Shiki — Light/Dark Dual Themes](https://shiki.matsu.io/guide/dual-themes)
  - Confirms the CSS-variable mechanism: passing `{ light: "...", dark: "..." }` as a theme emits `--shiki-light`/`--shiki-light-bg`/`--shiki-dark`/`--shiki-dark-bg` inline on each token/`<pre>`, switched purely via a CSS rule — no JS theme-detection needed at render time.
  - Why: this is the actual mechanism `render.ts`'s `rehype-pretty-code` options and `globals.css`'s new rules both depend on.
- [rehype-pretty-code](https://rehype-pretty.pages.dev/)
  - Confirms the plugin accepts a `theme` option (object form for dual themes) and documents the `data-language`/`data-theme` attributes it adds to output `<pre>`/`<code>` — **verify the exact option shape against the version `npm install` actually resolves** (check the installed package's README/CHANGELOG; the CSS-variable dual-theme mechanism has been stable across recent versions, but exact option key names are worth a 30-second confirmation before Task 4).
  - Why: the core rendering step; getting the option names wrong fails silently (falls back to a single theme) rather than erroring, so confirm against installed-version docs, not just this plan.
- [react-markdown](https://github.com/remarkjs/react-markdown)
  - Why: explicitly **not** used as the renderer (see Solution Statement / Notes for why) — read only to confirm that decision's reasoning still holds if the implementing agent is tempted to reach for it instead of the unified pipeline below.
- [Next.js — Route Segment Config (`revalidate`)](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#revalidate)
  - Confirms `export const revalidate = false` means "cache the fetched data (no automatic time-based revalidation) until an on-demand revalidation is triggered" — the exact behavior this ticket needs to make the existing `revalidatePath` calls meaningful.
  - Why: **critical gotcha** — Next.js 15+ changed `fetch` to be **uncached by default** (previously cached by default in 14 and earlier). This app is on Next 16.3.1. Without an explicit `revalidate` export, these pages will likely render dynamically per-request instead of statically — functionally fine, but silently violates CLAUDE.md's "ISR... not per-request SSR" rule and the PRD's stated cost rationale for choosing ISR at all.
- [Next.js — generateStaticParams](https://nextjs.org/docs/app/api-reference/functions/generate-static-params)
  - Why: confirms `dynamicParams` defaults to `true` — a newly published slug not in the build-time list still renders on first request and is then cached (combined with `revalidate = false`, this is exactly the "static, regenerated on-demand" behavior wanted).
- [Next.js Image — remotePatterns](https://nextjs.org/docs/app/api-reference/config/next-config-js/images#remotepatterns)
  - Why: `next/image` refuses to optimize an external URL unless its host is allow-listed; this is what `next.config.ts`'s new `images.remotePatterns` entry is for.
- [Supabase Storage — Public URLs](https://supabase.com/docs/guides/storage/serving/downloads#public-buckets) (bucket already confirmed `public: true` in the init migration)
  - Why: confirms `cover_image_url`/content-image URLs are directly-fetchable public URLs, no signed-URL/auth header needed for `next/image` to load them.

### Patterns to Follow

**Supabase query shape, split by cardinality** (`admin/(protected)/posts/page.tsx` vs `.../[id]/edit/page.tsx`): list queries use `.overrideTypes<Post[], { merge: false }>()`; single-row queries use `.maybeSingle<Post>()` then `if (error) throw error; if (!post) notFound()`. `lib/posts/queries.ts` mirrors both exactly — don't introduce a third querying style.

**No app-level status filter on public reads**: neither `getPublishedPosts` nor `getPublishedPostBySlug` adds `.eq("status", "published")`. This is deliberate, not an oversight — the ticket's AC is specifically to verify RLS (not app code) is what hides drafts. See Testing Strategy for how this gets manually verified.

**Client factory convention** (`lib/supabase/server.ts`): async factory, must `await createClient()`. Every Server Component/function in this ticket that touches Supabase is itself `async` for exactly this reason.

**React `cache()` for request-scoped dedup** (new to this codebase, but standard Next.js App Router practice — see Next.js's data-fetching docs on the "preload pattern"): `getPublishedPostBySlug` is called from both `generateMetadata` and the page component for the same route; wrapping it in `cache()` from `"react"` means the second call reuses the first's result within the same request instead of hitting Supabase twice.

**Styling vocabulary** (`PostForm.tsx`, `admin/(protected)/posts/page.tsx`): `rounded border px-3 py-2`, `text-sm`, `text-zinc-500` for secondary text, `flex flex-col gap-*`. `PostCard.tsx`/`TagList.tsx`/the new pages reuse this vocabulary — no new design system introduced for the public side.

**Dark mode via `.dark` class, never `prefers-color-scheme` directly** (`globals.css`): all new CSS (Shiki variables, markdown content, copy button) keys off `.dark`, consistent with `next-themes`'s `attribute="class"` config in `layout.tsx`.

**Dynamic-segment params typing** (`admin/(protected)/posts/[id]/edit/page.tsx`): `params: Promise<{ slug: string }>`, destructured via `const { slug } = await params;` — manual typing, not a generated `PageProps` helper (that helper is only used for the root layout in this codebase so far).

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation

<No dependency — this is the data/rendering substrate everything else calls into.>

**Tasks:**

- Install markdown/highlighting dependencies.
- Create `lib/posts/queries.ts` (the two cached Supabase reads).
- Create the markdown pipeline: `lib/markdown/rehype-copy-button.ts` + `lib/markdown/render.ts`.
- Add `images.remotePatterns` to `next.config.ts`.
- Add Shiki dual-theme + markdown-content + copy-button CSS to `globals.css`.

### Phase 2: Core Implementation

**Depends on:** Phase 1 (components below render data/HTML Phase 1 produces).

**Tasks:**

- Create `TagList.tsx`.
- Create `PostCard.tsx`.
- Create `MarkdownContent.tsx`.

### Phase 3: Integration

**Depends on:** Phase 1 and Phase 2.

**Tasks:**

- Create `(public)/layout.tsx`.
- Create `(public)/page.tsx` (list); remove `src/app/page.tsx`.
- Create `(public)/posts/[slug]/page.tsx` (detail).

### Phase 4: Docs

**Depends on:** Phases 1-3 (documents the shipped reality).

**Tasks:**

- Update `CLAUDE.md`'s architecture map.
- Update `.claude/references/supabase-access-control.md`.

---

## STEP-BY-STEP TASKS

### Task 1: ADD markdown-rendering dependencies

- **IMPLEMENT**:
  ```bash
  npm install unified remark-parse remark-gfm remark-rehype rehype-pretty-code rehype-stringify shiki unist-util-visit hast
  ```
- **GOTCHA**: `hast` is installed directly (not just pulled in transitively) purely so `src/lib/markdown/rehype-copy-button.ts` can import its `Root`/`Element` types under `strict` TypeScript without relying on hoisting luck.
- **VALIDATE**: `npm ls unified remark-parse remark-gfm remark-rehype rehype-pretty-code rehype-stringify shiki unist-util-visit hast` (all resolve, no `UNMET DEPENDENCY`).
- **SATISFIES**: prerequisite for AC "markdown rendered via react-markdown + shiki/rehype-pretty-code" (see Notes for why the unified pipeline is used instead of the `react-markdown` component itself, while still using the two named libraries).

### Task 2: CREATE src/lib/posts/queries.ts

- **IMPLEMENT**:
  ```typescript
  import { cache } from "react";
  import { createClient } from "@/lib/supabase/server";
  import type { Post } from "./types";

  export const getPublishedPosts = cache(async function getPublishedPosts(): Promise<Post[]> {
    const supabase = await createClient();
    const { data: posts, error } = await supabase
      .from("posts")
      .select("*")
      .order("published_at", { ascending: false })
      .overrideTypes<Post[], { merge: false }>();

    if (error) {
      throw error;
    }

    return posts;
  });

  export const getPublishedPostBySlug = cache(async function getPublishedPostBySlug(
    slug: string,
  ): Promise<Post | null> {
    const supabase = await createClient();
    const { data: post, error } = await supabase
      .from("posts")
      .select("*")
      .eq("slug", slug)
      .maybeSingle<Post>();

    if (error) {
      throw error;
    }

    return post;
  });
  ```
- **PATTERN**: list-query shape mirrors `src/app/admin/(protected)/posts/page.tsx:8-12`; single-row shape mirrors `src/app/admin/(protected)/posts/[id]/edit/page.tsx:13-17`. Neither adds `.eq("status", "published")` — see Patterns to Follow.
- **IMPORTS**: `react` (`cache`), `@/lib/supabase/server`, `./types`.
- **GOTCHA #1**: No status filter is deliberate. If a future edit "helpfully" adds `.eq("status", "published")` here, the RLS-verification AC becomes untestable (an app bug and an RLS bug would look identical from the outside) — don't add one.
- **GOTCHA #2**: `cache()` dedupes only *within a single render/request* — it is not a persistent cross-request cache (that's what `revalidate = false` on the pages is for, a separate mechanism). Both are needed; neither substitutes for the other.
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: AC "published posts appear... draft posts never appear (verify RLS is actually doing the filtering)".

### Task 3: CREATE src/lib/markdown/rehype-copy-button.ts

- **IMPLEMENT**:
  ```typescript
  import { visit } from "unist-util-visit";
  import type { Element, Root } from "hast";

  export function rehypeCopyButton() {
    return (tree: Root) => {
      visit(tree, "element", (node: Element, index, parent) => {
        if (node.tagName !== "pre" || index === null || !parent) {
          return;
        }

        const button: Element = {
          type: "element",
          tagName: "button",
          properties: {
            type: "button",
            className: ["copy-code-button"],
            "data-copy-button": "",
            "aria-label": "Copy code",
          },
          children: [{ type: "text", value: "Copy" }],
        };

        const wrapper: Element = {
          type: "element",
          tagName: "div",
          properties: { className: ["code-block"], "data-code-block": "" },
          children: [button, node],
        };

        parent.children[index] = wrapper;
      });
    };
  }
  ```
- **PATTERN**: new pattern for this codebase (first hand-rolled rehype/hast plugin) — no local precedent to mirror; this is a small, self-contained AST transform.
- **IMPORTS**: `unist-util-visit`, `hast` (types only, `import type`).
- **GOTCHA #1**: must run **after** `rehype-pretty-code` in the pipeline (Task 4) — it targets the already-highlighted `<pre>` produced by that plugin, not the raw markdown AST's code fence.
- **GOTCHA #2**: the button carries no reference to the code text itself; `MarkdownContent.tsx` (Task 9) finds the sibling `<pre><code>` at click time via `closest("[data-code-block]")` + `querySelector("code")` and reads its live `textContent`. Don't try to bake the code string into a `data-*` attribute here — it'd double the emitted HTML size and go stale if the highlighted markup is ever restructured.
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: scope addition "copy-to-clipboard button on code blocks" (confirmed in scope during exploration).

### Task 4: CREATE src/lib/markdown/render.ts

- **IMPLEMENT**:
  ```typescript
  import { unified } from "unified";
  import remarkParse from "remark-parse";
  import remarkGfm from "remark-gfm";
  import remarkRehype from "remark-rehype";
  import rehypePrettyCode from "rehype-pretty-code";
  import rehypeStringify from "rehype-stringify";
  import { rehypeCopyButton } from "./rehype-copy-button";

  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypePrettyCode, {
      theme: { light: "github-light", dark: "github-dark" },
      keepBackground: false,
      defaultLang: "plaintext",
    })
    .use(rehypeCopyButton)
    .use(rehypeStringify);

  export async function renderMarkdown(markdown: string): Promise<string> {
    const file = await processor.process(markdown);
    return String(file);
  }
  ```
- **PATTERN**: module-level `processor` singleton — the Shiki highlighter `rehype-pretty-code` builds internally is non-trivial to construct, so it's built once per server process/build, not per call. Only the detail page calls `renderMarkdown` (the list page shows plain-text `excerpt`, never `content`).
- **IMPORTS**: `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-pretty-code`, `rehype-stringify`, local `./rehype-copy-button`.
- **GOTCHA #1**: **verify `rehype-pretty-code`'s option shape against the actually-installed version's docs/README before trusting this snippet verbatim** (see Relevant Documentation) — the dual-theme CSS-variable mechanism is stable, but option key names have shifted across major versions historically.
- **GOTCHA #2**: `keepBackground: false` is intentional — it lets `globals.css`'s own `.dark`-keyed background rules (Task 6) control the code block background, rather than baking a fixed background color from the Shiki theme into the output that wouldn't respond to the site's own dark-mode toggle.
- **GOTCHA #3**: this pipeline runs server-side only (Server Components / build/ISR time) — never import this module from a `"use client"` file; `MarkdownContent.tsx` (Task 9) receives the already-rendered HTML **string**, it does not call `renderMarkdown` itself.
- **VALIDATE**: `npx tsc --noEmit`. A quick smoke check: `node -e "require('tsx/cjs'); import('./src/lib/markdown/render.ts').then(m => m.renderMarkdown('# Hi\\n\\n\`\`\`js\\nconst x = 1;\\n\`\`\`').then(console.log))"` (or equivalent — if `tsx`/`ts-node` isn't available, defer this smoke check to Task 13's manual browser validation instead of adding a new dev dependency just for it).
- **SATISFIES**: AC "markdown rendered via react-markdown + shiki/rehype-pretty-code for syntax-highlighted code snippets."

### Task 5: UPDATE next.config.ts

- **IMPLEMENT**:
  ```typescript
  import type { NextConfig } from "next";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseHostname = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

  const nextConfig: NextConfig = {
    // Don't let `next dev` auto-inject its version-warning block into our hand-authored CLAUDE.md.
    agentRules: false,
    images: {
      remotePatterns: supabaseHostname
        ? [
            {
              protocol: "https",
              hostname: supabaseHostname,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : [],
    },
  };

  export default nextConfig;
  ```
- **PATTERN**: additive edit — the existing `agentRules: false` line and its comment stay untouched.
- **GOTCHA #1**: Next.js loads `.env*` files before evaluating `next.config.ts`, so `process.env.NEXT_PUBLIC_SUPABASE_URL` is available here — this is not a runtime/client-side read, it's a build/config-time one, so there's no risk of leaking the URL (it's already `NEXT_PUBLIC_` and public) or needing the secret key.
- **GOTCHA #2**: `pathname` is scoped to `/storage/v1/object/public/**` specifically (Supabase's public-object URL shape), not a bare wildcard `**` — narrower than strictly required but cheap and avoids accidentally allow-listing unrelated paths on the same Supabase host.
- **GOTCHA #3**: if `NEXT_PUBLIC_SUPABASE_URL` is unset (shouldn't happen outside a broken local `.env.local`, but defensively), `remotePatterns` becomes `[]` rather than throwing at config-load time — `next dev`/`next build` would still start, just with cover images failing to optimize until the env var is fixed.
- **VALIDATE**: `npx tsc --noEmit` (config file itself is TypeScript-checked); functional check happens in Task 13's manual validation (cover image actually renders).
- **SATISFIES**: prerequisite for AC "cover image... display on both list and detail views."

### Task 6: UPDATE src/app/globals.css

- **IMPLEMENT**: append after the existing `body { ... }` block:
  ```css
  /* rehype-pretty-code dual-theme: Shiki emits --shiki-light/--shiki-light-bg and
     --shiki-dark/--shiki-dark-bg as CSS variables; these rules pick the right pair based on
     the same `.dark` class next-themes toggles (see the @custom-variant above). */
  .markdown-content pre {
    padding: 1rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    background-color: var(--shiki-light-bg);
  }
  .dark .markdown-content pre {
    background-color: var(--shiki-dark-bg);
  }
  .markdown-content pre code span {
    color: var(--shiki-light);
  }
  .dark .markdown-content pre code span {
    color: var(--shiki-dark);
  }

  .markdown-content :not(pre) > code {
    font-family: var(--font-mono);
    font-size: 0.875em;
    padding: 0.15em 0.4em;
    border-radius: 0.25rem;
    background-color: var(--background);
    border: 1px solid currentColor;
  }

  .markdown-content h1,
  .markdown-content h2,
  .markdown-content h3 {
    font-weight: 600;
    margin-top: 1.5em;
    margin-bottom: 0.5em;
  }
  .markdown-content p,
  .markdown-content ul,
  .markdown-content ol,
  .markdown-content blockquote {
    margin-bottom: 1em;
  }
  .markdown-content ul,
  .markdown-content ol {
    padding-left: 1.5em;
  }
  .markdown-content blockquote {
    border-left: 3px solid currentColor;
    padding-left: 1em;
    opacity: 0.85;
  }
  .markdown-content a {
    text-decoration: underline;
  }
  .markdown-content img {
    max-width: 100%;
    border-radius: 0.5rem;
  }

  .code-block {
    position: relative;
  }
  .copy-code-button {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    border: 1px solid currentColor;
    background: var(--background);
    opacity: 0.7;
  }
  .copy-code-button:hover {
    opacity: 1;
  }
  ```
- **PATTERN**: all new rules key off `.dark` (never `prefers-color-scheme`), consistent with the file's existing `@custom-variant dark (&:where(.dark, .dark *));` convention; uses the existing `--background`/`--font-mono` tokens rather than hardcoded colors.
- **GOTCHA**: this is plain CSS appended to the file, not a Tailwind `@layer`/`@apply` block — matches the existing file's style (no `@apply` used anywhere in it today).
- **VALIDATE**: `npm run dev`, visually confirm in Task 13.
- **SATISFIES**: AC "correctly highlighted code" (visual correctness in both themes) and the copy-button scope addition.

### Task 7: CREATE src/app/(public)/TagList.tsx

- **IMPLEMENT**:
  ```typescript
  export function TagList({ tags }: { tags: string[] }) {
    if (tags.length === 0) {
      return null;
    }

    return (
      <ul className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <li key={tag} className="rounded border px-2 py-0.5 text-xs text-zinc-500">
            {tag}
          </li>
        ))}
      </ul>
    );
  }
  ```
- **PATTERN**: styling vocabulary from `PostForm.tsx` (`rounded border`, `text-zinc-500`); non-interactive (`<li>`, not `<button>`/`<Link>`) — deliberate, see Out of Scope.
- **IMPORTS**: none beyond React/JSX runtime.
- **GOTCHA**: an empty `tags` array renders `null`, not an empty `<ul>` — avoids an empty bordered-nothing row on posts with no tags.
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: AC "tag display on both list and detail views."

### Task 8: CREATE src/app/(public)/PostCard.tsx

- **IMPLEMENT**:
  ```typescript
  import Image from "next/image";
  import Link from "next/link";
  import { TagList } from "./TagList";
  import type { Post } from "@/lib/posts/types";

  export function PostCard({ post }: { post: Post }) {
    return (
      <Link
        href={`/posts/${post.slug}`}
        className="flex flex-col gap-3 rounded border p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900"
      >
        {post.cover_image_url && (
          <Image
            src={post.cover_image_url}
            alt=""
            width={800}
            height={420}
            className="rounded"
          />
        )}
        <h2 className="text-lg font-semibold">{post.title}</h2>
        {post.excerpt && <p className="text-sm text-zinc-500">{post.excerpt}</p>}
        <TagList tags={post.tags} />
        {post.published_at && (
          <time dateTime={post.published_at} className="text-xs text-zinc-500">
            {new Date(post.published_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </time>
        )}
      </Link>
    );
  }
  ```
- **PATTERN**: styling vocabulary matches `PostForm.tsx`/admin list page (`rounded border`, `text-zinc-500`, `text-sm`); the whole card is a single `<Link>` (common list-item pattern) rather than a heading-only link.
- **IMPORTS**: `next/image`, `next/link`, local `./TagList`, `@/lib/posts/types`.
- **GOTCHA #1**: `excerpt` and `cover_image_url` are both conditionally rendered (`&&`) — a post with neither still renders a valid card (title + tags + date only). No placeholder image, no auto-generated excerpt from `content`.
- **GOTCHA #2**: `alt=""` on the cover image is deliberate (decorative — the adjacent `<h2>` title already conveys the same information to assistive tech); not a missing-alt-text oversight.
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: AC "cover image and tag display on... list... views", list-page linking to detail pages.

### Task 9: CREATE src/app/(public)/MarkdownContent.tsx

- **IMPLEMENT**:
  ```typescript
  "use client";

  const COPIED_LABEL = "Copied!";
  const RESET_DELAY_MS = 2000;

  export function MarkdownContent({ html }: { html: string }) {
    function handleClick(event: React.MouseEvent<HTMLDivElement>) {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-copy-button]",
      );
      if (!button) return;

      const code = button.closest("[data-code-block]")?.querySelector("code");
      if (!code?.textContent) return;

      navigator.clipboard.writeText(code.textContent).then(() => {
        const original = button.textContent;
        button.textContent = COPIED_LABEL;
        setTimeout(() => {
          button.textContent = original;
        }, RESET_DELAY_MS);
      });
    }

    return (
      <div
        className="markdown-content"
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  ```
- **PATTERN**: single delegated click handler on the wrapper `<div>`, not per-button React handlers — necessary because the inner markup is raw HTML (`dangerouslySetInnerHTML`), not React-owned elements; native DOM events from within it still bubble up to this handler.
- **IMPORTS**: none beyond the JSX/React runtime (no `useState` needed — the button label is toggled via direct DOM mutation, since this subtree isn't React-managed anyway).
- **GOTCHA #1**: skipping sanitization (no `rehype-sanitize`/DOMPurify step) is deliberate — `html` originates only from this app's own admin-authored `content` field (single allowlisted admin, see `.claude/references/supabase-access-control.md`), the same trust boundary already accepted for the raw `content` textarea in `PostForm.tsx`. Do not add a sanitizer "just in case" — that's scope creep for a non-existent threat model here (no third-party or reader-submitted content ever reaches this component).
  If a future ticket ever accepts writes from anyone other than the single allowlisted admin, this trust assumption must be revisited before that content reaches this component.
- **GOTCHA #2**: `button.textContent = original` inside the `setTimeout` closes over the button reference, not the label string, at the time of the click — safe even if this component instance persists (no stale-closure issue since it's a plain DOM node, not React state).
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: AC "correctly highlighted code" rendering path, plus the copy-button scope addition.

### Task 10: CREATE src/app/(public)/layout.tsx

- **IMPLEMENT**:
  ```typescript
  import Link from "next/link";
  import { ThemeToggle } from "@/lib/theme/theme-toggle";

  export default function PublicLayout({ children }: { children: React.ReactNode }) {
    return (
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b px-6 py-4">
          <Link href="/" className="text-lg font-semibold">
            Developer Jay
          </Link>
          <ThemeToggle />
        </header>
        <main className="flex-1">{children}</main>
      </div>
    );
  }
  ```
- **PATTERN**: `{ children }: { children: React.ReactNode }` typing mirrors `admin/(protected)/layout.tsx:5-9`'s manual typing (not the generated `LayoutProps<"/">` helper, which is only used for the root layout in this codebase). `flex flex-1 flex-col` fits inside root `layout.tsx`'s `<body className="min-h-full flex flex-col">`.
- **IMPORTS**: `next/link`, `@/lib/theme/theme-toggle`.
- **GOTCHA**: this is the **first** layout in the app with actual visual chrome — `admin/(protected)/layout.tsx` is bare (auth check only, `<>{children}</>`). Don't be tempted to also add this header to the admin section as a "consistency" pass; that's out of scope for this ticket (admin has no design requirement in the ticket, and touching it risks an unrelated regression).
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: AC "dark-mode toggle wired into the public layout using Ticket 1's ThemeProvider/toggle component."

### Task 11: CREATE src/app/(public)/page.tsx, REMOVE src/app/page.tsx

- **IMPLEMENT** (`src/app/(public)/page.tsx`):
  ```typescript
  export const revalidate = false;

  import { getPublishedPosts } from "@/lib/posts/queries";
  import { PostCard } from "./PostCard";

  export default async function PostListPage() {
    const posts = await getPublishedPosts();

    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        {posts.length > 0 ? (
          <ul className="flex flex-col gap-4">
            {posts.map((post) => (
              <li key={post.id}>
                <PostCard post={post} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No posts published yet — check back soon.</p>
        )}
      </div>
    );
  }
  ```
- Then delete `src/app/page.tsx` entirely (`git rm src/app/page.tsx` or equivalent) — it and `(public)/page.tsx` cannot coexist, both resolve `/`.
- **PATTERN**: empty-state text mirrors the admin list page's convention (`text-sm text-zinc-500`), reworded for a public reader.
- **IMPORTS**: `@/lib/posts/queries`, local `./PostCard`.
- **GOTCHA #1**: `export const revalidate = false;` is placed before the imports here deliberately (Route Segment Config exports are conventionally hoisted to the top of the file) — this is the line that makes the page actually static-until-`revalidatePath` rather than dynamic-per-request on Next 16 (see Relevant Documentation's Route Segment Config entry). Do not skip this thinking "it's already static by default" — it is not, on this Next.js version.
- **GOTCHA #2**: `npm run dev` will still show fresh data on every request regardless of `revalidate` — the Next.js dev server doesn't apply the same full route caching as `next build && next start`/production. Confirming the actual ISR behavior requires the production build (see Testing Strategy).
- **VALIDATE**: `npx tsc --noEmit`; after Task 5's `next.config.ts` change and a `next build`, confirm the build output marks `/` as `○ (Static)`.
- **SATISFIES**: AC "published posts appear on... [the list] page"; ticket's explicit ISR requirement.

### Task 12: CREATE src/app/(public)/posts/[slug]/page.tsx

- **IMPLEMENT**:
  ```typescript
  export const revalidate = false;

  import type { Metadata } from "next";
  import { notFound } from "next/navigation";
  import Image from "next/image";
  import { getPublishedPostBySlug, getPublishedPosts } from "@/lib/posts/queries";
  import { renderMarkdown } from "@/lib/markdown/render";
  import { MarkdownContent } from "../../MarkdownContent";
  import { TagList } from "../../TagList";

  export async function generateStaticParams() {
    const posts = await getPublishedPosts();
    return posts.map((post) => ({ slug: post.slug }));
  }

  export async function generateMetadata({
    params,
  }: {
    params: Promise<{ slug: string }>;
  }): Promise<Metadata> {
    const { slug } = await params;
    const post = await getPublishedPostBySlug(slug);
    if (!post) {
      return {};
    }

    return {
      title: post.title,
      description: post.excerpt ?? undefined,
      openGraph: {
        title: post.title,
        description: post.excerpt ?? undefined,
        type: "article",
        publishedTime: post.published_at ?? undefined,
        images: post.cover_image_url ? [post.cover_image_url] : undefined,
      },
    };
  }

  export default async function PostDetailPage({
    params,
  }: {
    params: Promise<{ slug: string }>;
  }) {
    const { slug } = await params;
    const post = await getPublishedPostBySlug(slug);

    if (!post) {
      notFound();
    }

    const html = await renderMarkdown(post.content);

    return (
      <article className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        {post.cover_image_url && (
          <Image
            src={post.cover_image_url}
            alt=""
            width={1200}
            height={630}
            className="rounded"
          />
        )}
        <h1 className="text-2xl font-semibold">{post.title}</h1>
        <TagList tags={post.tags} />
        <MarkdownContent html={html} />
      </article>
    );
  }
  ```
- **PATTERN**: `params: Promise<{ slug: string }>` mirrors `admin/(protected)/posts/[id]/edit/page.tsx:6-10` exactly; `if (!post) notFound();` mirrors the same file's `if (!post) notFound();`.
- **IMPORTS**: `next` (`Metadata`), `next/navigation` (`notFound`), `next/image`, `@/lib/posts/queries`, `@/lib/markdown/render`, relative `../../MarkdownContent`, `../../TagList`.
- **GOTCHA #1**: `getPublishedPostBySlug(slug)` is called independently in `generateStaticParams` (via `getPublishedPosts`), `generateMetadata`, and the page body — the `cache()` wrapper (Task 2) means the latter two dedupe within one request; `generateStaticParams` calling `getPublishedPosts` instead is a separate, intentionally-broader query (needs all slugs, not one post).
- **GOTCHA #2**: `generateMetadata` returning `{}` when `post` is `null` is correct — it doesn't call `notFound()` itself (that's the page component's job); Next.js still lets the page component run and call `notFound()`, which is what actually produces the 404.
- **GOTCHA #3**: same "no status filter" reasoning as Task 2 applies transitively here — a nonexistent slug and an existing-but-draft slug are indistinguishable from this page's perspective (both come back as `post === null` from RLS), which is the correct behavior (a draft should 404 for a public visitor exactly like a nonexistent post, not reveal that "something" exists at that slug).
- **VALIDATE**: `npx tsc --noEmit`; after `next build`, confirm the route table shows `/posts/[slug]` prerendered for existing published slugs.
- **SATISFIES**: AC "published posts appear on... [the detail] page with correctly highlighted code; draft posts never appear."

### Task 13: UPDATE CLAUDE.md

- **IMPLEMENT**: expand the Architecture map's `(public)/` bullet from:
  ```
    (public)/            # post list + post detail pages — statically generated with ISR,
                          #   revalidated on publish (posts change at most weekly)
  ```
  to note the concrete files: `page.tsx` (list), `posts/[slug]/page.tsx` (detail, `generateStaticParams`/`generateMetadata`), `layout.tsx` (header + ThemeToggle), `PostCard.tsx`/`TagList.tsx`/`MarkdownContent.tsx`, and that both pages set `revalidate = false` — the on-demand revalidation is driven entirely by PB-0003's `actions.ts`. Also add a one-line pointer to the new `lib/markdown/` module in the `lib/` section.
- **VALIDATE**: read-through only.
- **SATISFIES**: keeps the architecture map accurate, per project convention (mirrors PB-0004's Task 4).

### Task 14: UPDATE .claude/references/supabase-access-control.md

- **IMPLEMENT**: add one sentence to the `lib/supabase/server.ts` bullet noting it's now also read from a **no-session** (logged-out/anon) context by the public pages (PB-0005), not only from the authenticated admin/login flows — same client, same RLS enforcement, just exercised as the anon role for the first time.
- **VALIDATE**: read-through only.
- **SATISFIES**: keeps the reference doc accurate for the next ticket that touches Supabase access boundaries (directly relevant to PB-0006, which also reads via the anon path).

---

## TESTING STRATEGY

Per CLAUDE.md's current default (no test suite yet) and PB-0001-0004's precedent: no automated tests. Validation is `next build` + `npm run lint` + `tsc --noEmit` + manual browser verification, with one important addition specific to this ticket — a direct REST check proving RLS, not app code, hides drafts.

### Unit Tests

None.

### Integration Tests

None automated. The manual flow below (particularly the direct-REST-call step) is the integration check the AC actually asks for.

### Edge Cases (covered by manual validation below)

- A published post with a cover image and tags → renders correctly on both list and detail, code blocks highlighted in both light and dark mode.
- A published post with `cover_image_url: null` and `tags: []` → list/detail render without a broken image or an empty tag row.
- A draft post → does not appear in the list; its detail URL 404s.
- An unpublish (published → draft) via the admin → the post disappears from the public list/detail on the next request after the admin action's `revalidatePath` fires (not immediately mid-request, and not on a fixed timer — that's the whole point of `revalidate = false`).
- Toggling the theme on the detail page → code block colors switch between the light/dark Shiki theme pair without a page reload.
- Clicking "Copy" on a code block → clipboard receives the plain code text (no leftover HTML/highlighting markup), button label briefly shows "Copied!".
- A markdown code fence with no language tag (` ``` ` alone) → still renders via the `defaultLang: "plaintext"` fallback, doesn't error.

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```
npm run lint
npx tsc --noEmit
```

### Level 2: Unit Tests

N/A — none exist for this project yet.

### Level 3: Integration Tests

N/A — none exist for this project yet.

### Level 4: Manual Validation

```
npm run build
npm run start
```

(`next start`, not `next dev` — required to actually observe the static/ISR behavior `revalidate = false` produces; `next dev` re-renders per request regardless.)

1. Confirm the build output lists `/` as `○ (Static)` and `/posts/[slug]` as prerendered for any published slugs that existed at build time.
2. Seed (directly in the Supabase dashboard, or via the admin UI) one **published** post with a cover image, an excerpt, tags, and markdown content that includes: a fenced code block with a language tag, a fenced code block with no language tag, a table (tests `remark-gfm`), a blockquote, and an inline image. Seed one **draft** post as well.
3. Visit `/` → confirm the published post's card appears (cover image, excerpt, tags, date) and the draft post does **not**.
4. Click through to the published post's `/posts/<slug>` → confirm title, cover image, tags, and rendered markdown (table, blockquote, both code blocks) all display correctly.
5. Toggle dark mode via the header `ThemeToggle` → confirm code block colors switch, and the toggle's state is whatever `next-themes` already persists (localStorage) — navigate to `/` and back to confirm it held.
6. Click "Copy" on a highlighted code block → paste into any text field → confirm it's the plain code text, not HTML.
7. Visit `/posts/<draft-slug>` directly → confirm a 404 page, not the draft's content.
8. **RLS verification (the ticket's specific AC ask)**: from a terminal, hit the Supabase REST endpoint directly with the **anon**/publishable key for the draft post's slug:
   ```bash
   curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/posts?slug=eq.<draft-slug>&select=*" \
     -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
   ```
   Expect `[]` — this confirms the RLS policy itself hides the draft at the database layer, independent of anything this app's code does, directly satisfying "verify RLS is actually doing the filtering, not just an app-level query filter."
9. In the admin, unpublish the seeded post (published → draft) → revisit `/` and the post's `/posts/<slug>` → confirm both now reflect the unpublish (list entry gone, detail page 404s) — this exercises `actions.ts`'s existing `revalidatePublicPaths()` against the pages this ticket just created.
10. View page source (or a social-share debugger) on a published post's detail page → confirm `<title>`, `<meta name="description">`, and `og:*` tags reflect that post's title/excerpt/cover image.

### Level 5: Additional Validation (Optional)

- Lighthouse/PageSpeed pass on `/` and a detail page — not a hard requirement, but a cheap sanity check given `next/image` and static rendering are both in play.

---

## ACCEPTANCE CRITERIA

- [ ] AC1: `/` lists published posts only (cover image, excerpt if present, tags, date), statically generated with `revalidate = false`.
- [ ] AC2: `/posts/[slug]` renders a published post's markdown (via the `unified`/`rehype-pretty-code` pipeline) with syntax-highlighted, dual-theme, copy-buttoned code blocks; cover image and tags display.
- [ ] AC3: Draft posts never appear on either page — verified via a direct anon-key REST call showing RLS itself excludes them, not just an app-level filter (none exists to filter).
- [ ] AC4: The `ThemeToggle` is wired into a new `(public)/layout.tsx`; toggling persists across navigation between the list and detail pages.
- [ ] AC5: Publishing/unpublishing/deleting a post via the existing admin flow (PB-0003's `actions.ts`) correctly updates the public pages via the `revalidatePath` calls that already existed before this ticket.
- [ ] AC6: Per-post SEO/OpenGraph metadata (`generateMetadata`) reflects the post's title/excerpt/cover image.
- [ ] `npm run build`, `npm run lint`, and `npx tsc --noEmit` all pass with zero errors.
- [ ] CLAUDE.md and `supabase-access-control.md` reflect the new files/usage.

---

## COMPLETION CHECKLIST

- [ ] All 14 tasks completed in order
- [ ] Each task's validation command passed immediately after that task
- [ ] `npm run build`, `npm run lint`, `npx tsc --noEmit` all pass
- [ ] Full manual flow (Level 4, steps 1-10) confirmed in a real browser against a production build (`next start`), including the direct RLS/REST check
- [ ] Acceptance criteria all met
- [ ] CLAUDE.md and the Supabase access-control reference updated to match reality

---

## OPEN QUESTIONS / ASSUMPTIONS

- **`rehype-pretty-code`'s exact option shape** may have shifted from what's written in Task 4 by the time `npm install` resolves a version — the plan flags this explicitly (Task 4, GOTCHA #1) rather than asserting it as certain; confirm against the installed version's own docs before treating a build failure there as a plan error.
- **No time-based ISR fallback.** If Supabase data is ever changed outside this app (direct dashboard edit to an already-published row's content), the public page won't reflect it until another app-driven write touches that post. Accepted per CLAUDE.md; would need a `revalidate = <seconds>` fallback added later if this becomes an actual problem.
- **`metadataBase` unset.** No production domain exists yet (PB-0007). OpenGraph `images` use the already-absolute Supabase Storage URL, so this doesn't break anything now, but revisit once the real domain is live in case Next.js's metadata resolution wants a base for other fields.
- **Hand-written `.markdown-content` CSS vs. `@tailwindcss/typography`.** Chosen to avoid a new dependency; if the hand-rolled rules prove visually inadequate once real posts are written, swapping to the `prose` plugin is a contained, low-risk follow-up (would replace most of Task 6's markdown-content block with a `prose dark:prose-invert` class).
- **`PostCard.tsx`'s "no excerpt, no auto-summary" behavior** — if this reads too sparse once real posts exist, a follow-up could truncate `content`'s first N characters as a fallback; not built now to avoid stripping markdown syntax awkwardly in a plain-text card context.

## NOTES (open canvas)

**Why not `<ReactMarkdown rehypePlugins={[rehypePrettyCode]}>` directly, given the PRD literally names `react-markdown` alongside `shiki`/`rehype-pretty-code`?** `rehype-pretty-code` needs an async Shiki highlighter instantiated (theme loading, etc.) as part of its processing step. `react-markdown`'s component-based plugin execution model is not the natural fit for that — the far more common, better-documented working pattern for this exact combination is a plain `unified` pipeline (`remark-parse` → ... → `rehype-stringify`) producing an HTML string, rendered via `dangerouslySetInnerHTML`. This still uses `rehype-pretty-code`/Shiki exactly as named; `react-markdown` itself (the React-component wrapper) is the only piece swapped for its lower-level `unified` foundation. Confirmed with the user during exploration before this plan was written.

**Why `cache()` in `lib/posts/queries.ts` instead of relying on Next's automatic `fetch` memoization?** The Supabase JS client does call the global `fetch` under the hood, and Next.js does patch `fetch` for automatic per-request memoization in some cases — but relying on that implicitly (rather than wrapping the exported function in `cache()` explicitly) is fragile and non-obvious to a future reader. Explicit `cache()` is the documented, guaranteed mechanism regardless of how the Supabase SDK's internals evolve.

**Why does removing `src/app/page.tsx` belong in this ticket rather than being flagged as a conflict to resolve separately?** It's a direct, mechanical consequence of adding `app/(public)/page.tsx` — Next.js does not allow a route group's page and a sibling top-level page to both resolve the same path. There's no meaningful alternative to weigh here (confirmed with the user during exploration).

**Confidence score: 8/10.** The Supabase query/typing patterns, layout structure, and ISR mechanism are all either directly mirrored from existing code or a single well-documented Next.js config line. The two points of genuine novelty — the `rehype-pretty-code` dual-theme option shape (version-sensitive, flagged explicitly) and the hand-rolled copy-button rehype plugin (no local precedent) — are both small, isolated, and independently testable, which is why this isn't lower; it's not a 9-10 because there's real risk the exact `rehype-pretty-code` API has drifted from what's written here and needs a live check against installed-version docs during implementation.

## AMENDMENTS

(none yet)
