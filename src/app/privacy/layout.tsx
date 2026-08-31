// src/app/privacy/layout.tsx
//
// Server-component metadata wrapper for the /privacy route.

import type { Metadata } from "next";

const SLUG = "privacy";
const URL = `https://www.guardianx.cloud/${SLUG}`;

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "GuardianX privacy policy — how we collect, process, and protect personal data. Built to comply with GDPR, CCPA, and India's DPDPA. No selling of personal data, ever.",
  alternates: { canonical: URL },
  openGraph: {
    type: "article",
    url: URL,
    title: "Privacy Policy | GuardianX",
    description:
      "How GuardianX collects, processes, and protects personal data — GDPR, CCPA, and DPDPA compliant.",
    siteName: "GuardianX",
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy | GuardianX",
    description:
      "How GuardianX collects, processes, and protects personal data — GDPR, CCPA, and DPDPA compliant.",
  },
};

export default function PrivacyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
