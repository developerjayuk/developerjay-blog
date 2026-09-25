// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  // The real redirect throws NEXT_REDIRECT; mirroring that proves revalidatePath runs *before*
  // the redirect, and that nothing after it executes.
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
}));
vi.mock("next/navigation", () => navigation);

const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => cache);

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase/server";
import { createPost, updatePost, deletePost } from "./actions";

function mockSupabase(error: { code?: string; message?: string } | null = null) {
  const result = { error };
  const eq = vi.fn(async () => result);
  const table = {
    insert: vi.fn(async () => result),
    update: vi.fn(() => ({ eq })),
    delete: vi.fn(() => ({ eq })),
  };
  const from = vi.fn(() => table);
  vi.mocked(createClient).mockResolvedValue({ from } as never);
  return { from, table, eq };
}

function toFormData(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) formData.set(key, value);
  return formData;
}

function postForm(overrides: Record<string, string> = {}) {
  return toFormData({
    title: "Hello World",
    slug: "",
    excerpt: "",
    content: "Body",
    coverImageUrl: "",
    tags: "",
    status: "draft",
    ...overrides,
  });
}

function editForm(overrides: Record<string, string> = {}) {
  return postForm({ id: "p1", currentSlug: "hello-world", currentStatus: "draft", ...overrides });
}

function deleteForm(overrides: Record<string, string> = {}) {
  return toFormData({ id: "p1", slug: "hello-world", status: "published", ...overrides });
}

function withoutField(formData: FormData, key: string) {
  formData.delete(key);
  return formData;
}

describe("createPost", () => {
  it.each([
    ["title is missing", withoutField(postForm(), "title"), "Title is required."],
    ["title is blank", postForm({ title: "   " }), "Title is required."],
    [
      "title slugifies to nothing",
      postForm({ title: "!!!" }),
      "Slug is required — adjust the title or set a slug manually.",
    ],
    ["status is invalid", postForm({ status: "archived" }), "Invalid status."],
  ])("returns a validation error when the %s", async (_case, formData, error) => {
    expect(await createPost(null, formData)).toEqual({ error });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("inserts trimmed, parsed fields into the posts table", async () => {
    const { from, table } = mockSupabase();

    await expect(
      createPost(
        null,
        postForm({
          title: "  Hello World  ",
          tags: " a, ,b ,, c ",
          excerpt: "   ",
          coverImageUrl: "  ",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(from).toHaveBeenCalledWith("posts");
    expect(table.insert).toHaveBeenCalledWith({
      title: "Hello World",
      slug: "hello-world",
      excerpt: null,
      content: "Body",
      cover_image_url: null,
      tags: ["a", "b", "c"],
      status: "draft",
    });
  });

  it("slugifies an explicitly provided slug instead of the title", async () => {
    const { table } = mockSupabase();

    await expect(createPost(null, postForm({ slug: "My Custom Slug!" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(table.insert).toHaveBeenCalledWith(expect.objectContaining({ slug: "my-custom-slug" }));
  });

  it("trims a non-blank excerpt and cover image URL", async () => {
    const { table } = mockSupabase();

    await expect(
      createPost(
        null,
        postForm({ excerpt: "  An excerpt  ", coverImageUrl: "  https://cdn.test/a.png  " }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(table.insert).toHaveBeenCalledWith(
      expect.objectContaining({ excerpt: "An excerpt", cover_image_url: "https://cdn.test/a.png" }),
    );
  });

  it("returns the slug-in-use error on a unique violation without redirecting", async () => {
    mockSupabase({ code: "23505" });

    expect(await createPost(null, postForm())).toEqual({
      error: "That slug is already in use — try a different one.",
    });
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("returns a generic error for any other insert failure", async () => {
    mockSupabase({ code: "XX000" });

    expect(await createPost(null, postForm())).toEqual({
      error: "Could not create the post. Please try again.",
    });
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("redirects to the post list without revalidating public pages for a draft", async () => {
    mockSupabase();

    await expect(createPost(null, postForm())).rejects.toThrow("NEXT_REDIRECT");

    expect(navigation.redirect).toHaveBeenCalledWith("/admin/posts");
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates the home page and post page before redirecting for a published post", async () => {
    mockSupabase();

    await expect(createPost(null, postForm({ status: "published" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(cache.revalidatePath).toHaveBeenCalledTimes(2);
    expect(cache.revalidatePath).toHaveBeenCalledWith("/");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/posts/hello-world");
    expect(navigation.redirect).toHaveBeenCalledWith("/admin/posts");
  });
});

describe("updatePost", () => {
  it.each([
    ["missing", withoutField(editForm(), "id")],
    ["empty", editForm({ id: "" })],
  ])("returns an error when the post id is %s", async (_case, formData) => {
    expect(await updatePost(null, formData)).toEqual({ error: "Missing post id." });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns field validation errors before touching Supabase", async () => {
    expect(await updatePost(null, editForm({ title: "   " }))).toEqual({
      error: "Title is required.",
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("returns the slug-in-use error on a unique violation", async () => {
    mockSupabase({ code: "23505" });

    expect(await updatePost(null, editForm())).toEqual({
      error: "That slug is already in use — try a different one.",
    });
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("returns a generic error for any other update failure", async () => {
    mockSupabase({ code: "XX000" });

    expect(await updatePost(null, editForm())).toEqual({
      error: "Could not update the post. Please try again.",
    });
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("updates the row matching the post id with the parsed fields", async () => {
    const { from, table, eq } = mockSupabase();

    await expect(updatePost(null, editForm({ tags: "react, css" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(from).toHaveBeenCalledWith("posts");
    expect(table.update).toHaveBeenCalledWith({
      title: "Hello World",
      slug: "hello-world",
      excerpt: null,
      content: "Body",
      cover_image_url: null,
      tags: ["react", "css"],
      status: "draft",
    });
    expect(eq).toHaveBeenCalledWith("id", "p1");
  });

  it("revalidates public pages before redirecting when a draft is published", async () => {
    mockSupabase();

    await expect(updatePost(null, editForm({ status: "published" }))).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(cache.revalidatePath).toHaveBeenCalledTimes(2);
    expect(cache.revalidatePath).toHaveBeenCalledWith("/");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/posts/hello-world");
    expect(navigation.redirect).toHaveBeenCalledWith("/admin/posts");
  });

  it("still revalidates public pages when a published post is unpublished", async () => {
    mockSupabase();

    await expect(
      updatePost(null, editForm({ currentStatus: "published", status: "draft" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(cache.revalidatePath).toHaveBeenCalledTimes(2);
    expect(cache.revalidatePath).toHaveBeenCalledWith("/");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/posts/hello-world");
  });

  it("revalidates public pages once when a published post is edited without changing its slug", async () => {
    mockSupabase();

    await expect(
      updatePost(null, editForm({ currentStatus: "published", status: "published" })),
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(cache.revalidatePath).toHaveBeenCalledTimes(2);
    expect(cache.revalidatePath).toHaveBeenCalledWith("/");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/posts/hello-world");
    expect(navigation.redirect).toHaveBeenCalledWith("/admin/posts");
  });

  it("revalidates both the new and old post paths when a published post's slug changes", async () => {
    mockSupabase();

    await expect(
      updatePost(
        null,
        editForm({
          currentStatus: "published",
          status: "published",
          currentSlug: "old-slug",
          title: "New Title",
        }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT");

    // revalidatePublicPaths runs once per slug, so "/" is revalidated twice.
    expect(cache.revalidatePath).toHaveBeenCalledTimes(4);
    expect(cache.revalidatePath).toHaveBeenCalledWith("/");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/posts/new-title");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/posts/old-slug");
  });

  it("does not revalidate anything when a draft stays a draft", async () => {
    mockSupabase();

    await expect(updatePost(null, editForm())).rejects.toThrow("NEXT_REDIRECT");

    expect(cache.revalidatePath).not.toHaveBeenCalled();
    expect(navigation.redirect).toHaveBeenCalledWith("/admin/posts");
  });
});

describe("deletePost", () => {
  it("throws when the post id is missing, before touching Supabase", async () => {
    await expect(deletePost(withoutField(deleteForm(), "id"))).rejects.toThrow("Missing post id.");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("rethrows a Supabase error without revalidating", async () => {
    const error = { code: "XX000", message: "boom" };
    mockSupabase(error);

    await expect(deletePost(deleteForm())).rejects.toBe(error);
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("deletes the row matching the post id", async () => {
    const { from, table, eq } = mockSupabase();

    await deletePost(deleteForm());

    expect(from).toHaveBeenCalledWith("posts");
    expect(table.delete).toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("id", "p1");
  });

  it("revalidates the admin list and public pages for a published post, without redirecting", async () => {
    mockSupabase();

    await deletePost(deleteForm());

    expect(cache.revalidatePath).toHaveBeenCalledTimes(3);
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/posts");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/posts/hello-world");
    expect(navigation.redirect).not.toHaveBeenCalled();
  });

  it("revalidates only the admin list for a draft", async () => {
    mockSupabase();

    await deletePost(deleteForm({ status: "draft" }));

    expect(cache.revalidatePath).toHaveBeenCalledTimes(1);
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/posts");
  });
});
