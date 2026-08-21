export const revalidate = false;
export const dynamic = "force-static";

import { getPublishedPosts } from "@/lib/posts/queries";
import { PostCard } from "./PostCard";

export default async function PostListPage() {
  const posts = await getPublishedPosts();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
      {posts.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {posts.map((post) => (
            <li key={post.id}>
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">No posts published yet — check back soon :)</p>
      )}
    </div>
  );
}
