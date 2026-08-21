# PR #6 Review — chore(lib): harden server-only boundaries on server.ts, queries.ts, render.ts

**Ticket**: PB-0008 · **Branch**: `feature/pb-0008-harden-server-only-boundaries` → `main`
**Reviewed by**: automated PR review (fresh-eyes pass via `code-reviewer` agent + validation run)

## Summary

Adds `import "server-only";` as the first line of `src/lib/supabase/server.ts`,
`src/lib/posts/queries.ts`, and `src/lib/markdown/render.ts`, mirroring the guard already present in
`src/lib/supabase/admin.ts`. Pure defense-in-depth, no behavioral change: if any of these Node-only
modules is ever imported into a Client Component, the build now fails loudly at compile time instead
of silently bloating the client bundle. Diff is exactly +1 line × 3 files, plus the implementation
report. Validation passes clean and every importer of the three guarded modules was traced and
confirmed to be server-side (Server Components, Server Actions, or a Route Handler) — this guard
cannot break the build as written.

## Validation

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ pass, zero errors |
| `npm run lint` | ✅ pass, zero output |
| `npm run build` | ✅ pass — route table unchanged from baseline (`/` dynamic, `/posts/[slug]` SSG) |
| Report's documented build-failure check (scratch Client Component import) | ✅ per report, reverted cleanly, no trace in final diff |

## What's good

- Guard placement is byte-for-byte consistent with the existing `admin.ts` pattern — first line, no
  blank line before the next import.
- `server-only` is a genuine declared `dependencies` entry in `package.json`, not a transitive
  package being relied on implicitly.
- Every importer of all three modules was traced and confirmed non-client: `server.ts` (8 importers —
  Server Components, Server Actions, one Route Handler), `queries.ts` (2 Server Component importers),
  `render.ts` (1 Server Component importer). No path exists today where this guard fires unexpectedly.
- The implementation report shows the guard was actually verified to fire (temporary scratch Client
  Component import, confirmed build failure pointing at `render.ts:1:1`, then cleanly reverted) rather
  than just asserted — solid diligence for a change whose entire value is "this fails correctly when
  it should."
- Matches the access-control boundary described in `.claude/references/supabase-access-control.md`.
- Deviation from the plan (reusing the already-running dev server on port 3000 for the manual
  spot-check, since a scratch-port `npm run dev` hit Next's single-instance guard) is documented and
  reasonable — not flagged as an issue.

## Issues

None at Critical/High/Medium/Low confidence.

**Informational, non-blocking**: `.claude/references/supabase-access-control.md` currently mentions
the `server-only` guard only on `admin.ts` and doesn't yet reflect that `server.ts` carries it too.
Pre-existing doc, not part of this diff — worth a follow-up doc touch-up but not a reason to hold this
PR.

## Recommendation

**Approve.** Minimal, correctly-scoped, verified defense-in-depth change with clean validation and no
risk to any current import path.
