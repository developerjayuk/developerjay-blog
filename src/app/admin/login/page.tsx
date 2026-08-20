import { LoginForm } from "./login-form";
import { sanitizeRedirect } from "@/lib/auth/sanitize-redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const { redirect } = await searchParams;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6">
      <h1 className="text-xl font-semibold">Admin login</h1>
      <LoginForm redirectTo={sanitizeRedirect(redirect)} />
    </div>
  );
}
