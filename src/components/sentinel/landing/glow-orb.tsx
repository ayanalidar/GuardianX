"use client";

import { motion } from "framer-motion";

/**
 * GlowOrb
 * -------
 * Layered radial-gradient orb that pulses + slowly rotates behind an element
 * (e.g. the GuardianX logo). Pure CSS gradients, no images, very cheap.
 *
 * Pass `size` in px (defaults to 360).
 */
export function GlowOrb({ size = 360 }: { size?: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ width: size, height: size }}
    >
      {/* Outer violet halo */}
      <motion.div
        className="absolute inset-0 rounded-full blur-2xl"
        style={{
          background:
            "radial-gradient(circle, rgba(139,92,246,0.22) 0%, rgba(139,92,246,0) 70%)",
        }}
        animate={{ scale: [1, 1.12, 1], opacity: [0.55, 0.85, 0.55] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Middle cyan ring */}
      <motion.div
        className="absolute inset-[12%] rounded-full blur-xl"
        style={{
          background:
            "radial-gradient(circle, rgba(6,182,212,0.32) 0%, rgba(6,182,212,0) 70%)",
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
      />
      {/* Core emerald */}
      <motion.div
        className="absolute inset-[28%] rounded-full blur-md"
        style={{
          background:
            "radial-gradient(circle, rgba(16,185,129,0.55) 0%, rgba(16,185,129,0) 75%)",
        }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
      />
      {/* Rotating conic accent */}
      <motion.div
        className="absolute inset-[8%] rounded-full opacity-40 mix-blend-screen"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, rgba(16,185,129,0.4) 40deg, transparent 80deg, transparent 200deg, rgba(6,182,212,0.4) 240deg, transparent 280deg)",
          maskImage:
            "radial-gradient(circle, transparent 38%, black 60%, transparent 80%)",
          WebkitMaskImage:
            "radial-gradient(circle, transparent 38%, black 60%, transparent 80%)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}
