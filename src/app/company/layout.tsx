// src/app/company/layout.tsx
//
// Server-component metadata wrapper for the /company route (company / about page).

import type { Metadata } from "next";

const SLUG = "company";
const URL = `https://www.guardianx.cloud/${SLUG}`;

export const metadata: Metadata = {
  title: "Company",
  description:
    "About GuardianX — the mission, the team, and why we are building autonomous security operations. Built by security engineers who got tired of manual VAPT report writing and patch verification.",
  alternates: { canonical: URL },
  openGraph: {
    type: "website",
    url: URL,
    title: "Company | GuardianX",
    description:
      "The mission, team, and story behind GuardianX — autonomous security operations built by security engineers.",
    siteName: "GuardianX",
  },
  twitter: {
    card: "summary_large_image",
    title: "Company | GuardianX",
    description:
      "The mission, team, and story behind GuardianX — autonomous security operations.",
  },
};

export default function CompanyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
