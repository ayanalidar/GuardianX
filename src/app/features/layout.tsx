// src/app/features/layout.tsx
//
// Server-component metadata wrapper for the /features route.
// (The page itself is a client component, so we export metadata here.)

import type { Metadata } from "next";

const SLUG = "features";
const URL = `https://www.guardianx.cloud/${SLUG}`;

export const metadata: Metadata = {
  title: "Features",
  description:
    "Explore GuardianX features: AI-driven SAST/DAST, the RedAgent autonomous VAPT engine, sandbox-tested patch generation, human-in-the-loop approval, exposed-secret detection, and a real-time security posture dashboard.",
  alternates: { canonical: URL },
  openGraph: {
    type: "website",
    url: URL,
    title: "Features | GuardianX",
    description:
      "AI-driven SAST/DAST, autonomous VAPT, sandbox-tested patches, secret detection, and posture scoring in one platform.",
    siteName: "GuardianX",
  },
  twitter: {
    card: "summary_large_image",
    title: "Features | GuardianX",
    description:
      "AI-driven SAST/DAST, autonomous VAPT, sandbox-tested patches, secret detection, and posture scoring.",
  },
};

export default function FeaturesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
