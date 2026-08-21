import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Post, PostListItem } from "./types";

export const getPublishedPosts = cache(async function getPublishedPosts(): Promise<
  PostListItem[]
> {
  const supabase = await createClient();
  const { data: posts, error } = await supabase
    .from("posts")
    .select("id, slug, title, excerpt, cover_image_url, tags, published_at")
    .order("published_at", { ascending: false })
    .overrideTypes<PostListItem[], { merge: false }>();

  if (error) {
    throw error;
  }

  return posts;
});

export const getPublishedPostBySlug = cache(async function getPublishedPostBySlug(
  slug: string,
): Promise<Post | null> {
  const supabase = await createClient();
  const { data: post, error } = await supabase
    .from("posts")
    .select("*")
    .eq("slug", slug)
    .maybeSingle<Post>();

  if (error) {
    throw error;
  }

  return post;
});
