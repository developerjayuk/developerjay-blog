// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createClient: vi.fn() }));

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import { POST } from "./route";

const MAX = 4 * 1024 * 1024;

function mockSession(user: { email?: string } | null) {
  vi.mocked(createServerClient).mockResolvedValue({
    auth: { getUser: vi.fn(async () => ({ data: { user } })) },
  } as never);
}

function mockBucket(uploadError: unknown = null) {
  const bucket = {
    upload: vi.fn<(path: string, file: File, options: { contentType: string }) => Promise<{ error: unknown }>>(
      async () => ({ error: uploadError }),
    ),
    getPublicUrl: vi.fn((path: string) => ({
      data: { publicUrl: `https://cdn.test/post-images/${path}` },
    })),
  };
  const storage = { from: vi.fn(() => bucket) };
  vi.mocked(createAdminClient).mockReturnValue({ storage } as never);
  return { bucket, storage };
}

function image(type = "image/png", size = 16) {
  return new File([new Uint8Array(size)], "upload", { type });
}

function uploadRequest(
  file?: File | string,
  headers: Record<string, string> = { origin: "http://localhost:3000", host: "localhost:3000" },
) {
  const formData = new FormData();
  if (file !== undefined) formData.set("image", file);
  return new Request("http://localhost:3000/admin/posts/upload", {
    method: "POST",
    body: formData,
    headers,
  });
}

describe("POST", () => {
  beforeEach(() => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    mockSession({ email: "admin@example.com" });
    mockBucket();
  });

  it("returns 403 for a cross-origin request before looking up the session", async () => {
    const response = await POST(
      uploadRequest(image(), { origin: "https://evil.example", host: "localhost:3000" }),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no session, without reaching the admin client", async () => {
    mockSession(null);

    const response = await POST(uploadRequest(image()));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("returns 401 for a session whose email is not the admin, without reaching the admin client", async () => {
    mockSession({ email: "someone@else.com" });

    const response = await POST(uploadRequest(image()));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized." });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ["there is no image field", undefined],
    ["the image field is a string", "not-a-file"],
  ])("returns 400 when %s", async (_case, file) => {
    const response = await POST(uploadRequest(file));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "No image file provided." });
  });

  it("returns 400 for a disallowed file type without uploading", async () => {
    const { bucket } = mockBucket();

    const response = await POST(uploadRequest(image("application/pdf")));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/^Unsupported file type/);
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it("returns 400 for a file over 4MB without uploading", async () => {
    const { bucket } = mockBucket();

    const response = await POST(uploadRequest(image("image/png", MAX + 1)));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Image must be 4MB or smaller." });
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it("allows a file of exactly 4MB", async () => {
    const response = await POST(uploadRequest(image("image/png", MAX)));

    expect(response.status).toBe(200);
  });

  it("returns 500 and logs when the Storage upload fails", async () => {
    mockBucket({ message: "bucket down" });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(uploadRequest(image()));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Upload failed. Please try again." });
    expect(consoleError).toHaveBeenCalled();
  });

  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
    ["image/svg+xml", "svg"],
  ])("uploads a %s file under a UUID .%s path and returns its public URL", async (type, ext) => {
    const { bucket, storage } = mockBucket();

    const response = await POST(uploadRequest(image(type)));

    expect(response.status).toBe(200);
    expect(storage.from).toHaveBeenCalledWith("post-images");
    expect(bucket.upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^[0-9a-f-]{36}\\.${ext}$`)),
      expect.any(File),
      { contentType: type },
    );
    const path = bucket.upload.mock.calls[0][0];
    expect(bucket.getPublicUrl).toHaveBeenCalledWith(path);
    expect(await response.json()).toEqual({ url: `https://cdn.test/post-images/${path}` });
  });
});
