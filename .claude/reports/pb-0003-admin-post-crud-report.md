# Implementation Report — PB-0003 Admin post CRUD

**Plan**: `.claude/plans/pb-0003-admin-post-crud.md`   **Branch**: `feature/pb-0003-admin-post-crud`   **Status**: COMPLETE

## Summary
Built the full admin post CRUD surface: a `posts` list page (all statuses, badges), a shared
create/edit `PostForm`, `createPost`/`updatePost`/`deletePost` Server Actions (all via
`lib/supabase/server`, per the confirmed decision), a confirm-then-delete `DeleteButton`, a new
`set_published_at` DB trigger, and a "Manage posts" link from the dashboard. The trigger migration
has been applied to the live Supabase project and the full logged-in manual flow has been confirmed
working by the user.

## Tasks completed
- Task 1: trigger migration → `supabase/migrations/20260820160553_set_published_at_trigger.sql` (CREATE) — applied to the live Supabase project by the user via the SQL Editor.
- Task 2: `Post`/`PostStatus` types → `src/lib/posts/types.ts` (CREATE)
- Task 3: slug normalization → `src/lib/posts/slugify.ts` (CREATE)
- Task 4: Server Actions → `src/app/admin/(protected)/posts/actions.ts` (CREATE)
- Task 5: shared form → `src/app/admin/(protected)/posts/PostForm.tsx` (CREATE)
- Task 6: delete confirm → `src/app/admin/(protected)/posts/DeleteButton.tsx` (CREATE)
- Task 7: list page → `src/app/admin/(protected)/posts/page.tsx` (CREATE)
- Task 8: create page → `src/app/admin/(protected)/posts/new/page.tsx` (CREATE)
- Task 9: edit page → `src/app/admin/(protected)/posts/[id]/edit/page.tsx` (CREATE)
- Task 10: dashboard nav link → `src/app/admin/(protected)/page.tsx` (UPDATE)
- Task 11: architecture map → `CLAUDE.md` (UPDATE)
- Task 12: trigger note → `.claude/references/data-model.md` (UPDATE)

## Tests added
None — per the plan's confirmed decision (no automated test suite yet), consistent with
CLAUDE.md's current default.

## Validation results
- `npx tsc --noEmit` — **pass**, zero errors.
- `npm run lint` — **pass**, zero errors/warnings.
- `npm run build` — **pass**. Route table confirms `/admin/posts`, `/admin/posts/new`, and
  `/admin/posts/[id]/edit` all render dynamic (ƒ), matching the rest of `/admin/*`.
- Unauthenticated-access check: `curl -L http://localhost:3000/admin/posts` → 200 at
  `/admin/login?redirect=%2Fadmin%2Fposts`, confirming the `(protected)` layout gates the new
  route tree correctly.
- Full logged-in manual flow (Level 4, steps 1–6 in the plan) — **confirmed working by the user**.

## Deviations from the plan
`deletePost` (`src/app/admin/(protected)/posts/actions.ts`) now calls `revalidatePath("/admin/posts")`
explicitly after a successful delete. The plan's Task 4 GOTCHA #5 assumed Next.js's automatic
current-route refresh (which applies to non-redirecting Server Actions) would keep the list in
sync without an explicit call — in manual testing the list did not refresh after a confirmed
delete, so the explicit revalidation was added to make the behavior reliable. Everything else
follows the plan's code blocks and file list exactly, including the DB-trigger approach for
`published_at` (the plan's flagged, deliberate deviation from the ticket's literal text — already
justified in the plan's Open Questions).

`src/app/admin/(protected)/posts/page.tsx` uses `.overrideTypes<Post[], { merge: false }>()`
instead of the plan's `.returns<Post[]>()` — `postgrest-js` (bundled with the installed
`@supabase/supabase-js@^2.112.3`) marks `.returns()` `@deprecated` in favor of `overrideTypes`,
noticed after the plan was written. `merge: false` matches `.returns()`'s old full-replace
behavior. `.maybeSingle<Post>()` in the edit page is unaffected — that generic isn't deprecated.

## Issues encountered
None remaining. Migration SQL has been run and manual test by Jason complete
