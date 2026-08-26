"use client";

import { useEffect, useRef } from "react";

/**
 * useVisiblePolling
 *
 * Run an async loader on a fixed cadence, but pause while the tab is hidden.
 *
 * Why this exists: the GuardianX dashboard mounts many small panels, each of
 * which used to fire `setInterval(load, …)` independently. On a 3.9 GB box the
 * dev server was getting OOM-killed at ~2.8 GB because polling continued even
 * when the user had switched to another tab. The Page Visibility API lets us
 * stop the noise entirely when no one is looking.
 *
 * Behaviour:
 *   - Calls `fn` once on mount (unless `immediate: false`), regardless of
 *     visibility, so the panel isn't empty when the user returns.
 *   - Starts a `setInterval` only while `document.visibilityState === "visible"`.
 *   - On `visibilitychange` -> hidden: clears the interval.
 *   - On `visibilitychange` -> visible: calls `fn` once to catch up, then
 *     restarts the interval.
 *   - Pass `enabled: false` to fully suspend (e.g. while a transient operation
 *     is in progress or the parent component is unmounted).
 *
 * Manual refresh buttons should call `fn` directly — they always work, this
 * hook only governs the background cadence.
 *
 * The callback is stored in a ref so it can change every render without
 * restarting the interval (the cadence is tied to `intervalMs` / `enabled`,
 * not to the identity of `fn`).
 */
export function useVisiblePolling(
  fn: () => void,
  intervalMs: number,
  options?: { enabled?: boolean; immediate?: boolean }
): void {
  const { enabled = true, immediate = true } = options ?? {};
  const fnRef = useRef(fn);
  // Keep the ref in sync with the latest callback. Must happen in an effect
  // (not during render) per react-hooks/refs rule.
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    // Initial fetch on mount so the panel has data even if it loads in a
    // background tab.
    if (immediate) fnRef.current();

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer != null) return;
      timer = setInterval(() => fnRef.current(), intervalMs);
    };

    const stop = () => {
      if (timer == null) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        // Catch up immediately, then resume the cadence.
        fnRef.current();
        start();
      }
    };

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, intervalMs, immediate]);
}
