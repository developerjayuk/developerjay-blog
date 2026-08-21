import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeStringify from "rehype-stringify";
import { rehypeCopyButton } from "./rehype-copy-button";

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  // No `allowDangerousHtml` here or on rehypeStringify below — raw HTML in post markdown is
  // stripped, not passed through. That's what makes MarkdownContent.tsx's
  // dangerouslySetInnerHTML safe; don't add it without adding sanitization.
  .use(remarkRehype)
  .use(rehypePrettyCode, {
    theme: { light: "github-light", dark: "github-dark" },
    // With a dual-theme `theme` object, rehype-pretty-code forces Shiki's `defaultColor: false`
    // internally — no literal color/background is ever baked in, only `--shiki-{light,dark}`/
    // `--shiki-{light,dark}-bg` CSS variables. `keepBackground: true` keeps those variables on
    // the emitted <pre>; globals.css's `.dark`-keyed rules pick between them. (false would strip
    // the whole `style` attribute — and with it, the variables globals.css depends on.)
    keepBackground: true,
    defaultLang: "plaintext",
  })
  .use(rehypeCopyButton)
  .use(rehypeStringify);

export async function renderMarkdown(markdown: string): Promise<string> {
  const file = await processor.process(markdown);
  return String(file);
}
