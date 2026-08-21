export function TagList({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li key={tag} className="rounded border px-2 py-0.5 text-xs text-zinc-500">
          {tag}
        </li>
      ))}
    </ul>
  );
}
