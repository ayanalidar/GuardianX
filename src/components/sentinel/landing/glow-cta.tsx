"use client";

import { useRef, useState, type ReactNode, type MouseEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * GlowCTA
 * -------
 * A button/anchor wrapper that:
 *  - Expands a glowing box-shadow halo on hover
 *  - Emits a brief burst of small particle dots from the click point
 *
 * Pass `onClick`, `children`, and a `variant` ("solid" | "outline").
 */
interface GlowCTAProps {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  /** For external links: opens in a new tab with rel="noopener noreferrer" */
  external?: boolean;
  variant?: "solid" | "outline";
  className?: string;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  angle: number;
  color: string;
}

const COLORS = ["#34d399", "#22d3ee", "#a78bfa", "#fbbf24"];

export function GlowCTA({
  children,
  onClick,
  href,
  external = false,
  variant = "solid",
  className,
}: GlowCTAProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [particles, setParticles] = useState<Particle[]>([]);
  const idRef = useRef(0);

  const emitParticles = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const burst: Particle[] = Array.from({ length: 12 }, () => {
      const id = ++idRef.current;
      const angle = Math.random() * Math.PI * 2;
      return {
        id,
        x,
        y,
        angle,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    });
    setParticles((prev) => [...prev, ...burst]);
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !burst.find((b) => b.id === p.id)));
    }, 700);
  };

  const handleClick = (e: MouseEvent) => {
    emitParticles(e.clientX, e.clientY);
    onClick?.();
  };

  const baseClass =
    variant === "solid"
      ? "bg-emerald-600 text-white hover:bg-emerald-500 neon-border"
      : "inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/60 px-6 py-3 text-sm text-zinc-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300";

  const inner = (
    <motion.span
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      className={cn("cta-glow relative inline-flex cursor-pointer items-center gap-2 rounded-md px-6 py-3 text-sm font-medium", baseClass, className)}
    >
      {children}
      {/* Particle overlay */}
      <span className="pointer-events-none absolute inset-0 overflow-visible">
        <AnimatePresence>
          {particles.map((p) => (
            <motion.span
              key={p.id}
              initial={{ opacity: 1, x: p.x, y: p.y, scale: 1 }}
              animate={{
                opacity: 0,
                x: p.x + Math.cos(p.angle) * 60,
                y: p.y + Math.sin(p.angle) * 60,
                scale: 0.2,
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="absolute block size-1.5 rounded-full"
              style={{
                background: p.color,
                boxShadow: `0 0 6px ${p.color}, 0 0 12px ${p.color}`,
              }}
            />
          ))}
        </AnimatePresence>
      </span>
    </motion.span>
  );

  if (href) {
    return (
      <div ref={ref} className="relative inline-block">
        <a
          href={href}
          onClick={handleClick}
          className="inline-block"
          {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {inner}
        </a>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={handleClick} className="inline-block">
        {inner}
      </button>
    </div>
  );
}
