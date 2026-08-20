import { createClient } from "@/lib/supabase/admin";
import { logout } from "@/app/admin/actions/logout";
import Link from "next/link";

export default async function AdminDashboard() {
  const supabase = createClient();
  const { count, error } = await supabase
    .from("posts")
    .select("*", { count: "exact", head: true });

  if (error) {
    throw error;
  }

  return (
    <div className="flex flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">{count ?? 0} posts</h1>
      <Link href="/admin/posts" className="rounded border px-3 py-1 text-sm w-fit">
        Manage posts
      </Link>
      <form action={logout}>
        <button type="submit" className="rounded border px-3 py-1 text-sm">
          Log out
        </button>
      </form>
    </div>
  );
}
