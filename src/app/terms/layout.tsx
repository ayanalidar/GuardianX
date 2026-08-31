// src/app/terms/layout.tsx
//
// Server-component metadata wrapper for the /terms route (Terms of Service + AUP).

import type { Metadata } from "next";

const SLUG = "terms";
const URL = `https://www.guardianx.cloud/${SLUG}`;

export const metadata: Metadata = {
  title: "Terms of Service & Acceptable Use",
  description:
    "GuardianX terms of service and acceptable use policy. Use GuardianX only against systems you own or are authorized to test. Outlines prohibited uses, IP rights, liability, and the bug bounty program.",
  alternates: { canonical: URL },
  openGraph: {
    type: "article",
    url: URL,
    title: "Terms of Service & Acceptable Use | GuardianX",
    description:
      "GuardianX terms of service, acceptable use policy, IP rights, liability, and bug bounty program.",
    siteName: "GuardianX",
  },
  twitter: {
    card: "summary_large_image",
    title: "Terms of Service & AUP | GuardianX",
    description:
      "GuardianX terms of service, acceptable use policy, and bug bounty program.",
  },
};

export default function TermsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
