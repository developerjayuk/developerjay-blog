import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TagList } from "./TagList";

describe("TagList", () => {
  it("renders one list item per tag", () => {
    render(<TagList tags={["react", "nextjs"]} />);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("react");
    expect(items[1]).toHaveTextContent("nextjs");
  });

  it("renders nothing when there are no tags", () => {
    const { container } = render(<TagList tags={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
