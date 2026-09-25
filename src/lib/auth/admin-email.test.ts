import { describe, it, expect, vi } from "vitest";
import { getAdminEmail } from "./admin-email";

describe("getAdminEmail", () => {
  it("returns ADMIN_EMAIL when it is set", () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    expect(getAdminEmail()).toBe("admin@example.com");
  });

  it("throws when ADMIN_EMAIL is unset", () => {
    vi.stubEnv("ADMIN_EMAIL", undefined);
    expect(() => getAdminEmail()).toThrow("ADMIN_EMAIL environment variable is not set");
  });

  it("throws when ADMIN_EMAIL is an empty string, so it can't fail open", () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    expect(() => getAdminEmail()).toThrow("ADMIN_EMAIL environment variable is not set");
  });
});
