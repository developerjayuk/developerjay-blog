import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MarkdownContent } from "./MarkdownContent";

// Mirrors the markup rehype-copy-button.ts wraps around each <pre>.
const HTML =
  '<div data-code-block=""><button type="button" data-copy-button="" aria-label="Copy code">Copy</button><pre><code>const x = 1;</code></pre></div><p>Outside</p>';

// fireEvent rather than user-event: userEvent.setup() installs its own navigator.clipboard stub.
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

describe("MarkdownContent", () => {
  it("copies the code block's text and marks the button as copied", async () => {
    render(<MarkdownContent html={HTML} />);
    // Hold the element: its accessible name changes to "Copied" after the click.
    const button = screen.getByRole("button", { name: "Copy code" });

    fireEvent.click(button);

    expect(writeText).toHaveBeenCalledWith("const x = 1;");
    await waitFor(() => expect(button).toHaveAttribute("aria-label", "Copied"));
  });

  it("ignores clicks outside a copy button", () => {
    render(<MarkdownContent html={HTML} />);

    fireEvent.click(screen.getByText("Outside"));

    expect(writeText).not.toHaveBeenCalled();
  });
});
