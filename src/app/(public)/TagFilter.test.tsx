import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagFilter } from "./TagFilter";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/",
  useSearchParams: () => nav.searchParams,
}));

beforeEach(() => {
  nav.searchParams = new URLSearchParams();
});

describe("TagFilter", () => {
  it("renders nothing when there are no tags", () => {
    const { container } = render(<TagFilter tags={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("renders one button per tag", () => {
    render(<TagFilter tags={["react", "nextjs", "css"]} />);

    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("marks only the active tag as pressed", () => {
    render(<TagFilter tags={["react", "nextjs"]} activeTag="react" />);

    expect(screen.getByRole("button", { name: "react" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "nextjs" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("sets the tag param while preserving the search query", async () => {
    nav.searchParams = new URLSearchParams("q=hooks");
    const user = userEvent.setup();
    render(<TagFilter tags={["react", "nextjs"]} />);

    await user.click(screen.getByRole("button", { name: "react" }));

    expect(nav.replace).toHaveBeenCalledWith("/?q=hooks&tag=react");
  });

  it("clears the tag param when the active tag is clicked again, keeping the query", async () => {
    nav.searchParams = new URLSearchParams("q=hooks&tag=react");
    const user = userEvent.setup();
    render(<TagFilter tags={["react", "nextjs"]} activeTag="react" />);

    await user.click(screen.getByRole("button", { name: "react" }));

    expect(nav.replace).toHaveBeenCalledWith("/?q=hooks");
  });
});
