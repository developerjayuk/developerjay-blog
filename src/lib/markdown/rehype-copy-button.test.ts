// @vitest-environment node
import { describe, it, expect } from "vitest";
import type { Element, ElementContent, Properties, Root } from "hast";
import { rehypeCopyButton } from "./rehype-copy-button";

function el(tagName: string, children: ElementContent[] = [], properties: Properties = {}): Element {
  return { type: "element", tagName, properties, children };
}

function root(...children: Element[]): Root {
  return { type: "root", children };
}

function pre(code: string): Element {
  return el("pre", [el("code", [{ type: "text", value: code }])]);
}

function expectWrapped(node: ElementContent, original: Element) {
  expect(node).toMatchObject({
    type: "element",
    tagName: "div",
    properties: { className: ["code-block"], "data-code-block": "" },
  });
  const [button, inner] = (node as Element).children;
  expect(button).toMatchObject({
    tagName: "button",
    properties: { type: "button", "data-copy-button": "", "aria-label": "Copy code" },
    children: [{ type: "text", value: "Copy" }],
  });
  expect(inner).toBe(original);
}

describe("rehypeCopyButton", () => {
  it("wraps a top-level pre in a code-block div with the copy button first", () => {
    const block = pre("const x = 1;");
    const tree = root(block);

    rehypeCopyButton()(tree);

    expect(tree.children).toHaveLength(1);
    expectWrapped(tree.children[0] as Element, block);
  });

  it("wraps every pre, including siblings and ones nested inside other elements", () => {
    const first = pre("a");
    const second = pre("b");
    const nested = pre("c");
    const container = el("div", [nested]);
    const tree = root(first, second, container);

    rehypeCopyButton()(tree);

    expectWrapped(tree.children[0] as Element, first);
    expectWrapped(tree.children[1] as Element, second);
    expect(tree.children[2]).toBe(container);
    expect(container.children).toHaveLength(1);
    expectWrapped(container.children[0], nested);
  });

  it("leaves non-pre elements such as paragraphs and inline code unchanged", () => {
    const tree = root(
      el("p", [{ type: "text", value: "use " }, el("code", [{ type: "text", value: "x" }])]),
      el("code", [{ type: "text", value: "inline" }]),
    );
    const before = structuredClone(tree);

    rehypeCopyButton()(tree);

    expect(tree).toEqual(before);
  });
});
