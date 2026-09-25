// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./render";

describe("renderMarkdown", () => {
  it("renders GFM tables and strikethrough", async () => {
    const html = await renderMarkdown("| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~");

    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
    expect(html).toContain("<del>gone</del>");
  });

  it("highlights a fenced code block with a language and wraps it with a copy button", async () => {
    const html = await renderMarkdown("```ts\nconst x = 1;\n```");

    expect(html).toContain('data-language="ts"');
    expect(html).toContain("--shiki-light:");
    expect(html).toContain("--shiki-dark:");
    expect(html).toMatch(
      /<div class="code-block" data-code-block=""><button[^>]*data-copy-button=""[^>]*aria-label="Copy code"[^>]*>Copy<\/button><pre/,
    );
  });

  it("falls back to plaintext for a fenced code block without a language", async () => {
    const html = await renderMarkdown("```\nplain text\n```");

    expect(html).toContain('data-language="plaintext"');
    expect(html).toContain("plain text");
    expect(html).toContain("data-copy-button");
  });

  // MarkdownContent renders this output with dangerouslySetInnerHTML, so raw HTML in post
  // markdown must be dropped rather than passed through.
  it("strips raw HTML tags and event-handler attributes", async () => {
    const html = await renderMarkdown(
      'hi <script>alert(1)</script>\n\n<img src="x" onerror="alert(1)">\n\n<div onclick="evil()">d</div>',
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<div");
    expect(html).not.toContain("onclick");
  });

  it("does not add a copy button to inline code", async () => {
    const html = await renderMarkdown("use `x` here");

    expect(html).toContain("<code");
    expect(html).not.toContain("data-copy-button");
  });
});
