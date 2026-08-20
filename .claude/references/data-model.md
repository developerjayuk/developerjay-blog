# Data Model

`posts` (id, slug, title, excerpt, content [markdown], cover_image_url, tags [text[], GIN-indexed],
status [draft/published], published_at, created_at, updated_at) is the only content table for MVP.

Tags are a `text[]` column, not a `tags`/`post_tags` join table — sufficient at single-admin scale;
revisit only if tag metadata (descriptions, counts, slugs) is ever needed.

There's no separate media table. Images upload directly to a Supabase Storage bucket, and the
resulting URL is inserted straight into the post's markdown `content` — no indirection between an
image and where it's referenced. This flow is live as of PB-0004: `admin/(protected)/posts/upload/`
uploads to the `post-images` bucket and `PostForm.tsx` inserts the returned URL into `content`.

Users live entirely in Supabase Auth's built-in table — one allowlisted admin account, no custom
`users` table.

`published_at` is set by the `set_published_at` DB trigger (mirroring `set_updated_at`) the first
time a post's `status` becomes `'published'`, and is never modified afterward — an unpublish/
republish cycle preserves the original publish date. App code does not set this column directly.
