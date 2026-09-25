// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/public", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/public";
import { getPublishedPosts, getAllTags, getPublishedPostBySlug } from "./queries";

type Result = { data: unknown; error: unknown };

function mockQuery(result: Result) {
  const builder = {
    select: vi.fn(),
    textSearch: vi.fn(),
    contains: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    overrideTypes: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    // getAllTags awaits the builder directly after select("tags").
    then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const method of [builder.select, builder.textSearch, builder.contains, builder.eq, builder.order]) {
    method.mockReturnValue(builder);
  }
  const from = vi.fn(() => builder);
  vi.mocked(createClient).mockReturnValue({ from } as never);
  return { from, builder };
}

const posts = [
  {
    id: "p1",
    slug: "hello-world",
    title: "Hello World",
    excerpt: null,
    cover_image_url: null,
    tags: ["react"],
    published_at: "2026-09-01T00:00:00Z",
  },
];

describe("getPublishedPosts", () => {
  it("returns posts newest first with no filters applied", async () => {
    const { from, builder } = mockQuery({ data: posts, error: null });

    expect(await getPublishedPosts()).toEqual(posts);
    expect(from).toHaveBeenCalledWith("posts");
    expect(builder.select).toHaveBeenCalledWith(
      "id, slug, title, excerpt, cover_image_url, tags, published_at",
    );
    expect(builder.order).toHaveBeenCalledWith("published_at", { ascending: false });
    expect(builder.textSearch).not.toHaveBeenCalled();
    expect(builder.contains).not.toHaveBeenCalled();
  });

  it("applies a websearch full-text query for a search term", async () => {
    const { builder } = mockQuery({ data: posts, error: null });

    await getPublishedPosts({ search: "react hooks" });

    expect(builder.textSearch).toHaveBeenCalledWith("search_vector", "react hooks", {
      type: "websearch",
      config: "english",
    });
    expect(builder.contains).not.toHaveBeenCalled();
  });

  it("filters by tag with an array-contains query", async () => {
    const { builder } = mockQuery({ data: posts, error: null });

    await getPublishedPosts({ tag: "nextjs" });

    expect(builder.contains).toHaveBeenCalledWith("tags", ["nextjs"]);
    expect(builder.textSearch).not.toHaveBeenCalled();
  });

  it("applies both the search and tag filters together", async () => {
    const { builder } = mockQuery({ data: posts, error: null });

    await getPublishedPosts({ search: "react hooks", tag: "nextjs" });

    expect(builder.textSearch).toHaveBeenCalledWith("search_vector", "react hooks", {
      type: "websearch",
      config: "english",
    });
    expect(builder.contains).toHaveBeenCalledWith("tags", ["nextjs"]);
  });

  it("throws the Supabase error", async () => {
    const error = { message: "boom" };
    mockQuery({ data: null, error });

    await expect(getPublishedPosts()).rejects.toBe(error);
  });
});

describe("getAllTags", () => {
  it("returns every tag across posts, de-duplicated and sorted", async () => {
    const { builder } = mockQuery({
      data: [{ tags: ["react", "css"] }, { tags: ["css", "a11y"] }, { tags: [] }],
      error: null,
    });

    expect(await getAllTags()).toEqual(["a11y", "css", "react"]);
    expect(builder.select).toHaveBeenCalledWith("tags");
  });

  it("returns an empty list when there are no posts", async () => {
    mockQuery({ data: [], error: null });

    expect(await getAllTags()).toEqual([]);
  });

  it("throws the Supabase error", async () => {
    const error = { message: "boom" };
    mockQuery({ data: null, error });

    await expect(getAllTags()).rejects.toBe(error);
  });
});

describe("getPublishedPostBySlug", () => {
  it("returns the post matching the slug", async () => {
    const post = { ...posts[0], content: "Body", status: "published" };
    const { builder } = mockQuery({ data: post, error: null });

    expect(await getPublishedPostBySlug("hello-world")).toEqual(post);
    expect(builder.select).toHaveBeenCalledWith("*");
    expect(builder.eq).toHaveBeenCalledWith("slug", "hello-world");
  });

  it("returns null when no post matches", async () => {
    mockQuery({ data: null, error: null });

    expect(await getPublishedPostBySlug("missing")).toBeNull();
  });

  it("throws the Supabase error", async () => {
    const error = { message: "boom" };
    mockQuery({ data: null, error });

    await expect(getPublishedPostBySlug("hello-world")).rejects.toBe(error);
  });
});
