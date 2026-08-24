"use client";

import { useEffect, useRef } from "react";
import { CircuitBoard } from "../ai-visualizer/circuit-board";

/**
 * ParticleNetworkBackground
 * -------------------------
 * Canvas-based animated particle network that gently reacts to mouse movement.
 * - ~70 floating particles connected by short lines when close
 * - Mouse acts as a soft "attractor" — nearby particles brighten + a halo
 * - Reduced-motion: render static grid only
 * - Pointer-events disabled, sits behind content (z-0)
 *
 * Pass `variant="circuit"` to swap in the AI visualizer CircuitBoard
 * (subtle, low-opacity, breathes with engine state). Default keeps the
 * classic particle network for the homepage hero.
 *
 * Performance:
 *  - rAF loop is paused via IntersectionObserver when the section is scrolled
 *    off-screen (a tab on the homepage can have 5+ of these; pausing saves
 *    real CPU on laptops).
 *  - rAF loop is also paused when the document is hidden (tab switched).
 *  - Mouse listeners are only active while the canvas is visible.
 *  - DPR is capped at 2 to avoid retina-screen GPU saturation.
 *  - Particle count is `min(density, area/18000)` so the cost scales with
 *    viewport, not the raw density prop.
 *  - The O(n²) connection pass is the hot path; we early-skip pairs whose
 *    dx or dy alone exceeds the link radius (cheaper than full hypot).
 */

interface ParticleNetworkBackgroundProps {
  density?: number;
  /** "particles" (default) — classic network. "circuit" — AI visualizer board. */
  variant?: "particles" | "circuit";
}

export function ParticleNetworkBackground({
  density = 70,
  variant = "particles",
}: ParticleNetworkBackgroundProps) {
  // Variant swap renders a different component tree entirely; we branch at
  // the JSX level (not via early return) so the React hooks below stay
  // unconditional. The `variant === "circuit"` branch is taken on the FIRST
  // render, so the particle effect's useEffect returns early before touching
  // any DOM — keeping the rules-of-hooks happy while still allowing the
  // circuit board to fully own the canvas when chosen.
  if (variant === "circuit") {
    return <CircuitBoard opacity={0.35} showHud={false} />;
  }

  return <ParticleCanvas density={density} />;
}

function ParticleCanvas({ density }: { density: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    type P = { x: number; y: number; vx: number; vy: number; r: number; hue: number };
    let particles: P[] = [];

    const mouse = { x: -9999, y: -9999, active: false };

    // ── Visibility state ────────────────────────────────────────────────
    // `running` is true only when (a) the canvas is in the viewport AND
    // (b) the document is visible. Both conditions are tracked separately
    // so we re-evaluate on either signal.
    let inViewport = true;
    let docVisible = !document.hidden;
    let running = !reduced && inViewport && docVisible;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(density, Math.floor((width * height) / 18000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: 1 + Math.random() * 1.6,
        hue: Math.random() < 0.5 ? 158 : 188, // emerald or cyan
      }));
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      mouse.active = true;
    };
    const onLeave = () => {
      mouse.active = false;
      mouse.x = -9999;
      mouse.y = -9999;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseout", onLeave);

    // ── Visibility observers ────────────────────────────────────────────
    const updateRunning = () => {
      const was = running;
      running = !reduced && inViewport && docVisible;
      if (running && !was) {
        raf = requestAnimationFrame(draw);
      } else if (!running && was) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    const onVisibility = () => {
      docVisible = !document.hidden;
      updateRunning();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (entry && entry.target === canvas) {
            inViewport = entry.isIntersecting;
            updateRunning();
          }
        },
        { threshold: 0 },
      );
      io.observe(canvas);
    }

    const draw = () => {
      if (!running) return;
      raf = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, width, height);

      // ── Hot path: update + draw particles ───────────────────────────
      const linkR = 120;
      const linkR2 = linkR * linkR;
      const mouseActive = mouse.active;
      const mx = mouse.x;
      const my = mouse.y;

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
        p.x = Math.max(0, Math.min(width, p.x));
        p.y = Math.max(0, Math.min(height, p.y));

        if (mouseActive) {
          const dx = mx - p.x;
          const dy = my - p.y;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < 25600) {
            // 160^2
            const dist = Math.sqrt(dist2);
            const force = (160 - dist) / 160;
            p.vx += (dx / dist) * force * 0.012;
            p.vy += (dy / dist) * force * 0.012;
          }
        }
        p.vx *= 0.992;
        p.vy *= 0.992;
        if (Math.abs(p.vx) < 0.04) p.vx += (Math.random() - 0.5) * 0.05;
        if (Math.abs(p.vy) < 0.04) p.vy += (Math.random() - 0.5) * 0.05;

        const closeToMouse =
          mouseActive && Math.hypot(mx - p.x, my - p.y) < 140;
        ctx.beginPath();
        ctx.arc(p.x, p.y, closeToMouse ? p.r * 1.8 : p.r, 0, Math.PI * 2);
        ctx.fillStyle = closeToMouse
          ? `hsla(${p.hue}, 95%, 70%, 0.95)`
          : `hsla(${p.hue}, 85%, 55%, 0.45)`;
        ctx.fill();
      }

      // ── Hot path: connection lines (O(n²)) ──────────────────────────
      // Early-skip pairs whose dx alone exceeds link radius — saves the
      // expensive Math.hypot call on the majority of distant pairs.
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          if (dx > linkR || dx < -linkR) continue;
          const dy = a.y - b.y;
          if (dy > linkR || dy < -linkR) continue;
          const dist2 = dx * dx + dy * dy;
          if (dist2 < linkR2) {
            const dist = Math.sqrt(dist2);
            const alpha = (1 - dist / linkR) * 0.35;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle =
              a.hue === b.hue
                ? `hsla(${a.hue}, 80%, 55%, ${alpha})`
                : `hsla(172, 80%, 55%, ${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.stroke();
          }
        }
      }

      // Cursor halo
      if (mouseActive) {
        const grad = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 120);
        grad.addColorStop(0, "rgba(16, 185, 129, 0.18)");
        grad.addColorStop(1, "rgba(16, 185, 129, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 120, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    if (reduced) {
      // Static version: just draw particles once
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 85%, 55%, 0.45)`;
        ctx.fill();
      }
    } else if (running) {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseout", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-70"
      style={{ willChange: "transform" }}
    />
  );
}
