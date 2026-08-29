import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
