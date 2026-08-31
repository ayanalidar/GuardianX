// src/app/architecture/layout.tsx
//
// Server-component metadata wrapper for the /architecture route.

import type { Metadata } from "next";

const SLUG = "architecture";
const URL = `https://www.guardianx.cloud/${SLUG}`;

export const metadata: Metadata = {
  title: "Architecture",
  description:
    "GuardianX architecture: a sandboxed RedAgent VAPT engine, AI patch pipeline with human-in-the-loop approval, attestations layer, SIEM/soar integrations, and a zero-trust client portal — all built on Next.js and Supabase.",
  alternates: { canonical: URL },
  openGraph: {
    type: "website",
    url: URL,
    title: "Architecture | GuardianX",
    description:
      "Sandboxed VAPT engine, AI patch pipeline, attestations layer, SIEM integrations, and zero-trust client portal.",
    siteName: "GuardianX",
  },
  twitter: {
    card: "summary_large_image",
    title: "Architecture | GuardianX",
    description:
      "Sandboxed VAPT engine, AI patch pipeline, attestations layer, and zero-trust client portal.",
  },
};

export default function ArchitectureLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
