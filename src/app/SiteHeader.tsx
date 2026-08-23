import Link from "next/link";
import { ThemeToggle } from "@/lib/theme/theme-toggle";
import { logout } from "@/app/admin/actions/logout";

export function SiteHeader({ showLogout = false }: { showLogout?: boolean }) {
  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <Link href="/" className="text-lg font-semibold">
        <span className="text-red-400">Developer Jay&apos;s Musings</span>
      </Link>
      <div className="flex items-center gap-2">
        {showLogout && (
          <form action={logout}>
            <button type="submit" className="rounded border px-3 py-1 text-sm">
              Log out
            </button>
          </form>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}
