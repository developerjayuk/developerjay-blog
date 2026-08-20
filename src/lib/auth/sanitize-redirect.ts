// Rejects absolute/protocol-relative/backslash-prefixed values to prevent open-redirect.
export function sanitizeRedirect(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) {
    return "/admin";
  }
  return path;
}
