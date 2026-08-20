"use client";

import { useActionState, useRef, useState } from "react";
import { createPost, updatePost, type PostFormState } from "./actions";
import { ImageUpload } from "./ImageUpload";
import { slugify } from "@/lib/posts/slugify";
import type { Post } from "@/lib/posts/types";

type PostFormProps = { mode: "create"; post?: undefined } | { mode: "edit"; post: Post };

export function PostForm({ mode, post }: PostFormProps) {
  const action = mode === "create" ? createPost : updatePost;
  const [state, formAction, pending] = useActionState<PostFormState, FormData>(action, null);
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(mode === "edit");
  const contentRef = useRef<HTMLTextAreaElement>(null);

  function insertImageAtCursor(url: string) {
    const textarea = contentRef.current;
    if (!textarea) return;

    const markdown = `![](${url})`;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = textarea.value.slice(0, start) + markdown + textarea.value.slice(end);

    const cursor = start + markdown.length;
    textarea.focus();
    textarea.setSelectionRange(cursor, cursor);
  }

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
      <ImageUpload onUploaded={insertImageAtCursor} />
      <textarea
        ref={contentRef}
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
