// src/app/sitemap.ts
//
// Next.js 16 App Router — generates /sitemap.xml automatically.
// All public, crawlable routes are listed here so search engines can
// discover the marketing site, docs, blog, and legal pages.
//
// `lastModified` is bumped to `new Date()` so the sitemap always reflects
// the latest deploy. `changeFrequency: "weekly"` matches our release cadence.

import type { MetadataRoute } from "next";

const BASE_URL = "https://www.guardianx.cloud";

type RouteEntry = {
  path: string;
  priority: number;
};

const PUBLIC_ROUTES: RouteEntry[] = [
  { path: "/", priority: 1.0 },
  { path: "/features", priority: 0.8 },
  { path: "/solutions", priority: 0.8 },
  { path: "/architecture", priority: 0.8 },
  { path: "/why-guardianx", priority: 0.8 },
  { path: "/resources", priority: 0.8 },
  { path: "/docs", priority: 0.8 },
  { path: "/api-doc", priority: 0.8 },
  { path: "/status", priority: 0.8 },
  { path: "/company", priority: 0.8 },
  { path: "/contact", priority: 0.8 },
  { path: "/blog", priority: 0.8 },
  { path: "/privacy", priority: 0.8 },
  { path: "/terms", priority: 0.8 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_ROUTES.map((route) => ({
    url: `${BASE_URL}${route.path}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: route.priority,
  }));
}
