# Implementation Report — PB-0011 Vitest setup + unit/component tests

**Plan**: `.claude/plans/pb-0011-vitest-setup-and-frontend-tests.md`   **Branch**: `feature/pb-0011-vitest-setup-and-frontend-tests`   **Status**: COMPLETE

## Summary
Added the repo's first automated test suite: Vitest 5 + React Testing Library + jsdom, with test files next to their source. It has 14 test files (76 tests): the four pure `lib/` utilities (`slugify`, `sanitizeRedirect`, `isSvgUrl`, `getAdminEmail`) and ten client components. Only `next/navigation`, `next-themes` and `./actions` are mocked. Added `npm test` / `npm run test:watch`, and rewrote the CLAUDE.md/AGENTS.md "Verify" rule from "no tests yet" to "new logic comes with tests". No source file under `src/` was modified.

## Tasks completed
- Task 1: installed dev deps (`vitest@5.0.2`, `@vitejs/plugin-react`, `vite@8.3.1` peer, `jsdom@30.1.1`, `@testing-library/{react,dom,user-event,jest-dom}`) and bumped `@types/node` `^20` → `^24` → `package.json`, `package-lock.json` (UPDATE)
- Task 2: Vitest config → `vitest.config.mts` (CREATE; see Deviations)
- Task 3: jest-dom + RTL cleanup → `vitest.setup.ts` (CREATE)
- Task 4: `test` / `test:watch` scripts → `package.json` (UPDATE)
- Tasks 5–8: `src/lib/posts/slugify.test.ts`, `src/lib/auth/sanitize-redirect.test.ts`, `src/lib/posts/cover-image.test.ts`, `src/lib/auth/admin-email.test.ts` (CREATE)
- Tasks 9–13: `src/app/(public)/{TagList,PostCard,TagFilter,SearchBar,MarkdownContent}.test.tsx` (CREATE)
- Tasks 14–18: `src/app/admin/(protected)/posts/{Listbox,DeleteButton,ImageUpload,PostForm}.test.tsx`, `src/lib/theme/theme-toggle.test.tsx` (CREATE)
- Task 19: Verify rule, Commands, and a new "Tests" bullet under "Where new code goes" → `CLAUDE.md` (UPDATE)
- Task 20: Verify rule + Commands only → `AGENTS.md` (UPDATE)
- Task 21: full validation (below)

## Tests added
| File | Tests | Covers |
|---|---|---|
| `slugify.test.ts` | 6 | casing, punctuation, collapsed runs, leading/trailing dashes, all-symbol → `""` |
| `sanitize-redirect.test.ts` | 10 | 3 pass-through paths; fallback for null/undefined/`""`/no leading slash/absolute/`//`/`/\` |
| `cover-image.test.ts` | 9 | `.svg` + uppercase `.SVG`; raster, `.svg` only in the query string, unparseable, empty, relative → `false` without throwing |
| `admin-email.test.ts` | 3 | set, unset, empty string |
| `TagList.test.tsx` | 2 | items rendered; empty → nothing |
| `PostCard.test.tsx` | 8 | link href, title/excerpt/tags, null excerpt, en-GB date + `dateTime`, null date, no cover, SVG `dark:invert` vs PNG |
| `TagFilter.test.tsx` | 5 | empty, one button per tag, `aria-pressed`, set tag keeping `q`, toggle off keeping `q` |
| `SearchBar.test.tsx` | 5 | initial value, 300ms debounce → exactly one `replace`, keeps `tag`, clearing → `"/?"`, URL resync without `replace` |
| `MarkdownContent.test.tsx` | 2 | copy writes the code text + `aria-label="Copied"`; clicks outside a copy button ignored |
| `Listbox.test.tsx` | 8 | initial state, open on click + list focus, open via ArrowDown on button, commit by click, ArrowDown+Enter, ArrowUp clamp, Escape doesn't commit, outside `mousedown` |
| `DeleteButton.test.tsx` | 2 | confirm false → no action; confirm true → `FormData` with id/slug/status |
| `ImageUpload.test.tsx` | 5 | >4MB rejected, exactly 4MB allowed, success (URL, method, FormData body), server `{ error }`, network rejection |
| `theme-toggle.test.tsx` | 3 | mounted button enabled, light → dark, dark → light |
| `PostForm.test.tsx` | 8 | slug auto-fill, slug stops following once edited, create-mode shape, action error rendered + `(null, FormData)`, edit prefill, edit slug not re-derived, hidden inputs, Cancel blocked by confirm |

**Result: 14 files, 76 tests, all passing. No `act(...)` warnings, nothing on stderr.**

**Mutation checks** (the source was temporarily broken, each test file run, and `src/` restored with `git checkout`). Each break was caught:
- Removed `preventDefault` in `DeleteButton` → 1 test failed.
- Removed the trailing-dash strip in `slugify` → 2 failed.
- Set `DEBOUNCE_MS = 0` in `SearchBar` → 1 failed.
- Made `PostForm` always re-derive the slug → 3 failed.

## Validation results
- `npm run lint`: pass (0 problems)
- `npx tsc --noEmit`: pass
- `npm test`: pass (14 files / 76 tests, ~18s)
- `npm run build`: pass. `/` is `ƒ` (dynamic); `/posts/[slug]` is `●` (SSG, 3 posts prerendered). No test file appears as a route.
- `npm ls vitest vite jsdom @types/node`: no `invalid`/`UNMET PEER` entries.
- Dev-server smoke test (`npm run dev`): `/` → 200; a post detail page → 200; `/admin/posts/new` → 307 (the proxy redirecting a logged-out user, as expected).
- Watch-mode check (Level 4) was replaced by the one-shot mutation runs above, which cover the same "breaking source turns the suite red" intent.

## Deviations from the plan
- **`vitest.config.ts` → `vitest.config.mts`.** With `.ts`, Vite 8 printed a warning on every run: "ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1)… unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version". The repo has no `"type": "module"`, so `.ts` is treated as CJS. `.mts` is what the official Next.js Vitest guide uses. It removes the warning, and `tsconfig` `include` already covers `**/*.mts`, so `tsc`/`next build` still type-check it. The contents match the plan exactly.
- **Extra Listbox case:** "opens from the button with ArrowDown". The plan listed it as optional.
- **MarkdownContent clipboard stub:** used `Object.defineProperty(navigator, "clipboard", …)`, one of the two options the plan allowed, re-applied in `beforeEach`. It isn't auto-restored by `unstubGlobals`, but every test in the file redefines it, and it's configurable.
- **GitHub Actions CI pulled forward from PB-0012 (at the user's request).** Added `.github/workflows/ci.yml`: push to `main` + PRs, Node 24, npm cache, then `npm ci` → lint → `next typegen` + `tsc --noEmit` → `npm test`. No build and no secrets. It follows PB-0012's CI spec, except that it uses Node 24 instead of "LTS ≥ 20.9", which Vitest 5/jsdom 30 require. The `next typegen` step is needed because `next-env.d.ts` and `.next/types` (e.g. the global `LayoutProps` used by `src/app/layout.tsx`) are gitignored; plain `tsc` fails on a clean checkout without them. That was verified in a fresh clone with `npm ci`. CLAUDE.md/AGENTS.md Commands gained a one-line CI note. PB-0012's remaining scope is the server-side tests plus the `server-only` alias.
- Unchanged from the plan: the real `next/image` worked under jsdom, so the fallback mock wasn't needed; React passes a real `FormData` to the mocked form action, so no adjustment was needed in Task 15.

## Issues encountered
- **Existing `npm audit` advisories, not introduced here** (checked against the lockfile before the install): `next` 16.3.1 (critical: RCE advisories, including Image Optimization with AVIF and Windows-hosted servers), `sharp` (high: libheif), `js-yaml` (high). Out of scope for this ticket, but a Next.js patch upgrade deserves its own ticket soon.
- **One unexplained test-run failure during the clean-clone CI simulation.** The first `npm test` right after `npm ci` exited 1, reporting only 7 files / 35 tests passed and no failed tests. That looks like a run cut off partway, not a failing assertion. The full log wasn't captured. It didn't reproduce in 9 further runs (warm, cold with `.vite` cleared, and the exact lint → tsc → test sequence), so no fix was applied. Watch the first few CI runs; if it recurs, the log will show the cause.
- Vitest reports jsdom being created 14 times (65% of run time). It suggests `pool: 'vmThreads'` or `isolate: false`. Not applied, since the suite is fast enough (~18s) and per-file isolation is the safer default; worth revisiting if the suite grows.
- No source bugs found. Documented current behaviour: `isSvgUrl("/relative/a.svg") === false`, because relative URLs throw inside `new URL`.
- **Forward note for PB-0012 CI:** use Node 24 (Vitest 5 and jsdom 30 need ≥ 22.12 / 22.22.2 respectively).
- **Branch note:** the branch was cut from `main` while the plan and the PB-0011/PB-0012 ticket docs were still untracked. They carried over untracked and aren't part of the implementation; commit them deliberately if they should ride in this PR.
