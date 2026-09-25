import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { SearchBar } from "./SearchBar";

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => "/",
  useSearchParams: () => nav.searchParams,
}));

// fireEvent rather than user-event: user-event + fake timers needs extra wiring and can hang.
beforeEach(() => {
  nav.searchParams = new URLSearchParams();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const searchbox = () => screen.getByRole("searchbox", { name: "Search posts" });

describe("SearchBar", () => {
  it("starts with the q param from the URL", () => {
    nav.searchParams = new URLSearchParams("q=hooks");
    render(<SearchBar />);

    expect(searchbox()).toHaveValue("hooks");
  });

  it("debounces typing into a single URL update", () => {
    render(<SearchBar />);

    fireEvent.change(searchbox(), { target: { value: "a" } });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.change(searchbox(), { target: { value: "ab" } });
    act(() => vi.advanceTimersByTime(299));
    expect(nav.replace).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith("/?q=ab");
  });

  it("preserves other params such as the active tag", () => {
    nav.searchParams = new URLSearchParams("tag=react");
    render(<SearchBar />);

    fireEvent.change(searchbox(), { target: { value: "ab" } });
    act(() => vi.advanceTimersByTime(300));

    expect(nav.replace).toHaveBeenCalledWith("/?tag=react&q=ab");
  });

  it("removes the q param when the input is cleared", () => {
    nav.searchParams = new URLSearchParams("q=hooks");
    render(<SearchBar />);

    fireEvent.change(searchbox(), { target: { value: "" } });
    act(() => vi.advanceTimersByTime(300));

    expect(nav.replace).toHaveBeenCalledWith("/?");
  });

  it("resyncs from an external URL change without pushing it back", () => {
    nav.searchParams = new URLSearchParams("q=hooks");
    const { rerender } = render(<SearchBar />);

    nav.searchParams = new URLSearchParams("q=other");
    rerender(<SearchBar />);
    expect(searchbox()).toHaveValue("other");

    act(() => vi.advanceTimersByTime(300));
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
