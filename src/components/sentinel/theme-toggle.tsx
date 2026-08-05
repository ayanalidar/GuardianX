"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

/**
 * ThemeToggle — Sun/Moon button that flips between dark and light themes
 * via next-themes. Mounted only on the client (uses `useTheme` which reads
 * localStorage). Renders a placeholder button of the same size on first
 * paint to avoid hydration mismatch, then swaps in the live icon.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Standard next-themes mount-guard pattern: the one-time setState here
    // is intentional (defers rendering of the theme-dependent icon until
    // hydration completes to avoid hydration mismatch). Cascading renders
    // are not a concern because the value only flips once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const current = resolvedTheme ?? theme ?? "dark";
  const isDark = current === "dark";
  const next = isDark ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={`inline-flex size-9 items-center justify-center rounded-lg border border-zinc-200 bg-white/60 text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-emerald-500/30 dark:bg-zinc-900/60 dark:text-zinc-300 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-300 ${className}`}
    >
      {mounted ? (
        isDark ? (
          <Sun className="size-4" />
        ) : (
          <Moon className="size-4" />
        )
      ) : (
        <span className="size-4" />
      )}
    </button>
  );
}
