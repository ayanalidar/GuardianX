"use client";

import { useEffect, useRef } from "react";

/**
 * Sci-fi lab background: matrix rain (canvas) + ambient glow.
 * Sits behind all content at z-0. Pointer-events disabled.
 */
export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    let columns = 0;
    let drops: number[] = [];
    const fontSize = 14;
    // Mix of katakana-ish + hex + symbols for a hacker feel
    const chars = "01ｱｲｳｴｵｶｷｸｹｺABCDEF0123456789</>$#@*+=";

    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      columns = Math.floor(width / fontSize);
      drops = Array(columns)
        .fill(0)
        .map(() => Math.random() * -100);
    };
    resize();
    window.addEventListener("resize", resize);

    let lastTime = 0;
    const interval = 60; // ms between frames, slower = more readable

    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      if (time - lastTime < interval) return;
      lastTime = time;

      // Fade trail
      ctx.fillStyle = "rgba(5, 8, 11, 0.08)";
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // Head is brighter, trail is dimmer
        if (Math.random() > 0.975) {
          ctx.fillStyle = "rgba(167, 243, 208, 0.9)"; // bright emerald-200
        } else {
          ctx.fillStyle = "rgba(16, 185, 129, 0.35)"; // emerald-500 dim
        }
        ctx.fillText(text, x, y);

        if (y > height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-0 opacity-40 max-w-full"
      aria-hidden
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}
