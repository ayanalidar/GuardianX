// src/app/blog/layout.tsx
//
// Server-component metadata wrapper for the /blog route (public blog index).

import type { Metadata } from "next";

const SLUG = "blog";
const URL = `https://www.guardianx.cloud/${SLUG}`;

export const metadata: Metadata = {
  title: "Blog",
  description:
    "The GuardianX blog — security research, VAPT deep dives, AI patching case studies, threat intelligence briefings, and engineering notes from the team building autonomous security operations.",
  alternates: { canonical: URL },
  openGraph: {
    type: "website",
    url: URL,
    title: "Blog | GuardianX",
    description:
      "Security research, VAPT deep dives, AI patching case studies, and engineering notes from the GuardianX team.",
    siteName: "GuardianX",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blog | GuardianX",
    description:
      "Security research, VAPT deep dives, AI patching case studies, and engineering notes.",
  },
};

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
