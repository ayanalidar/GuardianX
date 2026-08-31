// src/app/api-doc/layout.tsx
//
// Server-component metadata wrapper for the /api-doc route (interactive Swagger UI).

import type { Metadata } from "next";

const SLUG = "api-doc";
const URL = `https://www.guardianx.cloud/${SLUG}`;

export const metadata: Metadata = {
  title: "API Documentation",
  description:
    "Interactive OpenAPI 3.0.3 documentation for the GuardianX REST API. Explore endpoints for scans, patches, codebases, findings, attestations, SIEM ingestion, and more — no signup required.",
  alternates: { canonical: URL },
  openGraph: {
    type: "website",
    url: URL,
    title: "API Documentation | GuardianX",
    description:
      "Interactive OpenAPI 3.0.3 docs for the GuardianX REST API — explore endpoints without signing up.",
    siteName: "GuardianX",
  },
  twitter: {
    card: "summary_large_image",
    title: "API Documentation | GuardianX",
    description:
      "Interactive OpenAPI 3.0.3 docs for the GuardianX REST API — explore endpoints without signing up.",
  },
};

export default function ApiDocLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
