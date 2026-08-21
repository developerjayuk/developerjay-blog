import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Post } from "./types";

export const getPublishedPosts = cache(async function getPublishedPosts(): Promise<Post[]> {
  const supabase = await createClient();
  const { data: posts, error } = await supabase
    .from("posts")
    .select("*")
    .order("published_at", { ascending: false })
    .overrideTypes<Post[], { merge: false }>();

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
