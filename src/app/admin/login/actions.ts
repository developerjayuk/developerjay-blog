"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sanitizeRedirect } from "@/lib/auth/sanitize-redirect";
import { getAdminEmail } from "@/lib/auth/admin-email";

export type LoginState = { error: string } | null;

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");
  const redirectField = formData.get("redirect");
  const redirectTo = sanitizeRedirect(typeof redirectField === "string" ? redirectField : null);

  if (typeof email !== "string" || !email || typeof password !== "string" || !password) {
    return { error: "Invalid email or password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Invalid email or password." };
  }

  if (data.user.email !== getAdminEmail()) {
    await supabase.auth.signOut();
    return { error: "This account is not authorized for admin access." };
  }

  redirect(redirectTo);
}
