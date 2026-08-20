"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error: string } | null;

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = (formData.get("redirect") as string) || "/admin";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Invalid email or password." };
  }

  if (data.user.email !== process.env.ADMIN_EMAIL) {
    await supabase.auth.signOut();
    return { error: "This account is not authorized for admin access." };
  }

  redirect(redirectTo);
}
