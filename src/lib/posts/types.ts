export type PostStatus = "draft" | "published";

export type Post = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_image_url: string | null;
  tags: string[];
  status: PostStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PostListItem = Omit<Post, "content" | "status" | "created_at" | "updated_at">;
