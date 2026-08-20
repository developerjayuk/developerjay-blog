# Feature: PB-0004 — Image upload to Storage

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils, types, and clients. Import from the right files — this ticket is the first one to use `lib/supabase/admin` (the secret-key, RLS-bypassing client) from a Route Handler rather than a Server Component/Action, and the first Route Handler in the app at all. Don't reach for `lib/supabase/server` for the actual Storage write (the ticket's own text specifies the service_role client), but DO use `lib/supabase/server` for the auth check — see Patterns.

## Feature Description

An image-upload widget embedded in the post editor (`PostForm.tsx`). The admin picks a file, it's uploaded server-side to the `post-images` Storage bucket (already provisioned in PB-0001) via a new Route Handler, and on success the resulting public URL is spliced into the `content` textarea as markdown image syntax (`![](url)`) at the current cursor position. No separate media table — the URL lives only inside the post's markdown content, per the data model.

## User Story

As the sole admin (Jason)
I want to upload an image while writing a post and have it inserted as markdown automatically
So that I can illustrate a write-up without hand-managing image hosting or markdown syntax.

## Problem Statement

The `post-images` Storage bucket and its RLS policies exist (PB-0001), and the post editor exists (PB-0003), but there is no way to get an image into a post's content today except manually uploading it elsewhere and hand-writing the markdown `![]()` syntax with a URL from outside the app.

## Solution Statement

Add a `POST /admin/posts/upload` Route Handler at `src/app/admin/(protected)/posts/upload/route.ts` that reads a single `image` file from `request.formData()`, validates its type (png/jpeg/webp/gif) and size (≤4MB) server-side, uploads it to the `post-images` bucket under a random UUID filename using `lib/supabase/admin` (bypasses RLS — matches the ticket's explicit "service_role never reaches the client" boundary, since the upload itself is server-only and the secret key stays server-side), and returns its public URL as JSON. A new Client Component, `ImageUpload.tsx`, wraps a plain file `<input>`, calls that endpoint via `fetch`, and reports the resulting URL back to `PostForm.tsx` through an `onUploaded` callback. `PostForm.tsx` gets a `ref` on the (already-uncontrolled) content `<textarea>` and splices `![](url)` into its DOM value at `selectionStart`/`selectionEnd` — no need to convert the textarea to a controlled component, since directly mutating an uncontrolled textarea's `.value` is a normal, supported DOM operation and this form already submits via plain `FormData`.

**Why an explicit auth check inside the Route Handler, when every other admin write in this app relies on `proxy.ts` alone:** `(protected)/layout.tsx`'s own `auth.getUser()` redirect only wraps the **page render tree** — it does not run for Route Handlers colocated in the same route-group folder, since route groups don't nest layouts around handlers, only around pages. That leaves `proxy.ts`'s matcher (`/admin/:path*`) as the *only* automatic gate on `/admin/posts/upload`, and this route is also the first place `lib/supabase/admin` (the RLS-bypassing key) is reached from a network endpoint that isn't itself wrapped by a page layout. Mirroring `(protected)/layout.tsx`'s own belt-and-suspenders pattern — an explicit `auth.getUser()` check via `lib/supabase/server` before touching `admin.ts` — is the same defense-in-depth instinct already established in this codebase, not new scope.

## Out of Scope / Non-Goals

- **`cover_image_url`** — confirmed out of scope with the user. This ticket only inserts images into `content`; the dedicated cover-image field stays unused (per PB-0003's plan, still owned by a future ticket if ever built).
- **Full public-rendering verification** — the ticket's AC says the image should "render correctly once the post is viewed publicly," but `app/(public)/*` doesn't exist yet (that's PB-0005). This plan validates that the uploaded file is reachable at its public URL and that correct markdown syntax lands in `content`; the actual rendered-on-a-public-page check is deferred to PB-0005 and flagged in Open Questions.
- **Drag-and-drop / paste-from-clipboard** — confirmed out of scope with the user; a plain file-input button only.
- **Alt text authoring UI** — confirmed out of scope; inserted markdown always uses empty alt text (`![](url)`), hand-editable afterward in the textarea.
- **Multi-file / batch upload** — one file per upload action. Uploading a second image while editing is just triggering the widget again.
- **Image resizing/compression/orphan cleanup** — not built. An uploaded-then-abandoned image stays in Storage forever (accepted consequence of "no media table," already decided in the architecture, not reopened here).
- **Magic-byte / content-sniffing validation** — the Route Handler trusts the browser-reported `File.type` for the allow-list check (not the file's actual bytes). Acceptable for a single-admin, authenticated-only endpoint; flagged in Notes as a conscious tradeoff, not silently skipped.
- **Automated tests** — per CLAUDE.md's current default and PB-0001–0003's precedent, verified manually (dev server + browser + a direct `curl`/`fetch` check of the endpoint).

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium (first Route Handler and first `admin.ts`-from-a-non-layout-wrapped-endpoint in the app — new pattern, but small surface; no schema changes)
**Primary Systems Affected**: `src/app/admin/(protected)/posts/upload/route.ts` (new), `src/app/admin/(protected)/posts/ImageUpload.tsx` (new), `src/app/admin/(protected)/posts/PostForm.tsx` (edit)
**Dependencies**: None new — uses the Web `File`/`FormData`/`crypto.randomUUID()` APIs already available in the Node runtime, and the already-installed `@supabase/supabase-js` Storage client.

## Related Work

**Implements**: `docs/tickets/pb-0004.md`   ·   **Epic**: `docs/tickets/personal-blog-platform.md` (decisions inherited from `personal-blog-platform.prd.md`'s Architecture section — no separate architecture page)

**Back-references** (plans this builds on or inherits decisions from):

- `.claude/plans/pb-0003-admin-post-crud.md` — Why: `PostForm.tsx` is the file this ticket edits; that plan's Notes section already flagged this exact insertion point ("PostForm.tsx's content textarea is the exact insertion point PB-0004's image-upload widget will target... no changes needed here to accommodate that").
- `.claude/plans/pb-0001-project-scaffold-and-supabase-schema.md` — Why: the `post-images` Storage bucket and its RLS policies (public read; authenticated-only insert/update/delete) this ticket's Route Handler uploads into — already provisioned, no new SQL needed.
- `.claude/plans/pb-0002-admin-authentication.md` — Why: `proxy.ts` and `getAdminEmail()`, both reused directly by this ticket's Route Handler auth check.

**Forward-references** (plans that extend or supersede this — append as follow-ups get created):

- PB-0005 (public pages) is where the "image renders correctly when viewed publicly" half of this ticket's AC gets its first real end-to-end confirmation — flagged in Open Questions.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ THESE BEFORE IMPLEMENTING

- `src/app/admin/(protected)/posts/PostForm.tsx` (whole file) — Why: the file this ticket edits. Note the content `<textarea>` (lines 71-77) is **uncontrolled** (`defaultValue`, no `value`/`onChange`) — the insertion mechanism must respect that, not convert it to a controlled component.
- `src/proxy.ts` (whole file, esp. line 55 `matcher: ["/admin/:path*"]`) — Why: confirms `/admin/posts/upload` is already covered by the session+email gate before any request reaches the new Route Handler — this ticket does not need to touch `proxy.ts`.
- `src/app/admin/(protected)/layout.tsx` (whole file) — Why: the exact `auth.getUser()` + `user?.email !== getAdminEmail()` pattern the new Route Handler's own auth check mirrors — see Feature Description for why this check is necessary here specifically (Route Handlers aren't wrapped by this layout).
- `src/lib/supabase/admin.ts` (whole file) — Why: the privileged client the upload itself must use; note it's `import "server-only"` and synchronous (`createClient()`, no `await`) — do not `await` it, unlike `server.ts`.
- `src/lib/supabase/server.ts` (whole file) — Why: the client for this Route Handler's auth check; async factory (`await createClient()`), cookie-aware.
- `src/lib/auth/admin-email.ts` (whole file) — Why: `getAdminEmail()` — reused verbatim, don't re-read `process.env.ADMIN_EMAIL` directly.
- `src/app/admin/login/actions.ts` and `src/app/admin/login/login-form.tsx` (whole files) — Why: the `{error: string} | null`-shaped state and `useActionState` pattern; **not** reused directly here (a Route Handler + `fetch`, not a Server Action + `useActionState`, since file upload needs `multipart/form-data` handled as a real HTTP POST with a JSON response the client-side `fetch` can branch on), but the `{error: string}` error-shape convention **is** carried over into the Route Handler's JSON error responses for consistency with the rest of the app.
- `supabase/migrations/20260819181837_init_schema.sql` (lines 54-77) — Why: confirms the `post-images` bucket is `public: true` (so `getPublicUrl` returns a directly usable URL, no signed-URL dance needed) and that `insert`/`update`/`delete` on `storage.objects` require `auth.role() = 'authenticated'` — this is why the upload must go through a client that either carries the admin's session (RLS-respecting) or bypasses RLS entirely (the chosen `admin.ts` approach, per the ticket's explicit instruction).
- `.claude/references/data-model.md` (whole file) — Why: confirms "no separate media table... URL inserted straight into the post's markdown content" — the design constraint this whole ticket implements.
- `tsconfig.json` (lines 21-23) — Why: `@/*` → `./src/*`, used by every new import.

### New Files to Create

- `src/app/admin/(protected)/posts/upload/route.ts` — `POST` Route Handler: auth check, validate file, upload to Storage, return `{url}` or `{error}` JSON.
- `src/app/admin/(protected)/posts/ImageUpload.tsx` — Client Component: file input, calls the Route Handler, surfaces uploading/error state, reports the URL up via `onUploaded`.

### Files to Update

- `src/app/admin/(protected)/posts/PostForm.tsx` — add a `contentRef`, mount `<ImageUpload onUploaded={insertImageAtCursor} />` near the content field, implement `insertImageAtCursor`.
- `CLAUDE.md` — Architecture map: note the new `posts/upload/` Route Handler and `ImageUpload.tsx` under the admin section.
- `.claude/references/data-model.md` — no schema change, but worth a one-line note that images now flow through the app (bucket was previously provisioned but unused by any UI).

### Relevant Documentation — READ THESE BEFORE IMPLEMENTING

- [Next.js Route Handlers — Request Body FormData](https://nextjs.org/docs/app/api-reference/file-conventions/route#request-body-formdata)
  - Confirms `request.formData()` is the correct, supported way to read a multipart upload in an App Router Route Handler — no extra config (no `bodyParser` opt-out needed, that's a Pages Router API Routes concern).
- [Vercel Functions — Limitations](https://vercel.com/docs/functions/limitations)
  - Confirms the request body cap for a Vercel Function is **4.5MB**, enforced at the infrastructure level (413 `FUNCTION_PAYLOAD_TOO_LARGE` if exceeded) and not configurable from app code — this is *why* the confirmed 4MB app-level limit was chosen: it fits safely under the platform ceiling without needing a different upload path (e.g., direct browser-to-Supabase).
- [Supabase JS — Upload a file](https://supabase.com/docs/reference/javascript/v1/storage-from-upload) (interface unchanged in v2, the installed major version)
  - Confirms the call shape: `supabase.storage.from(bucket).upload(path, fileBody, { contentType, upsert })` → `{data, error}`, where `data.path` echoes back the storage path on success.
  - `getPublicUrl(path)` (same client, sibling method) returns `{ data: { publicUrl } }` synchronously (no network call, no error branch) — safe to call immediately after a successful upload.

### Patterns to Follow

**Route Handler shape (new to this codebase — first one):** Web-standard `Request`/`Response.json()`, not `NextResponse` (the codebase already imports `NextResponse` in `proxy.ts` for redirects, but `Response.json()` is sufficient and more standard for a same-origin JSON API response — no cookies/redirects needed here).

**Client factory convention, extended:** this is the first file to use **both** Supabase client modules together — `lib/supabase/server` (`await createClient()`) purely for the auth check, `lib/supabase/admin` (`createClient()`, no `await`) purely for the privileged Storage write. Keep them distinct calls; don't try to reuse one client instance for both purposes.

**Error shape consistency:** every Server Action in this app returns/surfaces `{error: string}` (see `actions.ts`, `login/actions.ts`). The new Route Handler's JSON error body follows the same shape (`{error: string}`) so `ImageUpload.tsx`'s error handling reads identically to `PostForm`'s existing `state?.error` pattern, even though the transport (fetch+JSON vs. `useActionState`) differs.

**"use client" minimal-surface pattern** (`login-form.tsx`, `DeleteButton.tsx`): `ImageUpload.tsx` is a small, self-contained Client Component; `PostForm.tsx` stays the only other Client Component touched, gaining a `ref` and one handler function — no new Client Component wraps the whole form.

**Styling vocabulary** (from `PostForm.tsx`): `rounded border px-3 py-2`, `text-sm`, `text-red-600` for errors, `text-zinc-500` for secondary/status text. `ImageUpload.tsx` reuses this vocabulary, no new classes invented.

**Never trust the client's derived value — re-derive/re-validate server-side** (`sanitize-redirect.ts`, `readPostFields` in `posts/actions.ts`): `ImageUpload.tsx` does a client-side size pre-check purely for fast UX feedback; the Route Handler re-validates type and size independently and is the actual source of truth — a direct `curl` to the endpoint bypassing the browser must still be rejected on an oversized or wrong-type file.

---

## IMPLEMENTATION PLAN

### Phase 1: Upload endpoint

<No dependency — this is the foundation the widget calls into.>

**Tasks:**

- Create the `POST /admin/posts/upload` Route Handler: auth check, file validation, Storage upload, JSON response.

### Phase 2: Upload widget

**Depends on:** Phase 1 (calls its endpoint via `fetch`).

**Tasks:**

- Create `ImageUpload.tsx`: file input, upload state, error surfacing, `onUploaded` callback.

### Phase 3: Editor integration

**Depends on:** Phase 2 (mounts the widget) and the existing `PostForm.tsx` from PB-0003.

**Tasks:**

- Add `contentRef` and `insertImageAtCursor` to `PostForm.tsx`; mount `<ImageUpload>` near the content field.

### Phase 4: Docs

**Depends on:** Phase 1-3.

**Tasks:**

- Update `CLAUDE.md`'s architecture map.

---

## STEP-BY-STEP TASKS

### Task 1: CREATE src/app/admin/(protected)/posts/upload/route.ts

- **IMPLEMENT**:
  ```typescript
  import { createClient as createServerClient } from "@/lib/supabase/server";
  import { createClient as createAdminClient } from "@/lib/supabase/admin";
  import { getAdminEmail } from "@/lib/auth/admin-email";

  const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB — stays under Vercel's ~4.5MB function body limit
  const BUCKET = "post-images";
  const ALLOWED_TYPES: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  export async function POST(request: Request) {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.email !== getAdminEmail()) {
      return Response.json({ error: "Unauthorized." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("image");

    if (!(file instanceof File)) {
      return Response.json({ error: "No image file provided." }, { status: 400 });
    }

    const extension = ALLOWED_TYPES[file.type];
    if (!extension) {
      return Response.json(
        { error: "Unsupported file type. Use PNG, JPEG, WEBP, or GIF." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return Response.json({ error: "Image must be 4MB or smaller." }, { status: 400 });
    }

    const path = `${crypto.randomUUID()}.${extension}`;
    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
    });

    if (uploadError) {
      return Response.json({ error: "Upload failed. Please try again." }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = admin.storage.from(BUCKET).getPublicUrl(path);

    return Response.json({ url: publicUrl });
  }
  ```
- **PATTERN**: auth check mirrors `src/app/admin/(protected)/layout.tsx:10-17` exactly (same `createClient()` from `server.ts`, same `user?.email !== getAdminEmail()` check) — see Feature Description for why this check belongs here despite living inside the `(protected)` folder.
- **IMPORTS**: `@/lib/supabase/server` (aliased `createServerClient`), `@/lib/supabase/admin` (aliased `createAdminClient`), `@/lib/auth/admin-email`. No `next/server` import needed — plain Web `Request`/`Response`.
- **GOTCHA #1**: `lib/supabase/admin`'s `createClient()` is **synchronous** — do not `await` it (unlike `server.ts`'s async factory). Aliasing both imports as `createServerClient`/`createAdminClient` avoids a naming collision and a copy-paste `await` mistake.
- **GOTCHA #2**: `file.type` is a browser-reported MIME string, not a verified content-sniff of the actual bytes — this validates the *stated* type only (see Out of Scope). Sufficient for a single-admin authenticated endpoint; do not add magic-byte sniffing, that's out of scope.
- **GOTCHA #3**: The random UUID filename (not the original filename) is deliberate — sidesteps needing a post ID to namespace under (new posts don't have one yet at upload time, since the post row may not be saved until after the image is already inserted into `content`) and avoids any path-traversal/collision risk from trusting the client-supplied filename.
- **GOTCHA #4**: Order of checks matters — auth check first (cheapest, most important to fail fast on), then "is it a File at all," then type, then size. Don't reorder such that an unauthenticated request could trigger a Storage call.
- **VALIDATE**: `npx tsc --noEmit`. Then, with the dev server running and logged in via the browser (so the session cookie is set), from a second terminal: `curl -i http://localhost:3000/admin/posts/upload -X POST` (no cookie) → expect `401`. A full authenticated upload is exercised via the browser in Level 4 manual validation, not curl (cookie-based session auth is awkward to replicate from curl).
- **SATISFIES**: ticket AC "Upload handled server-side... against the Storage bucket from Ticket 1" and the service_role boundary requirement.

### Task 2: CREATE src/app/admin/(protected)/posts/ImageUpload.tsx

- **IMPLEMENT**:
  ```typescript
  "use client";

  import { useState } from "react";

  const ACCEPTED_TYPES = "image/png,image/jpeg,image/webp,image/gif";
  const MAX_FILE_SIZE = 4 * 1024 * 1024;

  export function ImageUpload({ onUploaded }: { onUploaded: (url: string) => void }) {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;

      if (file.size > MAX_FILE_SIZE) {
        setError("Image must be 4MB or smaller.");
        return;
      }

      setUploading(true);
      setError(null);

      const body = new FormData();
      body.append("image", file);

      try {
        const res = await fetch("/admin/posts/upload", { method: "POST", body });
        const result = await res.json();

        if (!res.ok) {
          setError(result.error ?? "Upload failed. Please try again.");
          return;
        }

        onUploaded(result.url);
      } catch {
        setError("Upload failed. Please try again.");
      } finally {
        setUploading(false);
      }
    }

    return (
      <div className="flex flex-col gap-1">
        <label htmlFor="image-upload" className="text-sm">
          Insert image
        </label>
        <input
          type="file"
          id="image-upload"
          accept={ACCEPTED_TYPES}
          disabled={uploading}
          onChange={handleChange}
          className="text-sm"
        />
        {uploading && <p className="text-sm text-zinc-500">Uploading…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }
  ```
- **PATTERN**: styling vocabulary from `PostForm.tsx` (`text-sm`, `text-red-600`); `useState` for local async status, same primitive `login-form.tsx` and `PostForm.tsx` already use, no new state library.
- **IMPORTS**: `react` (`useState`) only.
- **GOTCHA #1**: `e.target.value = ""` immediately after reading the file is required — without it, selecting the *same* file twice in a row (e.g., after fixing an error) doesn't fire a second `onChange` event, since the input's value hasn't changed.
- **GOTCHA #2**: the client-side size check is a fast-feedback nicety only — the type isn't pre-checked client-side beyond the `accept` attribute (which is a UI filter, not enforcement; a user can still pick "all files" in some OS file pickers). The Route Handler's server-side check is the actual enforcement, per "never trust the client" — don't be tempted to skip the server check because this exists.
- **GOTCHA #3**: `onUploaded` is called with the raw `result.url` from the Route Handler's JSON body — no client-side URL construction, avoids any drift between the Storage bucket's actual public-URL format and a hand-built one.
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: ticket AC "Image upload widget embedded in the post editor."

### Task 3: UPDATE src/app/admin/(protected)/posts/PostForm.tsx

- **IMPLEMENT**: Add the ref, the insertion handler, and mount the widget. Diff against the current file:
  ```typescript
  "use client";

  import { useActionState, useRef, useState } from "react";
  import { createPost, updatePost, type PostFormState } from "./actions";
  import { ImageUpload } from "./ImageUpload";
  import { slugify } from "@/lib/posts/slugify";
  import type { Post } from "@/lib/posts/types";

  type PostFormProps = { mode: "create"; post?: undefined } | { mode: "edit"; post: Post };

  export function PostForm({ mode, post }: PostFormProps) {
    const action = mode === "create" ? createPost : updatePost;
    const [state, formAction, pending] = useActionState<PostFormState, FormData>(action, null);
    const [slug, setSlug] = useState(post?.slug ?? "");
    const [slugTouched, setSlugTouched] = useState(mode === "edit");
    const contentRef = useRef<HTMLTextAreaElement>(null);

    function insertImageAtCursor(url: string) {
      const textarea = contentRef.current;
      if (!textarea) return;

      const markdown = `![](${url})`;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.slice(0, start) + markdown + textarea.value.slice(end);

      const cursor = start + markdown.length;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    }

    return (
      <form action={formAction} className="flex flex-col gap-4 max-w-2xl">
        {/* ...unchanged hidden fields, title, slug, excerpt... */}

        <label htmlFor="content" className="text-sm">
          Content (Markdown)
        </label>
        <ImageUpload onUploaded={insertImageAtCursor} />
        <textarea
          ref={contentRef}
          id="content"
          name="content"
          rows={16}
          defaultValue={post?.content}
          className="rounded border px-3 py-2 font-mono text-sm"
        />

        {/* ...unchanged tags, status, error, submit button... */}
      </form>
    );
  }
  ```
- **PATTERN**: this is an additive edit — every other field, the `state?.error` block, and the submit button stay byte-for-byte identical to the current file (`src/app/admin/(protected)/posts/PostForm.tsx`).
- **IMPORTS**: add `useRef` to the existing `react` import, add `ImageUpload` from `./ImageUpload`.
- **GOTCHA #1**: the `content` textarea stays **uncontrolled** — do not add a `value`/`onChange` pair to it as part of this change. `insertImageAtCursor` mutates `textarea.value` directly via the DOM ref, which is a fully supported operation on an uncontrolled field and is picked up correctly by the surrounding `<form>`'s `FormData` on submit.
- **GOTCHA #2**: `textarea.selectionStart`/`selectionEnd` reflect the *actual* last cursor/selection state of the DOM node, which defaults to `0` if the textarea has never been focused (e.g., clicking "Insert image" immediately after the page loads, without ever clicking into the content field first). In that case the image markdown is inserted at the very start of existing content — this is the literal, correct behavior of "insert at the cursor" when no cursor position has ever been established, not a bug; flagged in Open Questions as a UX nicety worth revisiting later, not fixed here.
- **GOTCHA #3**: `insertImageAtCursor` is defined inline in the component (not extracted to a util) since it's a one-call-site DOM manipulation tightly coupled to this specific ref — no reuse elsewhere in the codebase to justify extraction.
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: ticket AC "the resulting public URL is inserted as markdown image syntax into the content field at the cursor."

### Task 4: UPDATE CLAUDE.md

- **IMPLEMENT**: In the Architecture map's `admin/(protected)/posts/` bullet, add a line noting the new `upload/` Route Handler and `ImageUpload.tsx`, and note this is the first Route Handler in the app (as opposed to Server Actions) plus the first place `lib/supabase/admin` is used outside a page/action already wrapped by the `(protected)` layout — mirroring how PB-0003 documented its own new `lib/posts/` module.
- **VALIDATE**: Read-through only.
- **SATISFIES**: keeps the architecture map accurate, per project convention.

---

## TESTING STRATEGY

Per the confirmed decision (consistent with PB-0001-0003), no automated tests — validation is `next build` + `npm run lint` + `tsc --noEmit` + manual browser verification, plus one unauthenticated `curl` check of the new endpoint.

### Unit Tests

None.

### Integration Tests

None automated. The manual flow below is the integration check.

### Edge Cases (covered by manual validation below)

- Uploading a valid PNG/JPEG/WEBP/GIF under 4MB → markdown appears at the cursor, image loads when the resulting URL is opened directly in a new tab.
- Uploading a file over 4MB → client-side error shown immediately, no network request needed (verify via browser devtools Network tab that no request fires).
- Uploading a non-image file (e.g. a `.pdf` renamed to bypass the `accept` filter, or picked via "All Files") → server-side rejects with the "Unsupported file type" error.
- Selecting the same file twice in a row (e.g. after correcting a different error) → second selection still triggers a fresh upload attempt (verifies the `e.target.value = ""` reset).
- Uploading with the content textarea never focused → markdown lands at the very start of existing content (documented expected behavior, not a bug — see Task 3 GOTCHA #2).
- Uploading with the cursor placed mid-content → markdown splices in exactly at that position, text after the cursor is preserved intact.
- Unauthenticated `POST` to `/admin/posts/upload` (no session cookie) → `401`, no Storage write attempted.

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
npm run dev
```

Then, logged in as the allowlisted admin (as with PB-0002/PB-0003, the implementing agent should get as far as possible with `agent-browser` and defer the logged-in portion to the user if credentials aren't available in-session):

1. Open `/admin/posts/new`, scroll to Content — confirm the "Insert image" file input renders above the textarea.
2. Click into the content textarea, place the cursor mid-way through some typed text, then upload a small PNG → confirm `![](https://...)` is spliced in exactly at that cursor position, and the rest of the typed text is intact before/after it.
3. Open the inserted URL directly in a new browser tab → confirm the image loads (proves the bucket's public-read policy + the returned `getPublicUrl` value are both correct).
4. Attempt to upload a file over 4MB → confirm the inline error appears without a network request firing (check devtools Network tab).
5. Save the post as a draft, reopen it via `/admin/posts/[id]/edit` → confirm the markdown (including the image syntax) round-trips correctly through `content`.
6. From a terminal, `curl -i http://localhost:3000/admin/posts/upload -X POST` (no session cookie) → expect `401 Unauthorized` in the response, confirming the Route Handler's own auth check works independently of `proxy.ts`.
7. Confirm `npm run build`'s route table lists `/admin/posts/upload` as a Route Handler (ƒ, dynamic), alongside the existing `/admin/posts/*` routes.

### Level 5: Additional Validation (Optional)

- Supabase Dashboard → Storage → `post-images` bucket: confirm the uploaded file appears with a random-UUID name and the correct content-type.

---

## ACCEPTANCE CRITERIA

- [ ] AC1: An "Insert image" file-input widget is embedded in `PostForm.tsx`, visible in both create and edit mode.
- [ ] AC2: Selecting a valid image (PNG/JPEG/WEBP/GIF, ≤4MB) uploads it server-side via `POST /admin/posts/upload`, which uses `lib/supabase/admin` (service_role) for the actual Storage write and never exposes the secret key to the client.
- [ ] AC3: An oversized file or unsupported type is rejected — client-side for size (fast feedback), server-side for both size and type (actual enforcement); a direct unauthenticated request to the endpoint is rejected with `401`.
- [ ] AC4: On successful upload, `![](url)` markdown is inserted into the content textarea at the current cursor position, and existing content before/after the cursor is preserved unchanged.
- [ ] AC5: The uploaded image's public URL is directly reachable (loads when opened in a new browser tab) — full "renders correctly on the public post page" confirmation is deferred to PB-0005 per Open Questions.
- [ ] `npm run build`, `npm run lint`, and `npx tsc --noEmit` all pass with zero errors.
- [ ] CLAUDE.md reflects the new Route Handler and `ImageUpload.tsx`.

---

## COMPLETION CHECKLIST

- [ ] All 4 tasks completed in order
- [ ] Each task's validation command passed immediately after that task
- [ ] `npm run build`, `npm run lint`, `npx tsc --noEmit` all pass
- [ ] Full manual flow (Level 4, steps 1-7) confirmed in a real browser, or explicitly handed off to the user for the logged-in portion
- [ ] Acceptance criteria all met
- [ ] CLAUDE.md updated to match reality

---

## OPEN QUESTIONS / ASSUMPTIONS

- **Full public-rendering confirmation is blocked on PB-0005.** The ticket's own AC text ("image renders correctly once the post is viewed publicly") can't be fully exercised yet since `app/(public)/*` doesn't exist. This plan validates the URL is publicly reachable and the markdown is syntactically correct; re-run the full AC once PB-0005 ships a real public post page.
- **Cursor-at-position-0 fallback when the textarea was never focused** (Task 3, GOTCHA #2) — accepted as correct-per-spec behavior rather than a bug worth extra guard logic. If this turns out to annoy real usage (e.g., always wanting "append to end" as the fallback instead), it's a small, contained follow-up change to `insertImageAtCursor`.
- **No magic-byte content-sniffing** — the Route Handler trusts the browser-reported `File.type`. Accepted for a single-admin authenticated tool; would need revisiting if this endpoint were ever exposed beyond the allowlisted admin.
- **Random-UUID filenames, no post-scoped folder structure** — chosen because a new post has no `id` yet at upload time (image uploads can happen before the post is first saved). If a future ticket wants per-post-scoped storage organization (e.g. for bulk cleanup), this naming scheme would need to change.
- **No orphaned-image cleanup** — direct, accepted consequence of "no media table" (PB-0001's data-model decision, not reopened here).

## NOTES (open canvas)

**Why a Route Handler + `fetch`, not a Server Action, for the upload itself?** Every other write in this app so far is a Server Action bound via `useActionState` or a plain `<form action={...}>`. File upload doesn't fit that shape as cleanly: Server Actions *can* accept `FormData` with a `File` entry, but the calling code here specifically wants (a) a JSON response the widget can branch on independently of the surrounding `PostForm`'s own `useActionState` cycle (uploading an image must not trigger `PostForm`'s pending/submit state), and (b) the ticket's own text explicitly says "Upload handled server-side (Route Handler using the service_role client...)" — so this was already the specified shape, not a new deviation.

**Why does the Route Handler duplicate the `(protected)/layout.tsx` auth check instead of relying on `proxy.ts` alone?** Covered in depth in Feature Description — short version: Route Handlers aren't wrapped by route-group layouts, so `proxy.ts`'s middleware matcher is otherwise the *only* gate, and this is the first time the RLS-bypassing `admin.ts` client is reachable from something that isn't already double-gated by a layout. This is the same defense-in-depth instinct the codebase already applies (`layout.tsx` re-checks even though `proxy.ts` already checked), extended to a new kind of endpoint.

**Confidence score: 9/10.** The pattern space here is small and every piece (Route Handler shape, Supabase Storage upload/getPublicUrl calls, uncontrolled-textarea DOM manipulation, Vercel's body-size ceiling) is independently well-documented and low-risk. The one point of genuine novelty for this codebase — the Route Handler itself — has no local precedent to mirror, which is the main reason this isn't a 10.

## AMENDMENTS

(none yet)
