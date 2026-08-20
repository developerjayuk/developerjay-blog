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
    .overrideTypes<Post[], { merge: false }>();

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
