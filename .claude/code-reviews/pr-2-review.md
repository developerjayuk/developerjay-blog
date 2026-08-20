# PR #2 Review — `feat(admin): add post CRUD (create, edit, delete, publish)`

**Branch**: `feature/pb-0003-admin-post-crud` → `main`   **Reviewed against**: `.claude/plans/pb-0003-admin-post-crud.md` + `.claude/reports/pb-0003-admin-post-crud-report.md`

## Summary

This ticket gives the admin area its first real content-management capability: an all-statuses post list, a shared create/edit form, delete with confirmation, and a DB trigger that stamps `published_at` on first publish. Implementation follows the plan closely — task list, file list, and Server Action shapes all match. Both deviations called out in the PR description (`deletePost`'s explicit `revalidatePath("/admin/posts")`, and `.overrideTypes()` instead of the deprecated `.returns()`) are documented in the report and are reasonable, tested engineering calls, not undocumented drift.

## Validation

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Pass, zero errors |
| `npm run lint` | ✅ Pass, zero errors/warnings |
| `npm run build` | ✅ Pass — `/admin/posts`, `/admin/posts/new`, `/admin/posts/[id]/edit` all render dynamic (ƒ), consistent with the rest of `/admin/*` |
| Manual logged-in flow (create → edit → publish → duplicate-slug error → delete) | ✅ Confirmed working per report |

## What's done well

- **Trigger logic is correct on close inspection**: traced both INSERT and UPDATE paths — `published_at` is set once on first publish, untouched on unpublish, and a no-op on republish (`published_at is null` is already false). App code never sets this column, matching the documented single-source-of-truth decision.
- **Revalidation branching handles the hard case**: the compound "unpublish + rename in the same edit" correctly revalidates both the old (`currentSlug`) and new (`fields.slug`) public paths — an easy case to get wrong that isn't.
- **`23505` (unique_violation) handling is correctly scoped**: `slug` is the only unique constraint on `posts`, so the duplicate-slug error message can't misfire against something else.
- **Hidden-field trust (`DeleteButton`'s `slug`/`status`, `updatePost`'s `currentStatus`) is bounded correctly**: those fields only steer cache revalidation, never the actual `WHERE` clause (`id`-scoped), and the action is still gated by `proxy.ts` + RLS regardless. Worst case is a stale public page, not a security or data issue — matches the plan's stated trade-off.
- **Server Action shapes match existing conventions exactly**: `createPost`/`updatePost` mirror `login/actions.ts`'s stateful shape; `deletePost` mirrors `logout.ts`'s plain-action shape.
- **"Never trust the client's derived value"** is followed consistently — the client-side slug auto-generation in `PostForm.tsx` is UX-only; `readPostFields` re-normalizes server-side regardless of what arrives.

## Issues

### Medium

- **`src/app/admin/(protected)/posts/[id]/edit/page.tsx:13-25`** — A malformed `id` segment (e.g. visiting `/admin/posts/not-a-uuid/edit`) makes Postgres raise an invalid-UUID-syntax error, which hits `if (error) throw error` before the `notFound()` branch is reached. There's no `error.tsx` anywhere in the app yet, so this surfaces as Next's default unstyled error page instead of the clean 404 this code otherwise provides for a valid-but-missing id.
  - **Fix**: validate `id` looks like a UUID before querying, or catch the specific Postgres invalid-input error code and route it to `notFound()` too.

### Low

- **`actions.ts:104-111` (`updatePost`)** — no check on affected row count after `.update(fields).eq("id", id)`. A stale hidden `id` or a race with a concurrent delete returns `error: null` with zero rows affected, and the action still redirects as if it succeeded. Low risk at single-admin scale; worth a one-line comment if intentional.
- **`DeleteButton.tsx:9-12`** — `status` prop typed as plain `string` instead of the project's canonical `PostStatus` (from `@/lib/posts/types`). Free type-safety win.
- **Filename casing** — `PostForm.tsx`/`DeleteButton.tsx` are PascalCase; every existing client component in the repo (`login-form.tsx`, `theme-toggle.tsx`, `theme-provider.tsx`) is kebab-case. Not functional, but sets a new precedent worth an explicit decision.
- **`actions.ts:58` (`readPostFields`)** — `content` has no non-empty validation (unlike `title`), so a post can be published with empty content. Possibly fine for MVP; flagging in case that wasn't intended.
- **`page.tsx:8-12` vs `[id]/edit/page.tsx:13-17`** — two different Supabase row-typing approaches used side by side (`.overrideTypes<Post[], {merge:false}>()` vs `.maybeSingle<Post>()`). Both valid; picking one convention per feature would read more consistently. Cosmetic.
- **`page.tsx:10`** — `.select("*")` pulls the full markdown `content` column for every row on a list view that only renders title/status/tags. Not a real cost at personal-blog scale; worth narrowing if the table grows.

## Recommendation

**Approve.** No Critical or High-severity findings — the auth/RLS boundary, the publish-date trigger, slug-collision handling, and the revalidation branching (including the tricky combined unpublish+rename case) all check out on close inspection. The one Medium item (malformed-`id` UX gap on the edit route) is worth a decision before or shortly after merge but doesn't block it, and is consistent with the rest of the codebase's current error-handling maturity (no `error.tsx` exists anywhere yet). The Low items are optional polish.
