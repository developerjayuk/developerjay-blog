# PR #3 Review — feat(admin): add image upload to post editor

**Branch:** `feature/pb-0004-image-upload` → `main` · **Files:** 6 changed (+202/−3) · **Report:** `.claude/reports/pb-0004-image-upload-report.md` · **Plan:** `.claude/plans/pb-0004-image-upload.md`

## Summary

Adds a `POST /admin/posts/upload` Route Handler (the app's first — everything else is Server Actions), an `ImageUpload.tsx` Client Component, and wires both into `PostForm.tsx` to splice `![](url)` markdown into the content textarea at the cursor. Implementation closely tracks the plan; core auth, validation, and DOM-splice logic are sound.

## Validation

| Check | Result |
|---|---|
| `npm run lint` | ✅ Pass, zero warnings |
| `npx tsc --noEmit` | ✅ Pass, zero errors |
| `npm run build` | ✅ Pass — route table confirms `/admin/posts/upload` registers as `ƒ` (dynamic) |

## What's done well

- The Route Handler's auth check mirrors `layout.tsx`'s `user?.email !== getAdminEmail()` pattern exactly, and fails closed with `401`.
- Check ordering (auth → file presence → type → size) matches the plan — no Storage call happens before every guard passes.
- Filenames are server-derived (`crypto.randomUUID()` + a fixed extension map), not client input — no path-traversal or collision surface.
- Client separation is correct per `supabase-access-control.md`: `lib/supabase/server` only for the auth check, `lib/supabase/admin` only for the privileged write — never mixed, secret key never reaches the client.
- The uncontrolled-textarea DOM splice in `PostForm.tsx` is sound: no `value`/`onChange` added, so there's no React-reconciliation conflict, and `FormData` reads the live DOM value at submit — it can't drift from what's actually submitted.
- `CLAUDE.md` and `data-model.md` updates are accurate and match what was built.
- The documented deviation (307 vs. 401 on an unauthenticated curl, caused by `proxy.ts` intercepting first) is a correct, well-reasoned call — not re-flagged here.

## Issues

### High

1. **Untyped upload response — [ImageUpload.tsx:31](src/app/admin/(protected)/posts/ImageUpload.tsx#L31)**
   `const result = await res.json()` is implicitly `any`; `result.error` and `result.url` (fed straight into `onUploaded(url: string)`) are never validated or narrowed, so a server response-shape change wouldn't be caught even under `strict: true`.
   **Fix:** `type UploadResponse = { url: string } | { error: string }` and narrow the parsed JSON before use.

### Medium

2. **Undocumented CSRF-posture change — [route.ts](src/app/admin/(protected)/posts/upload/route.ts)**
   This is the app's first admin-write endpoint that isn't a Server Action. Server Actions get Next.js's automatic Origin-header CSRF check; plain Route Handlers don't, and none was added here. Every other admin mutation (`createPost`/`updatePost`/`deletePost`) is implicitly protected; this one isn't. Impact is bounded (worst case is unwanted Storage writes, not post-data tampering) and default `SameSite=Lax` session cookies likely mitigate cross-site `fetch` delivery — but it's a real posture change the plan and report are both silent on. Worth either a one-line accepted-tradeoff note (like the 307/401 deviation already gets) or a cheap `Origin`/`Sec-Fetch-Site` check.

3. **Report claims "verbatim" but `ImageUpload.tsx` diverges — [pb-0004-image-upload-report.md:27](.claude/reports/pb-0004-image-upload-report.md#L27)**
   The report states all three source files match the plan's `IMPLEMENT` blocks verbatim. `ImageUpload.tsx` doesn't: it wraps the input in a styled clickable `<label>`, hides the native input via `sr-only`, and folds "Uploading…" into the label text instead of the plan's separate `<p>`. This also introduces classes (`sr-only`, `cursor-pointer`, `cursor-not-allowed`) that appear nowhere else in the codebase, contradicting the plan's own "no new classes invented" note. The resulting UX is arguably better, but the report's accuracy claim doesn't hold for this file — worth a one-line correction so future plans can trust the report's deviation log.

### Low

4. **Swallowed Storage error — [route.ts:49-51](src/app/admin/(protected)/posts/upload/route.ts#L49-L51)** — `uploadError` is discarded with no server-side log; a real Storage failure is undiagnosable after the fact.
5. **Missing return-type annotation — [route.ts:14](src/app/admin/(protected)/posts/upload/route.ts#L14)** — `POST(request: Request)` has no explicit return type, unlike `actions.ts`'s `Promise<PostFormState>` convention.
6. **Repeated `.from(BUCKET)` — [route.ts:44,53-55](src/app/admin/(protected)/posts/upload/route.ts#L44)** — called twice; could reuse one reference.

## Recommendation

**Request changes** — no Critical blockers, and the core flow (auth, validation, filename handling, DOM splice) is solid and matches the plan. One High (type-safety hole on the fetch response) is enough to hold merge per this project's bar; the two Mediums (CSRF posture, report accuracy) are worth a short discussion/note before merge rather than a silent pass. All three Lows are optional polish.

Suggested next step: `piv-fix-review-findings` against this report, then re-run validation.
