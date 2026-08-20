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
