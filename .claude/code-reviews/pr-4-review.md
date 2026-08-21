# PR #4 Review — feat(public): add post list and detail pages with markdown rendering

**Branch**: `feature/pb-0005-public-post-pages` → `main`
**Reviewed against**: `.claude/plans/pb-0005-public-post-pages.md` + `.claude/reports/pb-0005-public-post-pages-report.md`

## Summary

Builds the public-facing half of the blog: a statically generated post list (`/`) and post detail
page (`/posts/[slug]`), with RLS as the sole enforcement of draft/published visibility and
server-rendered markdown via `unified`/`rehype-pretty-code`. Matches the ticket's intent and the
plan's architecture. The six deviations documented in the implementation report (hast→@types/hast
swap, `keepBackground: true`, `dynamic = "force-static"` on both routes, `cookies()` try/catch
hardening, `index === undefined` guard, CLAUDE.md correction) are all verification-driven
corrections, not scope changes, and check out against the actual code — none are flagged below.

## Validation

| Check | Result |
|---|---|
| `npm run lint` | ✅ pass, zero output |
| `npx tsc --noEmit` | ✅ pass, zero errors |
| `npm run build` | ✅ pass — `/` static, `/posts/[slug]` SSG via `generateStaticParams` |

## What's done well

- **RLS boundary correctly used and unusually well-verified.** `lib/posts/queries.ts` goes through
  `lib/supabase/server.ts` (publishable key) exclusively, never `admin.ts`. The added
  `dynamic = "force-static"` means `cookies()` always resolves to an empty jar on these routes, so
  an admin's own session cookie can never leak draft visibility into a page that gets statically
  cached and served to anonymous visitors.
- **Safe-by-default XSS posture.** `render.ts` never sets `allowDangerousHtml`, so raw HTML in
  markdown source is stripped before the string reaches `MarkdownContent.tsx`'s
  `dangerouslySetInnerHTML`. Verified against the actual pipeline config.
- **Revalidation loop confirmed working end-to-end**, not just documented as a follow-up:
  `admin/(protected)/posts/actions.ts`'s existing `revalidatePath` calls correctly bust these new
  `revalidate = false` routes on publish/unpublish/delete (AC5).
- Hand-declared `Post` type matches the actual migration schema exactly.
- Good scope discipline — `TagList`/`PostCard`/`MarkdownContent` stay local to `app/(public)/`
  rather than being prematurely generalized.
- `next.config.ts`'s `remotePatterns` is scoped to the specific bucket path, not the whole host.

## Issues

### Medium
- **Non-decorative `alt=""` on cover images** — `src/app/(public)/PostCard.tsx:15` and
  `src/app/(public)/posts/[slug]/page.tsx:60`. Empty alt marks the image as decorative, but a
  post's cover image is content. Suggest `alt={post.title}`.

### Low–Medium
- **Over-fetching in queries** — `src/lib/posts/queries.ts` uses `.select("*")` in both
  `getPublishedPosts` and `getPublishedPostBySlug`, pulling the full markdown `content` column even
  where it's unused (list page only renders `excerpt`; `generateStaticParams` only needs `slug`).
  Worth scoping `select()` per call site.

### Low
- `render.ts` and `queries.ts` lack `import "server-only"` (matching `admin.ts`'s convention);
  `render.ts` pulls in Shiki's Node-only theme data, so a client-side import would fail with a less
  clear error without it. Pre-existing gap (`server.ts` also lacks it), not introduced by this PR.
- The XSS-safety of the markdown pipeline depends entirely on `allowDangerousHtml` never being set
  in `render.ts` — correct today but undocumented as security-load-bearing. A one-line comment
  would guard against a future regression.

## Recommendation

**Approve.** No critical or high-severity issues; the two areas CLAUDE.md flags for extra care
(Supabase key/RLS boundary, XSS via `dangerouslySetInnerHTML`) both held up under review. The
Medium/Low items are small and non-blocking — worth a quick follow-up, not a merge blocker.
