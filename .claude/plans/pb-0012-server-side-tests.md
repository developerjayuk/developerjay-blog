# Feature: PB-0012 — Server-side tests (markdown pipeline, server actions, upload route, queries)

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Every mechanism this plan depends on was **checked with throwaway probe tests during planning** (since deleted): the `node` docblock, the `server-only` alias, React `cache()` outside a request, Shiki's real output and timing, and Node's `Request`/`FormData`/`File` behaviour. The results are in NOTES → "Probe results". Trust them over the ticket's "Known gotchas" wording where they differ. **The ticket's CI half is already done**: PB-0011 shipped `.github/workflows/ci.yml` and the CI note in CLAUDE.md, so this ticket only verifies CI and doesn't recreate it.

## Feature Description

Extend the PB-0011 Vitest suite to the **server-side** logic behind publishing and rendering posts:

- `lib/markdown/rehype-copy-button.ts` (hast transform)
- `lib/markdown/render.ts` (real `unified` + Shiki pipeline, including the "raw HTML is stripped" guarantee)
- `app/admin/(protected)/posts/actions.ts` (`createPost` / `updatePost` / `deletePost`)
- `app/admin/(protected)/posts/upload/route.ts` (Origin/CSRF check, auth re-check, file validation, Storage upload)
- `lib/posts/queries.ts` (`getPublishedPosts` / `getAllTags` / `getPublishedPostBySlug`)

The server test files run in Vitest's `node` environment via a per-file docblock, and `vitest.config.mts` aliases `server-only` to its empty module so these files can be imported.

## User Story

As the sole maintainer of this blog
I want the server-side logic behind publishing, uploading and rendering posts covered by the automated suite
So that I (and AI agents) can change actions, queries, the upload route or the markdown pipeline without silently breaking validation, cache revalidation, the upload auth/CSRF guards, or the no-raw-HTML guarantee.

## Problem Statement

PB-0011 covered pure utilities and client components only. The server-side modules have no tests, and some of them hold the most security-relevant logic in the app:

- the upload Route Handler's hand-written Origin check and auth re-check. Route Handlers don't get Server Actions' automatic Origin check, and this handler uses the RLS-bypassing admin client.
- `render.ts`'s "no `allowDangerousHtml`" config, which is what makes `MarkdownContent`'s `dangerouslySetInnerHTML` safe.
- `actions.ts`'s `revalidatePath` rules. If they're wrong, the statically rendered post pages go stale, or a deleted or unpublished post stays public.

These modules can't be imported under Vitest today. `import "server-only"` throws outside the `react-server` export condition ("This module cannot be imported from a Client Component module"), which was confirmed in planning.

## Solution Statement

1. **`server-only` alias:** in `vitest.config.mts`, add `resolve.alias["server-only"]` pointing to `node_modules/server-only/empty.js`, the same file the package serves under `react-server`. This is set once rather than mocked in every file.
2. **Environment: per-file `// @vitest-environment node` docblock** (the ticket's first option), chosen over a Vitest `projects` split. Reasons:
   - It's explicit at the top of each server test file, which is where a reader looks.
   - It needs no config restructuring or duplicated `setupFiles`/alias blocks.
   - A `projects` split would have to key on a filename rule, such as `.ts` → node and `.tsx` → jsdom, or on a directory list. That rule would be implicit and would break the first time someone writes a DOM `.ts` test.
   - The existing `vitest.setup.ts` (jest-dom matchers + RTL `cleanup`) loads fine under `node`. This was verified.
3. **Mocks at module boundaries only**, matching the PB-0011 convention:
   - Supabase: mock the `@/lib/supabase/{server,admin,public}` modules. Don't mock `next/headers` or `@supabase/*`.
   - Next.js: mock `next/cache` and `next/navigation`.
   - Everything else is real: `slugify`, `getAdminEmail` (driven by `vi.stubEnv`), `unified`/Shiki, and Node's `Request`/`FormData`/`File`/`crypto`.
4. **Document the conventions** in the CLAUDE.md and AGENTS.md Verify rule and Tests bullet.

## Out of Scope / Non-Goals

- **Not included:** GitHub Actions CI. It already exists from PB-0011 (`.github/workflows/ci.yml`, Node 24, lint → typegen + tsc → test). Only verify it runs green on this ticket's PR. Don't edit it unless it fails.
- **Not included:** async Server Components (`page.tsx`/`layout.tsx`) and `proxy.ts`. They're deferred to a possible E2E ticket.
- **Not included:** hitting a real Supabase instance, local or remote. All Supabase access is mocked.
- **Not included:** coverage reporting or thresholds, and running `npm run build` in CI.
- **Not included:** `lib/supabase/*` module tests. They're thin wrappers over `@supabase/*` constructors, and the ticket names only the five modules above.
- **Not changing:** any source file under `src/`. This ticket only **adds** tests. If a test exposes a real bug, don't fix it here: document current behaviour (or `it.todo`) and flag it in the execution report. The known `javascript:` URL issue in `render.ts` is handled this way (see Open Questions).
- **Not changing:** `vitest.config.mts`'s global options (`clearMocks`/`restoreMocks`/`unstubEnvs`/`unstubGlobals`) or the default `jsdom` environment.

## Feature Metadata

**Feature Type**: Enhancement (test coverage + test tooling config)
**Estimated Complexity**: Medium. It's mostly volume. The fiddly parts are the chainable Supabase query-builder mock and the throwing `redirect` mock.
**Primary Systems Affected**:
- `vitest.config.mts` (one alias)
- five new `*.test.ts` files under `src/`
- `CLAUDE.md`, `AGENTS.md`

**Dependencies**: none new. `server-only`, `vitest`, `unified`/Shiki and `@types/hast` are already installed.

## Related Work

**Implements**: [docs/tickets/pb-0012.md](docs/tickets/pb-0012.md)   ·   **Epic**: `docs/tickets/personal-blog-platform.md` (post-MVP hardening; no separate architecture page)

**Back-references** (plans this builds on or inherits decisions from):

- `.claude/plans/pb-0011-vitest-setup-and-frontend-tests.md`: Vitest config, `vitest.setup.ts`, the global mock-reset options, the "mock at boundaries, not child modules" rule, "tests document current behaviour", and CI (pulled forward from this ticket).
- `.claude/plans/pb-0003-admin-post-crud.md`: the `actions.ts` contract (`PostFormState`, the `23505` slug message, revalidation rules).
- `.claude/plans/pb-0004-image-upload.md`: the upload route contract (`{ url } | { error }`, 4MB limit, allowed MIME types, Origin check).
- `.claude/plans/pb-0005-public-post-pages.md`: `render.ts`, `rehype-copy-button.ts` and `queries.ts`.
- `.claude/plans/pb-0006-search-tag-filtering-architecture.md`: the `getPublishedPosts({ search, tag })` branches.

**Forward-references** (plans that extend or supersede this; append as follow-ups get created):

- (none yet). A possible follow-up is a `javascript:` URL sanitization ticket (see Open Questions).

---

## CONTEXT REFERENCES

### Relevant Codebase Files: YOU MUST READ THESE BEFORE IMPLEMENTING

- `vitest.config.mts` (whole file, 19 lines). Why: add the alias to the existing `resolve.alias` object. Note the global `clearMocks`/`restoreMocks`/`unstubEnvs`/`unstubGlobals`: no per-file teardown is needed for `vi.stubEnv`, `vi.spyOn` or call counts.
- `vitest.setup.ts`. Why: it runs for node-env files too (jest-dom + RTL `cleanup`). It's harmless there; verified.
- `src/lib/markdown/rehype-copy-button.ts` (lines 4–32). Why: the unit under test. It replaces each `pre` at `parent.children[index]` with `div.code-block[data-code-block]` → `[button[data-copy-button][aria-label="Copy code"], pre]`.
- `src/lib/markdown/render.ts` (lines 10–33). Why: the module-level `processor` (one warm Shiki instance per test file), `defaultLang: "plaintext"`, and no `allowDangerousHtml`.
- `src/app/admin/(protected)/posts/actions.ts`. Why: the unit under test.
  - `readPostFields` (34–66) validates in this order: **title → slug → status**. The invalid-status test therefore needs a valid title.
  - Exact error strings: 43, 49, 53, 80, 82, 98, 112, 114.
  - `createPost` (68–90) and `updatePost` (92–125) call `revalidatePublicPaths` **before** `redirect`.
  - `deletePost` (127–149) throws rather than returning `{ error }`, and never redirects.
- `src/app/admin/(protected)/posts/upload/route.ts`. Why: the unit under test.
  - The order of checks is the contract: Origin (18–22) → `getUser` (24–31) → file present (33–38) → MIME (40–46) → size `>` 4MB (48–50) → upload (52–61) → `getPublicUrl` (63–67).
  - Line 59 calls `console.error` on upload failure; the test spies on it.
- `src/lib/posts/queries.ts`. Why: the unit under test. The builder chains:
  - `getPublishedPosts`: `from → select → [textSearch] → [contains] → order → overrideTypes` (awaited).
  - `getAllTags`: `from → select("tags")`, and the **builder itself is awaited** (thenable).
  - `getPublishedPostBySlug`: `from → select("*") → eq → maybeSingle`.
  - `createClient` is sync but is `await`ed, which is harmless with a mocked sync return.
- `src/lib/supabase/{server,admin,public}.ts`. Why: the shapes to mock.
  - `server.createClient` is **async**.
  - `admin.createClient` and `public.createClient` are **sync**.
- `src/lib/auth/admin-email.ts` + `admin-email.test.ts`. Why: `getAdminEmail()` reads `process.env.ADMIN_EMAIL` on each call. Drive it with `vi.stubEnv("ADMIN_EMAIL", …)` as that test does; don't mock the module.
- `src/app/admin/(protected)/posts/DeleteButton.test.tsx` (lines 6–12). Why: the `vi.hoisted` + `vi.mock(path, () => obj)` pattern to mirror.
- `src/app/admin/(protected)/posts/ImageUpload.test.tsx` (lines 6–12, 34–42). Why: the `MAX` constant, the file-helper style, and the exactly-4MB boundary test to mirror server-side.
- `src/lib/posts/slugify.ts`. Why: left real in the action tests. `"!!!"` slugifies to `""`, and `"My Custom Slug!"` to `"my-custom-slug"`.

### New Files to Create

- `src/lib/markdown/rehype-copy-button.test.ts`
- `src/lib/markdown/render.test.ts`
- `src/app/admin/(protected)/posts/actions.test.ts`
- `src/app/admin/(protected)/posts/upload/route.test.ts`: safe to put here, because only `route.ts` itself is special to the App Router. PB-0011's `*.test.tsx` files already sit in `app/` and the build ignored them.
- `src/lib/posts/queries.test.ts`

### Relevant Documentation: YOU SHOULD READ THESE BEFORE IMPLEMENTING

- [Vitest: Test Environment → environment docblock](https://vitest.dev/guide/environment.html#environments-for-specific-files). The `// @vitest-environment node` comment must be at the **top of the file**.
- [Vitest: vi.mock / vi.hoisted](https://vitest.dev/api/vi.html#vi-mock). Factories are hoisted, so objects they reference must come from `vi.hoisted`.
- [Vitest: mockReset/restoreMocks semantics](https://vitest.dev/config/#restoremocks). In Vitest 3+, `restoreMocks` only restores `vi.spyOn` spies and **does not** wipe `vi.fn(impl)` implementations. The throwing `redirect` mock keeps throwing in every test (verified).
- [Supabase JS: textSearch](https://supabase.com/docs/reference/javascript/textsearch) and [contains](https://supabase.com/docs/reference/javascript/contains). Reference only; the calls are mocked.
- Bundled Next docs: `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`. It confirms async Server Components are out of Vitest's reach, which is why pages stay untested.

### Patterns to Follow

**File header (every new file):** the docblock on line 1, then explicit `vitest` imports (globals are off):

```ts
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
```

**Hoisted module mocks** (mirrors `DeleteButton.test.tsx:6-12`):

```ts
const navigation = vi.hoisted(() => ({
  // The real redirect throws NEXT_REDIRECT; mirroring that proves revalidatePath runs *before*
  // the redirect, and that nothing after it executes.
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("next/navigation", () => navigation);

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
import { createClient } from "@/lib/supabase/server"; // the mocked fn; drive with vi.mocked(...)
```

**Per-test Supabase double** (created fresh in each test or `beforeEach`; typed via `as never` to avoid restating the full `SupabaseClient` type):

```ts
function mockSupabase(error: { code?: string; message?: string } | null = null) {
  const result = { error };
  const eq = vi.fn(async () => result);
  const table = {
    insert: vi.fn(async () => result),
    update: vi.fn(() => ({ eq })),
    delete: vi.fn(() => ({ eq })),
  };
  const from = vi.fn(() => table);
  vi.mocked(createClient).mockResolvedValue({ from } as never);
  return { from, table, eq };
}
```

**Chainable query builder for `queries.ts`** (typed, no `any`; chain methods return the builder, and terminal methods plus `then` resolve the result):

```ts
type Result = { data: unknown; error: unknown };

function mockQuery(result: Result) {
  const builder = {
    select: vi.fn(),
    textSearch: vi.fn(),
    contains: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    overrideTypes: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    // getAllTags awaits the builder directly after select("tags").
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of [builder.select, builder.textSearch, builder.contains, builder.eq, builder.order]) {
    method.mockReturnValue(builder);
  }
  const from = vi.fn(() => builder);
  vi.mocked(createClient).mockReturnValue({ from } as never);
  return { from, builder };
}
```

**FormData helper for actions:** build a valid base form and let each test override fields:

```ts
function postForm(overrides: Record<string, string> = {}) {
  const fields = { title: "Hello World", slug: "", excerpt: "", content: "Body", coverImageUrl: "", tags: "", status: "draft", ...overrides };
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}
```

To test a *missing* field, as opposed to a blank one, call `formData.delete(key)`.

**Upload request helper:** use real Node `Request` + `FormData` + `File`. The `host` and `origin` headers survive `new Request` in Node 24 (verified):

```ts
const MAX = 4 * 1024 * 1024;

function image(type = "image/png", size = 16) {
  return new File([new Uint8Array(size)], "upload", { type });
}

function uploadRequest(file?: File | string, headers: Record<string, string> = { origin: "http://localhost:3000", host: "localhost:3000" }) {
  const formData = new FormData();
  if (file !== undefined) formData.set("image", file);
  return new Request("http://localhost:3000/admin/posts/upload", { method: "POST", body: formData, headers });
}
```

Use a real byte array for the size tests (`new Uint8Array(MAX + 1)`), **not** `Object.defineProperty(file, "size")` as in `ImageUpload.test.tsx`. The file is re-parsed from the multipart body by `request.formData()`, so only real bytes carry the size through (verified: a `MAX + 1` file arrives as 4194305 bytes).

**Assertion style:** behaviour first. Assert return values, status codes and JSON bodies, and assert mock calls only where the call *is* the behaviour: revalidation, redirect, the upload path, and query-builder filters. For HTML output, use `toContain` / `toMatch` / `not.toContain`. There's no DOMParser in the `node` env, so don't try to parse.

**Naming:** `describe("<exportName>")`, with `it("…")` phrased as behaviour, e.g. `it("returns 403 for a cross-origin request before looking up the session")`. Matches the existing suite.

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation (config)

Add the `server-only` alias. Nothing else in the config changes.

### Phase 2: Markdown pipeline tests

**Independent of:** Phases 3 and 4. Can run in parallel.

### Phase 3: Server action + upload route tests

**Independent of:** Phase 1. `actions.ts`/`route.ts` reach `server-only` only through `lib/supabase/*`, which these tests mock. Phases 2–4 can run in parallel once Task 1 lands.

### Phase 4: Query tests

**Depends on:** Phase 1 (`queries.ts` imports `server-only` directly).

### Phase 5: Rules + full validation

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

Branch first: `git checkout -b feature/pb-0012-server-side-tests` from an up-to-date `main`.

### Task 1: UPDATE vitest.config.mts

- **IMPLEMENT**: Add one entry to the existing `resolve.alias` object, plus a one-line comment:
  ```ts
  alias: {
    "@": fileURLToPath(new URL("./src", import.meta.url)),
    // `server-only` throws unless resolved under the `react-server` condition; point it at the
    // same empty module that condition serves so server modules can be imported in tests.
    "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
  },
  ```
- **PATTERN**: the existing `"@"` alias line in `vitest.config.mts`.
- **GOTCHA**: Don't set `resolve.conditions: ["react-server"]` instead. That would also switch `react`/`react-dom` to their server builds and break every jsdom component test. Don't change `test.environment`; it stays `jsdom`.
- **VALIDATE**: `npm test` (the existing 76 tests still pass) and `npx tsc --noEmit`.
- **SATISFIES**: Ticket "Test environment: `server-only` resolves to an empty module … set once in the config".

### Task 2: CREATE src/lib/markdown/rehype-copy-button.test.ts

- **IMPLEMENT**: Build hast trees by hand with a small helper, e.g. `function el(tagName: string, children: ElementContent[] = [], properties: Properties = {}): Element`. Run `rehypeCopyButton()(tree)` and assert on the mutated tree. Cases:
  1. **A top-level `pre` gets wrapped.** `root.children[0]` becomes a `div` with `properties` containing `"data-code-block": ""` and `className: ["code-block"]`. Its `children[0]` is a `button` with `"data-copy-button": ""`, `"aria-label": "Copy code"` and `type: "button"`, whose text child is `"Copy"`. Its `children[1]` **is the original `pre` node** (`toBe`, same reference).
  2. **Every `pre` gets wrapped:** two sibling `pre`s → two wrappers, and a `pre` nested inside a `div` → also wrapped, in place inside that `div`.
  3. **Non-`pre` elements are left alone:** a `p` and a bare `code` element (inline code) are unchanged (`toEqual` a structural clone taken before the transform).
- **IMPORTS**: `import type { Element, ElementContent, Properties, Root } from "hast";` and `import { rehypeCopyButton } from "./rehype-copy-button";`
- **GOTCHA**: The transform is a **void, in-place** mutation that returns `undefined`. Assert on `tree`, not on the return value. `@types/hast` is already a devDependency. This file needs no Shiki, but keep the `node` docblock for consistency. It's pure, so it would pass under jsdom too.
- **VALIDATE**: `npx vitest run src/lib/markdown/rehype-copy-button.test.ts`
- **SATISFIES**: Ticket "Markdown pipeline tests → `rehypeCopyButton`".

### Task 3: CREATE src/lib/markdown/render.test.ts

- **IMPLEMENT**: Use the real pipeline with no mocks. `import { renderMarkdown } from "./render";`. Cases:
  1. **GFM works:** `"| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~"` → contains `<table>`, `<td>1</td>`, `<del>gone</del>`.
  2. **A fenced block with a language is highlighted and wrapped:** `` "```ts\nconst x = 1;\n```" ``:
     - contains `data-language="ts"`, `--shiki-light:` and `--shiki-dark:`;
     - matches `/<div class="code-block" data-code-block=""><button[^>]*data-copy-button=""[^>]*aria-label="Copy code"[^>]*>Copy<\/button><pre/`, i.e. the button comes first, then the `pre`.
  3. **No language falls back to plaintext:** `` "```\nplain text\n```" `` resolves (no throw) and contains `data-language="plaintext"`, `plain text` and `data-copy-button`.
  4. **Raw HTML is stripped:** input `'hi <script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n<div onclick="evil()">d</div>'` → output does **not** contain `<script`, `<img`, `onerror`, `<div` or `onclick`.
     - Don't assert the absence of the text `alert(1)`. The *tags* are dropped, but the text between inline `<script>` tags survives as harmless escaped text (verified output: `<p>hi alert(1)</p>`).
     - Add a short comment tying this test to `MarkdownContent`'s `dangerouslySetInnerHTML`.
  5. *(Optional)* **Inline code gets no copy button:** ``"use `x` here"`` contains `<code` but not `data-copy-button`.
- **PATTERN**: the `render.ts:13-15` comment is the guarantee under test.
- **GOTCHA**:
  - Shiki's first highlight took ~215ms locally, and later ones ~2ms, well under Vitest's 5s default. **Don't** add a timeout bump up front. If it ever flakes on CI, add `{ timeout: 15_000 }` to the `describe`.
  - Don't snapshot the full HTML: Shiki colour hex values change with theme bumps.
  - Don't add a `javascript:` URL test here (see Open Questions).
- **VALIDATE**: `npx vitest run src/lib/markdown/render.test.ts`
- **SATISFIES**: Ticket "Markdown pipeline tests → `renderMarkdown`" (all four bullets).

### Task 4: CREATE src/app/admin/(protected)/posts/actions.test.ts

- **IMPLEMENT**:
  - Setup:
    - Use the hoisted mocks from Patterns: throwing `redirect`, `revalidatePath`, and `@/lib/supabase/server` → `createClient: vi.fn()`.
    - Add `mockSupabase()` and `postForm()`.
    - `import { createPost, updatePost, deletePost } from "./actions";`
  - **`describe("createPost")`:**
    1. `it.each` over the validation errors. Each returns the exact `{ error }`, and **`createClient` is not called**:
       - title missing (`formData.delete("title")`) → `"Title is required."`
       - title blank (`"   "`) → same
       - title `"!!!"` with blank slug → `"Slug is required — adjust the title or set a slug manually."`
       - valid title, `status: "archived"` → `"Invalid status."`
    2. **Parses fields.** Input `{ title: "  Hello World  ", slug: "", tags: " a, ,b ,, c ", excerpt: "   ", coverImageUrl: "  ", content: "Body" }`. Expect `table.insert` to have been called with `{ title: "Hello World", slug: "hello-world", excerpt: null, content: "Body", cover_image_url: null, tags: ["a", "b", "c"], status: "draft" }`, and `from` with `"posts"`.
    3. **Uses the explicit slug when given:** `slug: "My Custom Slug!"` → inserted `slug: "my-custom-slug"`.
    4. **Trims a non-blank excerpt and cover URL:** `"  An excerpt  "` → `"An excerpt"`.
    5. **`23505` error:** `mockSupabase({ code: "23505" })` → returns `{ error: "That slug is already in use — try a different one." }`, and no redirect.
    6. **Other insert error:** `{ code: "XX000" }` → `"Could not create the post. Please try again."`
    7. **Draft success:** `await expect(createPost(null, postForm())).rejects.toThrow("NEXT_REDIRECT")`. `navigation.redirect` was called with `"/admin/posts"`, and `revalidatePath` was **not** called.
    8. **Published success:** `revalidatePath` was called with `"/"` and `"/posts/hello-world"` (`toHaveBeenCalledTimes(2)`), then the redirect (rejects with `NEXT_REDIRECT`).
  - **`describe("updatePost")`:** the base form adds `id: "p1"`, `currentSlug: "hello-world"`, `currentStatus: "draft"`.
    1. **Missing `id`** (delete it) → `{ error: "Missing post id." }`, and `createClient` is not called. Also cover an empty-string `id`.
    2. One validation case (blank title) → `"Title is required."`. This shows the shared `readPostFields` path; don't repeat all four.
    3. **`23505`** → the slug message. **Other error** → `"Could not update the post. Please try again."`
    4. **Updates the right row:** `table.update` is called with the parsed fields, and `eq` with `("id", "p1")`.
    5. **Draft → published:** revalidates `/` + `/posts/hello-world`, then redirects.
    6. **Published → draft** (unpublish, `currentStatus: "published"`, `status: "draft"`): still revalidates both public paths. This is what takes an unpublished post off the static page.
    7. **Published with a slug change** (`currentStatus: "published"`, `currentSlug: "old-slug"`, `title: "New Title"`): revalidates `/`, `/posts/new-title` **and** `/posts/old-slug`.
    8. **Draft → draft:** `revalidatePath` is not called at all, and it still redirects.
  - **`describe("deletePost")`:** the base form is `id: "p1"`, `slug: "hello-world"`, `status: "published"`.
    1. **Missing `id`** → `rejects.toThrow("Missing post id.")`, and `createClient` is not called.
    2. **Supabase error rethrown:** `const error = { code: "XX000", message: "boom" }`, then `rejects.toBe(error)`. `revalidatePath` is not called.
    3. **Deletes the right row:** `table.delete` is called, and `eq` with `("id", "p1")`.
    4. **Published:** `revalidatePath` is called with `"/admin/posts"`, `"/"` and `"/posts/hello-world"`, and **no redirect**.
    5. **Draft:** `revalidatePath` is called **only** with `"/admin/posts"` (`toHaveBeenCalledTimes(1)`).
- **PATTERN**: `DeleteButton.test.tsx:6-12` for the `vi.hoisted` mock objects.
- **IMPORTS**: `import { createClient } from "@/lib/supabase/server";` (resolves to the mock). No need to mock `@/lib/posts/slugify`; keep it real.
- **GOTCHA**:
  - Success paths **reject**, because the mock `redirect` throws like the real one. Use `await expect(...).rejects.toThrow("NEXT_REDIRECT")`; a bare `await` would fail the test.
  - Error paths **resolve** with `{ error }`.
  - `clearMocks: true` resets call counts between tests, and the throwing implementation survives `restoreMocks` (verified).
  - `mockSupabase` must be called in every test that reaches Supabase. `vi.mocked(createClient).mockResolvedValue` persists across tests, because `restoreMocks` doesn't reset `vi.fn()` return values in Vitest 3+. The validation tests should therefore assert `not.toHaveBeenCalled()`, not rely on a missing return value.
  - `actions.ts` starts with `"use server"`. Importing it for real under Vitest is fine; it's just a directive string.
- **VALIDATE**: `npx vitest run "src/app/admin/(protected)/posts/actions.test.ts"`
- **SATISFIES**: Ticket "Server action tests" (`createPost`, `updatePost`, `deletePost` bullets).

### Task 5: CREATE src/app/admin/(protected)/posts/upload/route.test.ts

- **IMPLEMENT**:
  - Setup:
    - `vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))` and `vi.mock("@/lib/supabase/admin", () => ({ createClient: vi.fn() }))`. Import both with aliases (`createClient as createServerClient`, `createClient as createAdminClient`), mirroring `route.ts:1-2`.
    - `beforeEach`: `vi.stubEnv("ADMIN_EMAIL", "admin@example.com")`, then set up the doubles:
      ```ts
      function mockSession(user: { email?: string } | null) {
        vi.mocked(createServerClient).mockResolvedValue({
          auth: { getUser: vi.fn(async () => ({ data: { user } })) },
        } as never);
      }
      function mockBucket(uploadError: unknown = null) {
        const bucket = {
          upload: vi.fn(async () => ({ error: uploadError })),
          getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.test/post-images/${path}` } })),
        };
        const storage = { from: vi.fn(() => bucket) };
        vi.mocked(createAdminClient).mockReturnValue({ storage } as never);
        return { bucket, storage };
      }
      ```
      Default in `beforeEach`: `mockSession({ email: "admin@example.com" })` + `mockBucket()`.
    - `import { POST } from "./route";`
  - Cases, in the route's check order:
    1. **Cross-origin → 403 before any auth lookup:** headers `{ origin: "https://evil.example", host: "localhost:3000" }` → `status === 403`, the body is `{ error: "Unauthorized." }`, and **`createServerClient` is not called**.
    2. **No session → 401:** `mockSession(null)` → 401, `{ error: "Unauthorized." }`, and `createAdminClient` is not called.
    3. **Non-admin email → 401:** `mockSession({ email: "someone@else.com" })` → 401, and `createAdminClient` is not called.
    4. **Missing file → 400** `"No image file provided."`. Cover both no `image` field (`uploadRequest()`) and a string `image` value (`uploadRequest("not-a-file")`) with `it.each`.
    5. **Disallowed MIME type → 400**, `error` matching `/^Unsupported file type/`, for `image("application/pdf")`. `bucket.upload` is not called.
    6. **Over 4MB → 400** `"Image must be 4MB or smaller."` for `image("image/png", MAX + 1)`. `bucket.upload` is not called.
    7. **Exactly 4MB is allowed:** `image("image/png", MAX)` → 200. This mirrors `ImageUpload.test.tsx`'s `>` vs `>=` boundary test.
    8. **Storage error → 500** `"Upload failed. Please try again."`: `mockBucket({ message: "bucket down" })` plus `const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})`. Assert `consoleError` was called. This keeps stderr clean, as PB-0011's report required.
    9. **Success for each allowed type:** `it.each([["image/png", "png"], ["image/jpeg", "jpg"], ["image/webp", "webp"], ["image/gif", "gif"], ["image/svg+xml", "svg"]])`:
       - status 200;
       - `storage.from` called with `"post-images"`;
       - `bucket.upload` called with `(expect.stringMatching(new RegExp(`^[0-9a-f-]{36}\\.${ext}$`)), expect.any(File), { contentType: type })`;
       - the JSON body is `{ url: \`https://cdn.test/post-images/${path}\` }`, where `path` is `bucket.upload.mock.calls[0][0]`;
       - `getPublicUrl` was called with that same `path`.
    10. **Same-origin passes the Origin check:** covered by case 9's default headers, where `origin` and `host` match. No separate test is needed.
- **PATTERN**: `admin-email.test.ts` for `vi.stubEnv`; `ImageUpload.test.tsx:6` for `MAX`.
- **IMPORTS**: `import { createClient as createServerClient } from "@/lib/supabase/server";`, `import { createClient as createAdminClient } from "@/lib/supabase/admin";`, `import { POST } from "./route";`
- **GOTCHA**:
  - Use **real bytes** for size tests (see Patterns). `request.formData()` re-parses the body, so an overridden `size` property is lost.
  - Don't mock `crypto.randomUUID`; assert the UUID shape with a regex instead.
  - `unstubEnvs: true` restores `ADMIN_EMAIL` automatically.
  - Don't mock `@/lib/auth/admin-email`. The ticket says "`ADMIN_EMAIL` mocked", and `vi.stubEnv` is how that's done here, using the real allowlist check.
- **VALIDATE**: `npx vitest run "src/app/admin/(protected)/posts/upload/route.test.ts"`
- **SATISFIES**: Ticket "Upload Route Handler tests" (all seven bullets).

### Task 6: CREATE src/lib/posts/queries.test.ts

- **IMPLEMENT**:
  - Setup: `vi.mock("@/lib/supabase/public", () => ({ createClient: vi.fn() }))`, the `mockQuery()` helper from Patterns, and `import { getPublishedPosts, getAllTags, getPublishedPostBySlug } from "./queries";`.
  - **`describe("getPublishedPosts")`:**
    1. **No filters:** `mockQuery({ data: posts, error: null })`. The call returns `posts`, `from` is called with `"posts"`, `select` is called with `"id, slug, title, excerpt, cover_image_url, tags, published_at"`, and **neither `textSearch` nor `contains` is called**.
    2. **`{ search: "react hooks" }`:** `textSearch` is called with `("search_vector", "react hooks", { type: "websearch", config: "english" })`, and `contains` is not called.
    3. **`{ tag: "nextjs" }`:** `contains` is called with `("tags", ["nextjs"])`, and `textSearch` is not called.
    4. **Both filters:** both are applied.
    5. **Order:** `order` is called with `("published_at", { ascending: false })`. It can go in case 1 as an extra assertion or stand alone.
    6. **Error:** `const error = { message: "boom" }`, `mockQuery({ data: null, error })`, then `await expect(getPublishedPosts()).rejects.toBe(error)`.
  - **`describe("getAllTags")`:**
    1. **De-dupes and sorts across posts:** data `[{ tags: ["react", "css"] }, { tags: ["css", "a11y"] }, { tags: [] }]` → `["a11y", "css", "react"]`, and `select` is called with `"tags"`.
    2. **No posts** → `[]`.
    3. **Error is thrown.**
  - **`describe("getPublishedPostBySlug")`:**
    1. **Match:** returns the post, and `eq` is called with `("slug", "hello-world")`.
    2. **No match:** `{ data: null, error: null }` → `null`.
    3. **Error is thrown.**
- **PATTERN**: the Patterns → "Chainable query builder" block.
- **GOTCHA**:
  - **Don't mock `react`'s `cache`.** Outside a React Server Components request scope, `cache()` doesn't memoize: two identical calls ran the inner function twice (verified). Each test sees a fresh call.
  - Call `mockQuery` in **every** test, since the return value persists across tests.
  - `select` returns the builder, and `getAllTags` awaits that builder, which is why it's a thenable.
  - Keep the `then` signature to one parameter, so TS doesn't complain about an unused `reject`. A rejected Supabase query surfaces as `{ error }`, never as a rejection.
- **VALIDATE**: `npx vitest run src/lib/posts/queries.test.ts`
- **SATISFIES**: Ticket "Query tests" (all seven bullets).

### Task 7: UPDATE CLAUDE.md

- **IMPLEMENT**: two minimal edits. Keep them lean; the rules file steers, it doesn't document.
  1. **Verify bullet (Working principles):** after the sentence ending "…as a validation gate.", insert: `Server-side tests (Server Actions, Route Handlers, `server-only` lib modules) start with a `// @vitest-environment node` docblock; `vitest.config.mts` aliases `server-only` to its empty module so they can be imported.`
  2. **Tests bullet (Where new code goes):** append: `Server-side tests mock the `lib/supabase/*` module (not `next/headers`/`@supabase/*`) plus `next/cache`/`next/navigation`; they never hit a real Supabase.`
- **GOTCHA**: The CI note in Commands already exists (PB-0011) and is still accurate. Don't duplicate it. The ticket's wording `vitest.config.ts` is stale; the file is `.mts`.
- **VALIDATE**: `git diff CLAUDE.md` shows only these two additions.
- **SATISFIES**: Ticket "CLAUDE.md updated".

### Task 8: UPDATE AGENTS.md

- **IMPLEMENT**: apply the same Verify-bullet sentence as Task 7.1. AGENTS.md has **no** "Tests" bullet under "Where new code goes" (a known gap from the drift check), so add CLAUDE.md's full Tests bullet, including Task 7.2's addition. That brings the two files back into parity apart from the title line.
- **VALIDATE**: `diff <(tr -d '\r' < CLAUDE.md) <(tr -d '\r' < AGENTS.md)` should print only the title-line difference. CLAUDE.md is CRLF and AGENTS.md is LF, so strip `\r` before comparing, and keep each file's existing line endings.
- **SATISFIES**: keeps the Codex rules file true (the drift-check follow-up).

### Task 9: Full validation

- **IMPLEMENT**: run every Level 1–3 command below. Push the branch and open the PR (`/piv-create-pr`), then confirm the CI run is green.
- **VALIDATE**: all commands exit 0. `npm test` reports **19 files** and roughly 76 + 60 tests, all passing, with nothing on stderr.
- **SATISFIES**: AC "`npm test` passes with every module above covered", "lint and tsc pass", "CI runs green on the PR".

---

## TESTING STRATEGY

### Unit Tests

- Five new node-environment files, one per module, each next to its source.
- Real code everywhere except the three Supabase client modules and two Next.js modules.
- Error-message assertions use the **exact strings** from the source. They're user-facing, and a wording change should be deliberate.

### Integration Tests

- `render.test.ts` is effectively an integration test of the whole `unified` → Shiki → `rehypeCopyButton` → stringify pipeline. It uses no mocks, on purpose.
- The upload tests run the real `Request.formData()` multipart parse, the real `getAdminEmail` and the real `crypto.randomUUID`.
- No E2E; pages and `proxy.ts` remain out of scope.

### Edge Cases

- Title that slugifies to empty (`"!!!"`).
- Tags string full of empties and whitespace.
- Whitespace-only excerpt and cover URL become `null`.
- Unpublish, which must still revalidate.
- Slug rename on a published post, which must revalidate the old path.
- Draft delete, which must touch only `/admin/posts`.
- Upload:
  - an exactly-4MB file (allowed) and a 4MB + 1 byte file (rejected);
  - a string in the `image` field;
  - SVG, which gets the `svg` extension;
  - a cross-origin request, which must not reach the session lookup;
  - an authenticated but non-admin session, which must not reach the admin client.
- `getAllTags` with a post that has an empty `tags` array.
- `getPublishedPostBySlug` with no match (`null`, not a throw).
- Raw HTML tags (`script`, `img[onerror]`, `div[onclick]`) stripped; inline code not wrapped.

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
npm run lint
npx tsc --noEmit
```

### Level 2: Unit Tests

```bash
npx vitest run src/lib/markdown src/lib/posts/queries.test.ts "src/app/admin/(protected)/posts/actions.test.ts" "src/app/admin/(protected)/posts/upload"
npm test
```

### Level 3: Build (regression)

```bash
npm run build
```

The five test files must not show up as routes. `/` is still `ƒ` and `/posts/[slug]` is still `●`. This needs `.env.local` with live Supabase values, as in PB-0011.

### Level 4: Manual Validation

- **Mutation spot-checks** (as in PB-0011): temporarily break the source, run the matching test file, confirm it goes red, then `git checkout -- src/<file>`. Suggested breaks:
  - Remove the Origin check in `route.ts` → the 403 test fails.
  - Change `>` to `>=` in the size check → the exactly-4MB test fails.
  - Drop the `currentSlug` revalidation in `updatePost` → the slug-change test fails.
  - Add `allowDangerousHtml: true` to `remarkRehype` **and** `rehypeStringify` in `render.ts` → the raw-HTML test fails.
  - Remove the `contains` branch in `queries.ts` → the tag test fails.
- Record each mutation result in the execution report.

### Level 5: Additional Validation (Optional)

- **CI:** after `/piv-create-pr`, `gh pr checks --watch` (or view the Actions run) must be green.

---

## ACCEPTANCE CRITERIA

- [ ] `server-only` is aliased once in `vitest.config.mts`; no test file mocks `server-only`.
- [ ] All five new test files start with `// @vitest-environment node`.
- [ ] `rehypeCopyButton`: wraps every `pre` (top-level, sibling, nested) with the button first; leaves non-`pre` elements unchanged.
- [ ] `renderMarkdown`: GFM table + strikethrough; highlighted and wrapped code block; plaintext fallback; raw HTML stripped.
- [ ] `createPost` / `updatePost` / `deletePost`: every bullet in the ticket's "Server action tests" section has a test.
- [ ] Upload route: every bullet in the ticket's "Upload Route Handler tests" section has a test, plus the exactly-4MB boundary.
- [ ] `queries.ts`: every bullet in the ticket's "Query tests" section has a test.
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build` all pass; no stderr noise in the test run.
- [ ] CLAUDE.md (and AGENTS.md) Verify + Tests rules updated; AGENTS.md back in parity.
- [ ] The CI workflow runs green on this ticket's PR.
- [ ] No file under `src/` other than the five new tests is modified.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task's validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Full test suite passes
- [ ] No linting or type-checking errors
- [ ] Mutation spot-checks confirm the new tests fail when the code they cover breaks
- [ ] Acceptance criteria all met
- [ ] Execution report written to `.claude/reports/pb-0012-server-side-tests-report.md`

---

## OPEN QUESTIONS / ASSUMPTIONS

1. **`javascript:` URLs are NOT stripped by `render.ts` (found during planning). This is a real gap in the XSS guarantee.**
   - Verified output for `[x](javascript:alert(1))`, `<javascript:alert(2)>` and `![i](javascript:alert(3))`: `<a href="javascript:alert(1)">`, `<a href="javascript:alert(2)">` and `<img src="javascript:alert(3)">`. `mdast-util-to-hast` doesn't sanitize URL protocols, and there's no `rehype-sanitize` in the pipeline.
   - The practical risk is low: only the single allowlisted admin can author content. But `render.ts`'s comment and the ticket both describe the output as safe for `dangerouslySetInnerHTML`, and a clicked `javascript:` link on the public site would run script.
   - **This plan does not fix it or test it**, since this ticket adds tests only. It also doesn't write a test that locks the unsafe behaviour in.
   - **Recommendation:** a small follow-up ticket to add `rehype-sanitize`, or a protocol allowlist on `href`/`src`, **with** a test asserting the `javascript:` cases are neutralized. If you'd rather fold it into this ticket, add one task after Task 3: add sanitization to `render.ts` plus a test. That's a source change, so it breaks this plan's "tests only" boundary.
2. **Assumption:** docblock over `projects`. Rationale is in the Solution Statement. If you'd prefer the config-level split, it's a contained change to Task 1 plus removing the five docblocks.
3. **Assumption:** the ticket's CI section and "CLAUDE.md mentions CI" are already satisfied by PB-0011. Only a green run on this PR is required.
4. **Assumption:** `ADMIN_EMAIL` is driven with `vi.stubEnv` (the real `getAdminEmail`), not by mocking `@/lib/auth/admin-email`. The ticket says "mocked"; this is the stricter reading.

## NOTES (open canvas)

### Probe results (planning-time, throwaway tests since deleted)

| Question | Result |
|---|---|
| Does `import "server-only"` throw under Vitest without an alias? | **Yes**: "This module cannot be imported from a Client Component module…" |
| Alias to `node_modules/server-only/empty.js` works? | Yes; `render.ts` imports and runs. |
| `// @vitest-environment node` honoured in a full mixed run? | Yes: `typeof document === "undefined"` inside the file. **But** Vitest's summary line "jsdom was created N times" still counts every file. Don't read it as proof the docblock failed. |
| `vitest.setup.ts` (jest-dom, RTL cleanup) OK under `node`? | Yes, no errors. |
| React `cache()` memoizes outside a request? | **No**: two identical calls ran the function twice. No `react` mock needed. |
| Shiki timing | First render ~215ms, later ones ~2ms (warm module-level processor). |
| Code block with a language | `<figure data-rehype-pretty-code-figure><div class="code-block" data-code-block=""><button type="button" class="copy-code-button" data-copy-button="" aria-label="Copy code">Copy</button><pre style="--shiki-light:…;--shiki-dark:…" … data-language="ts" …>` |
| Code block without a language | Same wrapper, `data-language="plaintext"`. |
| Raw HTML | `hi <script>alert(1)</script>` + `<img onerror>` + `<div onclick>` → `<p>hi alert(1)</p>`: tags gone, inner text kept. |
| Inline code | `<span data-rehype-pretty-code-figure=""><code data-language="plaintext" …>`, with no copy button. |
| `javascript:` URLs | **Passed through** (see Open Questions 1). |
| Node `Request` with `origin`/`host` headers | Both readable via `headers.get`. |
| `request.formData()` → `File` | `instanceof File === true`, MIME type preserved (including `image/svg+xml`), real byte size preserved (4MB + 1 → 4194305). |
| A throwing `vi.fn` in a hoisted `vi.mock` factory | Still throws in later tests under `clearMocks` + `restoreMocks`; call counts reset. |
| `Response.json(body, { status })` | Available in the node env; `.status` and `.json()` work. |

### Why mock `lib/supabase/*` rather than `@supabase/supabase-js`

These wrapper modules are the project's declared seam (CLAUDE.md: "Any Supabase read/write goes through `lib/supabase/…`"). Mocking at the seam keeps the tests independent of Supabase's internal builder classes and of `next/headers`. It also means the tests break only when the app's own query shape changes, which is what they're meant to pin down. The trade-off is that a wrong column name, like `search_vector`, is only caught as "called with the wrong argument", not against a real schema. Real-database tests are explicitly out of scope.

### Why a throwing `redirect` mock

The real `redirect()` throws `NEXT_REDIRECT`, so code after it never runs. A no-op mock would let a future refactor that moves `revalidatePublicPaths` *after* `redirect` pass the tests while silently skipping revalidation in production. With a throwing mock, that bug turns the revalidation assertions red.

### Rough size

About 450 lines of tests: actions ~170, route ~120, queries ~90, render ~50, rehype-copy-button ~50. That fits the ticket's 400–500 estimate.

## AMENDMENTS

