# CLAUDE.md — Personal Blog Platform

## What this is
A single-admin personal blog for Jason to publish weekly write-ups of what he's learning (text, code
snippets, images) at `blog.developerjay.com`, giving him public accountability plus a linkable
portfolio artifact. Stack: Next.js (App Router, TypeScript) as the sole deployable, talking directly
to Supabase (Postgres + Auth + Storage) — no hand-rolled backend service.

## Architecture map
```
app/
  (public)/            # post list (page.tsx, `dynamic = "force-dynamic"` — reads `q`/`tag`
                        #   `searchParams` to run full-text search + tag filtering server-side on
                        #   every request, via SearchBar.tsx/TagFilter.tsx client components that
                        #   drive the URL) + post detail (posts/[slug]/page.tsx, with
                        #   generateStaticParams/generateMetadata) — detail page still
                        #   `revalidate = false` + `dynamic = "force-static"`, revalidated on
                        #   publish (posts change at most weekly); layout.tsx (site title +
                        #   ThemeToggle); PostCard.tsx/TagList.tsx (shared list+detail pieces);
                        #   MarkdownContent.tsx (client wrapper rendering the server-produced
                        #   markdown HTML string, with a delegated click handler for code-block
                        #   copy buttons)
  admin/                # session-gated CRUD UI (login, post list/create/edit/delete,
                        #   image upload, draft/publish toggle) — gated by proxy;
                        #   admin/(protected)/ holds the dashboard + CRUD pages,
                        #   admin/login/ stays outside that group so it's reachable logged-out
    (protected)/
      posts/            # post list (all statuses) + shared create/edit PostForm +
                        #   DeleteButton, backed by actions.ts (createPost/updatePost/
                        #   deletePost) — all writes via lib/supabase/server, not admin.ts.
                        #   posts/upload/route.ts is a POST Route Handler (the app's first —
                        #   everything else is a Server Action) that uploads to the post-images
                        #   bucket via lib/supabase/admin (the first use of the RLS-bypassing
                        #   client outside a page/action already wrapped by the (protected)
                        #   layout, so it re-checks auth itself); ImageUpload.tsx is the Client
                        #   Component that calls it and hands the resulting URL back to
                        #   PostForm.tsx to splice into the content textarea as markdown
  proxy.ts              # checks active Supabase session AND session email == allowlisted admin,
                        #   redirects unauthenticated/wrong-email requests to /admin/login
                        #   (Next.js 16 renamed the middleware.ts convention to proxy.ts)
lib/
  supabase/              # admin.ts: privileged client (secret key, server-only, bypasses RLS,
                        #   sync createClient()). server.ts: cookie-aware session client
                        #   (publishable key, respects RLS, async createClient()) used by the
                        #   (protected) layout and login/logout Server Actions — proxy.ts builds an
                        #   equivalent inline client (different cookie adapter, not this module).
                        #   client.ts: browser client (publishable key). Secret key must never reach
                        #   the client.
  posts/                # types.ts (hand-declared Post/PostStatus, no generated Database types
                        #   yet) + slugify.ts (shared client/server slug normalization) +
                        #   queries.ts (getPublishedPosts/getPublishedPostBySlug/getAllTags, React
                        #   `cache()`-wrapped, RLS-only filtering — no app-level status filter;
                        #   getPublishedPosts takes optional `{ search, tag }` and branches into a
                        #   Postgres `search_vector` full-text query / `tags` array-contains query)
  markdown/              # render.ts: unified pipeline (remark-parse/gfm/rehype → rehype-pretty-
                        #   code with dual light/dark Shiki themes → rehype-stringify) producing
                        #   an HTML string server-side. rehype-copy-button.ts: hand-rolled rehype
                        #   plugin wrapping each <pre> for the copy-button UI.
```
Supabase project (external, not in this repo): `posts` table, RLS policies, one Storage bucket for
images, Auth config with public sign-up disabled and one allowlisted admin user.

## Where new code goes
- **New public page:** `app/(public)/` — follows the existing ISR pattern (see Rendering below).
- **New admin capability:** `app/admin/(protected)/` for pages requiring a logged-in session — a
  Server Action or Route Handler using `lib/supabase/admin` (secret key, privileged) or
  `lib/supabase/server` (publishable key, session-scoped), whichever the operation needs.
- **Any Supabase read/write:** goes through `lib/supabase/admin`, `lib/supabase/server`, or
  `lib/supabase/client`, not an ad-hoc `createClient()` call.

## Ground rules (conventions)
- **Backend:** No hand-rolled API layer, no separate backend service — Server Actions/Route Handlers
  in the Next.js app talk to Supabase directly.
- **Access control:** admin-route gating + Supabase key/RLS boundaries — see
  `.claude/references/supabase-access-control.md`.
- **Data model:** `posts` schema + storage decisions — see `.claude/references/data-model.md`.
- **Rendering:** Post detail pages use ISR (revalidated on publish), not per-request SSR — posts
  change at most weekly. The post list page (`app/(public)/page.tsx`) is the one exception: it's
  dynamically rendered (`dynamic = "force-dynamic"`) so it can read `q`/`tag` search params and
  query Supabase per request for search + tag filtering (PB-0006) — acceptable at this blog's
  low-traffic scale.
- **Post content:** Markdown, rendered server-side with a `unified` pipeline (`remark`/`rehype`) +
  `shiki`/`rehype-pretty-code` for syntax highlighting — not the `react-markdown` component (its
  plugin execution model doesn't fit `rehype-pretty-code`'s async Shiki highlighter; see
  `lib/markdown/render.ts`).
- **Search:** Postgres full-text search via Supabase — no separate search service.
- **Dark mode:** `next-themes`, not a hand-rolled theme context.

## Working principles (agent steering)
- **Approach:** Build directly for most changes. Plan first (surface assumptions, open questions)
  only when a change touches auth, RLS policies, or the data model/schema — those are the areas
  worth pausing on.
- **Verify:** No test suite yet — a manual check (dev server, exercise the actual flow in the
  browser) is enough for now. Don't add tests speculatively; revisit test coverage once the
  prototype is stable, not before.
- **Scope discipline:** Comments, RSS, view-count analytics, video embedding, and multi-author
  support are explicit non-goals for MVP.
- **Stack discipline:** Stay inside TypeScript/React/Next + Supabase — a separate backend service
  (e.g. .NET) and a git/MDX static approach were both considered and rejected during architecture;
  don't reintroduce either without the user explicitly reopening that decision.

## Commands
- `npm run dev` — start the dev server (Turbopack).
- `npm run build` — production build.
- `npm run lint` — ESLint.
- `npx supabase migration new <name>` — add a new migration under `supabase/migrations/`.

## On-demand context
- Recurring patterns → `.claude/references/<topic>.md`.
- File-type-specific rules → `.claude/rules/<area>.md` (path-scoped; loads only for matching files).
