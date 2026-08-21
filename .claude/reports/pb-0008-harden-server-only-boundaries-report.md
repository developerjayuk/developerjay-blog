# Implementation Report — PB-0008 Harden server-only boundaries

**Plan**: `.claude/plans/pb-0008-harden-server-only-boundaries.md`   **Branch**: `feature/pb-0008-harden-server-only-boundaries`   **Status**: COMPLETE

## Summary
Added `import "server-only";` as the first line of `src/lib/supabase/server.ts`, `src/lib/posts/queries.ts`, and `src/lib/markdown/render.ts`, mirroring the existing guard in `lib/supabase/admin.ts`. This is defense-in-depth so a future accidental Client Component import of one of these modules fails the build loudly instead of silently bloating the client bundle.

## Tasks completed
- Add guard to `server.ts` → `src/lib/supabase/server.ts` (UPDATE)
- Add guard to `queries.ts` → `src/lib/posts/queries.ts` (UPDATE)
- Add guard to `render.ts` → `src/lib/markdown/render.ts` (UPDATE)
- Verify guard is live → temporary `src/app/scratch-server-only-check.tsx` + temporary import in `src/app/(public)/layout.tsx` (created, build confirmed to fail, then both reverted — no trace in final diff)

## Tests added
None — no test framework in this project; this is a build-time-only guard with no runtime behavior to unit-test, per the plan's Testing Strategy.

## Validation results
- `npx tsc --noEmit` — pass, zero errors.
- `npm run lint` — pass, zero output.
- `npm run build` (baseline, guards in place) — pass.
- `npm run build` (with scratch client-component import wired in) — **failed as expected**, with Turbopack's `server-only` error pointing at `render.ts:1:1` and tracing the Client Component Browser/SSR import chain back through `scratch-server-only-check.tsx` → `(public)/layout.tsx`.
- `npm run build` (after scratch cleanup) — pass, clean output identical in shape to baseline.
- Manual spot-check on the already-running dev server (port 3000): `GET /` → 200, `GET /posts/my-test` → 200. No regression on the `queries.ts`-dependent routes.

## Deviations from the plan
- Used the existing dev server on port 3000 for the manual spot-check instead of starting a new one — `npm run dev` on a scratch port detected the already-running instance and exited immediately (Next.js's own single-instance guard). Reused the running server rather than killing the user's process.
- Everything else matches the plan exactly: same three files, same guard placement (first line, no blank line, matching `admin.ts`), same verification method (scratch `"use client"` component wired into `(public)/layout.tsx`), same cleanup.

## Issues encountered
None.
