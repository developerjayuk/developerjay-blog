import Image from "next/image";
import Link from "next/link";
import { TagList } from "./TagList";
import type { Post } from "@/lib/posts/types";

export function PostCard({ post }: { post: Post }) {
  return (
    <Link
      href={`/posts/${post.slug}`}
      className="flex flex-col gap-3 rounded border p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900"
    >
      {post.cover_image_url && (
        <Image
          src={post.cover_image_url}
          alt=""
          width={800}
          height={420}
          className="rounded"
        />
      )}
      <h2 className="text-lg font-semibold">{post.title}</h2>
      {post.excerpt && <p className="text-sm text-zinc-500">{post.excerpt}</p>}
      <TagList tags={post.tags} />
      {post.published_at && (
        <time dateTime={post.published_at} className="text-xs text-zinc-500">
          {new Date(post.published_at).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </time>
      )}
    </Link>
  );
}
