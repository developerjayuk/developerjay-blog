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
