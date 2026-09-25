import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImageUpload } from "./ImageUpload";

const MAX = 4 * 1024 * 1024;

function png(size = 1024) {
  const file = new File(["x"], "a.png", { type: "image/png" });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

function setup() {
  const onUploaded = vi.fn();
  const user = userEvent.setup();
  render(<ImageUpload onUploaded={onUploaded} />);
  return { onUploaded, user, input: screen.getByLabelText<HTMLInputElement>("Insert image") };
}

describe("ImageUpload", () => {
  it("rejects files over 4MB without uploading", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { onUploaded, user, input } = setup();

    await user.upload(input, png(MAX + 1));

    expect(await screen.findByText("Image must be 4MB or smaller.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("allows a file of exactly 4MB", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: "u" }) });
    vi.stubGlobal("fetch", fetch);
    const { user, input } = setup();

    await user.upload(input, png(MAX));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("posts the file and hands back the uploaded URL", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ url: "https://x.co/a.png" }) });
    vi.stubGlobal("fetch", fetch);
    const { onUploaded, user, input } = setup();
    const file = png();

    await user.upload(input, file);

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith("https://x.co/a.png"));
    expect(fetch).toHaveBeenCalledWith(
      "/admin/posts/upload",
      expect.objectContaining({ method: "POST" }),
    );
    const body = fetch.mock.calls[0][1].body;
    expect(body).toBeInstanceOf(FormData);
    expect(body.get("image")).toBe(file);
  });

  it("shows the server's error message", async () => {
    const error = "Unsupported file type. Use PNG, JPEG, WEBP, GIF, or SVG.";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error }) }));
    const { onUploaded, user, input } = setup();

    await user.upload(input, png());

    expect(await screen.findByText(error)).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("shows a generic error when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { onUploaded, user, input } = setup();

    await user.upload(input, png());

    expect(await screen.findByText("Upload failed. Please try again.")).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
