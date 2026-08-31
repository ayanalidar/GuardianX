// src/app/resources/layout.tsx
//
// Server-component metadata wrapper for the /resources route.

import type { Metadata } from "next";

const SLUG = "resources";
const URL = `https://www.guardianx.cloud/${SLUG}`;

export const metadata: Metadata = {
  title: "Resources",
  description:
    "GuardianX resources — whitepapers, case studies, security research, threat briefings, ROI calculators, and on-demand webinars. Everything you need to evaluate and operationalize autonomous VAPT.",
  alternates: { canonical: URL },
  openGraph: {
    type: "website",
    url: URL,
    title: "Resources | GuardianX",
    description:
      "Whitepapers, case studies, security research, threat briefings, and ROI calculators for autonomous VAPT.",
    siteName: "GuardianX",
  },
  twitter: {
    card: "summary_large_image",
    title: "Resources | GuardianX",
    description:
      "Whitepapers, case studies, security research, and ROI calculators for autonomous VAPT.",
  },
};

export default function ResourcesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
