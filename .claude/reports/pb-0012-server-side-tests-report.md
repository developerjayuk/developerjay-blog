# Implementation Report — PB-0012 Server-side tests

**Plan**: `.claude/plans/pb-0012-server-side-tests.md`   **Branch**: `feature/pb-0012-server-side-tests`   **Status**: COMPLETE (the CI-green check waits on the PR; see Validation)

## Summary
Extended the PB-0011 Vitest suite to the server-side modules: the markdown pipeline (`rehypeCopyButton`, `renderMarkdown`), the post Server Actions, the image-upload Route Handler and the public post queries. Each of the five new test files runs in Vitest's `node` environment through a `// @vitest-environment node` docblock. `vitest.config.mts` now aliases `server-only` to its empty module, so server modules can be imported under test. CLAUDE.md and AGENTS.md record the new conventions, and AGENTS.md is back in parity with CLAUDE.md. No source file under `src/` was modified.

## Tasks completed
- Task 1: `server-only` alias → `vitest.config.mts` (UPDATE)
- Task 2: hast transform tests → `src/lib/markdown/rehype-copy-button.test.ts` (CREATE)
- Task 3: real unified/Shiki pipeline tests → `src/lib/markdown/render.test.ts` (CREATE)
- Task 4: `createPost`/`updatePost`/`deletePost` tests → `src/app/admin/(protected)/posts/actions.test.ts` (CREATE)
- Task 5: upload route tests → `src/app/admin/(protected)/posts/upload/route.test.ts` (CREATE)
- Task 6: query tests → `src/lib/posts/queries.test.ts` (CREATE)
- Task 7: Verify + Tests rules → `CLAUDE.md` (UPDATE, two additions)
- Task 8: same Verify sentence, plus the missing Tests bullet → `AGENTS.md` (UPDATE). With `\r` stripped, `diff` against CLAUDE.md shows only the title line. Each file keeps its line endings (CLAUDE.md CRLF, AGENTS.md LF).
- Task 9: full validation (below)

## Tests added
59 new tests in 5 files, all passing:

| File | Tests | Covers |
|---|---|---|
| `rehype-copy-button.test.ts` | 3 | Top-level `pre` wrapped with the button first and the original node kept (same reference); sibling and nested `pre`s wrapped; `p` and inline `code` unchanged |
| `render.test.ts` | 5 | GFM table and strikethrough; highlighted `ts` block with `--shiki-light/dark` wrapped as div → button → pre; plaintext fallback; raw `<script>`/`<img onerror>`/`<div onclick>` stripped; inline code gets no copy button |
| `actions.test.ts` | 26 | 4 validation errors (Supabase never reached); field parsing (trim, tags, null excerpt/cover); explicit slug; `23505` vs generic errors; draft vs published revalidation before the throwing `redirect`; update id missing/empty, row targeting, publish, unpublish, slug-change old-path revalidation, draft→draft; delete id missing, error rethrown, row targeting, published vs draft revalidation, no redirect |
| `upload/route.test.ts` | 14 | Cross-origin 403 before the session lookup; no session / non-admin 401 before the admin client; missing or string `image` 400; unsupported MIME 400; >4MB 400; exactly 4MB 200; Storage error 500 + `console.error` (spied, stderr stays clean); success for all 5 MIME types (UUID path + extension, bucket, `contentType`, public URL) |
| `queries.test.ts` | 11 | `getPublishedPosts`: no filters / search / tag / both / order / error; `getAllTags`: de-dupe + sort, empty, error; `getPublishedPostBySlug`: match, `null`, error |

## Validation results
- `npm run lint`: pass (0 errors, 0 warnings)
- `npx tsc --noEmit`: pass
- New-file run (Level 2 command): 5 files, 59 tests passed
- `npm test`: **19 files, 135 tests passed** (76 existing + 59 new), stderr empty
- `npm run build`: pass. `/` is still `ƒ`, `/posts/[slug]` is still `●`, and no test file appears as a route.
- **Mutation spot-checks**: each source file was restored with `git checkout` afterwards. All five turned red:

  | Mutation | Failing test(s) |
  |---|---|
  | Origin check removed in `route.ts` | returns 403 for a cross-origin request… |
  | `>` changed to `>=` in the size check | allows a file of exactly 4MB |
  | `revalidatePublicPaths(currentSlug)` dropped in `updatePost` | revalidates both the new and old post paths… |
  | `allowDangerousHtml: true` on `remarkRehype` + `rehypeStringify` | strips raw HTML tags and event-handler attributes |
  | `contains` branch removed in `queries.ts` | filters by tag… and applies both… (2 tests) |
- **CI**: not yet run. The PR hasn't been opened; that happens in `piv-create-pr`. Confirm `gh pr checks --watch` is green.

## Deviations from the plan
- **`bucket.upload` mock is typed with `vi.fn<(path, file, options) => Promise<…>>(…)`** rather than the plan's untyped `vi.fn(async () => …)`. Case 9 reads `bucket.upload.mock.calls[0][0]`, which needs a typed parameter tuple. My first attempt typed the implementation's parameters (`_path`, `_file`, `_options`), and ESLint warned about them as unused, so I switched to the function-type generic.
- **Extra local helpers** for readability: `root`/`pre`/`expectWrapped` in the rehype test, and `toFormData`/`editForm`/`deleteForm`/`withoutField` in the actions test. They just wrap the plan's `postForm` pattern.
- The createPost "trims a non-blank excerpt" test also asserts the trimmed **cover image URL**, since the test name in the plan covers both.
- Plan case 5 (queries order) is folded into the no-filters test as an extra assertion, which the plan allowed. Optional render case 5 (inline code) is included.

## Issues encountered
- None blocking.
- **Flagged for follow-up (no change made, per the plan's tests-only boundary):** `render.ts` passes `javascript:` URLs through in links, autolinks and image `src` (plan Open Question 1). Recommend a small ticket to add `rehype-sanitize` or a protocol allowlist, with a test that the `javascript:` cases are neutralized. This ticket adds no test that locks in the unsafe behaviour.
- As the plan noted, Vitest's summary line "jsdom was created N times" counts every file, node-docblock files included. It isn't a sign that the docblock was ignored.
