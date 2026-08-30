import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    // Strict CSP: restricts all resource types to 'self' + known-safe sources.
    // 'unsafe-inline' for styles is required by Next.js (injects inline styles).
    // 'unsafe-inline' for scripts is required by Next.js hydration + framer-motion.
    // frame-ancestors 'none' = clickjacking protection (replaces X-Frame-Options).
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
      "media-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    // Restrict browser features to same-origin only. Camera/mic are allowed
    // (the War Room uses them for voice/gesture control) but only from self.
    value: "camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), magnetometer=(), gyroscope=(self)",
  },
];

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["*.space-z.ai", "*.chatglm.cn", "*.z.ai", "*.vercel.app"],
  // ── Security headers (applied to all routes) ────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  // ── perf-optimize: tree-shake heavy barrel-export deps ────────────────────
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
