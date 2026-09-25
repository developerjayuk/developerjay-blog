import { describe, it, expect } from "vitest";
import { isSvgUrl } from "./cover-image";

describe("isSvgUrl", () => {
  it.each([
    "https://x.supabase.co/storage/v1/object/public/post-images/a.svg",
    "https://x.co/A.SVG",
  ])("returns true for the SVG URL %j", (url) => {
    expect(isSvgUrl(url)).toBe(true);
  });

  it.each([
    "https://x.co/a.png",
    "https://x.co/a.jpg",
    "https://x.co/a.webp",
    "https://x.co/a.png?format=.svg",
    "not a url",
    "",
    // Relative URLs throw inside `new URL`, so they're treated as non-SVG (current behaviour).
    "/relative/a.svg",
  ])("returns false (without throwing) for %j", (url) => {
    expect(() => isSvgUrl(url)).not.toThrow();
    expect(isSvgUrl(url)).toBe(false);
  });
});
