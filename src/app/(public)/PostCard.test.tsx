import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PostCard } from "./PostCard";
import type { PostListItem } from "@/lib/posts/types";

function makePost(overrides: Partial<PostListItem> = {}): PostListItem {
  return {
    id: "1",
    slug: "hello-world",
    title: "Hello World",
    excerpt: "An excerpt",
    cover_image_url: null,
    tags: ["react"],
    // Midday UTC so the en-GB date can't shift a day in any local timezone.
    published_at: "2026-08-21T12:00:00Z",
    ...overrides,
  };
}

describe("PostCard", () => {
  it("links to the post detail page", () => {
    render(<PostCard post={makePost()} />);

    expect(screen.getByRole("link")).toHaveAttribute("href", "/posts/hello-world");
  });

  it("renders the title, excerpt and tags", () => {
    render(<PostCard post={makePost()} />);

    expect(screen.getByRole("heading", { name: "Hello World" })).toBeInTheDocument();
    expect(screen.getByText("An excerpt")).toBeInTheDocument();
    expect(screen.getByText("react")).toBeInTheDocument();
  });

  it("omits the excerpt when it is null", () => {
    render(<PostCard post={makePost({ excerpt: null })} />);

    expect(screen.queryByText("An excerpt")).toBeNull();
  });

  it("renders the published date in en-GB long form", () => {
    render(<PostCard post={makePost()} />);

    const time = screen.getByText("21 August 2026");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("dateTime", "2026-08-21T12:00:00Z");
  });

  it("omits the date when published_at is null", () => {
    const { container } = render(<PostCard post={makePost({ published_at: null })} />);

    expect(container.querySelector("time")).toBeNull();
  });

  it("renders no image when there is no cover", () => {
    render(<PostCard post={makePost()} />);

    expect(screen.queryByRole("img")).toBeNull();
  });

  it("inverts an SVG cover in dark mode", () => {
    render(<PostCard post={makePost({ cover_image_url: "https://x.co/cover.svg" })} />);

    expect(screen.getByRole("img", { name: "Hello World" })).toHaveClass("dark:invert");
  });

  it("does not invert a raster cover", () => {
    render(<PostCard post={makePost({ cover_image_url: "https://x.co/cover.png" })} />);

    expect(screen.getByRole("img", { name: "Hello World" })).not.toHaveClass("dark:invert");
  });
});
