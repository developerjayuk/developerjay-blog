# Feature: PB-0007 — Deploy & DNS

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

This ticket is unusual for this repo: it's ~90% dashboard/DNS configuration outside the repo (Vercel project settings, Porkbun DNS, Supabase dashboard verification) and ~10% repo changes (README documentation). Every dashboard/DNS step below is explicitly flagged **[MANUAL]** — do not try to script or automate these; walk through them by hand and record what was actually clicked/entered so the README section written in the last phase reflects reality, not a guess.

## Feature Description

Take the already-built MVP (admin CRUD + image upload + public read/search, all merged through PB-0008) live at `blog.developerjay.com`. This means: connecting the GitHub repo to a new Vercel project, configuring the four Supabase/admin environment variables in Vercel (never committed), pointing a Porkbun-managed CNAME for the `blog` subdomain at the Vercel deployment, and running a production smoke check that proves the whole stack works end-to-end on the real domain — public pages, on-demand ISR revalidation after a real publish, and `/admin` login. The smoke check culminates in publishing a real first post, which also satisfies the PRD's time-to-first-post success metric.

## User Story

As Jason, the sole admin of this blog
I want the app connected to Vercel and reachable at blog.developerjay.com with working production auth and revalidation
So that I can actually start publishing weekly write-ups publicly instead of only running the app locally

## Problem Statement

The MVP feature set (PB-0001–PB-0006, PB-0008) is fully built and merged on `main`, but nothing is deployed. The PRD's actual "done" bar — a live post within a week of sign-off — isn't met until this ships. Every prior ticket assumed local `.env.local` values and `npm run dev`; none of that configuration exists in Vercel yet, and DNS for the `blog` subdomain hasn't been touched.

## Solution Statement

Import the GitHub repo (`developerjayuk/developerjay-blog`) into a new Vercel project (Vercel account already exists, no project for this repo yet). Configure the four env vars from `.env.local.example` in Vercel for both Production and Preview environments, sourced from the same single Supabase project used locally (no separate staging project — matches the architecture doc's data-model scope). Enable Vercel Authentication (free, all plans) on Preview/generated deployment URLs so they're not casually public, while the Production custom domain stays public as normal. Verify Porkbun actually controls DNS for `developerjay.com` (not yet confirmed — root domain already has something live there, so this must not disturb existing records), then add a `blog` CNAME per Vercel's project-specific target. Finish with a production smoke check that includes publishing a real first post — this exercises the full write → RLS → Storage → on-demand-revalidation path and satisfies the PRD's launch metric in the same pass.

## Out of Scope / Non-Goals

- **A separate staging Supabase project for Preview deployments** — not called for by the architecture doc's data model; Preview shares the Production Supabase project (RLS still limits anon reads to published posts; `/admin` on a preview URL still requires the real admin session + email allowlist).
- **Touching any existing DNS records at the `developerjay.com` root/`www`** — something is already live there; this ticket adds only a new `blog` host record and must not modify or remove anything else in the zone.
- **`vercel.json`** — not needed. Next.js App Router is auto-detected by Vercel's build system, and on-demand ISR revalidation is already code-driven (`revalidatePath()` in `actions.ts`), not config-driven. Only add one if a concrete Level 4 gap surfaces during smoke testing (see Open Questions).
- **Vercel Password Protection (paid Advanced Deployment Protection add-on)** — Vercel Authentication (free) is sufficient for a solo-admin project; the paid password-gate add-on is not needed.
- **Changing Supabase Auth config** (public sign-up disabled, admin user, RLS policies) — these were set up in PB-0002/PB-0001 and are only *verified*, not re-configured, here.
- **CI/CD beyond Vercel's built-in Git-push deploys** — no separate GitHub Actions pipeline is being introduced.
- **RSS, comments, analytics, video** — PRD non-goals, unaffected by this ticket.

## Feature Metadata

**Feature Type**: Deployment / Infrastructure configuration (not new application code)
**Estimated Complexity**: Low code complexity, Medium overall (external dependencies: DNS propagation timing, dashboard steps that can't be scripted, a production-only failure mode can't be caught by local `npm run dev`)
**Primary Systems Affected**: Vercel project (new), Porkbun DNS zone for `developerjay.com`, Supabase Auth config (verification only), `README.MD`
**Dependencies**: Existing Vercel account, Porkbun account access to the `developerjay.com` DNS zone, existing Supabase project (URL + publishable + secret keys already in local `.env.local`)

## Related Work

**Implements**: [docs/tickets/pb-0007.md](docs/tickets/pb-0007.md) · **Epic**: [docs/tickets/personal-blog-platform.md](docs/tickets/personal-blog-platform.md), architecture in [personal-blog-platform.prd.md](personal-blog-platform.prd.md) § Architecture → "Missing pieces" (DNS bullet) and § Boundaries & contracts (RLS/key-boundary rules this ticket must not weaken)

**Back-references** (plans this builds on or inherits decisions from):

- `.claude/plans/pb-0004-image-upload.md` — Why: production smoke test exercises the Storage upload path (`lib/supabase/admin.ts`, `post-images` bucket) for the first time outside local dev.
- `.claude/plans/pb-0006-search-tag-filtering-architecture.md` — Why: the public list page (`app/(public)/page.tsx`) is now dynamically rendered (`force-dynamic`); production smoke test must confirm search/tag filtering works against the real Supabase project, not just locally.
- `.claude/plans/pb-0008-harden-server-only-boundaries.md` — Why: most recent merged work; confirms `main` is currently in a deployable state with the `server-only` guards in place.

**Forward-references** (plans that extend or supersede this — append as follow-ups get created):

- (none yet)

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ THESE BEFORE IMPLEMENTING

- [.env.local.example](.env.local.example) - Why: the exact four env var names/descriptions to replicate in Vercel — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ADMIN_EMAIL`.
- [next.config.ts](next.config.ts) (lines 1-20) - Why: **build-time gotcha** — `NEXT_PUBLIC_SUPABASE_URL` is read at module scope to compute `images.remotePatterns` for the Supabase Storage hostname. If this var is missing when Vercel *builds* (not just at runtime), the image config silently becomes `remotePatterns: []` and every post's cover/inline images will 404 or refuse to render in production. This is the single most likely "worked locally, broken in prod" failure mode for this ticket.
- [src/proxy.ts](src/proxy.ts) (whole file) - Why: reads `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` directly via `process.env` (non-null-asserted, no fallback) and runs on Vercel's Edge Middleware runtime (`config.matcher: ["/admin/:path*"]`) — if these vars aren't set for Production, every `/admin/*` request throws at the edge instead of failing gracefully.
- [src/lib/supabase/admin.ts](src/lib/supabase/admin.ts) (whole file) - Why: reads `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`, non-null-asserted; used by the upload route and all admin dashboard writes. Missing this var in Production breaks post CRUD and image upload silently at runtime (not build time).
- [src/lib/auth/admin-email.ts](src/lib/auth/admin-email.ts) (whole file) - Why: `getAdminEmail()` throws explicitly ("ADMIN_EMAIL environment variable is not set") if `ADMIN_EMAIL` is missing — this is the one env var whose absence fails loudly rather than silently, useful as a quick production sanity signal if login breaks.
- [src/app/admin/(protected)/posts/actions.ts](<src/app/admin/(protected)/posts/actions.ts>) (lines 19-22, 81-86, 113-118) - Why: `revalidatePublicPaths()` calls `revalidatePath("/")` and `revalidatePath("/posts/${slug}")` on publish — this is the on-demand ISR mechanism the smoke test must prove works in production. No webhook or cron config needed; it's pure Next.js cache API, runs automatically on Vercel.
- [src/app/admin/(protected)/posts/upload/route.ts](<src/app/admin/(protected)/posts/upload/route.ts>) (lines 15-21) - Why: the Route Handler's own Origin/Host CSRF check compares `request.headers.get("origin")` against `request.headers.get("host")`. Once live at `blog.developerjay.com`, both headers will naturally match the real domain — no code change needed, but worth understanding so a production 403 on image upload is correctly diagnosed (e.g. proxied/rewritten requests changing the Host header) rather than mistaken for an auth bug.
- [.claude/references/supabase-access-control.md](.claude/references/supabase-access-control.md) (whole file) - Why: restates the key-boundary rules (secret key server-only, publishable key respects RLS, public sign-up must stay disabled) this ticket's env var configuration must not violate — e.g. never add `SUPABASE_SECRET_KEY` as a `NEXT_PUBLIC_`-prefixed var.
- [README.MD](README.MD) (whole file) - Why: current "Status" section says "Scaffolded (PB-0001)" — badly stale once this ticket ships; "Local setup" section's numbered-step style and doc-link style (§ Docs) is the pattern the new "Deployment" section should mirror.

### New Files to Create

- None. This ticket edits `README.MD` only; everything else is external dashboard/DNS configuration, not repo files. (Do not create `vercel.json` unless Level 4 smoke testing surfaces a concrete, specific need — see Open Questions.)

### Relevant Documentation — READ THESE BEFORE IMPLEMENTING

- [Vercel: Adding & Configuring a Custom Domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain)
  - Why: exact current flow for adding `blog.developerjay.com` under Project Settings → Domains and obtaining the project-specific CNAME target.
- [Vercel: Setting up a custom domain](https://vercel.com/docs/domains/set-up-custom-domain)
  - Why: subdomain-specific guidance — confirms a CNAME (not an A record) is correct for a non-apex host like `blog`.
- [Vercel: Environment Variables](https://vercel.com/docs/environment-variables)
  - Why: Production vs. Preview vs. Development scoping, the "Sensitive" flag for secrets, and that Preview variables apply to all non-production branches by default.
- [Vercel: Deployment Protection — Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)
  - Why: confirms Vercel Authentication (Standard Protection) is free on all plans including Hobby, and how its scope (Preview + generated URLs, excluding the Production custom domain) is configured.

### Patterns to Follow

**Env var naming:** `NEXT_PUBLIC_`-prefixed vars are the only ones safe client-side (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`); `SUPABASE_SECRET_KEY` and `ADMIN_EMAIL` carry no prefix and must never gain one — mirror `.env.local.example` exactly, including capitalization.

**README structure:** existing "Local setup" section ([README.MD:29-45](README.MD#L29-L45)) uses a numbered list with a short imperative sentence per step and inline dashboard-path breadcrumbs (e.g. "Settings → API Keys"). The new "Deployment" section should match this voice — numbered steps, dashboard breadcrumbs in the same style, no secret values ever written into the file.

**Manual/ops flagging:** the ticket itself calls out "flag these steps clearly as manual/ops in the loop that picks this up" — every dashboard/DNS task below carries an explicit **[MANUAL]** tag for this reason; don't attempt to find a CLI/API shortcut that defeats the point of a deliberate, verifiable-by-hand walkthrough for a one-time launch.

---

## IMPLEMENTATION PLAN

Phases run top to bottom by default; deviations are called out explicitly.

### Phase 1: Vercel project connection

**Tasks:**

- **[MANUAL]** Import the GitHub repo into a new Vercel project under the existing Vercel account.
- **[MANUAL]** Confirm Vercel auto-detects the Next.js framework preset and the root directory is the repo root (not a subfolder — this is not a monorepo).
- **[MANUAL]** Confirm the Production Branch is set to `main` (Vercel's default; matches this repo's actual default branch).

### Phase 2: Environment variables

**Depends on:** Phase 1 (project must exist first)

**Tasks:**

- **[MANUAL]** Add all four vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ADMIN_EMAIL`) to the Vercel project, scoped to **both Production and Preview**, using the same values already in local `.env.local` (same single Supabase project — no separate staging project per Out of Scope).
- **[MANUAL]** Mark `SUPABASE_SECRET_KEY` and `ADMIN_EMAIL` as **Sensitive** in the Vercel UI.
- **[MANUAL]** Trigger a redeploy (or push a no-op commit) so the build picks up the vars — required because of the `next.config.ts` build-time read of `NEXT_PUBLIC_SUPABASE_URL`.

### Phase 3: Preview deployment protection

**Depends on:** Phase 1 · **Independent of:** Phase 2, Phase 4 (can be configured any time after the project exists)

**Tasks:**

- **[MANUAL]** In Project Settings → Deployment Protection, enable **Vercel Authentication** (Standard Protection) scoped to Preview + auto-generated deployment URLs.
- **[MANUAL]** Confirm the Production custom domain (once added in Phase 4) is excluded from protection and stays publicly reachable.

### Phase 4: DNS — Porkbun CNAME

**Depends on:** Phase 1 (need the project to get its CNAME target)

**Tasks:**

- **[MANUAL]** Verify Porkbun actually hosts DNS for `developerjay.com` before touching anything — check the domain's nameservers (`dig NS developerjay.com` or Porkbun's own domain overview) actually point at Porkbun's DNS servers, not a third party like Cloudflare. Root domain already serves something live, so getting this wrong risks editing the wrong zone or having no effect.
- **[MANUAL]** In the Vercel project → Settings → Domains, add `blog.developerjay.com` and copy the exact CNAME target Vercel shows (project-specific, e.g. `xxxxxxxx.vercel-dns-xxx.com` — do not assume it's the generic `cname.vercel-dns.com`; use whatever the dashboard actually displays).
- **[MANUAL]** In Porkbun's DNS management for `developerjay.com`, add a new CNAME record: host `blog`, answer = the exact target copied above. **Do not modify or remove any existing record** (root/`@`, `www`, or anything else already serving the live site there).
- **[MANUAL]** Wait for propagation and click Verify in the Vercel dashboard; confirm Vercel reports the domain as valid and auto-provisions an SSL certificate.

### Phase 5: Production smoke test + first real post

**Depends on:** Phases 1-4 all complete

**Tasks:**

- Load `https://blog.developerjay.com/` — confirm the post list page renders without error (may be empty pre-first-post).
- Log into `/admin` on the production domain with the allowlisted admin email + password — proves `proxy.ts` (Edge Middleware) and `lib/supabase/server.ts` work with the production env vars end-to-end.
- Create and publish one real post, including at least one uploaded image — exercises `lib/supabase/admin.ts`, the `post-images` Storage bucket, and the upload route's CSRF origin/host check together for the first time in production.
- Immediately reload `/` and `/posts/<slug>` without a redeploy — confirms `revalidatePath()` on-demand ISR actually took effect (this is the ticket's specific "ISR revalidation works after a real publish" AC, not just "the page loads").
- Exercise search (`?q=`) and a tag filter (`?tag=`) on the production list page — confirms the PB-0006 dynamic rendering path works against the real Supabase project, not just local dev.
- Quick sanity: toggle dark mode, confirm it persists across a reload.

### Phase 6: Documentation

**Independent of:** Phase 5 (can be drafted in parallel, but should be finalized only after Phase 5 confirms the steps actually worked as described)

**Tasks:**

- Update `README.MD` "Status" section — no longer "Scaffolded (PB-0001)"; reflect that the MVP is live.
- Add a "Deployment" section to `README.MD` describing: Vercel project connected via Git integration, the four env vars (names only, referencing `.env.local.example` — never actual values), that Preview deployments share the Production Supabase project and are gated by Vercel Authentication, and the Porkbun CNAME step at a high level (host `blog` → Vercel-provided target, without hardcoding today's specific CNAME value since Vercel's target could change if the project is ever recreated).

---

## STEP-BY-STEP TASKS

### 1. CONFIGURE Vercel project — import repo

- **IMPLEMENT**: Import `developerjayuk/developerjay-blog` from GitHub as a new Vercel project.
- **PATTERN**: N/A — first-time project creation.
- **GOTCHA**: Confirm root directory is repo root; this repo is not a monorepo, but Vercel sometimes needs the root confirmed explicitly on first import.
- **VALIDATE**: Vercel dashboard shows the project with a successful (or at least attempted) first deployment.
- **SATISFIES**: AC1 ("Vercel project connected to the repo").

### 2. CONFIGURE Vercel environment variables

- **IMPLEMENT**: Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ADMIN_EMAIL` for both Production and Preview, sourced from the current local `.env.local` values.
- **PATTERN**: [.env.local.example](.env.local.example) — exact var names and one-line descriptions of what each is for.
- **IMPORTS**: N/A (dashboard config, not code).
- **GOTCHA**: [next.config.ts](next.config.ts) reads `NEXT_PUBLIC_SUPABASE_URL` at build time for image `remotePatterns` — the var must be present *before* the build runs, not just at request time. Mark `SUPABASE_SECRET_KEY`/`ADMIN_EMAIL` Sensitive.
- **VALIDATE**: Trigger a redeploy; build succeeds; `vercel env ls` (if using the CLI) or the dashboard confirms all four vars present in both environments.
- **SATISFIES**: AC1 ("environment variables ... configured in Vercel, not committed").

### 3. CONFIGURE Preview deployment protection

- **IMPLEMENT**: Enable Vercel Authentication (Standard Protection) on Preview + generated deployment URLs; leave the eventual Production custom domain public.
- **PATTERN**: [Vercel Deployment Protection docs](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication).
- **GOTCHA**: Confirm the scope explicitly excludes the custom Production domain — misconfiguring scope could accidentally lock out real readers.
- **VALIDATE**: Visiting an auto-generated preview URL while logged out of Vercel prompts for Vercel login; the eventual `blog.developerjay.com` does not.
- **SATISFIES**: Decision made during planning (not a literal ticket AC, but closes an exposure gap the ticket's ACs don't explicitly cover).

### 4. VERIFY Porkbun DNS authority for developerjay.com

- **IMPLEMENT**: Confirm Porkbun's nameservers are authoritative for `developerjay.com` before editing any record.
- **PATTERN**: N/A.
- **GOTCHA**: Root domain already has a live site — wrong assumption about which provider hosts DNS could mean edits in Porkbun's panel silently do nothing.
- **VALIDATE**: `dig NS developerjay.com` (or `nslookup -type=ns developerjay.com`) returns Porkbun nameservers; alternatively Porkbun's own domain overview confirms it manages DNS for this domain.
- **SATISFIES**: Precondition for AC2.

### 5. CONFIGURE Vercel custom domain

- **IMPLEMENT**: Add `blog.developerjay.com` in Project Settings → Domains; copy the exact CNAME target shown.
- **PATTERN**: [Vercel: Adding & Configuring a Custom Domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain).
- **GOTCHA**: The CNAME target is project-specific — don't reuse a generic value from a tutorial; use exactly what the dashboard shows for this project.
- **VALIDATE**: Vercel dashboard shows the domain as "Pending" with the exact record to add.
- **SATISFIES**: AC2 (setup half).

### 6. CONFIGURE Porkbun CNAME record

- **IMPLEMENT**: Add a CNAME record in Porkbun's DNS panel for `developerjay.com`: host `blog`, answer = the target copied in task 5.
- **PATTERN**: N/A.
- **GOTCHA**: Do not touch any other existing record in the zone (root/`@`, `www`, or anything else already live).
- **VALIDATE**: `dig CNAME blog.developerjay.com` resolves to the Vercel target once propagated.
- **SATISFIES**: AC2 ("`blog.developerjay.com` CNAME added in Porkbun DNS, pointed at the Vercel deployment").

### 7. VERIFY domain verification + SSL

- **IMPLEMENT**: Click Verify in Vercel once DNS has propagated.
- **PATTERN**: N/A.
- **GOTCHA**: Propagation can take minutes to a few hours; don't assume failure immediately.
- **VALIDATE**: `curl -I https://blog.developerjay.com` returns a `200`/`30x` with a valid TLS handshake (no cert warning); Vercel dashboard marks the domain "Valid Configuration".
- **SATISFIES**: AC2 (verification half).

### 8. VALIDATE production public pages

- **IMPLEMENT**: Load `https://blog.developerjay.com/` in a browser.
- **VALIDATE**: Post list page renders without server errors; dark mode toggle works.
- **SATISFIES**: AC3 ("public pages load over the real domain").

### 9. VALIDATE production admin login

- **IMPLEMENT**: Log into `/admin` on the production domain with the real admin credentials.
- **PATTERN**: [src/proxy.ts](src/proxy.ts), [src/app/admin/login/actions.ts](src/app/admin/login/actions.ts).
- **GOTCHA**: If login fails specifically with "not authorized for admin access," re-check `ADMIN_EMAIL` in Vercel matches the Supabase auth user's email exactly (case-sensitive comparison in `getAdminEmail()`/`admin-email.ts`).
- **VALIDATE**: Successful login redirects to `/admin`; logged-out access to `/admin/posts` redirects to `/admin/login`.
- **SATISFIES**: AC3 ("`/admin` login works in production").

### 10. VALIDATE production publish + ISR revalidation with a real first post

- **IMPLEMENT**: Create and publish a real post (with at least one uploaded image) from the production `/admin` UI.
- **PATTERN**: [src/app/admin/(protected)/posts/actions.ts](<src/app/admin/(protected)/posts/actions.ts>) `revalidatePublicPaths()`.
- **GOTCHA**: If the image upload 403s, check the Route Handler's Origin/Host CSRF comparison — this should naturally pass once both are `blog.developerjay.com`, but any proxying/redirect in front of Vercel could break the match.
- **VALIDATE**: Immediately after publishing (no manual redeploy), reload `/` and the new post's `/posts/<slug>` — both reflect the new post without a full rebuild.
- **SATISFIES**: AC3 ("ISR revalidation works after a real publish"); also satisfies the PRD's time-to-first-post success metric.

### 11. VALIDATE production search + tag filtering

- **IMPLEMENT**: Exercise `?q=<term>` and `?tag=<tag>` on the production list page.
- **PATTERN**: [src/lib/posts/queries.ts](src/lib/posts/queries.ts) `getPublishedPosts(filters)`.
- **VALIDATE**: Filtered results match expectations against the real Supabase data.
- **SATISFIES**: General production-parity confidence (not a literal ticket AC, but the PB-0006 feature must work in prod too).

### 12. UPDATE README.MD

- **IMPLEMENT**: Replace the stale "Status" line; add a "Deployment" section per Phase 6.
- **PATTERN**: [README.MD](README.MD) "Local setup" section's numbered-step, dashboard-breadcrumb voice.
- **GOTCHA**: Never write actual secret values into the file — names and dashboard paths only, exactly like `.env.local.example` already does for local setup.
- **VALIDATE**: `npm run lint` passes (Markdown isn't linted, but confirms no accidental code edits broke anything); manual read-through confirms no secrets present.
- **SATISFIES**: Ticket's own file-touch estimate ("deployment/env documentation in README.MD").

---

## TESTING STRATEGY

No automated test suite exists in this repo (per `CLAUDE.md`'s "no test suite yet" working principle), and this ticket introduces no new application code to unit-test. Verification is entirely the manual production smoke test in Phase 5 / Tasks 8-11 above, run against the real domain and real Supabase project.

### Manual Test Plan

1. Public list page loads on the real domain.
2. Public post detail page loads for an existing (or newly published) post.
3. Search and tag filtering return correct results against production data.
4. Admin login succeeds with the real allowlisted account; fails/redirects for anyone else or when logged out.
5. Full publish flow (create → upload image → publish) succeeds and is immediately visible without a redeploy.
6. Dark mode toggle persists.

### Edge Cases

- **Env var present in Production but not Preview (or vice versa)**: confirm both scopes explicitly rather than assuming Vercel copies one to the other.
- **DNS propagation delay**: don't conclude the CNAME is wrong within the first few minutes; re-check with `dig` before troubleshooting the Vercel side.
- **Build-time vs. runtime env var**: if post images 404 in production but everything else works, suspect `next.config.ts`'s build-time read of `NEXT_PUBLIC_SUPABASE_URL` first — check whether the var was set *before* the last successful build, not just currently present.
- **Origin/Host mismatch on image upload**: if uploads 403 in production but login works, check the upload route's CSRF header comparison against how the request actually reached Vercel.

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```
npm run lint
```

### Level 2: Unit Tests

N/A — no test suite exists in this repo; not introduced by this ticket (per CLAUDE.md working principles).

### Level 3: Integration Tests

N/A — same as above.

### Level 4: Manual Validation

- Browser walkthrough of the 6-step Manual Test Plan above, performed against `https://blog.developerjay.com` after DNS verification completes.
- `curl -I https://blog.developerjay.com` — confirm `200`, valid TLS.
- Publish one real post through the production `/admin` UI and confirm `/` + `/posts/<slug>` update without a manual redeploy.

### Level 5: Additional Validation

```
dig NS developerjay.com
dig CNAME blog.developerjay.com
```

Use before/after the Porkbun CNAME change to confirm DNS authority and propagation.

---

## ACCEPTANCE CRITERIA

- [ ] Vercel project connected to the repo via Git integration (main = Production Branch).
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ADMIN_EMAIL` configured in Vercel for Production and Preview — not committed anywhere in the repo.
- [ ] `blog.developerjay.com` CNAME added in Porkbun DNS, verified in Vercel, SSL certificate issued — no other existing DNS record in the zone modified.
- [ ] Public pages load correctly over `https://blog.developerjay.com`.
- [ ] `/admin` login works in production with the real allowlisted account.
- [ ] A real post published in production is immediately visible on `/` and its detail page without a manual redeploy (on-demand ISR revalidation confirmed working).
- [ ] Search and tag filtering work against production data.
- [ ] Preview/generated deployment URLs require Vercel Authentication; the Production domain does not.
- [ ] `README.MD` updated with an accurate Status line and a Deployment section containing no secret values.
- [ ] No regressions — logged-out `/admin/*` access still redirects to `/admin/login`.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order (Phases 1-6)
- [ ] Each task's validation step passed immediately after that task
- [ ] Full manual smoke test (Level 4) passed on the real domain
- [ ] `npm run lint` passes after the README edit
- [ ] No secrets present anywhere in the repo (README, commit history for this change)
- [ ] Acceptance criteria all met
- [ ] README changes reviewed for accuracy against what was actually configured

---

## OPEN QUESTIONS / ASSUMPTIONS

- **Assumes** Porkbun is confirmed as the actual DNS host for `developerjay.com` once Task 4 runs `dig NS` — if it turns out DNS is delegated elsewhere (e.g. Cloudflare), Phase 4's CNAME step moves to that provider's panel instead; the Vercel-side steps (get target, verify) are unaffected.
- **Assumes** the existing site at the `developerjay.com` root is unaffected by adding a `blog` subdomain CNAME — true for any standard DNS setup (a new host record doesn't touch `@`/`www`), but worth a quick post-change check that the root site still resolves correctly.
- **Assumes** Supabase Auth's "Allow new user signups" is already disabled and the one admin user already exists (set up in PB-0002) — not re-configured here, but worth a quick dashboard glance (Authentication → Providers / Users) while already doing dashboard work, since CLAUDE.md calls this out as "the actual security boundary the `/admin` gate depends on."
- **Assumes** Vercel plan (Hobby vs. Pro) doesn't matter for this ticket — Vercel Authentication (used for Preview protection) is free on all plans; if a future need for the paid Password Protection add-on arises, that's a separate decision.
- **Open**: if Level 4 smoke testing surfaces a concrete need Vercel's zero-config defaults don't cover (e.g. a specific header or redirect), that's the one case where adding a minimal `vercel.json` would be justified — flag it as a plan amendment rather than silently adding one.

## NOTES (open canvas)

**Decisions locked in during the planning conversation** (see chat history for full rationale):

| Decision point | Chosen | Why |
|---|---|---|
| Preview env config | Share Production Supabase credentials | No staging Supabase project exists per the architecture doc; lowest friction for a solo-admin project; RLS + real admin auth still gate anything sensitive. |
| Preview URL exposure | Vercel Authentication (free) on Preview/generated URLs | Closes a "public but unlisted" gap at zero cost; Production domain unaffected. |
| DNS host | Not yet confirmed — verify before editing | Root domain already serves something live; wrong-provider edits would silently no-op. |
| First-post handling | Publish a real post as part of this ticket | Single pass satisfies both the ISR-revalidation AC and the PRD's time-to-first-post metric. |
| `vercel.json` | Not created unless proven necessary | Next.js zero-config on Vercel already covers everything this ticket needs. |

**Why this ticket's tasks read differently from a typical code ticket:** most "tasks" here have no meaningful automated validation — a Vercel dashboard click can't be asserted by a test runner. The `VALIDATE` line on each manual task is deliberately an observable dashboard/browser/CLI check (e.g. `dig`, `curl -I`, "dashboard shows X") rather than a script, so the implementing agent (or Jason, doing this by hand) has a concrete definition of "done" per step even without code to run.

## AMENDMENTS

(none yet)
