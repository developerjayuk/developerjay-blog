export const dynamic = "force-dynamic";

import { getAllTags, getPublishedPosts } from "@/lib/posts/queries";
import { PostCard } from "./PostCard";
import { SearchBar } from "./SearchBar";
import { TagFilter } from "./TagFilter";

export default async function PostListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string }>;
}) {
  const { q, tag } = await searchParams;
  const [posts, tags] = await Promise.all([
    getPublishedPosts({ search: q, tag }),
    getAllTags(),
  ]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-3">
        <SearchBar />
        <TagFilter tags={tags} activeTag={tag} />
      </div>
      {posts.length > 0 ? (
        <ul className="flex flex-col gap-4">
          {posts.map((post) => (
            <li key={post.id}>
              <PostCard post={post} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-zinc-500">
          {q || tag
            ? "No posts match your search."
            : "No posts published yet — check back soon :)"}
        </p>
      )}
    </div>
  );
}
