import type { Metadata } from "next";
import { redirect } from "next/navigation";

// /why-guardianx → /company (renamed)
// Keep this redirect for backward compatibility with existing links/bookmarks.
//
// Metadata is declared (even though the route redirects) so that any crawler
// or link-preview bot that resolves the URL before following the redirect
// gets a meaningful title + canonical — preventing the page from appearing
// as a "no title" entry in search console.
const URL = "https://www.guardianx.cloud/why-guardianx";
const CANONICAL = "https://www.guardianx.cloud/company";

export const metadata: Metadata = {
  title: "Why GuardianX",
  description:
    "Why teams choose GuardianX: autonomous VAPT, sandbox-tested AI patches, human-in-the-loop approval, and a single pane of glass for security posture. (This page has moved to /company.)",
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    url: URL,
    title: "Why GuardianX",
    description:
      "Autonomous VAPT, sandbox-tested AI patches, human-in-the-loop approval, and unified security posture.",
    siteName: "GuardianX",
  },
  twitter: {
    card: "summary_large_image",
    title: "Why GuardianX",
    description:
      "Autonomous VAPT, sandbox-tested AI patches, and unified security posture.",
  },
};

export default function WhyGuardianXRedirect() {
  redirect("/company");
}
