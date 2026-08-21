import { visit } from "unist-util-visit";
import type { Element, Root } from "hast";

export function rehypeCopyButton() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "pre" || index === undefined || !parent) {
        return;
      }

      const button: Element = {
        type: "element",
        tagName: "button",
        properties: {
          type: "button",
          className: ["copy-code-button"],
          "data-copy-button": "",
          "aria-label": "Copy code",
        },
        children: [{ type: "text", value: "Copy" }],
      };

      const wrapper: Element = {
        type: "element",
        tagName: "div",
        properties: { className: ["code-block"], "data-code-block": "" },
        children: [button, node],
      };

      parent.children[index] = wrapper;
    });
  };
}
