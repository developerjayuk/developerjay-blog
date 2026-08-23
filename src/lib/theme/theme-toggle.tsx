"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import MoonFoggyFillIcon from "remixicon-react/MoonFoggyFillIcon";
import SunFoggyFillIcon from "remixicon-react/SunFoggyFillIcon";

const noopSubscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes only knows the real theme after the client mounts; this avoids a server/client
  // hydration mismatch without a setState-in-effect (getServerSnapshot is always false).
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  if (!mounted) {
    return <button aria-label="Toggle theme" disabled className="rounded border p-2 opacity-0" />;
  }

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="rounded border p-2 text-yellow-600 bg-white dark:bg-zinc-800 cursor-pointer"
    >
      {resolvedTheme === "dark" ? (
        <SunFoggyFillIcon size={18} />
      ) : (
        <MoonFoggyFillIcon size={18} />
      )}
    </button>
  );
}
