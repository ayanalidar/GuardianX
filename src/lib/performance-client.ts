"use client";

/**
 * Client-side performance hooks for GuardianX.
 *
 * This file has "use client" so it can use React hooks.
 * Server-side code imports from `src/lib/performance.ts` (which has no
 * "use client" directive) to avoid pulling React into API route bundles.
 */

import { useEffect, useRef, useState, type MutableRefObject } from "react";

// ── Render timing ─────────────────────────────────────────────────────────

const SLOW_RENDER_THRESHOLD_MS = 16; // ~1 frame at 60fps

export function usePerformanceMetric(name: string, enabled = false): void {
  const lastRenderRef = useRef<number>(0);
  lastRenderRef.current = performance.now();
  useEffect(() => {
    if (!enabled) return;
    const elapsed = performance.now() - lastRenderRef.current;
    if (elapsed > SLOW_RENDER_THRESHOLD_MS) {
      console.warn(`[perf] slow render: <${name}> took ${elapsed.toFixed(1)}ms`);
    }
  });
}

// ── Visibility-aware polling ──────────────────────────────────────────────

interface UseVisiblePollingOptions {
  intervalMs: number;
  targetRef?: MutableRefObject<HTMLElement | null>;
  pauseWhenHidden?: boolean;
  fireImmediately?: boolean;
  enabled?: boolean;
}

export function useVisiblePolling(
  callback: () => void | Promise<void>,
  options: UseVisiblePollingOptions,
): void {
  const {
    intervalMs,
    targetRef,
    pauseWhenHidden = true,
    fireImmediately = true,
    enabled = true,
  } = options;

  const cbRef = useRef(callback);
  useEffect(() => {
    cbRef.current = callback;
  }, [callback]);

  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!pauseWhenHidden) return;
    const update = () => setVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, [pauseWhenHidden]);

  useEffect(() => {
    if (!targetRef) return;
    const el = targetRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry && entry.target === el) {
          setVisible((prev) => {
            if (pauseWhenHidden && document.hidden) return prev;
            return entry.isIntersecting;
          });
        }
      },
      { threshold: 0.05, rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [targetRef, pauseWhenHidden]);

  useEffect(() => {
    if (!enabled || !visible) return;
    if (fireImmediately) {
      Promise.resolve().then(() => cbRef.current());
    }
    const id = setInterval(() => {
      cbRef.current();
    }, intervalMs);
    return () => clearInterval(id);
  }, [enabled, visible, intervalMs, fireImmediately]);
}
