"use client";

import { useEffect, useRef } from "react";

/**
 * ParticleLogo
 * ============
 * Interactive particle-based logo animation. The logo is reconstructed
 * from square particles sampled from the GuardianX logo image.
 *
 * Phases:
 *   1. ASSEMBLY — particles scattered outside → spring to target positions
 *   2. IDLE — subtle noise floating + opacity flicker
 *   3. MOUSE — cursor repels nearby particles; they spring back
 *
 * Mobile: reduces particle count for performance.
 * Accessibility: respects prefers-reduced-motion (skips assembly animation).
 */

interface Particle {
  tx: number; ty: number;
  x: number; y: number;
  vx: number; vy: number;
  size: number;
  color: string;
  baseOpacity: number;
  opacity: number;
  delay: number;
  seed: number;
}

export function ParticleLogo({ size = 400 }: { size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const isMobile = window.innerWidth < 768;
    const CONFIG = {
      size: isMobile ? 280 : size,
      particleCount: isMobile ? 800 : 2000,
      sampleRes: 300,
      logoScale: 0.78,
      interactive: true,
      assemblyDuration: 2200,
      repelRadius: 110,
      repelStrength: 0.6,
    };

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const renderSize = CONFIG.size;
    canvas.width = renderSize * dpr;
    canvas.height = renderSize * dpr;
    canvas.style.width = renderSize + "px";
    canvas.style.height = renderSize + "px";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: Particle[] = [];
    let phase: "loading" | "assembling" | "idle" = "loading";
    const mouse = { x: 0, y: 0, active: false };
    let startTime = 0;
    let rafId = 0;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const img = imgRef.current;
    if (!img) return;

    const buildParticles = () => {
      if (!img || !ctx) return;
      const sampleRes = CONFIG.sampleRes;
      const off = document.createElement("canvas");
      off.width = sampleRes;
      off.height = sampleRes;
      const offCtx = off.getContext("2d", { willReadFrequently: true });
      if (!offCtx) return;
      offCtx.drawImage(img, 0, 0, sampleRes, sampleRes);
      const data = offCtx.getImageData(0, 0, sampleRes, sampleRes).data;

      const candidates: Array<{ x: number; y: number; r: number; g: number; b: number }> = [];
      for (let y = 0; y < sampleRes; y += 2) {
        for (let x = 0; x < sampleRes; x += 2) {
          const i = (y * sampleRes + x) * 4;
          const a = data[i + 3];
          if (a > 60) {
            candidates.push({
              x: (x / sampleRes) * renderSize * dpr,
              y: (y / sampleRes) * renderSize * dpr,
              r: data[i], g: data[i + 1], b: data[i + 2],
            });
          }
        }
      }

      let chosen = candidates;
      if (candidates.length > CONFIG.particleCount) {
        for (let i = candidates.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        chosen = candidates.slice(0, CONFIG.particleCount);
      }

      const cx = (renderSize * dpr) / 2;
      const cy = (renderSize * dpr) / 2;

      particles = chosen.map((c) => {
        const scaledTx = cx + (c.x - cx) * CONFIG.logoScale;
        const scaledTy = cy + (c.y - cy) * CONFIG.logoScale;
        const angle = Math.random() * Math.PI * 2;
        const dist = renderSize * dpr * (0.55 + Math.random() * 0.35);
        return {
          tx: scaledTx, ty: scaledTy,
          x: prefersReducedMotion ? scaledTx : cx + Math.cos(angle) * dist,
          y: prefersReducedMotion ? scaledTy : cy + Math.sin(angle) * dist,
          vx: 0, vy: 0,
          size: (1.6 + Math.random() * 2.2) * dpr,
          color: `rgb(${c.r},${c.g},${c.b})`,
          baseOpacity: 0.7 + Math.random() * 0.3,
          opacity: prefersReducedMotion ? 0.9 : 0,
          delay: Math.random(),
          seed: Math.random() * 1000,
        };
      });

      startTime = performance.now();
      phase = prefersReducedMotion ? "idle" : "assembling";
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(animate);
    };

    const animate = () => {
      if (!ctx) { rafId = requestAnimationFrame(animate); return; }
      if (particles.length === 0) { rafId = requestAnimationFrame(animate); return; }

      const now = performance.now();
      const assemblyElapsed = now - startTime;
      const repelRadius = CONFIG.repelRadius * dpr;
      const t = now * 0.001;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        const assemblyProgress = Math.max(0, Math.min(1, (assemblyElapsed - p.delay * 800) / CONFIG.assemblyDuration));
        const arrived = assemblyProgress;

        if (assemblyProgress > 0 || phase === "idle") {
          const ax = (p.tx - p.x) * 0.08;
          const ay = (p.ty - p.y) * 0.08;
          p.vx += ax;
          p.vy += ay;

          if (phase === "idle" || arrived > 0.8) {
            const noiseAmp = 1.2 * dpr;
            p.vx += Math.sin(t * 0.8 + p.seed) * Math.cos(t * 0.5 + p.seed * 0.7) * noiseAmp * 0.04;
            p.vy += Math.cos(t * 0.7 + p.seed * 1.3) * Math.sin(t * 0.6 + p.seed * 0.5) * noiseAmp * 0.04;
            p.opacity = p.baseOpacity * (0.82 + Math.sin(t * 1.5 + p.seed) * 0.18);
          }

          if (assemblyProgress > 0 && phase === "assembling") {
            p.opacity = assemblyProgress * p.baseOpacity;
          }

          if (CONFIG.interactive && mouse.active) {
            const dx = p.x - mouse.x;
            const dy = p.y - mouse.y;
            const dist2 = dx * dx + dy * dy;
            if (dist2 < repelRadius * repelRadius && dist2 > 0.01) {
              const dist = Math.sqrt(dist2);
              const nd = dist / repelRadius;
              const force = nd < 0.4 ? (1 - nd / 0.4) * 18 : (1 - nd) * CONFIG.repelStrength * 4;
              p.vx += (dx / dist) * force;
              p.vy += (dy / dist) * force;
              if (nd < 0.5) p.opacity = Math.min(1, p.opacity * 1.5);
            }
          }
        }

        p.vx *= 0.84;
        p.vy *= 0.84;
        p.x += p.vx;
        p.y += p.vy;

        const op = Math.max(0, Math.min(1, p.opacity));
        if (op < 0.02) continue;
        ctx.globalAlpha = op;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }

      ctx.globalAlpha = 1;
      if (phase === "assembling" && assemblyElapsed > CONFIG.assemblyDuration + 300) {
        phase = "idle";
      }
      rafId = requestAnimationFrame(animate);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const pad = 60;
      if (e.clientX < rect.left - pad || e.clientX > rect.right + pad ||
          e.clientY < rect.top - pad || e.clientY > rect.bottom + pad) {
        mouse.active = false;
        return;
      }
      mouse.x = (e.clientX - rect.left) * dpr;
      mouse.y = (e.clientY - rect.top) * dpr;
      mouse.active = true;
    };

    const onVisibilityChange = () => {
      if (document.hidden) cancelAnimationFrame(rafId);
      else rafId = requestAnimationFrame(animate);
    };

    if (CONFIG.interactive) {
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseleave", () => { mouse.active = false; });
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (img.complete) buildParticles();
    else img.onload = buildParticles;

    let resizeTimer: ReturnType<typeof setTimeout>;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (!document.hidden) buildParticles(); }, 300);
    });

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseleave", () => {});
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [size]);

  return (
    <div ref={containerRef} className="relative" style={{ width: "min(400px, 90vw)", height: "min(400px, 90vw)" }}>
      {/* Glow behind particles */}
      <div
        className="pointer-events-none absolute inset-[8%] rounded-full"
        style={{
          background: "radial-gradient(circle at 50% 45%, rgba(124,58,237,0.28), rgba(56,189,248,0.12) 40%, transparent 68%)",
          filter: "blur(32px)",
        }}
        aria-hidden="true"
      />
      <canvas
        ref={canvasRef}
        className="relative z-10 block"
        aria-label="GuardianX particle logo"
        role="img"
      />
      <img
        ref={imgRef}
        src="/guardianx-logo-v2.png"
        crossOrigin="anonymous"
        alt="GuardianX logo"
        className="hidden"
      />
    </div>
  );
}
