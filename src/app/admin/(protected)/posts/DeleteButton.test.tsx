import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteButton } from "./DeleteButton";

// Mocked so lib/supabase/server (server-only + next/headers) never loads.
const actions = vi.hoisted(() => ({
  createPost: vi.fn(),
  updatePost: vi.fn(),
  deletePost: vi.fn(),
}));
vi.mock("./actions", () => actions);

describe("DeleteButton", () => {
  it("does not delete when the confirm dialog is dismissed", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<DeleteButton id="p1" slug="hello-world" status="published" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirm).toHaveBeenCalledWith("Delete this post? This cannot be undone.");
    expect(actions.deletePost).not.toHaveBeenCalled();
  });

  it("submits the post's id, slug and status when confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<DeleteButton id="p1" slug="hello-world" status="published" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(actions.deletePost).toHaveBeenCalledTimes(1));
    const formData = actions.deletePost.mock.calls[0][0];
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get("id")).toBe("p1");
    expect(formData.get("slug")).toBe("hello-world");
    expect(formData.get("status")).toBe("published");
  });
});
