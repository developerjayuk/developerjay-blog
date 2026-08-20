# Implementation Report — PB-0004 Image upload to Storage

**Plan**: `.claude/plans/pb-0004-image-upload.md`   **Branch**: `feature/pb-0004-image-upload`   **Status**: PARTIAL (logged-in browser flow deferred to user)

## Summary
Added a `POST /admin/posts/upload` Route Handler that validates and uploads an image to the `post-images` Storage bucket via the service_role client, a small `ImageUpload` Client Component that calls it, and wired `PostForm.tsx` to splice the returned URL into the content textarea as `![](url)` at the cursor position via an uncontrolled-textarea DOM ref. Implemented exactly per plan with no code deviations.

## Tasks completed
- Task 1: CREATE upload Route Handler → `src/app/admin/(protected)/posts/upload/route.ts` (CREATE)
- Task 2: CREATE upload widget → `src/app/admin/(protected)/posts/ImageUpload.tsx` (CREATE)
- Task 3: UPDATE editor integration → `src/app/admin/(protected)/posts/PostForm.tsx` (UPDATE — added `contentRef`, `insertImageAtCursor`, mounted `<ImageUpload>`)
- Task 4: UPDATE docs → `CLAUDE.md` (UPDATE, architecture map) and `.claude/references/data-model.md` (UPDATE, one-line note that the flow is now live)

## Tests added
None — per plan, this project has no automated test suite yet; validation is lint/typecheck/build + manual.

## Validation results
- `npm run lint` — pass, zero warnings/errors.
- `npx tsc --noEmit` — pass, zero errors.
- `npm run build` — pass. Route table confirms `/admin/posts/upload` as `ƒ` (dynamic), alongside the existing `/admin/posts/*` routes, as required by Level 4 step 7.
- Level 4 manual validation (dev server + browser): **partially completed** — see below.

## Deviations from the plan

- **Unauthenticated curl check returns `307` (redirect to `/admin/login`), not `401`.** The plan's Task 1 VALIDATE step and Level 4 step 6 expected `curl -i http://localhost:3000/admin/posts/upload -X POST` (no cookie) to return `401` from the Route Handler's own auth check. In practice, `proxy.ts`'s matcher (`/admin/:path*`) intercepts the request *before* it reaches the Route Handler and issues its own `307` redirect to `/admin/login?redirect=...` — confirmed with `curl -i` and `curl -i -L` (which follows through to a real `200` login page). This means the Route Handler's own `auth.getUser()` check is not independently observable via a plain unauthenticated request; it only fires in scenarios where `proxy.ts`'s gate is somehow bypassed or misconfigured (still legitimate defense-in-depth, matching the plan's own stated rationale — Route Handlers aren't wrapped by the `(protected)` layout, and `admin.ts` is otherwise reachable through only one gate). The code is unchanged from the plan; only the *expected observable status code* in the manual-validation script was wrong. No fix needed — flagging this so the reviewer doesn't read a `307` as a bug.

No other deviations — all three source files match the plan's `IMPLEMENT` blocks verbatim (aliasing, ordering, gotcha handling, styling vocabulary) and both doc updates are additive one-liners per Task 4's instructions.

## Issues encountered

- **Logged-in manual verification (Level 4 steps 1–5, and Level 5) is deferred to the user.** No admin password is available in this session — `.env.local` has `ADMIN_EMAIL` but no credential a browser session could use to authenticate, and per the plan's own guidance ("...defer the logged-in portion to the user if credentials aren't available in-session"), this was handed off rather than worked around. What *was* confirmed in this session:
  - Dev server boots cleanly (`npm run dev`, `200` on `/`).
  - `/admin/posts/upload` is gated for unauthenticated requests (redirected to login, per the deviation note above).
  - Build's route table lists the new handler correctly.

  **Still needed from the user** (dev server is left running at `http://localhost:3000`):
  1. Log in as the allowlisted admin, open `/admin/posts/new`, confirm "Insert image" renders above the content textarea.
  Confirmed
  2. Place cursor mid-content, upload a small PNG, confirm `![](https://...)` lands exactly at the cursor and surrounding text is intact.
  Confirmed
  3. Open the returned URL in a new tab, confirm the image loads.
  Confirmed
  4. Try a >4MB file, confirm the client-side error fires with no network request.
  Confirmed
  5. Save as draft, reopen via edit, confirm the markdown round-trips through `content`.
  Confirmed
  6. (Optional) Supabase Dashboard → Storage → `post-images` — confirm the uploaded file has a random-UUID name and correct content-type.
  Confirmed