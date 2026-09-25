import { describe, it, expect } from "vitest";
import { slugify } from "./slugify";

describe("slugify", () => {
  it.each([
    ["Hello World", "hello-world"],
    ["  Next.js 16: What's New?  ", "next-js-16-what-s-new"],
    ["a---b___c", "a-b-c"],
    ["--Leading and trailing--", "leading-and-trailing"],
    ["!!!", ""],
    ["Already-slugged-123", "already-slugged-123"],
  ])("turns %j into %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });
});
