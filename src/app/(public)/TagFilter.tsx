"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function TagFilter({ tags, activeTag }: { tags: string[]; activeTag?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (tags.length === 0) {
    return null;
  }

  function toggleTag(tag: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (activeTag === tag) {
      params.delete("tag");
    } else {
      params.set("tag", tag);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li key={tag}>
          <button
            type="button"
            onClick={() => toggleTag(tag)}
            aria-pressed={activeTag === tag}
            className={`rounded border px-2 py-0.5 text-xs ${
              activeTag === tag
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-500"
            }`}
          >
            {tag}
          </button>
        </li>
      ))}
    </ul>
  );
}
