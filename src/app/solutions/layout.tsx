// src/app/solutions/layout.tsx
//
// Server-component metadata wrapper for the /solutions route.

import type { Metadata } from "next";

const SLUG = "solutions";
const URL = `https://www.guardianx.cloud/${SLUG}`;

export const metadata: Metadata = {
  title: "Solutions",
  description:
    "GuardianX solutions for every team: continuous VAPT for AppSec, autonomous patching for DevSecOps, compliance evidence for GRC, and managed security workflows for MSSPs and red teams.",
  alternates: { canonical: URL },
  openGraph: {
    type: "website",
    url: URL,
    title: "Solutions | GuardianX",
    description:
      "Tailored security workflows for AppSec, DevSecOps, GRC, MSSPs, and red teams.",
    siteName: "GuardianX",
  },
  twitter: {
    card: "summary_large_image",
    title: "Solutions | GuardianX",
    description:
      "Tailored security workflows for AppSec, DevSecOps, GRC, MSSPs, and red teams.",
  },
};

export default function SolutionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
