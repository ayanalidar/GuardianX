// src/app/robots.ts
//
// Next.js 16 App Router — generates /robots.txt dynamically.
//
// Policy:
//   • Allow all crawlers on the public marketing routes.
//   • Disallow the entire /api/* namespace EXCEPT for two public,
//     crawl-safe endpoints used by integrators and uptime monitors:
//       - /api/health        (liveness probe, no sensitive data)
//       - /api/openapi.json  (public OpenAPI 3.0 spec for the REST API)
//   • Disallow /portal/* (authenticated client portal — not for indexing).
//   • Point crawlers at the sitemap.

import type { MetadataRoute } from "next";

const BASE_URL = "https://www.guardianx.cloud";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/features",
          "/solutions",
          "/architecture",
          "/why-guardianx",
          "/resources",
          "/docs",
          "/api-doc",
          "/status",
          "/company",
          "/contact",
          "/blog",
          "/privacy",
          "/terms",
          // Public, crawl-safe API endpoints
          "/api/health",
          "/api/openapi.json",
        ],
        disallow: [
          "/api/*",
          "/portal/*",
          // Authenticated / dynamic routes that should never be indexed
          "/reset-password",
          "/verify-email",
          "/verify",
          "/demo",
          "/_next/*",
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
