export const revalidate = false;
export const dynamic = "force-static";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getPublishedPostBySlug, getPublishedPosts } from "@/lib/posts/queries";
import { renderMarkdown } from "@/lib/markdown/render";
import { MarkdownContent } from "../../MarkdownContent";
import { TagList } from "../../TagList";

export async function generateStaticParams() {
  const posts = await getPublishedPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) {
    return {};
  }

  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    openGraph: {
      title: post.title,
      description: post.excerpt ?? undefined,
      type: "article",
      publishedTime: post.published_at ?? undefined,
      images: post.cover_image_url ? [post.cover_image_url] : undefined,
    },
  };
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);

  if (!post) {
    notFound();
  }

  const html = await renderMarkdown(post.content);

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
      {post.cover_image_url && (
        <Image
          src={post.cover_image_url}
          alt={post.title}
          width={1200}
          height={630}
          className="rounded"
        />
      )}
      <h1 className="text-2xl font-semibold">{post.title}</h1>
      <TagList tags={post.tags} />
      <MarkdownContent html={html} />
    </article>
  );
}
