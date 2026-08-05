"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

/**
 * ThemeToggle — Sun/Moon button that flips between dark (black) and light (navy blue) themes
 * via next-themes. The "light" theme is actually a premium blueish navy — visible in daylight
 * but not stark white. Cards keep their colorful accents in both modes.
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
      className={`inline-flex size-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-zinc-900/60 text-zinc-300 transition-colors hover:bg-emerald-500/10 hover:text-emerald-300 ${className}`}
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
