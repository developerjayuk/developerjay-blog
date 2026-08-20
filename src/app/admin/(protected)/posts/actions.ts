"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/posts/slugify";
import type { PostStatus } from "@/lib/posts/types";

export type PostFormState = { error: string } | null;

function parseTags(raw: FormDataEntryValue | null): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function revalidatePublicPaths(slug: string) {
  revalidatePath("/");
  revalidatePath(`/posts/${slug}`);
}

type ParsedFields = {
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  tags: string[];
  status: PostStatus;
};

function readPostFields(formData: FormData): ParsedFields | { error: string } {
  const title = formData.get("title");
  const rawSlug = formData.get("slug");
  const excerpt = formData.get("excerpt");
  const content = formData.get("content");
  const status = formData.get("status");

  if (typeof title !== "string" || !title.trim()) {
    return { error: "Title is required." };
  }

  const slugSource = typeof rawSlug === "string" && rawSlug.trim() ? rawSlug : title;
  const slug = slugify(slugSource);
  if (!slug) {
    return { error: "Slug is required — adjust the title or set a slug manually." };
  }

  if (status !== "draft" && status !== "published") {
    return { error: "Invalid status." };
  }

  return {
    title: title.trim(),
    slug,
    excerpt: typeof excerpt === "string" && excerpt.trim() ? excerpt.trim() : null,
    content: typeof content === "string" ? content : "",
    tags: parseTags(formData.get("tags")),
    status,
  };
}

export async function createPost(
  _prevState: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const fields = readPostFields(formData);
  if ("error" in fields) return fields;

  const supabase = await createClient();
  const { error } = await supabase.from("posts").insert(fields);

  if (error) {
    if (error.code === "23505") {
      return { error: "That slug is already in use — try a different one." };
    }
    return { error: "Could not create the post. Please try again." };
  }

  if (fields.status === "published") {
    revalidatePublicPaths(fields.slug);
  }

  redirect("/admin/posts");
}

export async function updatePost(
  _prevState: PostFormState,
  formData: FormData,
): Promise<PostFormState> {
  const id = formData.get("id");
  if (typeof id !== "string" || !id) {
    return { error: "Missing post id." };
  }

  const fields = readPostFields(formData);
  if ("error" in fields) return fields;

  const currentSlug = formData.get("currentSlug");
  const wasPublished = formData.get("currentStatus") === "published";

  const supabase = await createClient();
  const { error } = await supabase.from("posts").update(fields).eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "That slug is already in use — try a different one." };
    }
    return { error: "Could not update the post. Please try again." };
  }

  if (wasPublished || fields.status === "published") {
    revalidatePublicPaths(fields.slug);
    if (typeof currentSlug === "string" && currentSlug && currentSlug !== fields.slug) {
      revalidatePublicPaths(currentSlug);
    }
  }

  redirect("/admin/posts");
}

export async function deletePost(formData: FormData): Promise<void> {
  const id = formData.get("id");
  const slug = formData.get("slug");
  const status = formData.get("status");

  if (typeof id !== "string" || !id) {
    throw new Error("Missing post id.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("posts").delete().eq("id", id);

  if (error) {
    throw error;
  }

  revalidatePath("/admin/posts");

  if (status === "published" && typeof slug === "string" && slug) {
    revalidatePublicPaths(slug);
  }
}
