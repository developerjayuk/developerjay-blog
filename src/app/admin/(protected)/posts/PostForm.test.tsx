import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PostForm } from "./PostForm";
import type { Post } from "@/lib/posts/types";

// Mocked so lib/supabase/server (server-only + next/headers) never loads.
const actions = vi.hoisted(() => ({
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
}));
vi.mock("./actions", () => actions);

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    id: "p1",
    slug: "existing-slug",
    title: "Existing title",
    excerpt: "Existing excerpt",
    content: "# Body",
    cover_image_url: "https://x.co/c.svg",
    tags: ["react", "nextjs"],
    status: "published",
    published_at: "2026-08-21T12:00:00Z",
    created_at: "2026-08-20T12:00:00Z",
    updated_at: "2026-08-21T12:00:00Z",
    ...overrides,
  };
}

const hiddenValue = (container: HTMLElement, name: string) =>
  container.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;

describe("PostForm", () => {
  describe("create mode", () => {
    it("auto-fills the slug from the title", async () => {
      const user = userEvent.setup();
      render(<PostForm mode="create" />);

      await user.type(screen.getByLabelText("Title"), "Hello World!");

      expect(screen.getByLabelText("Slug")).toHaveValue("hello-world");
    });

    it("stops following the title once the slug is edited", async () => {
      const user = userEvent.setup();
      render(<PostForm mode="create" />);
      const title = screen.getByLabelText("Title");
      const slug = screen.getByLabelText("Slug");

      await user.type(title, "First");
      await user.clear(slug);
      await user.type(slug, "custom");
      await user.type(title, " More");

      expect(slug).toHaveValue("custom");
    });

    it("has no edit-only hidden inputs or Cancel link", () => {
      const { container } = render(<PostForm mode="create" />);

      expect(hiddenValue(container, "id")).toBeUndefined();
      expect(screen.queryByRole("link", { name: "Cancel" })).toBeNull();
      expect(screen.getByRole("button", { name: "Create post" })).toBeInTheDocument();
    });

    it("shows the error returned by the action", async () => {
      const error = "That slug is already in use — try a different one.";
      actions.createPost.mockResolvedValue({ error });
      const user = userEvent.setup();
      render(<PostForm mode="create" />);

      await user.type(screen.getByLabelText("Title"), "Hello");
      await user.click(screen.getByRole("button", { name: "Create post" }));

      expect(await screen.findByText(error)).toBeInTheDocument();
      expect(actions.createPost).toHaveBeenCalledWith(null, expect.any(FormData));
    });
  });

  describe("edit mode", () => {
    it("prefills every field from the post", () => {
      const { container } = render(<PostForm mode="edit" post={makePost()} />);

      expect(screen.getByLabelText("Title")).toHaveValue("Existing title");
      expect(screen.getByLabelText("Slug")).toHaveValue("existing-slug");
      expect(screen.getByLabelText("Excerpt")).toHaveValue("Existing excerpt");
      expect(screen.getByLabelText("Cover image URL")).toHaveValue("https://x.co/c.svg");
      expect(screen.getByLabelText("Content (Markdown)")).toHaveValue("# Body");
      expect(screen.getByLabelText("Tags (comma-separated)")).toHaveValue("react, nextjs");
      expect(hiddenValue(container, "status")).toBe("published");
      expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    });

    it("does not re-derive the slug from the title", async () => {
      const user = userEvent.setup();
      render(<PostForm mode="edit" post={makePost()} />);

      await user.type(screen.getByLabelText("Title"), " updated");

      expect(screen.getByLabelText("Slug")).toHaveValue("existing-slug");
    });

    it("includes the id, current slug and current status as hidden inputs", () => {
      const { container } = render(<PostForm mode="edit" post={makePost()} />);

      expect(hiddenValue(container, "id")).toBe("p1");
      expect(hiddenValue(container, "currentSlug")).toBe("existing-slug");
      expect(hiddenValue(container, "currentStatus")).toBe("published");
    });

    it("blocks Cancel navigation when the confirm dialog is dismissed", () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      render(<PostForm mode="edit" post={makePost()} />);

      const notCancelled = fireEvent.click(screen.getByRole("link", { name: "Cancel" }));

      expect(notCancelled).toBe(false);
      expect(confirm).toHaveBeenCalledWith("Are you sure? Any changes have not been saved!");
    });
  });
});
