import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Listbox } from "./Listbox";

function renderListbox() {
  const utils = render(
    <Listbox
      id="status"
      name="status"
      defaultValue="draft"
      options={[
        { value: "draft", label: "Draft" },
        { value: "published", label: "Published" },
      ]}
    />,
  );
  const hidden = () => utils.container.querySelector<HTMLInputElement>('input[name="status"]')!;
  return { ...utils, hidden, button: screen.getByRole("button") };
}

// Opened by click, not Enter/Space on the button: those also fire a native click and toggle twice.
describe("Listbox", () => {
  it("starts closed with the default value selected", () => {
    const { hidden, button } = renderListbox();

    expect(hidden().value).toBe("draft");
    expect(button).toHaveTextContent("Draft");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens on click and focuses the list", async () => {
    const user = userEvent.setup();
    const { button } = renderListbox();

    await user.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toHaveFocus();
  });

  it("opens from the button with ArrowDown", async () => {
    const user = userEvent.setup();
    const { button } = renderListbox();

    button.focus();
    await user.keyboard("{ArrowDown}");

    expect(screen.getByRole("listbox")).toHaveFocus();
  });

  it("commits a clicked option and returns focus to the button", async () => {
    const user = userEvent.setup();
    const { hidden, button } = renderListbox();

    await user.click(button);
    await user.click(screen.getByRole("option", { name: "Published" }));

    expect(hidden().value).toBe("published");
    expect(button).toHaveTextContent("Published");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("commits the highlighted option with ArrowDown + Enter", async () => {
    const user = userEvent.setup();
    const { hidden, button } = renderListbox();

    await user.click(button);
    await user.keyboard("{ArrowDown}{Enter}");

    expect(hidden().value).toBe("published");
  });

  it("clamps ArrowUp at the first option", async () => {
    const user = userEvent.setup();
    const { hidden, button } = renderListbox();

    await user.click(button);
    await user.keyboard("{ArrowUp}{Enter}");

    expect(hidden().value).toBe("draft");
  });

  it("closes on Escape without committing", async () => {
    const user = userEvent.setup();
    const { hidden, button } = renderListbox();

    await user.click(button);
    await user.keyboard("{ArrowDown}{Escape}");

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(hidden().value).toBe("draft");
    expect(button).toHaveFocus();
  });

  it("closes on a mousedown outside the component", async () => {
    const user = userEvent.setup();
    const { button } = renderListbox();

    await user.click(button);
    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
