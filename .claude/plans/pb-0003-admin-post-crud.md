# Feature: PB-0003 — Admin post CRUD (create, edit, delete, draft/publish)

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils, types, and clients. Import from the right files — this ticket introduces a new `lib/posts/` domain module alongside the existing `lib/supabase/` and `lib/auth/` ones; don't reach for `lib/supabase/admin` here, the confirmed decision is `lib/supabase/server` for every write in this ticket.

## Feature Description

The first real content-management capability: an admin post list (all statuses, with badges), a shared create/edit form (title, slug, excerpt, markdown content, tags, draft/published status), delete with confirmation, and publish-time ISR revalidation of the public pages PB-0005 will build. Today `/admin` is just a login-gated post-count stub — this ticket is what makes the admin area actually useful.

## User Story

As the sole admin (Jason)
I want to create, edit, publish, and delete posts from a web UI
So that I can publish a weekly write-up without touching the database directly.

## Problem Statement

The `posts` table and its RLS policies exist (PB-0001), and `/admin` is session-gated (PB-0002), but there is no UI or Server Action that reads or writes a single row in that table. There is no way to get a post from "idea" to "published" today except by hand-editing rows in the Supabase dashboard.

## Solution Statement

Add a `posts/` route tree under the existing `admin/(protected)/` group: a list page, a shared `PostForm` (mode-driven create/edit) backed by `createPost`/`updatePost` Server Actions, and a `deletePost` action wrapped in a small confirm-then-submit `DeleteButton`. All writes go through `lib/supabase/server.ts` (the session-scoped, RLS-respecting client already used by login/logout), not the privileged `admin.ts` client — RLS's `admin full access ... using (auth.role() = 'authenticated')` policy already grants the logged-in admin full read/write, so the weaker key is sufficient and keeps the secret key's usage surface as small as possible.

`published_at` is populated by a new Postgres trigger (`set_published_at`), not app code — mirroring the existing `set_updated_at` trigger in the same migration file. The rule ("set once, on the first transition into `published`, never touched again") lives in one place and applies uniformly to inserts and updates, which also removes the need for a pre-write `SELECT` in the Server Actions.

Revalidation (`revalidatePath("/")` + `revalidatePath(\`/posts/${slug}\`)`) fires whenever a write could change what the public site shows: creating/updating a post that is or becomes `published`, and deleting/unpublishing a post that currently is `published`. The old status needed for that decision travels through a hidden `currentStatus` form field (the edit page already loaded the post to render the form) rather than a second DB round trip.

## Out of Scope / Non-Goals

- **`cover_image_url` field** — not part of this ticket's form. The ticket's own field list (title, slug, excerpt, content, tags, status) omits it; PB-0004 owns both the image-upload widget and populating this column. The column stays `null` until then.
- **Rich/live markdown preview** — the ticket specifies a plain textarea; live rendering is PB-0005's `react-markdown`/`shiki` pipeline, not this ticket's concern.
- **Quick publish/unpublish buttons on the list page** — status changes go through the create/edit form only (the form's status `<select>`). A one-click list-page toggle is a natural fast-follow, not built here.
- **Automated tests** — per the confirmed decision, this ticket is verified manually (dev server + browser), consistent with CLAUDE.md's current "no test suite yet" default. The ticket's own 20–30% test estimate is treated as stale.
- **Supabase generated `Database` types** (`supabase gen types typescript`) — not wired up yet. This plan hand-declares a `Post` type in `lib/posts/types.ts` and uses supabase-js's `.returns<T>()` / `.maybeSingle<T>()` generics for type safety at each call site. Revisit once more tables exist.
- **The public pages that consume the revalidated paths** — `app/(public)/page.tsx` and `app/(public)/posts/[slug]/page.tsx` don't exist yet; that's PB-0005. This ticket only calls `revalidatePath` against the paths PB-0005's own ticket text already commits to using.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium (touches the data model via one new trigger migration — a CLAUDE.md-flagged area — but the pattern is directly precedented by the existing `set_updated_at` trigger; everything else is standard CRUD)
**Primary Systems Affected**: `src/app/admin/(protected)/posts/*` (new), `src/lib/posts/*` (new), `supabase/migrations/*` (new migration), `src/app/admin/(protected)/page.tsx` (nav link)
**Dependencies**: None new — no additional npm packages required (slug generation is a ~4-line regex, not a library)

## Related Work

**Implements**: `docs/tickets/pb-0003.md`   ·   **Epic**: `docs/tickets/personal-blog-platform.md` (no separate architecture page — decisions inherited from `personal-blog-platform.prd.md`'s Architecture section)

**Back-references** (plans this builds on or inherits decisions from):

- `.claude/plans/pb-0002-admin-authentication.md` — Why: this ticket's every page lives inside the `(protected)` route group and every write uses the `server.ts` client that plan introduced; no new auth logic is added here.
- `.claude/plans/pb-0001-project-scaffold-and-supabase-schema.md` — Why: the `posts` schema, RLS policies, and the `set_updated_at` trigger pattern this ticket's new trigger mirrors.

**Forward-references** (plans that extend or supersede this — append as follow-ups get created):

- PB-0004 (image upload) will extend `PostForm.tsx` with an image-upload widget and start populating `cover_image_url`.
- PB-0005 (public pages) will create the exact paths (`/`, `/posts/[slug]`) this ticket's `revalidatePath` calls target.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ THESE BEFORE IMPLEMENTING

- `src/app/admin/login/actions.ts` (whole file) — Why: the `useActionState`-compatible Server Action shape to mirror exactly: `(prevState, formData) => Promise<State>`, `State = {error: string} | null`, plain `{data, error}` destructuring (no try/catch), `redirect()` called as a bare top-level statement only on the success path.
- `src/app/admin/login/login-form.tsx` (whole file) — Why: the Client Component pattern (`"use client"`, `useActionState`, inline error paragraph, `disabled={pending}` button) that `PostForm.tsx` follows.
- `src/app/admin/actions/logout.ts` (whole file) — Why: the plain (non-`useActionState`) Server Action shape — `deletePost` follows this simpler pattern since it doesn't need to surface inline validation state.
- `src/app/admin/(protected)/layout.tsx` and `src/app/admin/(protected)/page.tsx` (whole files) — Why: `posts/*` nests inside this same `(protected)` group and inherits its gating automatically; the dashboard page is where the new "Manage posts" link is added, and its `createClient()`/query shape is close to what the list/edit pages need (but note: dashboard uses `lib/supabase/admin`, this ticket's pages use `lib/supabase/server` — see Patterns).
- `src/lib/supabase/server.ts` (whole file) — Why: this is the client every new Server Action and Server Component in this ticket uses. Async factory — every caller must `await createClient()`.
- `src/lib/auth/sanitize-redirect.ts` (whole file) — Why: not reused directly, but the "never trust the client value, re-derive/validate server-side" instinct it embodies is exactly why `readPostFields` re-runs `slugify()` on the server rather than trusting the client-computed slug verbatim.
- `supabase/migrations/20260819181837_init_schema.sql` (whole file, esp. lines 19–31) — Why: the `set_updated_at` trigger this ticket's new `set_published_at` trigger mirrors line-for-line in structure (`create or replace function` + `drop trigger if exists` + `create trigger ... before ... for each row execute function ...`), and the RLS policy (lines 41–45) confirming `server.ts`'s RLS-scoped writes will succeed for the authenticated admin.
- `.claude/references/data-model.md` (whole file) — Why: confirms `tags` is a plain `text[]` (no join table) and there's no media table — both directly shape `readPostFields`'s tag parsing and the decision to exclude `cover_image_url` from this ticket.
- `src/app/globals.css`, `src/app/page.tsx` — Why: the Tailwind utility-class vocabulary already in use (`rounded border px-3 py-2`, `text-sm`, `dark:` variants) — match it, don't invent a new style.
- `tsconfig.json` (lines 21–23) — Why: `@/*` maps to `./src/*`; all new imports use that alias, matching every existing file.

### New Files to Create

- `supabase/migrations/<generated-timestamp>_set_published_at_trigger.sql` — the `published_at`-on-first-publish trigger.
- `src/lib/posts/types.ts` — the hand-declared `Post`/`PostStatus` types shared by every file below.
- `src/lib/posts/slugify.ts` — pure slug-normalization function, used both for the live client-side preview and server-side normalization.
- `src/app/admin/(protected)/posts/actions.ts` — `createPost`, `updatePost`, `deletePost` Server Actions.
- `src/app/admin/(protected)/posts/PostForm.tsx` — shared create/edit form (Client Component).
- `src/app/admin/(protected)/posts/DeleteButton.tsx` — confirm-then-delete form (Client Component).
- `src/app/admin/(protected)/posts/page.tsx` — post list (all statuses, badges, edit/delete actions, "New post" link).
- `src/app/admin/(protected)/posts/new/page.tsx` — renders `<PostForm mode="create" />`.
- `src/app/admin/(protected)/posts/[id]/edit/page.tsx` — fetches one post, renders `<PostForm mode="edit" post={post} />`, 404s on a missing id.

### Files to Update

- `src/app/admin/(protected)/page.tsx` — add a "Manage posts" link to `/admin/posts`.
- `CLAUDE.md` — Architecture map: note the new `admin/(protected)/posts/` tree and `lib/posts/`.
- `.claude/references/data-model.md` — note the `published_at`-on-first-publish trigger, so a future reader doesn't assume app code sets it.

### Relevant Documentation — READ THESE BEFORE IMPLEMENTING

- [Supabase JS: Update data](https://supabase.com/docs/reference/javascript/update) and [Insert data](https://supabase.com/docs/reference/javascript/insert)
  - Confirms `{data, error}` shape and that `error` (a `PostgrestError`) carries a Postgres `.code` — `23505` is `unique_violation`, the exact code the `posts_slug_key` constraint raises on a duplicate slug.
- [Next.js: `revalidatePath`](https://nextjs.org/docs/app/api-reference/functions/revalidatePath)
  - Confirms calling `revalidatePath` for a path with no page built yet (true here — PB-0005 doesn't exist) is safe and simply marks that path for revalidation next time it's requested; it does not throw for an as-yet-nonexistent route.
- [Next.js: Server Actions and Mutations — updating data](https://nextjs.org/docs/app/getting-started/updating-data)
  - Confirms a plain `<form action={someAction}>` (no `useActionState`) automatically refreshes the current route's data after the action completes, when the action doesn't `redirect()` — this is why `deletePost` needs no manual `revalidatePath("/admin/posts")` call for the list page itself.
- [PostgreSQL: Trigger procedures (`BEFORE INSERT OR UPDATE`)](https://www.postgresql.org/docs/current/plpgsql-trigger.html)
  - Confirms a single `before insert or update` trigger can branch on `TG_OP`-independent column checks (`NEW.status`/`NEW.published_at`) without needing `TG_OP`, exactly as the existing `set_updated_at` trigger does.

### Patterns to Follow

**Server Action shape — two variants already established, both followed here:**

1. Stateful (`useActionState`-bound): `(prevState, formData) => Promise<State>`, `State = {error: string} | null`, plain `{data, error}` checks, `redirect()` as a bare statement on success (`src/app/admin/login/actions.ts`). `createPost`/`updatePost` follow this exactly — reuse the same `PostFormState = {error: string} | null` shape as `LoginState`.
2. Plain (form-bound, no state): `async function action(formData) {...}` with no return value, used when there's no inline validation feedback to show (`src/app/admin/actions/logout.ts`). `deletePost` follows this.

**Client factory convention:** every new file that talks to Supabase does `const supabase = await createClient();` importing from `@/lib/supabase/server` — never `@/lib/supabase/admin` in this ticket (see Feature Description for why).

**"use client" minimal-surface pattern** (`src/lib/theme/theme-toggle.tsx`, `src/app/admin/login/login-form.tsx`): keep the interactive boundary as small as possible. `posts/page.tsx`, `posts/new/page.tsx`, and `posts/[id]/edit/page.tsx` all stay Server Components; only `PostForm.tsx` and `DeleteButton.tsx` are `"use client"`.

**Never trust the client's derived value — re-derive server-side.** `PostForm.tsx` auto-generates the slug in the browser purely for UX (instant feedback as you type the title); `readPostFields` in `actions.ts` re-runs `slugify()` on whatever slug value actually arrives, so a hand-edited or JS-disabled submission still gets a normalized, valid slug. Same instinct as `sanitize-redirect.ts`.

**Business rules that must hold regardless of write path belong in a DB trigger, not app code** (`set_updated_at`, and now `set_published_at`) — keeps `createPost` and `updatePost` from duplicating "only set this the first time" logic, and makes it impossible to bypass by writing to the table from anywhere else (SQL editor, a future script) that isn't this ticket's Server Actions.

**Styling vocabulary** (from `src/app/page.tsx`, `src/app/admin/login/login-form.tsx`): `rounded border px-3 py-2`, `text-sm`, `text-red-600` for errors, `dark:` variants where the existing pages use them. No component library — plain Tailwind utility classes on native elements.

---

## IMPLEMENTATION PLAN

### Phase 1: Schema

<No dependency — everything else assumes this trigger exists.>

**Tasks:**

- Add the `set_published_at` trigger migration; apply it manually via the Supabase SQL Editor (same documented workaround as PB-0001/PB-0002, until the CLI's non-interactive token auth is supported — see README.MD step 3).

### Phase 2: Foundation

**Depends on:** Phase 1 conceptually (the `Post` type's `published_at` semantics assume the trigger exists), no code dependency.

**Tasks:**

- Create `lib/posts/types.ts` and `lib/posts/slugify.ts` — shared by every file in later phases.

### Phase 3: Server Actions

**Depends on:** Phase 2 (types, slugify) and the existing `lib/supabase/server.ts`.

**Tasks:**

- Implement `createPost`, `updatePost`, `deletePost` in `posts/actions.ts`.

### Phase 4: UI components

**Depends on:** Phase 3 (imports the actions) and Phase 2 (imports the types).

**Tasks:**

- Implement `PostForm.tsx` (shared create/edit) and `DeleteButton.tsx` (confirm-then-submit).

### Phase 5: Pages

**Depends on:** Phase 3 and Phase 4.

**Tasks:**

- Implement the list, new, and edit pages.

### Phase 6: Navigation & docs

**Depends on:** Phase 5.

**Tasks:**

- Link the dashboard to `/admin/posts`; update `CLAUDE.md` and `data-model.md`.

---

## STEP-BY-STEP TASKS

### Task 1: CREATE the `set_published_at` trigger migration

- **IMPLEMENT**: Run `npx supabase migration new set_published_at_trigger` to get a correctly timestamped filename, then write:
  ```sql
  -- auto-populate published_at the first time a post's status becomes 'published';
  -- never overwritten afterward, so unpublish/republish cycles preserve the original date.
  create or replace function public.set_published_at()
  returns trigger as $$
  begin
    if new.status = 'published' and new.published_at is null then
      new.published_at = now();
    end if;
    return new;
  end;
  $$ language plpgsql;

  drop trigger if exists posts_set_published_at on public.posts;
  create trigger posts_set_published_at
    before insert or update on public.posts
    for each row execute function public.set_published_at();
  ```
- **PATTERN**: `supabase/migrations/20260819181837_init_schema.sql:20-31` (`set_updated_at`) — identical structure (`create or replace function` → `drop trigger if exists` → `create trigger ... before ... for each row execute function ...`), applied to a new column instead.
- **GOTCHA**: This migration must be applied to the live Supabase project manually via the SQL Editor (README.MD step 3's documented workaround) before any Server Action in Phase 3 is manually tested — until then, `published_at` will simply stay `null` on every insert/update, which will look like a silent bug rather than a missing-migration issue.
- **VALIDATE**: After applying in the SQL Editor, `select trigger_name from information_schema.triggers where event_object_table = 'posts';` should list both `posts_set_updated_at` and `posts_set_published_at`.
- **SATISFIES**: AC4 (publishing sets `published_at`).

### Task 2: CREATE src/lib/posts/types.ts

- **IMPLEMENT**:
  ```typescript
  export type PostStatus = "draft" | "published";

  export type Post = {
    id: string;
    slug: string;
    title: string;
    excerpt: string | null;
    content: string;
    cover_image_url: string | null;
    tags: string[];
    status: PostStatus;
    published_at: string | null;
    created_at: string;
    updated_at: string;
  };
  ```
- **PATTERN**: field-for-field match of `supabase/migrations/20260819181837_init_schema.sql:2-14`.
- **GOTCHA**: Keep this the single source of truth for the row shape — every other file in this plan imports `Post`/`PostStatus` from here rather than redeclaring inline fields (unlike `LoginState`, which is small enough to live directly in its action file).
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: infra prerequisite for all ACs.

### Task 3: CREATE src/lib/posts/slugify.ts

- **IMPLEMENT**:
  ```typescript
  export function slugify(input: string): string {
    return input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
  ```
- **GOTCHA**: A title made entirely of symbols/whitespace slugifies to `""` — `readPostFields` (Task 4) must treat that as a validation error, not silently insert an empty slug (which would collide with any other empty-titled post on the unique constraint).
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: AC2 (slug auto-generated from title, editable).

### Task 4: CREATE src/app/admin/(protected)/posts/actions.ts

- **IMPLEMENT**:
  ```typescript
  "use server";

  import { redirect } from "next/navigation";
  import { revalidatePath } from "next/cache";
  import { createClient } from "@/lib/supabase/server";
  import { slugify } from "@/lib/posts/slugify";
  import type { PostStatus } from "@/lib/posts/types";

  export type PostFormState = { error: string } | null;

  function parseTags(raw: FormDataEntryValue | null): string[] {
    if (typeof raw !== "string") return [];
    return raw
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
  }

  function revalidatePublicPaths(slug: string) {
    revalidatePath("/");
    revalidatePath(`/posts/${slug}`);
  }

  type ParsedFields = {
    title: string;
    slug: string;
    excerpt: string | null;
    content: string;
    tags: string[];
    status: PostStatus;
  };

  function readPostFields(formData: FormData): ParsedFields | { error: string } {
    const title = formData.get("title");
    const rawSlug = formData.get("slug");
    const excerpt = formData.get("excerpt");
    const content = formData.get("content");
    const status = formData.get("status");

    if (typeof title !== "string" || !title.trim()) {
      return { error: "Title is required." };
    }

    const slugSource = typeof rawSlug === "string" && rawSlug.trim() ? rawSlug : title;
    const slug = slugify(slugSource);
    if (!slug) {
      return { error: "Slug is required — adjust the title or set a slug manually." };
    }

    if (status !== "draft" && status !== "published") {
      return { error: "Invalid status." };
    }

    return {
      title: title.trim(),
      slug,
      excerpt: typeof excerpt === "string" && excerpt.trim() ? excerpt.trim() : null,
      content: typeof content === "string" ? content : "",
      tags: parseTags(formData.get("tags")),
      status,
    };
  }

  export async function createPost(
    _prevState: PostFormState,
    formData: FormData,
  ): Promise<PostFormState> {
    const fields = readPostFields(formData);
    if ("error" in fields) return fields;

    const supabase = await createClient();
    const { error } = await supabase.from("posts").insert(fields);

    if (error) {
      if (error.code === "23505") {
        return { error: "That slug is already in use — try a different one." };
      }
      return { error: "Could not create the post. Please try again." };
    }

    if (fields.status === "published") {
      revalidatePublicPaths(fields.slug);
    }

    redirect("/admin/posts");
  }

  export async function updatePost(
    _prevState: PostFormState,
    formData: FormData,
  ): Promise<PostFormState> {
    const id = formData.get("id");
    if (typeof id !== "string" || !id) {
      return { error: "Missing post id." };
    }

    const fields = readPostFields(formData);
    if ("error" in fields) return fields;

    const currentSlug = formData.get("currentSlug");
    const wasPublished = formData.get("currentStatus") === "published";

    const supabase = await createClient();
    const { error } = await supabase.from("posts").update(fields).eq("id", id);

    if (error) {
      if (error.code === "23505") {
        return { error: "That slug is already in use — try a different one." };
      }
      return { error: "Could not update the post. Please try again." };
    }

    if (wasPublished || fields.status === "published") {
      revalidatePublicPaths(fields.slug);
      if (typeof currentSlug === "string" && currentSlug && currentSlug !== fields.slug) {
        revalidatePublicPaths(currentSlug);
      }
    }

    redirect("/admin/posts");
  }

  export async function deletePost(formData: FormData): Promise<void> {
    const id = formData.get("id");
    const slug = formData.get("slug");
    const status = formData.get("status");

    if (typeof id !== "string" || !id) {
      throw new Error("Missing post id.");
    }

    const supabase = await createClient();
    const { error } = await supabase.from("posts").delete().eq("id", id);

    if (error) {
      throw error;
    }

    if (status === "published" && typeof slug === "string" && slug) {
      revalidatePublicPaths(slug);
    }
  }
  ```
- **PATTERN**: `src/app/admin/login/actions.ts` (stateful action shape, `{data,error}` checks, bare `redirect()`) for `createPost`/`updatePost`; `src/app/admin/actions/logout.ts` (plain action, no state) for `deletePost`.
- **IMPORTS**: `next/navigation` (`redirect`), `next/cache` (`revalidatePath`), `@/lib/supabase/server`, `@/lib/posts/slugify`, `@/lib/posts/types`.
- **GOTCHA #1**: `redirect()` throws internally (Next.js mechanism) — never wrap it in a `try/catch` that could also catch Supabase errors. This file follows login's style of using no `try/catch` at all, checking `.error` directly, so this isn't a risk here — preserve that style if refactoring.
- **GOTCHA #2**: Call `revalidatePublicPaths` **before** `redirect()`, not after — code after a `redirect()` call never runs.
- **GOTCHA #3**: `error.code === "23505"` is Postgres's `unique_violation` code, raised by the `posts_slug_key` unique constraint. This is the *only* unique constraint on the table, so it's safe to assume any `23505` here means a slug collision.
- **GOTCHA #4**: `updatePost`'s `wasPublished` comes from a hidden `currentStatus` form field (set by `PostForm.tsx` from the post it loaded), not a fresh DB read — this trades a theoretical staleness window (two concurrent edits) for avoiding an extra round trip, acceptable for a single-admin tool.
- **GOTCHA #5**: `deletePost` deliberately does not call `revalidatePath("/admin/posts")` — that route is already dynamically rendered (it calls `createClient()` from `server.ts`, which reads cookies, forcing per-request rendering), and Next.js automatically refreshes the current route's data after a plain form action completes without redirecting.
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: AC2 (create), AC3 (edit), AC4 (publish sets revalidation), AC5 (delete).

### Task 5: CREATE src/app/admin/(protected)/posts/PostForm.tsx

- **IMPLEMENT**:
  ```typescript
  "use client";

  import { useActionState, useState } from "react";
  import { createPost, updatePost, type PostFormState } from "./actions";
  import { slugify } from "@/lib/posts/slugify";
  import type { Post } from "@/lib/posts/types";

  type PostFormProps = { mode: "create"; post?: undefined } | { mode: "edit"; post: Post };

  export function PostForm({ mode, post }: PostFormProps) {
    const action = mode === "create" ? createPost : updatePost;
    const [state, formAction, pending] = useActionState<PostFormState, FormData>(action, null);
    const [slug, setSlug] = useState(post?.slug ?? "");
    const [slugTouched, setSlugTouched] = useState(mode === "edit");

    return (
      <form action={formAction} className="flex flex-col gap-4 max-w-2xl">
        {mode === "edit" && (
          <>
            <input type="hidden" name="id" value={post.id} />
            <input type="hidden" name="currentSlug" value={post.slug} />
            <input type="hidden" name="currentStatus" value={post.status} />
          </>
        )}

        <label htmlFor="title" className="text-sm">
          Title
        </label>
        <input
          type="text"
          id="title"
          name="title"
          required
          defaultValue={post?.title}
          onChange={(e) => {
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
          className="rounded border px-3 py-2"
        />

        <label htmlFor="slug" className="text-sm">
          Slug
        </label>
        <input
          type="text"
          id="slug"
          name="slug"
          required
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          className="rounded border px-3 py-2"
        />

        <label htmlFor="excerpt" className="text-sm">
          Excerpt
        </label>
        <textarea
          id="excerpt"
          name="excerpt"
          rows={2}
          defaultValue={post?.excerpt ?? ""}
          className="rounded border px-3 py-2"
        />

        <label htmlFor="content" className="text-sm">
          Content (Markdown)
        </label>
        <textarea
          id="content"
          name="content"
          rows={16}
          defaultValue={post?.content}
          className="rounded border px-3 py-2 font-mono text-sm"
        />

        <label htmlFor="tags" className="text-sm">
          Tags (comma-separated)
        </label>
        <input
          type="text"
          id="tags"
          name="tags"
          defaultValue={post?.tags.join(", ")}
          className="rounded border px-3 py-2"
        />

        <label htmlFor="status" className="text-sm">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={post?.status ?? "draft"}
          className="rounded border px-3 py-2"
        >
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>

        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

        <button type="submit" disabled={pending} className="rounded border px-3 py-2 text-sm">
          {pending ? "Saving…" : mode === "create" ? "Create post" : "Save changes"}
        </button>
      </form>
    );
  }
  ```
- **PATTERN**: `src/app/admin/login/login-form.tsx` — `useActionState` wiring, inline error paragraph, `disabled={pending}` button, minimal `"use client"` surface.
- **IMPORTS**: `react` (`useActionState`, `useState`), `./actions`, `@/lib/posts/slugify`, `@/lib/posts/types`.
- **GOTCHA #1**: `slugTouched` starts `true` in edit mode and `false` in create mode — editing an existing post's title must never silently rewrite its (possibly already-public) slug; auto-generation-from-title only applies while creating.
- **GOTCHA #2**: The `mode === "edit"` discriminated union means TypeScript only allows `post.id`/`post.slug`/`post.status` access inside that branch — don't destructure `post` at the top of the function, it's `undefined` in create mode.
- **GOTCHA #3**: `action` is chosen once per render based on `mode`, not per-submit — `mode` is not expected to change during a form's lifetime (each page only ever renders one mode).
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: AC2 (create form), AC3 (edit form), AC4 (status toggle in the form).

### Task 6: CREATE src/app/admin/(protected)/posts/DeleteButton.tsx

- **IMPLEMENT**:
  ```typescript
  "use client";

  import { deletePost } from "./actions";

  export function DeleteButton({
    id,
    slug,
    status,
  }: {
    id: string;
    slug: string;
    status: string;
  }) {
    return (
      <form
        action={deletePost}
        onSubmit={(e) => {
          if (!confirm("Delete this post? This cannot be undone.")) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="status" value={status} />
        <button type="submit" className="rounded border px-3 py-1 text-sm text-red-600">
          Delete
        </button>
      </form>
    );
  }
  ```
- **PATTERN**: confirmed decision (native `confirm()`, no custom modal).
- **GOTCHA**: `slug`/`status` are passed in as hidden fields from the list page's already-fetched row data — this avoids `deletePost` needing a `SELECT` before its `DELETE` just to know whether revalidation is needed.
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: AC5 (delete with confirmation).

### Task 7: CREATE src/app/admin/(protected)/posts/page.tsx

- **IMPLEMENT**:
  ```typescript
  import Link from "next/link";
  import { createClient } from "@/lib/supabase/server";
  import { DeleteButton } from "./DeleteButton";
  import type { Post } from "@/lib/posts/types";

  export default async function PostsListPage() {
    const supabase = await createClient();
    const { data: posts, error } = await supabase
      .from("posts")
      .select("*")
      .order("updated_at", { ascending: false })
      .returns<Post[]>();

    if (error) {
      throw error;
    }

    return (
      <div className="flex flex-col gap-4 p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Posts</h1>
          <Link href="/admin/posts/new" className="rounded border px-3 py-1 text-sm">
            New post
          </Link>
        </div>

        {posts && posts.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {posts.map((post) => (
              <li key={post.id} className="flex items-center justify-between rounded border p-3">
                <div className="flex flex-col">
                  <span className="font-medium">{post.title}</span>
                  <span className="text-xs text-zinc-500">
                    <span className={post.status === "published" ? "text-green-600" : ""}>
                      {post.status}
                    </span>
                    {post.tags.length > 0 ? ` · ${post.tags.join(", ")}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/posts/${post.id}/edit`}
                    className="rounded border px-3 py-1 text-sm"
                  >
                    Edit
                  </Link>
                  <DeleteButton id={post.id} slug={post.slug} status={post.status} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No posts yet.</p>
        )}
      </div>
    );
  }
  ```
- **PATTERN**: `src/app/admin/(protected)/page.tsx` (async Server Component, `createClient()` + `{data,error}` check, `throw error` on failure — acceptable here since this is an internal admin tool, not public-facing, matching the existing dashboard's own error handling).
- **IMPORTS**: `next/link`, `@/lib/supabase/server`, `./DeleteButton`, `@/lib/posts/types`.
- **GOTCHA**: `.returns<Post[]>()` is required for type safety — `createClient()` has no `Database` generic wired up (see Out of Scope), so `.select("*")` alone would type as `any`.
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: AC1 (list shows all posts, any status, with badges).

### Task 8: CREATE src/app/admin/(protected)/posts/new/page.tsx

- **IMPLEMENT**:
  ```typescript
  import { PostForm } from "../PostForm";

  export default function NewPostPage() {
    return (
      <div className="flex flex-col gap-4 p-8">
        <h1 className="text-xl font-semibold">New post</h1>
        <PostForm mode="create" />
      </div>
    );
  }
  ```
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: AC2 (create form reachable).

### Task 9: CREATE src/app/admin/(protected)/posts/[id]/edit/page.tsx

- **IMPLEMENT**:
  ```typescript
  import { notFound } from "next/navigation";
  import { createClient } from "@/lib/supabase/server";
  import { PostForm } from "../../PostForm";
  import type { Post } from "@/lib/posts/types";

  export default async function EditPostPage({
    params,
  }: {
    params: Promise<{ id: string }>;
  }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: post, error } = await supabase
      .from("posts")
      .select("*")
      .eq("id", id)
      .maybeSingle<Post>();

    if (error) {
      throw error;
    }

    if (!post) {
      notFound();
    }

    return (
      <div className="flex flex-col gap-4 p-8">
        <h1 className="text-xl font-semibold">Edit post</h1>
        <PostForm mode="edit" post={post} />
      </div>
    );
  }
  ```
- **PATTERN**: `src/app/admin/login/page.tsx` — `params`/`searchParams` are Promises in this Next.js version, must be `await`ed.
- **GOTCHA**: Relative import is `../../PostForm` (two levels up: `edit` → `[id]` → `posts`), not `../PostForm` — double-check against Task 8's single `../`.
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: AC3 (edit form loads an existing post; missing id 404s cleanly).

### Task 10: UPDATE src/app/admin/(protected)/page.tsx

- **IMPLEMENT**: Add a link to the posts list next to the existing logout form:
  ```typescript
  import { createClient } from "@/lib/supabase/admin";
  import { logout } from "@/app/admin/actions/logout";
  import Link from "next/link";

  export default async function AdminDashboard() {
    const supabase = createClient();
    const { count, error } = await supabase
      .from("posts")
      .select("*", { count: "exact", head: true });

    if (error) {
      throw error;
    }

    return (
      <div className="flex flex-col gap-4 p-8">
        <h1 className="text-xl font-semibold">{count ?? 0} posts</h1>
        <Link href="/admin/posts" className="rounded border px-3 py-1 text-sm w-fit">
          Manage posts
        </Link>
        <form action={logout}>
          <button type="submit" className="rounded border px-3 py-1 text-sm">
            Log out
          </button>
        </form>
      </div>
    );
  }
  ```
- **GOTCHA**: Leave this page's existing `lib/supabase/admin` import as-is — it's outside this ticket's write-path scope, and changing it isn't needed for the ticket's AC.
- **VALIDATE**: `npx tsc --noEmit`.
- **SATISFIES**: reachability — without this link, `/admin/posts` exists but nothing in the UI points to it.

### Task 11: UPDATE CLAUDE.md

- **IMPLEMENT**: In the Architecture map, add the new `admin/(protected)/posts/` tree and `lib/posts/` under their respective existing sections (mirroring how PB-0002 updated this file for the `lib/supabase/` split).
- **VALIDATE**: Read-through only.
- **SATISFIES**: keeps the architecture map accurate, per project convention.

### Task 12: UPDATE .claude/references/data-model.md

- **IMPLEMENT**: Add a line noting `published_at` is set by the `set_published_at` trigger the first time `status` becomes `'published'`, and is never modified afterward (so unpublish/republish preserves the original date) — so a future reader doesn't assume app code is responsible for it.
- **VALIDATE**: Read-through only.
- **SATISFIES**: keeps the reference doc accurate for PB-0004+.

---

## TESTING STRATEGY

Per the confirmed decision, no automated tests for this ticket — validation is `next build` + `npm run lint` + `tsc --noEmit` + manual browser verification, consistent with PB-0001/PB-0002.

### Unit Tests

None.

### Integration Tests

None automated. The manual flow below is the integration check.

### Edge Cases (covered by manual validation below)

- Creating a post with a slug that collides with an existing one → inline "That slug is already in use" error, no duplicate row.
- A title that slugifies to an empty string (e.g., `"???"`) → inline "Slug is required" error, no insert attempted.
- Editing a post's title without touching the slug field → slug stays exactly as it was (does not silently regenerate).
- Publishing a draft → `published_at` set; unpublishing it, then republishing → `published_at` unchanged from its original value (requires checking the row directly, e.g. via the Supabase dashboard's table editor).
- Editing the slug of an already-published post → both the old and new slug paths get `revalidatePath` calls.
- Deleting a published post vs. a draft → only the published case should trigger `revalidatePath`.

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

Then, logged in as the allowlisted admin (this requires the real admin password — as with PB-0002, the implementing agent should get as far as it can with `agent-browser` and defer the final logged-in round trip to the user if credentials aren't available in-session):

1. `/admin/posts` shows an empty state ("No posts yet.") on a fresh table, or the existing posts with correct status badges.
2. Click "New post" → fill in a title only → slug field auto-populates as you type → submit as Draft → redirected to `/admin/posts` → new post appears with a "draft" badge.
3. Click "Edit" on that post → change the title → confirm the slug field does *not* change → change status to Published → save → redirected to list → badge now shows "published".
4. Attempt to create a second post reusing the first post's slug → inline error shown, no navigation away from the form.
5. Click "Delete" on a post → cancel the browser confirm → post remains; click Delete again → confirm → post disappears from the list without a full page reload glitch.
6. Confirm `npm run build`'s route table lists the new `/admin/posts`, `/admin/posts/new`, and `/admin/posts/[id]/edit` routes as dynamic (ƒ), consistent with the rest of `/admin/*`.

### Level 5: Additional Validation (Optional)

- Supabase SQL Editor: `select id, status, published_at from public.posts order by updated_at desc;` — visually confirm the trigger behavior described in the Edge Cases above.

---

## ACCEPTANCE CRITERIA

- [ ] AC1: `/admin/posts` lists every post regardless of status, with a visible status badge per row.
- [ ] AC2: A new post can be created via a form with title, slug (auto-generated from title, editable), excerpt, markdown content, tags, and status — invalid/duplicate slugs surface a clear inline error instead of a crash.
- [ ] AC3: An existing post can be loaded and edited via the same form; editing the title does not silently change an untouched slug.
- [ ] AC4: Transitioning a post's status to Published sets `published_at` (once, via the DB trigger) and triggers `revalidatePath` for the public list and detail paths.
- [ ] AC5: A post can be deleted, gated by a native browser confirmation.
- [ ] AC6: The full lifecycle (create draft → edit → publish → delete) is reflected correctly in both the admin list and the `posts` table at every step.
- [ ] `npm run build`, `npm run lint`, and `npx tsc --noEmit` all pass with zero errors.
- [ ] CLAUDE.md and `.claude/references/data-model.md` reflect the new `posts/` admin tree and the `published_at` trigger.

---

## COMPLETION CHECKLIST

- [ ] All 12 tasks completed in order
- [ ] Migration applied to the live Supabase project via the SQL Editor (Task 1)
- [ ] Each task's validation command passed immediately after that task
- [ ] `npm run build`, `npm run lint`, `npx tsc --noEmit` all pass
- [ ] Full manual flow (Level 4, steps 1-6) confirmed in a real browser, or explicitly handed off to the user for the logged-in portion
- [ ] Acceptance criteria all met
- [ ] CLAUDE.md / data-model reference updated to match reality

---

## OPEN QUESTIONS / ASSUMPTIONS

- **`published_at` via DB trigger, not app code**: this is a deliberate deviation from the most literal reading of the ticket (which implies the Server Action itself sets `published_at`). It was chosen during planning because it mirrors the existing `set_updated_at` trigger exactly, removes a pre-write `SELECT` from both `createPost` and `updatePost`, and makes the "only set once" rule impossible to bypass from any future write path. Flagging explicitly per the epic-inheritance rule — if you'd rather keep this logic in the Server Actions instead of a migration, say so before implementation; it's a contained change (drop Task 1, add the `published_at` computation inline in Task 4).
- **No second admin account / no real Supabase login available to the implementation agent**: same constraint PB-0002's report hit — the full logged-in manual round trip (Level 4, steps 1–6) may need to be confirmed by the user directly rather than by the implementing agent, since it requires the real admin password.
- **Ordering on the list page is `updated_at desc`**: not specified by the ticket. Chosen because it surfaces whatever was most recently touched (draft or published) first, which fits an active-editing workflow better than `created_at`. Cheap to change if you'd prefer `created_at desc` instead.
- **Excerpt normalization**: empty/whitespace-only excerpt is stored as `null`, not `""`, to match the column's nullable-with-no-default definition and keep `post.excerpt ?? ""` a safe display pattern everywhere it's read later (PB-0005).

## NOTES (open canvas)

**Why a hidden `currentStatus`/`currentSlug` field instead of a pre-write `SELECT` in `updatePost`?** The edit page already fetches the full post to render the form (Task 9), so the "old" values are already in hand at render time — threading them through as hidden inputs avoids a second round trip inside the Server Action purely to answer "was this public before?" for the revalidation decision. The trade-off (a theoretically stale value if two edits race) is negligible at single-admin scale and was accepted as part of the earlier "all status-affecting writes revalidate" decision.

**Why not extend `readPostFields` to also validate tag count/length, excerpt length, etc.?** The ticket and PRD set no such bar (see PRD Open Questions — "minimum content length/quality" is explicitly still open at the product level), so this plan validates only what's structurally required (title present, slug non-empty after normalization, status is one of the two valid values) and leaves content/quality judgment entirely to the admin, consistent with "don't validate for scenarios that can't happen" / avoid speculative rules.

**Relationship to PB-0004 and PB-0005**: `PostForm.tsx`'s `content` textarea is the exact insertion point PB-0004's image-upload widget will target ("insert markdown image syntax into the content field at the cursor" per its ticket text) — no changes needed here to accommodate that, the textarea is already a plain, cursor-addressable `<textarea name="content">`. The `revalidatePath` targets in `actions.ts` are a forward commitment to PB-0005's route shape; if PB-0005 ends up choosing different paths, this ticket's `revalidatePublicPaths` helper is the one place to update.

## AMENDMENTS

(none yet)
