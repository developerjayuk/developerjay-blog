import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./theme-toggle";

const theme = vi.hoisted(() => ({ resolvedTheme: "light" as string, setTheme: vi.fn() }));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: theme.resolvedTheme, setTheme: theme.setTheme }),
}));

beforeEach(() => {
  theme.resolvedTheme = "light";
});

describe("ThemeToggle", () => {
  it("renders the enabled, mounted button", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("button", { name: "Toggle theme" })).toBeEnabled();
  });

  it("switches from light to dark", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Toggle theme" }));

    expect(theme.setTheme).toHaveBeenCalledWith("dark");
  });

  it("switches from dark to light", async () => {
    theme.resolvedTheme = "dark";
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("button", { name: "Toggle theme" }));

    expect(theme.setTheme).toHaveBeenCalledWith("light");
  });
});
