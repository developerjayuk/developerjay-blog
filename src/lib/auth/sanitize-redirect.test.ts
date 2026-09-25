import { describe, it, expect } from "vitest";
import { sanitizeRedirect } from "./sanitize-redirect";

describe("sanitizeRedirect", () => {
  it.each(["/admin/posts", "/admin/posts/abc/edit", "/admin/posts?tab=drafts"])(
    "passes through the same-origin path %j",
    (path) => {
      expect(sanitizeRedirect(path)).toBe(path);
    },
  );

  it.each([
    null,
    undefined,
    "",
    "admin/posts",
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
  ])("falls back to /admin/posts for %j", (path) => {
    expect(sanitizeRedirect(path)).toBe("/admin/posts");
  });
});
