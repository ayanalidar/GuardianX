// src/app/status/layout.tsx
//
// Server-component metadata wrapper for the /status route (public uptime page).

import type { Metadata } from "next";

const SLUG = "status";
const URL = `https://www.guardianx.cloud/${SLUG}`;

export const metadata: Metadata = {
  title: "System Status",
  description:
    "Live GuardianX platform status — uptime, API health, region availability, and incident history. Subscribe for real-time updates on service degradation or outages.",
  alternates: { canonical: URL },
  openGraph: {
    type: "website",
    url: URL,
    title: "System Status | GuardianX",
    description:
      "Live uptime, API health, region availability, and incident history for the GuardianX platform.",
    siteName: "GuardianX",
  },
  twitter: {
    card: "summary_large_image",
    title: "System Status | GuardianX",
    description:
      "Live uptime, API health, region availability, and incident history.",
  },
};

export default function StatusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
