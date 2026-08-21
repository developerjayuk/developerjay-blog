import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Post, PostListItem } from "./types";

export type PostFilters = {
  search?: string;
  tag?: string;
};

export const getPublishedPosts = cache(async function getPublishedPosts(
  filters: PostFilters = {},
): Promise<PostListItem[]> {
  const supabase = await createClient();
  let query = supabase
    .from("posts")
    .select("id, slug, title, excerpt, cover_image_url, tags, published_at");

  if (filters.search) {
    query = query.textSearch("search_vector", filters.search, {
      type: "websearch",
      config: "english",
    });
  }

  if (filters.tag) {
    query = query.contains("tags", [filters.tag]);
  }

  const { data: posts, error } = await query
    .order("published_at", { ascending: false })
    .overrideTypes<PostListItem[], { merge: false }>();

  if (error) {
    throw error;
  }

  return posts;
});

export const getAllTags = cache(async function getAllTags(): Promise<string[]> {
  const supabase = await createClient();
  const { data: posts, error } = await supabase.from("posts").select("tags");

  if (error) {
    throw error;
  }

  const tags = new Set<string>();
  for (const post of posts) {
    for (const tag of post.tags) {
      tags.add(tag);
    }
  }

  return Array.from(tags).sort();
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
