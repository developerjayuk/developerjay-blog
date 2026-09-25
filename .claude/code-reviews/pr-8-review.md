# PR #8 Review: server-side tests for actions, upload, queries (PB-0012)

**Recommendation: ✅ Approve.** No Critical or High issues. Validation is green locally and in CI. The PR matches its stated intent.

## Summary
This PR adds only tests and rules text. It adds 59 tests across 5 new files, covering the post Server Actions, the upload Route Handler, the markdown pipeline and the public queries. It also adds a `server-only` alias in `vitest.config.mts` and updates the convention text in CLAUDE.md and AGENTS.md. No source file under `src/` changes.

The review read every changed test file and the full source module it tests. It was checked against CLAUDE.md, AGENTS.md, `.claude/references/*` and the implementation report (`.claude/reports/pb-0012-server-side-tests-report.md`). The deviations documented in the report are treated as intentional and are not flagged: the typed `bucket.upload` mock, the extra local helpers, and the order case folded into the no-filters test.

## Issues

### Critical: none
### High: none

### Medium
**M1. `updatePost` has no test for editing a published post that stays published with the same slug.**
`src/app/admin/(protected)/posts/actions.test.ts:174-280`
Existing tests cover draft→published, published→draft, published with a slug change, and draft→draft. None covers the most common real edit: fixing the body of a live post (`currentStatus: "published"`, `status: "published"`, same slug). If revalidation were skipped or doubled on that path, no test would catch it.
*Fix:* add `editForm({ currentStatus: "published", status: "published" })` and assert `revalidatePath` is called exactly twice, once with `"/"` and once with `"/posts/hello-world"`.

### Low
**L1. No test for a request without an `Origin` header.**
`src/app/admin/(protected)/posts/upload/route.test.ts`, guard at `route.ts:20`
The Origin check is skipped when `Origin` is missing (`origin && host && …`), and the auth check then decides. This is probably intentional, but it's an untested branch of a CSRF-relevant guard.
*Fix:* add a case with only a `host` header that asserts the request reaches the session lookup.

**L2. No route-level test that an unset `ADMIN_EMAIL` fails closed.**
`src/app/admin/(protected)/posts/upload/route.test.ts`
`getAdminEmail` throws when `ADMIN_EMAIL` is unset, and `admin-email.test.ts` covers that at unit level. The route's guarantee is not pinned: with no session and no `ADMIN_EMAIL`, the handler must never reach the admin client.
*Fix:* call `vi.stubEnv("ADMIN_EMAIL", "")` and `mockSession(null)`, then assert that `POST(...)` rejects and that `createAdminClient` was not called.

**L3. One `updatePost` error test doesn't assert that no redirect happened.**
`src/app/admin/(protected)/posts/actions.test.ts:199-205`
The generic-error test for `updatePost` omits `expect(navigation.redirect).not.toHaveBeenCalled()`, which the sibling tests (lines 148 and 196) include.

**L4. The slug-change test doesn't pin the total call count.**
`src/app/admin/(protected)/posts/actions.test.ts:252-270`
Unlike the sibling tests, it has no `toHaveBeenCalledTimes`, so an unexpected extra call would go unnoticed. The source currently calls `revalidatePath("/")` twice on this path, so the count is 4. Pinning it documents that behaviour, and the harmless duplicate could be removed in a later ticket.

**L5. The PB-0011 plan forward-reference contradicts itself.**
`.claude/plans/pb-0011-vitest-setup-and-frontend-tests.md:78`
It says CI "was pulled forward into this ticket", but still lists "GitHub Actions CI" and a config-level "`node` environment" as PB-0012 scope. PB-0012 actually uses per-file `// @vitest-environment node` docblocks, and `ci.yml` already exists on `main`.
*Fix:* reword it to match what shipped.

### Follow-up, not a finding against this PR
- **`Origin: null` returns 500 instead of 403** (`route.ts:20`). Browsers send `Origin: null` from sandboxed or opaque contexts. `new URL("null")` throws `TypeError: Invalid URL`, so the handler errors out instead of returning 403. The request is still denied, so this isn't a bypass, but it's the wrong status and an unhandled error. It's a source change, so it's out of scope for this tests-only PR. It could go in the same follow-up as the `javascript:` URL sanitization gap the report already flags.

## Validation

| Check | Result |
|---|---|
| `npm run lint` | ✅ pass, 0 warnings |
| `npx tsc --noEmit` | ✅ pass |
| `npm test` | ✅ 19 files, 135/135 tests passed |
| `npm run build` | ✅ pass. `/` is still `ƒ`, `/posts/[slug]` is still `●`, and no test file appears as a route |
| CI (Lint, type-check, test) | ✅ pass |
| Vercel preview | ✅ pass |
| CLAUDE.md and AGENTS.md parity | ✅ identical apart from the title line (checked with `\r` stripped) |

## What's done well
- **Mocks match each wrapper's contract.** `server` is mocked async (`mockResolvedValue`); `admin` and `public` are mocked sync (`mockReturnValue`), matching the documented shapes. Mocks sit at `lib/supabase/*`, `next/cache` and `next/navigation`, as the new rule says.
- **The `redirect` mock throws `NEXT_REDIRECT`, like Next's real `redirect`.** Because of that, `.rejects.toThrow("NEXT_REDIRECT")` actually proves that `revalidatePath` runs before the redirect and that nothing after it executes.
- **The order of security checks is asserted.** One test checks that a cross-origin request returns 403 *before* the session lookup. Others check that a 401 happens *before* the RLS-bypassing admin client is created. Both size boundaries are tested: exactly 4MB is allowed, and 4MB plus one byte is rejected.
- **`render.ts` runs through the real unified/Shiki pipeline, not a mock.** Raw-HTML stripping is checked against three injection vectors, and that stripping is what keeps `MarkdownContent`'s `dangerouslySetInnerHTML` safe.
- **Mutation spot-checks are documented.** The author broke five source files on purpose and confirmed the matching tests went red. That's strong evidence the assertions aren't vacuous.
- **The global `clearMocks`/`restoreMocks`/`unstubEnvs` config** keeps the "not called" assertions sound across tests without any per-file reset code.
- **Checked and found to be fine:**
  - React `cache()` passes calls straight through in this environment, so cached results can't leak between tests.
  - The `server-only` alias target exists.
  - The nested-`pre` wrapping test matches how `unist-util-visit` traverses the tree.
- **Known gaps are disclosed, not hidden.** The `javascript:` URL gap is flagged for follow-up, and no test locks in the unsafe behaviour.

## Recommendation
**Approve.** M1 is worth adding, either before merge or in a quick follow-up; it's a one-test change. The Low items are optional polish.
