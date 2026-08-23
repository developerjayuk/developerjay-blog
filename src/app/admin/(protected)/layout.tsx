import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAdminEmail } from "@/lib/auth/admin-email";
import { SiteHeader } from "@/app/SiteHeader";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email !== getAdminEmail()) {
    redirect("/admin/login");
  }

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader showLogout />
      <main className="flex-1">{children}</main>
    </div>
  );
}
