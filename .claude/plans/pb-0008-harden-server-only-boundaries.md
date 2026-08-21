# Feature: PB-0008 — Harden server-only boundaries

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to which three files get the guard and which two are explicitly excluded — the ticket is precise about this split and getting it wrong (e.g. guarding `proxy.ts`'s auth helpers) risks breaking the edge middleware runtime.

## Feature Description

Add `import "server-only";` as the first line of `src/lib/supabase/server.ts`, `src/lib/posts/queries.ts`, and `src/lib/markdown/render.ts` — the three server-only modules in `lib/` that don't yet carry the guard `lib/supabase/admin.ts` already has. This is defense-in-depth: nothing has actually leaked into a client bundle today, but if it ever did, the `server-only` package makes Next.js fail the build with its clear "This module cannot be imported from a Client Component module" error instead of a silent bundle-size regression or a confusing bundler error surfaced from deep inside Shiki/`@supabase/ssr`.

## User Story

As the sole maintainer of this codebase
I want server-only modules to fail the build loudly if a future change accidentally imports them into a Client Component
So that a boundary violation is caught at build time with a clear message, not discovered later as bundle bloat or a runtime error.

## Problem Statement

`lib/supabase/admin.ts` is the only module in `lib/` with the `server-only` guard today (confirmed at [admin.ts:1](src/lib/supabase/admin.ts#L1)). `server.ts`, `queries.ts`, and `render.ts` all assume a server context (Node `cookies()`, Node-only Shiki theme data) but have no explicit mechanism enforcing that assumption — raised as a Low-severity finding in the [PB-0005 PR #4 review](.claude/code-reviews/pr-4-review.md#L55-L58).

## Solution Statement

Add the one-line `import "server-only";` guard to the top of each of the three target files. The `server-only` package (`^0.0.1`) is already a project dependency (confirmed in [package.json:23](package.json#L23)) — no install needed. Verify the guard is live by temporarily creating a scratch `"use client"` component that imports one of the guarded modules, confirming `npm run build` fails with `server-only`'s error, then deleting the scratch component and confirming a clean build again.

## Out of Scope / Non-Goals

- **`lib/markdown/rehype-copy-button.ts`** — a pure unified/rehype AST transform with no Node-only API. Ticket explicitly excludes it; do not add the guard here.
- **`lib/auth/admin-email.ts` and `lib/auth/sanitize-redirect.ts`** — both are imported from `proxy.ts`, which runs on the Edge middleware runtime, not a client-bundle target the same way. Adding `server-only` there requires first confirming it doesn't break under the Edge runtime (the `server-only` package's mechanism is a Node-conditional-exports poison pill — its Edge-runtime behavior isn't verified here). This is a separate judgment call for a future ticket, not a drive-by include in this one.
- **`lib/supabase/client.ts`** — the browser client; guarding it would be backwards (it's *meant* to be imported client-side). Not touched.
- **Any behavioral change** — this ticket only adds import statements. No logic, exports, or function signatures change in any of the three files.

## Feature Metadata

**Feature Type**: Hardening / Refactor (defense-in-depth, no behavior change)
**Estimated Complexity**: Low
**Primary Systems Affected**: `src/lib/supabase/server.ts`, `src/lib/posts/queries.ts`, `src/lib/markdown/render.ts`
**Dependencies**: `server-only` (`^0.0.1`, already installed — see [package.json:23](package.json#L23))

## Related Work

**Implements**: [docs/tickets/pb-0008.md](docs/tickets/pb-0008.md)   ·   **Epic**: `docs/tickets/personal-blog-platform.md` (no separate architecture page for this maintenance ticket)

**Back-references** (plans this builds on or inherits decisions from):

- `.claude/plans/pb-0005-public-post-pages.md` — Why: created `render.ts` and `queries.ts`, the two of the three target files that didn't already exist; PR #4's review of that plan's implementation is where this ticket originated.
- `.claude/plans/pb-0002-admin-authentication.md` / `.claude/plans/pb-0001-project-scaffold-and-supabase-schema.md` — Why: `server.ts` and the `admin.ts` precedent this ticket mirrors both originate there.

**Forward-references** (plans that extend or supersede this — append as follow-ups get created):

- (none yet — a future ticket may revisit `admin-email.ts`/`sanitize-redirect.ts` guarding under the Edge runtime, per Out of Scope above)

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ THESE BEFORE IMPLEMENTING

- [src/lib/supabase/admin.ts](src/lib/supabase/admin.ts) (lines 1-2) - Why: the exact pattern to mirror — `import "server-only";` as line 1, before all other imports.
- [src/lib/supabase/server.ts](src/lib/supabase/server.ts) (lines 1-3) - Why: target file; guard goes above the existing `createServerClient`/`cookies` imports.
- [src/lib/posts/queries.ts](src/lib/posts/queries.ts) (lines 1-3) - Why: target file; guard goes above the existing `cache`/`createClient` imports. Ticket calls out this file should carry its own guard rather than relying on `server.ts`'s transitively — add it here even though `server.ts` will also be guarded.
- [src/lib/markdown/render.ts](src/lib/markdown/render.ts) (lines 1-7) - Why: target file; guard goes above the `unified`/`remark`/`rehype` imports, ahead of the pipeline construction.
- [package.json](package.json) (line 23) - Why: confirms `server-only` is already a listed dependency; no `npm install` step needed.

### New Files to Create

- None. This ticket only edits three existing files (plus a scratch verification component that is created and then deleted, not committed).

### Relevant Documentation

- [server-only npm package](https://www.npmjs.com/package/server-only) - The package used; it has no runtime export, its `package.json` `"react-server"`/default conditional exports are what triggers Next's bundler error when pulled into a client graph.
- [Next.js docs: Keeping server-only code out of the client environment](https://nextjs.org/docs/app/guides/local-development#keeping-server-only-code-out-of-the-client-environment) - Confirms the `import "server-only"` convention and the exact error message it produces.

### Patterns to Follow

**Guard placement:** `import "server-only";` is always the first line of the file, before any other import — see [admin.ts:1](src/lib/supabase/admin.ts#L1). It's a side-effect-only import (no bound name), consistent across the one existing usage in this codebase.

**No other convention changes:** don't reorder existing imports, don't add a blank line between the guard and the next import unless matching `admin.ts`'s exact spacing (there is none in `admin.ts` — line 2 follows immediately).

---

## IMPLEMENTATION PLAN

### Phase 1: Add the guards

<Single phase — three independent one-line edits, no ordering dependency between them.>

**Tasks:**

- Add `import "server-only";` to the top of `server.ts`, `queries.ts`, and `render.ts`.

### Phase 2: Verify the guard is live

**Depends on:** Phase 1

**Tasks:**

- Confirm `npm run build` still succeeds with the guards in place (AC's first requirement).
- Create a scratch `"use client"` component importing one guarded module, confirm the build fails with `server-only`'s error, then delete the scratch component and re-confirm a clean build.

---

## STEP-BY-STEP TASKS

### UPDATE src/lib/supabase/server.ts

- **IMPLEMENT**: Insert `import "server-only";` as the new line 1, pushing the existing `createServerClient`/`cookies` imports down.
- **PATTERN**: [admin.ts:1](src/lib/supabase/admin.ts#L1)
- **IMPORTS**: `server-only` (side-effect import, no bound name)
- **GOTCHA**: `server.ts` is imported by `proxy.ts`... no — check: `proxy.ts` builds its own inline `createServerClient` call (per CLAUDE.md's architecture map: "proxy.ts builds an equivalent inline client... not this module"), so `server.ts` is NOT imported from the Edge middleware. It's only imported by the `(protected)` layout, login/logout Server Actions, and `lib/posts/queries.ts` — all genuine server contexts. Safe to guard.
- **VALIDATE**: `npx tsc --noEmit`
- **SATISFIES**: AC — `import "server-only"` added to `server.ts`

### UPDATE src/lib/posts/queries.ts

- **IMPLEMENT**: Insert `import "server-only";` as the new line 1, above the existing `react`/`@/lib/supabase/server`/`./types` imports.
- **PATTERN**: [admin.ts:1](src/lib/supabase/admin.ts#L1)
- **IMPORTS**: `server-only` (side-effect import, no bound name)
- **GOTCHA**: Add this even though `server.ts` (which `queries.ts` imports) will also be guarded — the ticket explicitly wants `queries.ts` to carry its own guard rather than relying on the transitive one, so the failure is attributable to the right module if it ever fires.
- **VALIDATE**: `npx tsc --noEmit`
- **SATISFIES**: AC — `import "server-only"` added to `queries.ts`

### UPDATE src/lib/markdown/render.ts

- **IMPLEMENT**: Insert `import "server-only";` as the new line 1, above the existing `unified`/`remark-parse`/`remark-gfm`/`remark-rehype`/`rehype-pretty-code`/`rehype-stringify`/`./rehype-copy-button` imports.
- **PATTERN**: [admin.ts:1](src/lib/supabase/admin.ts#L1)
- **IMPORTS**: `server-only` (side-effect import, no bound name)
- **GOTCHA**: `render.ts` is only ever invoked from `MarkdownContent.tsx`'s server-side caller (a Server Component passing the rendered HTML string down as a prop) — confirm no Client Component calls `renderMarkdown()` directly before assuming this is a no-op change. Grep for `renderMarkdown` usages if uncertain.
- **VALIDATE**: `npx tsc --noEmit`
- **SATISFIES**: AC — `import "server-only"` added to `render.ts`

### VERIFY guard is live (scratch component)

- **IMPLEMENT**: Temporarily create `src/app/scratch-server-only-check.tsx` with `"use client";` at the top and `import { renderMarkdown } from "@/lib/markdown/render";` (or any of the three guarded modules) plus a trivial component body that references it so the import isn't tree-shaken away.
- **PATTERN**: N/A — throwaway verification file, not a codebase pattern.
- **IMPORTS**: One of the three now-guarded modules.
- **GOTCHA**: The component must actually be reachable from a route (or at minimum type-checked/bundled) for Next's client-graph analysis to catch the violation — a file that exists but is never imported anywhere won't trigger the build error. Simplest: temporarily import the scratch component from `src/app/(public)/layout.tsx` (or any existing page), run the build, observe the failure, then revert both the scratch file and the temporary import.
- **VALIDATE**: `npm run build` — expect failure with `server-only`'s "This module cannot be imported from a Client Component module" error, referencing the guarded module.
- **SATISFIES**: AC — scratch `"use client"` component confirms the guard is live

### CLEANUP scratch verification files

- **IMPLEMENT**: Delete `src/app/scratch-server-only-check.tsx` and revert the temporary import added to whichever file referenced it.
- **VALIDATE**: `npm run build` — expect a clean, successful build (back to the pre-verification baseline, now with the guards permanently in place).
- **SATISFIES**: AC — `npm run build` still succeeds after adding the guards

---

## TESTING STRATEGY

No test suite exists in this project (per CLAUDE.md: "No test suite yet — a manual check... is enough for now"). This ticket's validation is entirely the build-time mechanism described above — there's no unit-testable behavior since no runtime logic changes.

### Unit Tests

None — no test framework in this project, and this change has no runtime behavior to unit-test (it's a build-time-only guard).

### Integration Tests

None — covered by the manual `npm run build` verification steps (Phase 2 / the VERIFY and CLEANUP tasks above).

### Edge Cases

- **False confidence from a no-op guard**: if the scratch component's import gets tree-shaken before Next's client-boundary check runs, the build could succeed even though the guard "worked" for the wrong reason. Mitigate by making sure the scratch component is actually referenced from a real route (see GOTCHA above) and by confirming the build genuinely fails, not just succeeds silently.
- **`queries.ts` still resolves correctly server-side**: since `queries.ts` is used by both the dynamic `(public)/page.tsx` (force-dynamic, PB-0006) and the static `posts/[slug]/page.tsx` (force-static, ISR), confirm both routes still build/render correctly after the guard is added — they're both genuine Server Components, so this should be a non-issue, but worth a quick manual dev-server check of both routes.

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

- `npm run lint` — must pass with zero output (matches PR #4's validation baseline).
- `npx tsc --noEmit` — must pass with zero errors.

### Level 2: Unit Tests

N/A — no test suite in this project.

### Level 3: Integration Tests

N/A — no integration test suite; covered by Level 4 manual validation.

### Level 4: Manual Validation

1. `npm run build` — succeeds with all three guards in place (baseline before scratch verification).
2. Add the scratch `"use client"` component importing a guarded module (see task above) and wire it into a reachable route; `npm run build` — fails with `server-only`'s Client Component error.
3. Delete the scratch component and its temporary import; `npm run build` — succeeds again.
4. `npm run dev` — spot-check `/` (list, force-dynamic) and one post detail page `/posts/[slug]` (force-static) both still render correctly, confirming `queries.ts`'s guard didn't break either route.

### Level 5: Additional Validation (Optional)

None applicable — no relevant MCP servers or additional CLI tooling for this change.

---

## ACCEPTANCE CRITERIA

- [ ] `import "server-only";` is the first line of `src/lib/supabase/server.ts`.
- [ ] `import "server-only";` is the first line of `src/lib/posts/queries.ts`.
- [ ] `import "server-only";` is the first line of `src/lib/markdown/render.ts`.
- [ ] `src/lib/markdown/rehype-copy-button.ts`, `src/lib/auth/admin-email.ts`, and `src/lib/auth/sanitize-redirect.ts` remain unguarded (unchanged).
- [ ] `npm run build` succeeds after the guards are added (final state).
- [ ] A scratch `"use client"` component importing a guarded module was confirmed to fail the build with `server-only`'s error, then removed — no scratch files or temporary imports remain in the final diff.
- [ ] `npm run lint` and `npx tsc --noEmit` both pass with zero errors.
- [ ] No behavioral change to any of the three files beyond the added import line.

---

## COMPLETION CHECKLIST

- [ ] All three guards added, matching `admin.ts`'s pattern exactly.
- [ ] Scratch verification performed and reverted (no leftover files).
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build` all pass.
- [ ] Manual dev-server spot-check of `/` and one `/posts/[slug]` route confirms no regression.
- [ ] Diff contains exactly three one-line additions (plus nothing else) when scratch files are excluded.

---

- **Verified during planning**: grepped `src/` for `from "@/lib/supabase/server"` — 8 importers, all genuine server contexts (`queries.ts`, admin CRUD pages/actions/route handler, login/logout actions, `(protected)` layout). `proxy.ts` is not among them, confirming it does not transitively pull in `server.ts`.
- **Verified during planning**: grepped `src/` for `renderMarkdown`/`getPublishedPosts`/`getAllTags`/`getPublishedPostBySlug` — only called from `render.ts` itself and the two Server Component pages (`(public)/page.tsx`, `(public)/posts/[slug]/page.tsx`). No Client Component imports any of them. Both open questions below are resolved as "no risk"; the guards can be added with no expected build failure on the real (non-scratch) codebase.

## NOTES (open canvas)

This is about as low-risk as a ticket gets — three one-line additions with a well-established precedent (`admin.ts`) already in the same codebase. The only real "work" is the verification step (Phase 2), which exists specifically to prove the guard does something rather than being a no-op comment-like addition. The plan spends more words on that verification than on the edits themselves because it's the part with any judgment calls (route reachability for tree-shaking, cleanup discipline).

Confidence this succeeds in one pass: very high. The main risk is forgetting to revert the scratch verification component, which the CLEANUP task and the ACCEPTANCE CRITERIA checklist both explicitly guard against.

## AMENDMENTS

(none yet)
