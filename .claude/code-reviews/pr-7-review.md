# PR #7 Review: Vitest + RTL suite and GitHub Actions CI (PB-0011)

**Recommendation: ✅ Approve.** No critical or high issues. The full suite passes locally and on GitHub CI, and the PR does what it says: it adds a test gate without touching application source.

## Summary

This PR adds the repo's first automated tests: 14 files and 76 tests covering the four pure `lib/` utilities and ten client components. It also adds a CI workflow (lint → `next typegen` + `tsc` → `npm test`) and updates the CLAUDE.md/AGENTS.md "Verify" rule and Commands.

The review compared the diff against CLAUDE.md, `.claude/references/frontend-component-best-practices.md` and `conventions.md`, and the PB-0011 plan and implementation report. The report documents these deviations, so they're treated as intentional and not flagged:
- `vitest.config.mts` instead of `.ts`
- CI pulled forward from PB-0012
- Node 24 in CI
- `next typegen` before `tsc`
- no `npm run build` in CI
- the clipboard `defineProperty` stub
- the existing `npm audit` advisories

## Issues

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 4 |

### Low

1. **AGENTS.md is out of date with CLAUDE.md. This predates this PR and is not caused by it.**
   - `AGENTS.md:41-54, 68-69`: it never mentions `lib/supabase/public.ts`. It also tells agents that Supabase reads go through `admin`/`server`/`client` only. A Codex agent following it could use `server` for a public read and bring back the PGRST303 cookie-forwarding bug.
   - `AGENTS.md:75-76, 116-117`: links to `.Codex/references/*` and `.Codex/rules/`, which don't exist.
   - The plan's Task 20 deliberately left these sections alone, so this is not something this PR needs to fix.
   - **Fix:** open a follow-up ticket to sync AGENTS.md with CLAUDE.md, or reduce it to a short pointer to CLAUDE.md.

2. **`SearchBar.test.tsx:65` locks in a cosmetic quirk.**
   - Clearing the last param calls `router.replace("/?")`, leaving a trailing `?`. The same pattern is in `TagFilter.tsx:21`.
   - The test correctly records current behaviour, in line with the plan's "tests document current behaviour" rule.
   - **Fix:** none needed now. If the URL builder is later changed to drop an empty `?`, update this assertion along with it.

3. **Suite runtime.**
   - Locally the suite took **43s**, against about 18s in the implementation report.
   - Vitest reports that jsdom was created 14 times, which is 75% of tracked time.
   - It's fine at this size. If it grows, try `pool: 'vmThreads'`, which keeps per-file isolation.

4. **The unreproduced test-run cut-off from the report.**
   - The first GitHub run was clean, and so was a local re-run.
   - Keep an eye on the next few CI runs. If it comes back, the Actions log will show the cause.

## Validation

| Check | Local | GitHub CI |
|---|---|---|
| `npm run lint` | ✅ pass | ✅ |
| `npx tsc --noEmit` | ✅ pass | ✅ (after `next typegen`) |
| `npm test` | ✅ 14 files / 76 tests pass | ✅ |
| `npm run build` | ✅ pass: `/` is still `ƒ`, `/posts/[slug]` is still `●` SSG, no test files appear as routes | not run in CI (by design) |
| Vercel preview | n/a | ✅ deployed |

## What's good

- **Mocks stay at the boundaries.** Only `next/navigation`, `next-themes` and the `"use server"` `./actions` module are mocked. `ImageUpload`/`Listbox` render for real inside `PostForm`, as the project rule requires.
- **Tests check behaviour, not implementation.**
  - The SearchBar debounce test advances the clock to 299ms and then 300ms and asserts that `replace` fires exactly once.
  - ImageUpload has an exactly-4MB test that would catch a `>` vs `>=` off-by-one.
  - The four mutation checks in the report show the tests fail when the code they cover is broken.
- **The global mock and env reset is right.** `clearMocks`, `restoreMocks`, `unstubEnvs` and `unstubGlobals` remove per-file teardown code. Fake timers are restored in `afterEach`. `vi.stubEnv(..., undefined)` really deletes the variable.
- **The `fireEvent` exceptions come with reasons.** Comments explain why `fireEvent` is used instead of user-event in two places (fake timers can hang; `userEvent.setup()` overwrites `navigator.clipboard`). That stops a later "cleanup" from making the tests flaky.
- **The CI workflow is tight.**
  - `permissions: contents: read`.
  - Superseded runs are cancelled.
  - npm is cached.
  - There's a timeout.
  - Comments explain why `typegen` runs and why `build` doesn't.
- **The rules files were updated with the change.** The "Verify" rule no longer says "don't add tests", and the Commands section says what CI runs.

## Recommendation

**Approve.** There's nothing blocking. Items 1–4 are follow-ups or things to watch, not merge conditions. Item 1 is the one worth a ticket.

---
_Agentic review (piv-review-pr + code-reviewer agent). A human makes the final merge call._
