// src/app/docs/layout.tsx
//
// Server-component metadata wrapper for the /docs route (public knowledge base).

import type { Metadata } from "next";

const SLUG = "docs";
const URL = `https://www.guardianx.cloud/${SLUG}`;

export const metadata: Metadata = {
  title: "Docs & Knowledge Base",
  description:
    "GuardianX knowledge base: getting started guides, VAPT methodology, patch approval workflows, API integration recipes, compliance frameworks, and security best practices — self-serve reference for users and prospects.",
  alternates: { canonical: URL },
  openGraph: {
    type: "website",
    url: URL,
    title: "Docs & Knowledge Base | GuardianX",
    description:
      "Getting started, VAPT methodology, patch workflows, API recipes, compliance, and security best practices.",
    siteName: "GuardianX",
  },
  twitter: {
    card: "summary_large_image",
    title: "Docs & Knowledge Base | GuardianX",
    description:
      "Getting started, VAPT methodology, patch workflows, API recipes, and compliance guides.",
  },
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
