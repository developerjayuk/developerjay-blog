// Throws rather than letting an unset ADMIN_EMAIL make the allowlist check fail open.
export function getAdminEmail(): string {
  const email = process.env.ADMIN_EMAIL;
  if (!email) {
    throw new Error("ADMIN_EMAIL environment variable is not set");
  }
  return email;
}
