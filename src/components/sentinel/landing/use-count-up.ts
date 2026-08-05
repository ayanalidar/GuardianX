"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

/**
 * Count-up hook.
 *
 * Returns `[ref, value]` where `ref` is attached to a wrapper element.
 * When the element scrolls into view (or `start` is true), the value
 * animates from 0 → target using an ease-out curve.
 *
 * Re-triggers when `trigger` changes (lets you re-fire animations).
 */
export function useCountUp(
  target: number,
  options: {
    duration?: number;
    delay?: number;
    start?: boolean;
    once?: boolean;
    trigger?: unknown;
  } = {},
): readonly [(node: HTMLElement | null) => void, number] {
  const { duration = 1600, delay = 0, start, once = true, trigger } = options;
  const ref = useRef<HTMLElement | null>(null);
  const inView = useInView(ref, { once, amount: 0.4 });
  const [value, setValue] = useState(0);

  // `inView` (with once:true) flips to true permanently after first entry.
  // Passing it as a dep would re-fire the effect forever — so we use a
  // boolean gate that only flips when we actually want a (re)start.
  const shouldStart = start ?? inView;

  useEffect(() => {
    if (!shouldStart) return;
    const startTs = Date.now() + delay;
    let raf = 0;
    const tick = () => {
      const elapsed = Math.max(0, Date.now() - startTs);
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, delay, trigger, shouldStart]);

  return [((node: HTMLElement | null) => {
    ref.current = node;
  }), value] as const;
}

/** Format an integer with thousands separators (en-US). */
export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
