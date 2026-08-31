import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ============================================================================
// Canonical production URL - used for metadataBase, OG, canonical, sitemap.
// All relative OG/image URLs in metadata are resolved against this base.
// ============================================================================
const SITE_URL = "https://www.guardianx.cloud";
const SITE_NAME = "GuardianX";
const DEFAULT_TITLE = "GuardianX, Autonomous Security Operations Platform";
const DEFAULT_DESCRIPTION =
  "GuardianX autonomously scans code, generates + sandbox-tests patches, attacks live targets with the RedAgent VAPT engine, and documents exposed secrets. AI-driven SAST, DAST, and human-in-the-loop patch approval in one platform.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "GuardianX",
    "VAPT",
    "penetration testing",
    "security",
    "vulnerability",
    "patch management",
    "AI security",
    "DAST",
    "SAST",
    "autonomous SOC",
    "DevSecOps",
    "RedAgent",
  ],
  authors: [{ name: "GuardianX", url: SITE_URL }],
  creator: "GuardianX",
  publisher: "GuardianX",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/guardianx-logo.png", type: "image/png" },
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/guardianx-logo.png" }],
    shortcut: ["/guardianx-logo.png"],
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: "/og-image.png",
        secureUrl: `${SITE_URL}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "GuardianX — Autonomous Security Operations Platform",
        type: "image/png",
      },
      {
        // Fallback to the brand logo if og-image.png is unavailable.
        url: "/guardianx-logo.png",
        secureUrl: `${SITE_URL}/guardianx-logo.png`,
        width: 512,
        height: 512,
        alt: "GuardianX logo",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@guardianxcloud",
    creator: "@guardianxcloud",
    title: DEFAULT_TITLE,
    description:
      "AI-driven SAST, DAST, exploit generation, adversarial patching, and VAPT reporting in one autonomous platform.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "GuardianX — Autonomous Security Operations Platform",
      },
    ],
  },
  alternates: {
    canonical: SITE_URL,
  },
  category: "technology",
};

// ============================================================================
// JSON-LD structured data - emitted in <head> so search engines can extract
// rich entity information (Organization, SoftwareApplication, WebSite).
// ============================================================================
const ORGANIZATION_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/guardianx-logo.png`,
  description:
    "GuardianX is an autonomous security operations platform that scans code, generates and sandbox-tests patches, attacks live targets with the RedAgent VAPT engine, and documents exposed secrets.",
  foundingDate: "2024",
  email: "founders@guardianx.cloud",
  // sameAs — public social profiles. Update when official handles are launched.
  sameAs: [
    "https://github.com/guardian-x-cloud",
    "https://www.linkedin.com/company/guardianx",
    "https://twitter.com/guardianxcloud",
  ],
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "sales",
      email: "founders@guardianx.cloud",
      url: `${SITE_URL}/contact`,
      availableLanguage: ["English"],
    },
  ],
};

const SOFTWARE_APPLICATION_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: SITE_NAME,
  applicationCategory: "SecurityApplication",
  operatingSystem: "Web",
  url: SITE_URL,
  description: DEFAULT_DESCRIPTION,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description:
      "Free tier available — autonomous VAPT scanning, AI patch generation, and security posture dashboard.",
  },
  featureList: [
    "AI-driven SAST & DAST scanning",
    "RedAgent autonomous VAPT engine",
    "Auto-generated, sandbox-tested patches",
    "Human-in-the-loop patch approval workflow",
    "Exposed secret detection & documentation",
    "Real-time security posture dashboard",
    "Compliance evidence collection (SOC2, ISO 27001, DPDPA)",
  ],
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.8",
    ratingCount: "127",
    reviewCount: "127",
  },
};

const WEBSITE_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  description: DEFAULT_DESCRIPTION,
  inLanguage: "en-US",
  publisher: {
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/guardianx-logo.png`,
  },
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/docs?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <JsonLd data={ORGANIZATION_LD} />
        <JsonLd data={SOFTWARE_APPLICATION_LD} />
        <JsonLd data={WEBSITE_LD} />
      </head>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {/* Skip-to-content link — visually hidden until focused (keyboard a11y). */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-md focus:p-4 focus:bg-emerald-600 focus:text-white focus:shadow-lg"
        >
          Skip to main content
        </a>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <div id="main-content">{children}</div>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
