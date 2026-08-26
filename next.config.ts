import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["*.space-z.ai", "*.chatglm.cn", "*.z.ai", "*.vercel.app"],
  // ── perf-optimize: tree-shake heavy barrel-export deps ────────────────────
  // `lucide-react` exports 1500+ icons as a single barrel. Without this hint
  // every page that imports 1 icon ends up bundling the whole library in dev
  // (production already tree-shakes, but this also speeds up dev compiles).
  // `@radix-ui/*` and `framer-motion` similarly benefit.
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "@radix-ui/react-icons",
      "recharts",
      "date-fns",
      "react-markdown",
    ],
  },
  // ── perf-optimize: strip console.* calls in production ─────────────────────
  // The codebase uses `console.log`/`console.info`/`console.debug` for dev
  // diagnostics (especially in the canvas + socket + agent-x code paths,
  // which fire many times per second). In production these calls still cost
  // a function-call + serialization per invocation and pollute the devtools
  // console. `removeConsole` strips them at compile time. `console.error`
  // and `console.warn` are preserved so real failures still surface.
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
};

export default nextConfig;
