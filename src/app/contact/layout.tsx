// src/app/contact/layout.tsx
//
// Server-component metadata wrapper for the /contact route.

import type { Metadata } from "next";

const SLUG = "contact";
const URL = `https://www.guardianx.cloud/${SLUG}`;

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact the GuardianX team — request a demo, ask about enterprise VAPT engagements, report a security issue, or partner with us. We respond within one business day.",
  alternates: { canonical: URL },
  openGraph: {
    type: "website",
    url: URL,
    title: "Contact | GuardianX",
    description:
      "Request a demo, ask about enterprise VAPT, report a security issue, or partner with GuardianX.",
    siteName: "GuardianX",
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact | GuardianX",
    description:
      "Request a demo, ask about enterprise VAPT, report a security issue, or partner with us.",
  },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
