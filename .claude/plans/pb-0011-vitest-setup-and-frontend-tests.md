# Feature: PB-0011 — Vitest setup + unit/component tests for lib utilities and client components

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to the **dependency install step (Task 1)**: Vitest 5 won't install next to the repo's current `@types/node@^20`, so `@types/node` must be bumped in the same install command. This was verified with `npm install --dry-run` during planning. Also note which modules are **mocked** (`next/navigation`, `next-themes`, `./actions`) and which are **left real** (`next/link`, `next/image`, `remixicon-react`, child components like `Listbox`/`ImageUpload` inside `PostForm`). Both lists were checked against the installed packages and are deliberate.

## Feature Description

Add the repo's first automated test suite: Vitest 5 + React Testing Library + jsdom, with test files next to their source. It covers:

- the four pure `lib/` utilities (`slugify`, `sanitizeRedirect`, `isSvgUrl`, `getAdminEmail`);
- the ten synchronous/client components (`SearchBar`, `TagFilter`, `TagList`, `PostCard`, `MarkdownContent`, `Listbox`, `DeleteButton`, `PostForm`, `ImageUpload`, `ThemeToggle`).

It adds `npm test` / `npm run test:watch`, and changes the CLAUDE.md (and AGENTS.md) "Verify" working principle from "no tests yet" to "new logic comes with tests".

## User Story

As the sole maintainer of this blog
I want a fast, repeatable automated test suite covering the app's pure logic and interactive UI
So that I can change code (and let AI agents change code) with confidence that search, tag filtering, post editing, image upload and the redirect guard still work, without manually clicking through every flow.

## Problem Statement

The repo has zero tests. [CLAUDE.md](CLAUDE.md) currently says: "No test suite yet — a manual check … is enough for now. Don't add tests speculatively; revisit test coverage once the prototype is stable, not before." The MVP (PB-0001–PB-0010) has shipped, so that condition is now met. Regressions are only caught by hand today, including in security-relevant logic like `sanitizeRedirect` (the open-redirect guard) and `getAdminEmail` (which throws so an unset env var can't let everyone through).

## Solution Statement

Follow the official Next.js Vitest guide (bundled at `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`) with three repo-specific adjustments:

1. Use the `resolve.alias` `@` → `./src` alias instead of `vite-tsconfig-paths`. It's one line and adds no extra dependency.
2. Use a `vitest.setup.ts` that registers the jest-dom matchers and runs RTL `cleanup`. Globals are **not** enabled, so every test explicitly imports `describe/it/expect/vi` from `vitest`. That keeps `tsc` and ESLint happy without extra type wiring.
3. Turn on `clearMocks` / `restoreMocks` / `unstubEnvs` / `unstubGlobals` in the config, so stubs of `window.confirm`, `fetch`, `navigator.clipboard` and `ADMIN_EMAIL` never leak between tests.

Test files sit next to their source as `<name>.test.ts(x)`. That's safe inside `app/`, because only special filenames (`page`, `layout`, `route`, …) become routes.

## Out of Scope / Non-Goals

- **Not included:** tests for `renderMarkdown`/`rehypeCopyButton`, the server actions (`actions.ts`), the upload Route Handler, `queries.ts`, and GitHub Actions CI. All of that is **PB-0012**.
- **Not included:** async Server Components (`page.tsx`/`layout.tsx`) and `proxy.ts`. The Next.js docs say Vitest doesn't support async Server Components; they're deferred to a possible future E2E ticket. No Playwright or E2E tooling is added.
- **Not included:** coverage reporting (`@vitest/coverage-v8`) or thresholds.
- **Not included:** `server-only` aliasing in `vitest.config.ts`. Nothing in this ticket's test graph imports a `server-only` module once `./actions` is mocked, so that belongs to PB-0012, which tests `render.ts`/`queries.ts`.
- **Not changing:** any source file under `src/`. This ticket only **adds** test files. If a test exposes a real bug, **don't fix it here**: write the test to document current behaviour (or `it.todo`) and flag it in the execution report.
- **Not changing:** other drift in AGENTS.md (it's a stale mirror of CLAUDE.md, e.g. no `public.ts` mention). Only its Verify + Commands sections get updated.

## Feature Metadata

**Feature Type**: New Capability (developer tooling + test suite)
**Estimated Complexity**: Medium (mostly volume. The fiddly parts are React 19 form actions under jsdom, the `SearchBar` debounce with fake timers, and the `Listbox` keyboard/focus behaviour)
**Primary Systems Affected**:
- `package.json`
- new `vitest.config.ts` + `vitest.setup.ts`
- 14 new `*.test.ts(x)` files under `src/`
- `CLAUDE.md`, `AGENTS.md`

**Dependencies (dev only)**:
- `vitest@^5`
- `@vitejs/plugin-react@^6`, which pulls in `vite@^8` as a peer; npm 11 auto-installs it
- `jsdom@^30`
- `@testing-library/react@^16`
- `@testing-library/dom@^10`
- `@testing-library/user-event@^14`
- `@testing-library/jest-dom@^7`
- `@types/node` bumped `^20` → `^24`

## Related Work

**Implements**: [docs/tickets/pb-0011.md](docs/tickets/pb-0011.md)   ·   **Epic**: `docs/tickets/personal-blog-platform.md` (post-MVP hardening; no separate architecture page)

**Back-references** (plans this builds on or inherits decisions from):

- `.claude/plans/pb-0003-admin-post-crud.md`: `PostForm`, `DeleteButton` and the `actions.ts` contract (`PostFormState`) the component tests exercise.
- `.claude/plans/pb-0004-image-upload.md`: the `ImageUpload` → `/admin/posts/upload` fetch contract (`{ url } | { error }`, 4MB limit).
- `.claude/plans/pb-0006-search-tag-filtering-architecture.md`: the `SearchBar` debounce/URL-sync and `TagFilter` toggle behaviour under test.
- `.claude/plans/pb-0002-admin-authentication.md`: `sanitizeRedirect` and `getAdminEmail`, the security helpers under test.

**Forward-references** (plans that extend or supersede this; append as follow-ups get created):

- `docs/tickets/pb-0012.md` → plan `.claude/plans/pb-0012-server-side-tests.md` (CI was pulled forward into this ticket; PB-0012 now covers the server-side tests + `server-only` alias): extends this Vitest config with a `node` environment for server tests, a `server-only` alias, and GitHub Actions CI. **CI must use Node ≥ 22.22 / 24.15**, because Vitest 5 and jsdom 30 require it (see NOTES).

---

## CONTEXT REFERENCES

### Relevant Codebase Files: YOU MUST READ THESE BEFORE IMPLEMENTING

The file under test for each test file (read each one in full before writing its test):

- [src/lib/posts/slugify.ts](src/lib/posts/slugify.ts) (lines 1-7): lowercase → trim → `[^a-z0-9]+` → `-` → strip leading/trailing `-`.
- [src/lib/auth/sanitize-redirect.ts](src/lib/auth/sanitize-redirect.ts) (lines 1-7): fallback `/admin/posts`. It rejects falsy values, anything not starting with `/`, `//…` and `/\…`.
- [src/lib/posts/cover-image.ts](src/lib/posts/cover-image.ts) (lines 1-9): `new URL(url).pathname.toLowerCase().endsWith(".svg")`, `catch → false`. **Relative URLs (`/a.svg`) throw in `new URL`, so they return `false`.** That's current behaviour; test it as such.
- [src/lib/auth/admin-email.ts](src/lib/auth/admin-email.ts) (lines 1-8): throws `"ADMIN_EMAIL environment variable is not set"` when `process.env.ADMIN_EMAIL` is falsy.
- [src/app/(public)/SearchBar.tsx](src/app/(public)/SearchBar.tsx) (lines 1-57):
  - `DEBOUNCE_MS = 300`;
  - resync-from-URL during render (lines 17-20);
  - `searchParamsRef` so the debounced call reads the latest params (lines 25-28);
  - `router.replace(\`${pathname}?${params.toString()}\`)` (line 40), so **clearing produces `"/?"` exactly** when no other params exist.
- [src/app/(public)/TagFilter.tsx](src/app/(public)/TagFilter.tsx) (lines 1-44):
  - returns `null` for no tags;
  - toggles `tag` via `router.replace`;
  - `aria-pressed={activeTag === tag}`.
- [src/app/(public)/TagList.tsx](src/app/(public)/TagList.tsx) (lines 1-15): a plain `<ul>/<li>` list; `null` when empty.
- [src/app/(public)/PostCard.tsx](src/app/(public)/PostCard.tsx) (lines 1-36):
  - uses real `next/link` + `next/image`;
  - `dark:invert` only when `isSvgUrl`;
  - date formatted `toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })`.
- [src/app/(public)/MarkdownContent.tsx](src/app/(public)/MarkdownContent.tsx) (lines 1-36):
  - delegated click → `closest("[data-copy-button]")` → `closest("[data-code-block]")?.querySelector("code")` → `navigator.clipboard.writeText(...)`;
  - then swaps `innerHTML` and sets `aria-label="Copied"`, and resets after 4000ms.
- [src/app/admin/(protected)/posts/Listbox.tsx](src/app/admin/(protected)/posts/Listbox.tsx) (lines 1-145):
  - hidden `<input name={name}>`;
  - button `aria-expanded`;
  - a `useEffect` focuses the `<ul role="listbox">` on open (line 37);
  - keyboard handling is on the **list** (lines 64-96);
  - outside-click listens for **`mousedown`** on `document` (line 44).
- [src/app/admin/(protected)/posts/DeleteButton.tsx](src/app/admin/(protected)/posts/DeleteButton.tsx) (lines 1-31): `<form action={deletePost}>` with `onSubmit` calling `e.preventDefault()` when `confirm(...)` is false, plus hidden `id`/`slug`/`status`.
- [src/app/admin/(protected)/posts/PostForm.tsx](src/app/admin/(protected)/posts/PostForm.tsx) (lines 1-156):
  - `useActionState(createPost|updatePost)`;
  - slug auto-fill until touched (lines 15-16, 52-54, 66-69);
  - edit-mode hidden inputs (lines 36-42);
  - error `<p>` (line 131);
  - Cancel `Link` with `confirm` (lines 137-150).
  - Labels: "Title", "Slug", "Excerpt", "Cover image URL", "Content (Markdown)", "Tags (comma-separated)", "Status". Submit button: "Create post" / "Save changes".
- [src/app/admin/(protected)/posts/ImageUpload.tsx](src/app/admin/(protected)/posts/ImageUpload.tsx) (lines 1-69):
  - `MAX_FILE_SIZE = 4 * 1024 * 1024` and `size > MAX` rejects;
  - `fetch("/admin/posts/upload", { method: "POST", body })`;
  - uses `res.ok` and `res.json()`;
  - error messages "Image must be 4MB or smaller." and "Upload failed. Please try again.";
  - file input labelled "Insert image".
- [src/lib/theme/theme-toggle.tsx](src/lib/theme/theme-toggle.tsx) (lines 1-42):
  - `useTheme()` from `next-themes`;
  - the `useSyncExternalStore` mounted guard returns `true` on client render, so RTL gets the real button;
  - `setTheme(resolvedTheme === "dark" ? "light" : "dark")`.
- [src/app/admin/(protected)/posts/actions.ts](src/app/admin/(protected)/posts/actions.ts) (lines 1-9): `"use server"` + `PostFormState` type. It imports `lib/supabase/server`, which imports `server-only` + `next/headers`. **That's why `./actions` must be `vi.mock`ed in the `PostForm` and `DeleteButton` tests.**
- [src/lib/posts/types.ts](src/lib/posts/types.ts) (lines 1-17): the `Post` / `PostListItem` shapes for test fixtures.

Config and docs:

- [tsconfig.json](tsconfig.json) (lines 25-37): `paths: { "@/*": ["./src/*"] }`. `include` covers `**/*.ts`/`**/*.tsx`, so **test files and `vitest.config.ts` are type-checked by `tsc` and by `next build`**.
- [eslint.config.mjs](eslint.config.mjs): `next/core-web-vitals` + `next/typescript`. These apply to test files too.
- [package.json](package.json) (lines 5-10): the scripts block to extend.
- [CLAUDE.md](CLAUDE.md), sections "Working principles → Verify" and "Commands": the text to rewrite.
- [AGENTS.md](AGENTS.md): the same two sections, for the Codex mirror.
- [.claude/references/frontend-component-best-practices.md](.claude/references/frontend-component-best-practices.md) (lines 37-42): the house testing rules. Test behaviour via `getByRole`/`getByLabelText`; mock only external dependencies, **not internal child components**; one test file per component.

### New Files to Create

- `vitest.config.ts`: Vitest config (jsdom, React plugin, `@` alias, setup file, mock hygiene).
- `vitest.setup.ts`: jest-dom matchers + RTL `cleanup`.
- `src/lib/posts/slugify.test.ts`
- `src/lib/auth/sanitize-redirect.test.ts`
- `src/lib/posts/cover-image.test.ts`
- `src/lib/auth/admin-email.test.ts`
- `src/app/(public)/SearchBar.test.tsx`
- `src/app/(public)/TagFilter.test.tsx`
- `src/app/(public)/TagList.test.tsx`
- `src/app/(public)/PostCard.test.tsx`
- `src/app/(public)/MarkdownContent.test.tsx`
- `src/app/admin/(protected)/posts/Listbox.test.tsx`
- `src/app/admin/(protected)/posts/DeleteButton.test.tsx`
- `src/app/admin/(protected)/posts/PostForm.test.tsx`
- `src/app/admin/(protected)/posts/ImageUpload.test.tsx`
- `src/lib/theme/theme-toggle.test.tsx`

### Relevant Documentation: YOU SHOULD READ THESE BEFORE IMPLEMENTING

- `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md` (local, matches the installed Next 16.3.1)
  - "Manual Setup" section: the canonical dependency list + `vitest.config.mts` shape.
  - Why: the official baseline. Its note that async Server Components aren't supported justifies the scope boundary.
- [Vitest: Mocking modules](https://vitest.dev/guide/mocking/modules)
  - `vi.mock` hoisting + `vi.hoisted`.
  - Why: every component test mocks `next/navigation`/`next-themes`/`./actions`. A mock factory can't reference top-level `const`s without `vi.hoisted`.
- [Vitest: Fake timers](https://vitest.dev/api/vi.html#vi-usefaketimers)
  - `vi.useFakeTimers`, `vi.advanceTimersByTime`.
  - Why: the `SearchBar` 300ms debounce.
- [Vitest config: clearMocks / restoreMocks / unstubEnvs / unstubGlobals](https://vitest.dev/config/#restoremocks)
  - Why: automatic cleanup of spies and stubs. All four option names were checked against the `vitest@5.0.2` type definitions during planning.
- [Testing Library: user-event setup](https://testing-library.com/docs/user-event/setup)
  - Why: `userEvent.setup()` per test. **Note that it installs its own `navigator.clipboard` stub**, which is why the `MarkdownContent` test uses `fireEvent` instead (see gotchas).
- [Testing Library: jest-dom with Vitest](https://github.com/testing-library/jest-dom#with-vitest)
  - `import "@testing-library/jest-dom/vitest"`.
  - Why: registers `toBeInTheDocument`, `toHaveAttribute`, `toHaveValue`, `toHaveClass` and adds their types. The `./vitest` export was confirmed in `@testing-library/jest-dom@7` exports.
- [React: `<form action>` / useActionState](https://react.dev/reference/react-dom/components/form)
  - Why: the `DeleteButton` and `PostForm` submit behaviour. When `onSubmit` calls `preventDefault()`, React 19 does **not** invoke the function `action`, which is how `DeleteButton`'s confirm gate works.

### Patterns to Follow

**Naming Conventions:**
- Test file: `<source-basename>.test.ts(x)` next to the source file (e.g. `theme-toggle.tsx` → `theme-toggle.test.tsx`; `Listbox.tsx` → `Listbox.test.tsx`).
- Wrap each file in `describe("<ExportName>", () => { ... })` with `it("<behaviour in plain English>")` cases.
- Explicit imports, no globals: `import { describe, it, expect, vi, beforeEach } from "vitest";`
- Import the unit under test with the same path style as the codebase: a relative sibling import (`import { SearchBar } from "./SearchBar";`), matching how `PostForm.tsx` imports `./Listbox`. Use `@/…` only for cross-directory fixtures/types (e.g. `import type { Post } from "@/lib/posts/types";`).

**Mocking `next/navigation` (`SearchBar`, `TagFilter`):** use `vi.hoisted` so the factory can reference the shared state:

```tsx
const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/",
  useSearchParams: () => nav.searchParams,
}));

beforeEach(() => {
  nav.searchParams = new URLSearchParams(); // reset per test; set e.g. new URLSearchParams("q=hooks&tag=react") inside a test before render
});
```

**Mocking `./actions` (`PostForm`, `DeleteButton`):** must be mocked so `lib/supabase/server` → `server-only`/`next/headers` never loads:

```tsx
const actions = vi.hoisted(() => ({
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
}));
vi.mock("./actions", () => actions);
```

(`PostFormState` is a type-only import in `PostForm.tsx`, so it's erased and the mock doesn't need to provide it.)

**Mocking `next-themes` (`ThemeToggle`):**

```tsx
const theme = vi.hoisted(() => ({ resolvedTheme: "light" as string, setTheme: vi.fn() }));
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: theme.resolvedTheme, setTheme: theme.setTheme }),
}));
```

**Stubbing browser APIs:** rely on the config's `restoreMocks`/`unstubGlobals` for cleanup; don't hand-roll `afterEach` restores.

```tsx
vi.spyOn(window, "confirm").mockReturnValue(false);                  // DeleteButton, PostForm
vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url }) })); // ImageUpload: plain object, not `new Response`
vi.stubEnv("ADMIN_EMAIL", "admin@example.com");                      // admin-email
```

**Queries:** follow [frontend-component-best-practices.md](.claude/references/frontend-component-best-practices.md#L37-L42). Prefer `screen.getByRole(...)` / `getByLabelText(...)`. Use `container.querySelector('input[name="..."]')` **only** for `type="hidden"` inputs, which have no accessible role.

**Fixtures:** build `Post`/`PostListItem` objects with a small local `makePost(overrides)` helper inside the test file that needs one. There's no shared fixtures module; don't create one for two call sites.

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation (tooling)

Install dev dependencies (with the `@types/node` bump), add `vitest.config.ts` + `vitest.setup.ts`, and add the `test`/`test:watch` scripts. Prove it runs with one trivial real test (`slugify`).

### Phase 2: Pure utility tests

**Depends on:** Phase 1

`slugify`, `sanitizeRedirect`, `isSvgUrl`, `getAdminEmail`. No mocks except `vi.stubEnv`.

### Phase 3: Public client component tests

**Depends on:** Phase 1 · **Independent of:** Phase 2, Phase 4

`TagList`, `PostCard`, `TagFilter`, `SearchBar`, `MarkdownContent`.

### Phase 4: Admin client component + theme tests

**Depends on:** Phase 1 · **Independent of:** Phase 2, Phase 3

`Listbox`, `DeleteButton`, `ImageUpload`, `PostForm`, `ThemeToggle`. `PostForm` goes last because it renders the real `Listbox` + `ImageUpload`, so those tests should pass first.

### Phase 5: Rules + full validation

**Depends on:** Phases 2–4

Update CLAUDE.md + AGENTS.md, then run lint, `tsc`, test and build, and confirm `posts/[slug]` is still `●` (SSG).

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### Task 1: UPDATE package.json (install dev dependencies)

- **IMPLEMENT**: run exactly:
  ```bash
  npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/user-event @testing-library/jest-dom @types/node@^24
  ```
- **GOTCHA**:
  - Without `@types/node@^24` this fails with `ERESOLVE … peerOptional @types/node@"^22.0.0 || >=24.0.0" from vitest@5.0.2` (reproduced during planning). **Don't** use `--legacy-peer-deps`/`--force`. `^24` matches the local Node (v24.18.0).
  - npm may warn about `unrs-resolver` install scripts (`allow-scripts`). That warning is pre-existing and harmless; ignore it.
  - Don't install `vite-tsconfig-paths`; the alias is set by hand in Task 2.
- **VALIDATE**: `npx vitest --version` (prints 5.x) and `npx tsc --noEmit` (still passes after the `@types/node` bump)
- **SATISFIES**: AC #1 (tooling)

### Task 2: CREATE vitest.config.ts

- **IMPLEMENT**:
  ```ts
  import { fileURLToPath } from "node:url";
  import react from "@vitejs/plugin-react";
  import { defineConfig } from "vitest/config";

  export default defineConfig({
    plugins: [react()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./vitest.setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      clearMocks: true,
      restoreMocks: true,
      unstubEnvs: true,
      unstubGlobals: true,
    },
  });
  ```
- **PATTERN**: the Next.js guide's `vitest.config.mts` (local docs); alias mirrors `tsconfig.json` `paths`.
- **GOTCHA**:
  - Use `.ts`, not `.mts`. `tsconfig.json` `include` already covers `**/*.ts` and `"**/*.mts"`, and `package.json` has no `"type": "module"`, but Vite loads TS configs as ESM regardless.
  - Use `import.meta.url`, **not** `__dirname`.
  - `include` is scoped to `src/` so Vitest never crawls `.next/` or `node_modules`.
- **VALIDATE**: `npx tsc --noEmit`
- **SATISFIES**: AC #1

### Task 3: CREATE vitest.setup.ts

- **IMPLEMENT**:
  ```ts
  import "@testing-library/jest-dom/vitest";
  import { cleanup } from "@testing-library/react";
  import { afterEach } from "vitest";

  afterEach(() => {
    cleanup();
  });
  ```
- **GOTCHA**:
  - RTL only auto-cleans when Vitest `globals: true`. We don't enable globals, so the explicit `cleanup` is required, or DOM from one test leaks into the next.
  - Because this file is inside `tsconfig` `include`, its jest-dom import also makes the matcher **types** (`toBeInTheDocument` etc.) visible to `tsc` in every test file.
- **VALIDATE**: `npx tsc --noEmit`
- **SATISFIES**: AC #1

### Task 4: UPDATE package.json (scripts)

- **IMPLEMENT**: add to `"scripts"` after `"lint"`: `"test": "vitest run"` and `"test:watch": "vitest"`.
- **GOTCHA**: `test` must be `vitest run` (single pass, exits). Plain `vitest` enters watch mode and would hang validation and CI.
- **VALIDATE**: `npm test`. With no test files yet it exits non-zero with "No test files found", which is expected until Task 5.
- **SATISFIES**: AC #1 (scripts)

### Task 5: CREATE src/lib/posts/slugify.test.ts

- **IMPLEMENT** cases:
  - `"Hello World"` → `"hello-world"`
  - `"  Next.js 16: What's New?  "` → `"next-js-16-what-s-new"`
  - `"a---b___c"` → `"a-b-c"` (runs collapse)
  - `"--Leading and trailing--"` → `"leading-and-trailing"`
  - `"!!!"` → `""`
  - `"Already-slugged-123"` → `"already-slugged-123"`
- **VALIDATE**: `npm test -- src/lib/posts/slugify.test.ts` (this is the first proof the whole toolchain works)
- **SATISFIES**: AC #2 (lib utilities)

### Task 6: CREATE src/lib/auth/sanitize-redirect.test.ts

- **IMPLEMENT**:
  - Passes through: `"/admin/posts"`, `"/admin/posts/abc/edit"`, `"/admin/posts?tab=drafts"`.
  - Falls back to `"/admin/posts"` for: `null`, `undefined`, `""`, `"admin/posts"` (no leading slash), `"https://evil.com"`, `"//evil.com"`, `"/\\evil.com"` (the JS literal for `/\evil.com`).
  - Use `it.each` for the fallback table.
- **VALIDATE**: `npm test -- src/lib/auth/sanitize-redirect.test.ts`
- **SATISFIES**: AC #2

### Task 7: CREATE src/lib/posts/cover-image.test.ts

- **IMPLEMENT**:
  - `true` for `"https://x.supabase.co/storage/v1/object/public/post-images/a.svg"` and `"https://x.co/A.SVG"` (case-insensitive).
  - `false` for:
    - `.png`/`.jpg`/`.webp`;
    - `"https://x.co/a.png?format=.svg"` (only the pathname counts);
    - `"not a url"`;
    - `""`;
    - `"/relative/a.svg"` (relative URLs throw inside `new URL`, so they return `false`; that's current behaviour).
  - Assert that none of these throw.
- **VALIDATE**: `npm test -- src/lib/posts/cover-image.test.ts`
- **SATISFIES**: AC #2

### Task 8: CREATE src/lib/auth/admin-email.test.ts

- **IMPLEMENT**:
  - `vi.stubEnv("ADMIN_EMAIL", "admin@example.com")` → returns it.
  - `vi.stubEnv("ADMIN_EMAIL", undefined)` → `toThrow("ADMIN_EMAIL environment variable is not set")`.
  - `vi.stubEnv("ADMIN_EMAIL", "")` → throws, so an empty string can't let everyone through either.
- **GOTCHA**: `vi.stubEnv(name, undefined)` is supported in Vitest 5 (its signature accepts `string | undefined`, checked in the `vitest@5.0.2` type definitions). `unstubEnvs: true` in the config restores the real env after each test, so no manual cleanup is needed.
- **VALIDATE**: `npm test -- src/lib/auth/admin-email.test.ts`
- **SATISFIES**: AC #2

### Task 9: CREATE src/app/(public)/TagList.test.tsx

- **IMPLEMENT**:
  - `render(<TagList tags={["react", "nextjs"]} />)` → `screen.getAllByRole("listitem")` has length 2 with the right text.
  - `render(<TagList tags={[]} />)` → `container` is empty (`expect(container).toBeEmptyDOMElement()`).
- **VALIDATE**: `npm test -- "src/app/(public)/TagList.test.tsx"`
- **SATISFIES**: AC #3 (client components)

### Task 10: CREATE src/app/(public)/PostCard.test.tsx

- **IMPLEMENT**: a local `makePost(overrides: Partial<PostListItem> = {}): PostListItem` with defaults:
  - `id: "1"`, `slug: "hello-world"`, `title: "Hello World"`, `excerpt: "An excerpt"`;
  - `cover_image_url: null`, `tags: ["react"]`, `published_at: "2026-08-21T12:00:00Z"`.

  Cases:
  - `screen.getByRole("link")` has `href="/posts/hello-world"`.
  - The heading "Hello World" is rendered.
  - The excerpt is rendered; with `excerpt: null`, `queryByText("An excerpt")` is null.
  - The tag "react" is rendered.
  - `screen.getByText("21 August 2026")`, and the `<time>` has `dateTime="2026-08-21T12:00:00Z"`.
  - With `published_at: null`, no `<time>` is rendered.
  - No cover → `queryByRole("img")` is null.
  - SVG cover (`https://x.co/cover.svg`) → `getByRole("img", { name: "Hello World" })` `toHaveClass("dark:invert")`.
  - PNG cover → `not.toHaveClass("dark:invert")`.
- **GOTCHA**:
  - Use **real** `next/link` and `next/image`, no mock. Planning confirmed that `next/link` returns early when no router context exists (`if (!router) return` in `node_modules/next/dist/client/app-dir/link.js`), and that `next/image`'s remote-host check is skipped when `NODE_ENV === "test"` (`node_modules/next/dist/shared/lib/image-loader.js:71`). Vitest sets `NODE_ENV=test`.
  - The rendered `<img src>` will be a `/_next/image?url=…` URL; don't assert on `src`.
  - Use midday UTC for `published_at` so the `en-GB` date can't shift a day in any local timezone.
  - **Fallback only if the real `next/image` throws under jsdom:**
    - add `vi.mock("next/image", () => ({ default: function MockImage(props: React.ComponentProps<"img">) { return <img {...props} alt={props.alt} />; } }))`;
    - add `// eslint-disable-next-line @next/next/no-img-element` on the `<img>`;
    - note the divergence in the report.
- **VALIDATE**: `npm test -- "src/app/(public)/PostCard.test.tsx"`
- **SATISFIES**: AC #3

### Task 11: CREATE src/app/(public)/TagFilter.test.tsx

- **IMPLEMENT**: use the `next/navigation` mock pattern above.
  - `tags={[]}` → `container` empty.
  - Renders one button per tag.
  - With `activeTag="react"`: the "react" button has `aria-pressed="true"` and the others `"false"`.
  - With `nav.searchParams = new URLSearchParams("q=hooks")` and no `activeTag`: clicking "react" → `nav.replace` called with `"/?q=hooks&tag=react"`.
  - With `nav.searchParams = new URLSearchParams("q=hooks&tag=react")` and `activeTag="react"`: clicking "react" → `nav.replace("/?q=hooks")`.
- **GOTCHA**: set `nav.searchParams` **before** `render`. Use `const user = userEvent.setup(); await user.click(...)`.
- **VALIDATE**: `npm test -- "src/app/(public)/TagFilter.test.tsx"`
- **SATISFIES**: AC #3

### Task 12: CREATE src/app/(public)/SearchBar.test.tsx

- **IMPLEMENT**: use the `next/navigation` mock pattern, with `vi.useFakeTimers()` in `beforeEach` and `vi.useRealTimers()` in `afterEach`. Drive input with **`fireEvent.change`**, not user-event.
  - **Initial value:** `nav.searchParams = new URLSearchParams("q=hooks")` → `getByRole("searchbox", { name: "Search posts" })` has value `"hooks"`.
  - **Debounce:**
    - `fireEvent.change(input, { target: { value: "a" } })`;
    - `act(() => vi.advanceTimersByTime(100))`;
    - `fireEvent.change(input, { target: { value: "ab" } })`;
    - `act(() => vi.advanceTimersByTime(299))` → `nav.replace` **not** called;
    - `act(() => vi.advanceTimersByTime(1))` → called **once** with `"/?q=ab"`.
  - **Preserves other params:** with `nav.searchParams = new URLSearchParams("tag=react")`, typing `"ab"` + advancing 300 → `nav.replace("/?tag=react&q=ab")`.
  - **Clearing:** start with `q=hooks`, change to `""`, advance 300 → `nav.replace("/?")`.
  - **Resync from URL:**
    - render with `q=hooks`;
    - set `nav.searchParams = new URLSearchParams("q=other")`;
    - `rerender(<SearchBar />)` → input value `"other"`;
    - `nav.replace` not called after advancing 300, because query === urlQuery.
- **GOTCHA**:
  - `type="search"` has ARIA role **`searchbox`**, not `textbox`.
  - `userEvent` + fake timers needs `advanceTimers: vi.advanceTimersByTime` wiring and is easy to deadlock. `fireEvent.change` is deterministic here, and the component only reads `e.target.value`.
  - Wrap timer advances in `act(...)` so the state update and effect flush.
- **VALIDATE**: `npm test -- "src/app/(public)/SearchBar.test.tsx"`
- **SATISFIES**: AC #3

### Task 13: CREATE src/app/(public)/MarkdownContent.test.tsx

- **IMPLEMENT**:
  - Fixture HTML: `'<div data-code-block=""><button type="button" data-copy-button="" aria-label="Copy code">Copy</button><pre><code>const x = 1;</code></pre></div><p>Outside</p>'`. This mirrors what `rehype-copy-button.ts` emits.
  - `beforeEach`: `const writeText = vi.fn().mockResolvedValue(undefined); vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } })`. Or use `Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })`, whichever type-checks cleanly.
  - Cases:
    - `fireEvent.click(screen.getByRole("button", { name: "Copy code" }))` → `writeText` called with `"const x = 1;"`, then `await waitFor(() => expect(button).toHaveAttribute("aria-label", "Copied"))`.
    - `fireEvent.click(screen.getByText("Outside"))` → `writeText` not called.
- **GOTCHA**:
  - **Don't use `userEvent.setup()` in this file.** It replaces `navigator.clipboard` with its own stub, which would silently swallow the assertion.
  - Keep a reference to the button element from **before** the click. After the click, `innerHTML` changes to an SVG and the accessible name changes to "Copied", so re-querying by `"Copy code"` fails.
- **VALIDATE**: `npm test -- "src/app/(public)/MarkdownContent.test.tsx"`
- **SATISFIES**: AC #3

### Task 14: CREATE src/app/admin/(protected)/posts/Listbox.test.tsx

- **IMPLEMENT**:
  - Render `<Listbox id="status" name="status" defaultValue="draft" options={[{value:"draft",label:"Draft"},{value:"published",label:"Published"}]} />`.
  - Helper: `const hidden = () => container.querySelector<HTMLInputElement>('input[name="status"]')!`.
  - Cases:
    - **Initial:** `hidden().value === "draft"`; the button shows "Draft" and has `aria-expanded="false"`; `queryByRole("listbox")` is null.
    - **Open by click:** `await user.click(button)` → `aria-expanded="true"`, `getByRole("listbox")` exists and has focus (`toHaveFocus()`).
    - **Commit by click:** open, then `await user.click(getByRole("option", { name: "Published" }))` → `hidden().value === "published"`, the button text is "Published", the listbox is gone, and the button has focus.
    - **Keyboard:** open, `await user.keyboard("{ArrowDown}{Enter}")` → `hidden().value === "published"`.
    - **ArrowUp clamps at 0:** open, `{ArrowUp}{Enter}` → stays `"draft"`.
    - **Escape:** open, `{ArrowDown}{Escape}` → the listbox is gone, `hidden().value` is still `"draft"`, and the button has focus.
    - **Outside click:** open, `fireEvent.mouseDown(document.body)` → the listbox is gone.
- **GOTCHA**:
  - Open by **click**, not keyboard. Pressing Enter/Space on the button also fires a native click, which toggles `open` twice. Opening via `ArrowDown` on the button is an optional extra case (`button.focus(); await user.keyboard("{ArrowDown}")`).
  - The key handlers are on the `<ul>`, which the component focuses in a `useEffect`, so `user.keyboard` targets it after open.
  - Outside-close listens to `mousedown`, not `click`.
  - The button's accessible name is the selected label, e.g. "Draft": `getByRole("button", { name: "Draft" })`, or `getByRole("button")` since it's the only one.
  - Don't mock `remixicon-react`. It's CJS `module.exports = Component` (checked in `node_modules/remixicon-react/ArrowDownSLineIcon.js`), so the default import works under Vitest.
- **VALIDATE**: `npm test -- "src/app/admin/(protected)/posts/Listbox.test.tsx"`
- **SATISFIES**: AC #3

### Task 15: CREATE src/app/admin/(protected)/posts/DeleteButton.test.tsx

- **IMPLEMENT**: use the `./actions` mock pattern.
  - Render `<DeleteButton id="p1" slug="hello-world" status="published" />`.
  - **Confirm false:**
    - `vi.spyOn(window, "confirm").mockReturnValue(false)`;
    - `await user.click(getByRole("button", { name: "Delete" }))`;
    - `confirm` was called with `"Delete this post? This cannot be undone."`;
    - `actions.deletePost` **not** called.
  - **Confirm true:**
    - `mockReturnValue(true)`, then click;
    - `await waitFor(() => expect(actions.deletePost).toHaveBeenCalledTimes(1))`;
    - the `FormData` argument (`actions.deletePost.mock.calls[0][0]` — React calls a form `action` with **only** the FormData) has `get("id") === "p1"`, `get("slug") === "hello-world"`, `get("status") === "published"`.
- **GOTCHA**:
  - React 19's form-action plugin checks `defaultPrevented` after `onSubmit` runs and skips the action if it's set. That's exactly the production behaviour under test.
  - The action is dispatched in a transition, so use `waitFor`.
  - If `mock.calls[0][0]` isn't a `FormData`, log it once, adjust, and note it in the report. Don't loosen the assertion to `toHaveBeenCalled()` alone.
- **VALIDATE**: `npm test -- "src/app/admin/(protected)/posts/DeleteButton.test.tsx"`
- **SATISFIES**: AC #3

### Task 16: CREATE src/app/admin/(protected)/posts/ImageUpload.test.tsx

- **IMPLEMENT**:
  - `const onUploaded = vi.fn()`; render `<ImageUpload onUploaded={onUploaded} />`.
  - `const input = screen.getByLabelText("Insert image")`.
  - Helper: `const png = (size = 1024) => { const f = new File(["x"], "a.png", { type: "image/png" }); Object.defineProperty(f, "size", { value: size }); return f; }`.
  - Cases:
    - **Too big:**
      - stub `fetch` with `vi.fn()`;
      - `await user.upload(input, png(4 * 1024 * 1024 + 1))`;
      - `await screen.findByText("Image must be 4MB or smaller.")`;
      - `fetch` and `onUploaded` not called.
    - **Exactly 4MB is allowed:** `png(4 * 1024 * 1024)` → `fetch` called (boundary: the source uses `>`).
    - **Success:**
      - `fetch` resolves `{ ok: true, json: async () => ({ url: "https://x.co/a.png" }) }`;
      - upload → `await waitFor(() => expect(onUploaded).toHaveBeenCalledWith("https://x.co/a.png"))`;
      - `fetch` called with `"/admin/posts/upload"` and `expect.objectContaining({ method: "POST" })`;
      - the body is a `FormData` whose `get("image")` is the file.
    - **Server error:** resolves `{ ok: false, json: async () => ({ error: "Unsupported file type. Use PNG, JPEG, WEBP, GIF, or SVG." }) }` → that text is shown and `onUploaded` is not called.
    - **Network failure:** `fetch` rejects `new Error("offline")` → `"Upload failed. Please try again."` is shown.
- **GOTCHA**:
  - `getByLabelText("Insert image")` resolves to the `sr-only` file input via `htmlFor="image-upload"`. `sr-only` is just a CSS class and jsdom doesn't apply Tailwind, so it's still interactable.
  - `user.upload` respects the `accept` attribute. `image/png` is in `ACCEPTED_TYPES`, so it's fine.
  - Stub `fetch` with `vi.stubGlobal` (auto-unstubbed by config), not by assigning `global.fetch`.
- **VALIDATE**: `npm test -- "src/app/admin/(protected)/posts/ImageUpload.test.tsx"`
- **SATISFIES**: AC #3

### Task 17: CREATE src/lib/theme/theme-toggle.test.tsx

- **IMPLEMENT**: use the `next-themes` mock pattern.
  - `theme.resolvedTheme = "light"` → click `getByRole("button", { name: "Toggle theme" })` → `theme.setTheme` called with `"dark"`.
  - `theme.resolvedTheme = "dark"` → click → `setTheme("light")`.
  - The button is enabled (not the disabled pre-mount placeholder).
- **GOTCHA**: RTL's `render` is a client render, not hydration, so `useSyncExternalStore` uses `getSnapshot` (`true`) and the mounted button renders straight away. Reset `theme.resolvedTheme` in `beforeEach`.
- **VALIDATE**: `npm test -- src/lib/theme/theme-toggle.test.tsx`
- **SATISFIES**: AC #3

### Task 18: CREATE src/app/admin/(protected)/posts/PostForm.test.tsx

- **IMPLEMENT**: use the `./actions` mock pattern and a local `makePost(overrides): Post` covering all `Post` fields:
  - `id: "p1"`, `slug: "existing-slug"`, `title: "Existing title"`, `excerpt: "Existing excerpt"`;
  - `content: "# Body"`, `cover_image_url: "https://x.co/c.svg"`, `tags: ["react", "nextjs"]`, `status: "published"`;
  - `published_at`/`created_at`/`updated_at` ISO strings.

  Keep the real `Listbox` and `ImageUpload` children (house rule: don't mock internal child components).

  Cases:
  - **Create: slug auto-fills.** `await user.type(getByLabelText("Title"), "Hello World!")` → `getByLabelText("Slug")` has value `"hello-world"`.
  - **Create: slug stops following once edited.**
    - type title `"First"`;
    - `await user.clear(slug)` then `await user.type(slug, "custom")`;
    - `await user.type(title, " More")` → slug is still `"custom"`.
  - **Edit: prefilled.**
    - Title/Slug/Excerpt/Cover image URL/Content/Tags have values from `makePost()`. Tags are `"react, nextjs"`.
    - The status Listbox hidden input `name="status"` is `"published"`.
    - The submit button is "Save changes".
  - **Edit: slug not auto-derived.** Typing in Title leaves Slug `"existing-slug"`.
  - **Edit: hidden inputs.** `container.querySelector('input[name="id"]')` is `"p1"`, `currentSlug` is `"existing-slug"`, `currentStatus` is `"published"`.
  - **Create mode:** no hidden `id` input; no "Cancel" link; the submit button is "Create post".
  - **Cancel gated by confirm (edit mode):**
    - `vi.spyOn(window, "confirm").mockReturnValue(false)`;
    - `const notCancelled = fireEvent.click(getByRole("link", { name: "Cancel" }))`;
    - `expect(notCancelled).toBe(false)` (the event was `preventDefault`ed);
    - `confirm` was called with `"Are you sure? Any changes have not been saved!"`.
  - **Action error rendered:**
    - `actions.createPost.mockResolvedValue({ error: "That slug is already in use — try a different one." })`;
    - type a title (Slug auto-fills; both are `required`);
    - `await user.click(getByRole("button", { name: "Create post" }))`;
    - `await screen.findByText("That slug is already in use — try a different one.")`;
    - `actions.createPost` was called with `(null, expect.any(FormData))` (the `useActionState` signature).
- **GOTCHA**:
  - `getByLabelText("Title")` works because every `<label htmlFor>` matches an input `id`.
  - "Content (Markdown)" is the label for the `content` textarea, **not** for `ImageUpload` (whose file input is labelled "Insert image").
  - Only test the confirm-**false** path for Cancel. On the true path, jsdom logs "Not implemented: navigation" noise.
  - `fireEvent.click` returns `false` when the event was cancelled, which is the cleanest assertion that `preventDefault` ran.
  - The `Status` label's `htmlFor="status"` points at the Listbox `<button id="status">`.
- **VALIDATE**: `npm test -- "src/app/admin/(protected)/posts/PostForm.test.tsx"`
- **SATISFIES**: AC #3

### Task 19: UPDATE CLAUDE.md

- **IMPLEMENT**:
  1. In **Working principles**, replace the whole **Verify** bullet with:
     > - **Verify:** Vitest + React Testing Library (jsdom), tests next to their source as `<name>.test.ts(x)`. New lib utilities and interactive client components come with tests; `npm test` joins `npm run lint`, `npx tsc --noEmit`, and `npm run build` as a validation gate. A manual browser check is still expected for UI flows. Async Server Components (`page.tsx`/`layout.tsx`) and `proxy.ts` aren't unit-testable in Vitest — don't try; they're left for a future E2E suite.
  2. In **Commands**, add after `npm run lint`:
     > - `npm test` — run the Vitest suite once (`vitest run`).
     > - `npm run test:watch` — Vitest in watch mode.
  3. In **Where new code goes**, add a bullet:
     > - **Tests:** next to the unit under test as `<name>.test.ts(x)`; mock `next/navigation`/`next-themes`/`"use server"` action modules, not internal child components (see `.claude/references/frontend-component-best-practices.md`).
- **GOTCHA**: keep CLAUDE.md lean. Don't paste mock recipes into it; they live in the test files and this plan.
- **VALIDATE**: `grep -n "npm test" CLAUDE.md` shows the Commands and Verify entries; `grep -n "Don't add tests speculatively" CLAUDE.md` returns nothing.
- **SATISFIES**: AC #4 (CLAUDE.md rule)

### Task 20: UPDATE AGENTS.md

- **IMPLEMENT**: apply the same **Verify** replacement and the two **Commands** lines from Task 19 to AGENTS.md. Don't touch its other (already stale) sections.
- **VALIDATE**: `grep -n "Don't add tests speculatively" AGENTS.md` returns nothing.
- **SATISFIES**: AC #4 (so Codex agents aren't told "don't add tests")

### Task 21: Full validation

- **IMPLEMENT**: run all Level 1–3 validation commands below. Fix any lint or type errors **in test files/config only**.
- **GOTCHA**:
  - `next build` type-checks everything in `tsconfig` `include`, so test files and `vitest.config.ts` must be type-clean or the **build** fails, not just `tsc`.
  - If ESLint flags `react/display-name` on a mock component, give it a named `function`.
- **VALIDATE**: see VALIDATION COMMANDS
- **SATISFIES**: AC #5, #6

---

## TESTING STRATEGY

### Unit Tests

The whole ticket. Pure-function tests use table-driven `it.each` where there are more than 3 input/output pairs. Component tests render one component, drive it through user-visible queries, and assert on DOM/ARIA state or on calls to mocked external dependencies.

### Integration Tests

`PostForm` is the closest to integration: the real `Listbox` + `ImageUpload` + `slugify` inside a real `useActionState` loop, with only the server action mocked. No other integration or E2E tests are in scope.

### Edge Cases

These must be covered by the tasks above:

- `slugify`: all-symbol input → `""`; leading/trailing and repeated separators.
- `sanitizeRedirect`: `//evil.com`, `/\evil.com`, absolute URL, missing leading slash, null/undefined/empty.
- `isSvgUrl`: `.svg` only in the query string; uppercase extension; relative or unparseable URL (no throw).
- `getAdminEmail`: unset **and** empty-string env.
- `SearchBar`: rapid typing within the debounce window → exactly one `replace`; clearing → `"/?"`; external URL change resyncs without firing `replace`.
- `TagFilter`: empty tag list; toggling the active tag off preserves `q`.
- `PostCard`: null excerpt, null `published_at`, no cover, SVG vs raster cover.
- `Listbox`: ArrowUp at index 0; Escape doesn't commit; outside `mousedown` closes.
- `ImageUpload`: exactly 4MB (allowed) vs 4MB+1 (rejected); server `{ error }`; network rejection.
- `DeleteButton`/`PostForm` Cancel: `confirm` → `false` blocks the action/navigation.

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 1: Syntax & Style

```bash
npm run lint
npx tsc --noEmit
```

### Level 2: Unit Tests

```bash
npm test
```

Expect 14 test files, all passing, and no "act(...)" warnings left unexplained in the output.

### Level 3: Build (regression)

```bash
npm run build
```

Requires `.env.local`, because `generateStaticParams` queries Supabase. Confirm in the route table that `/posts/[slug]` is still `●` (SSG) and `/` is still `ƒ` (dynamic), and that no test file shows up as a route.

### Level 4: Manual Validation

- `npm run test:watch`, edit `src/lib/posts/slugify.ts` to break it (e.g. drop the trailing-dash strip), and confirm the watch run goes red. Then revert.
- `npm run dev` → quick smoke test that `/`, a post detail page, and `/admin/posts/new` still render (no source changed, so this is just a sanity check that the dependency bump didn't break the dev server).

### Level 5: Additional Validation (Optional)

- `npm ls vitest vite jsdom @types/node` should show no `invalid`/`UNMET PEER` entries.

---

## ACCEPTANCE CRITERIA

- [ ] **AC #1:** Vitest, RTL (`react`, `dom`, `user-event`, `jest-dom`), jsdom and `@vitejs/plugin-react` are installed as devDependencies. `vitest.config.ts` resolves `@/*`, uses jsdom and loads `vitest.setup.ts` (jest-dom + cleanup). `package.json` has `test` (`vitest run`) and `test:watch` (`vitest`).
- [ ] **AC #2:** `slugify`, `sanitizeRedirect`, `isSvgUrl` and `getAdminEmail` have tests next to their source covering every behaviour listed in the ticket.
- [ ] **AC #3:** `SearchBar`, `TagFilter`, `TagList`, `PostCard`, `Listbox`, `DeleteButton`, `PostForm`, `ImageUpload`, `ThemeToggle` and `MarkdownContent` have tests next to their source covering every behaviour listed in the ticket, with `next/navigation`, `next-themes` and `./actions` mocked.
- [ ] **AC #4:** CLAUDE.md (and AGENTS.md) Verify now says new logic and interactive components come with tests, with `npm test` as a gate. Commands lists `npm test` / `npm run test:watch`.
- [ ] **AC #5:** `npm test`, `npm run lint`, `npx tsc --noEmit` and `npm run build` all pass.
- [ ] **AC #6:** `posts/[slug]` still prerenders as SSG (`●`); no source file under `src/` other than new `*.test.ts(x)` files is modified.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Full test suite passes
- [ ] No linting or type checking errors
- [ ] Manual testing confirms the dev server and watch mode work
- [ ] Acceptance criteria all met
- [ ] `git status` shows only: `package.json`, `package-lock.json`, `vitest.config.ts`, `vitest.setup.ts`, 14 `*.test.ts(x)` files, `CLAUDE.md`, `AGENTS.md`

---

## OPEN QUESTIONS / ASSUMPTIONS

- **Assumption: bump `@types/node` to `^24`.** This is forced by Vitest 5's peer range. It matches the local Node 24.18. **Vercel's Node version** for the project should also be 24.x for consistency. Types-only, so a mismatch wouldn't break a deploy, but worth checking in Vercel → Settings → Node.js Version. The alternative (pin `vitest@^4`, which still accepts Node 20 types) was rejected: it would start the suite on an outdated major for no benefit.
- **Assumption: update AGENTS.md's Verify + Commands too.** It's a tracked Codex mirror and would otherwise tell Codex agents "don't add tests". Only those two sections change; its other drift is left alone. Drop Task 20 if you'd rather AGENTS.md be handled separately.
- **Assumption: tests document current behaviour.** Example: `isSvgUrl("/relative/a.svg") === false`. If a test reveals behaviour that looks like a bug, it's flagged in the report rather than fixed here, keeping the no-src-changes constraint.
- **Forward note for PB-0012:** GitHub Actions must use **Node 24** (or ≥ 22.22). Vitest 5 requires `^22.12 || ^24 || >=26` and jsdom 30 requires `^22.22.2 || ^24.15.0 || >=26`. The ticket's "Node LTS (≥ 20.9)" wording should be read as Node 24.

## NOTES (open canvas)

**Why no `vite-tsconfig-paths`:** the Next guide suggests it, but this repo has exactly one alias (`@/*`). A single `resolve.alias` line avoids a dependency and a plugin.

**Why no `globals: true`:** explicit `import { describe, it, expect, vi } from "vitest"` keeps each test file self-describing, and avoids adding `"types": ["vitest/globals"]` to `tsconfig.json`. That tsconfig is shared with `next build`, so leaving it untouched is safer.

**Why `fireEvent` in two places despite the house preference for user-event:**
- In `SearchBar`, `user-event` combined with fake timers needs `advanceTimers` wiring and is a common source of hung tests.
- In `MarkdownContent`, `userEvent.setup()` overwrites `navigator.clipboard`.

Everywhere else uses `userEvent.setup()`.

**What was verified during planning (not assumed):**

| Claim | How verified |
|---|---|
| Vitest 5 fails to install next to `@types/node@20`; succeeds with `@^24` | `npm install --dry-run` both ways |
| `@vitejs/plugin-react@6` needs `vite@^8`; Vitest 5 accepts `vite ^6.4 \|\| ^7 \|\| ^8` | `npm view … peerDependencies` |
| `@testing-library/react@16` accepts React 19; jest-dom 7 exports `./vitest` | `npm view … peerDependencies exports` |
| Config keys `clearMocks`/`restoreMocks`/`unstubEnvs`/`unstubGlobals`, `vi.stubEnv(name, undefined)`, `vi.hoisted`, default `NODE_ENV=test` | grepped the `vitest@5.0.2` tarball's `.d.ts`/`.js` |
| `remixicon-react` icons are `module.exports = Component` | read `node_modules/remixicon-react/ArrowDownSLineIcon.js` |
| `next/link` early-returns without router context | `node_modules/next/dist/client/app-dir/link.js` ~L336 |
| `next/image` skips the remote-pattern check under `NODE_ENV=test` | `node_modules/next/dist/shared/lib/image-loader.js:71` |

**Not verified (runtime behaviour to confirm during implementation):**
- `next/image` rendering cleanly in jsdom (fallback mock specified in Task 10).
- The exact shape of the argument React passes to a mocked `<form action>` (asserted in Task 15, with an instruction to adjust rather than weaken).

**Confidence: 8/10.** The tooling path is de-risked. The remaining risk is React 19 form-action and `useActionState` timing under jsdom (Tasks 15 and 18) and possible `act()` warning noise. Those are fixable inside the test files without touching source.

## AMENDMENTS

<!-- Append-only. Newest at the bottom. -->
