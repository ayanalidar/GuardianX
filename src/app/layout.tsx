import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GuardianX — Autonomous Security Operations Platform",
  description:
    "GuardianX autonomously scans code, generates + sandbox-tests patches, attacks live targets with the RedAgent VAPT engine, and documents exposed secrets. AI-driven SAST, DAST, and human-in-the-loop patch approval in one platform.",
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
  ],
  authors: [{ name: "GuardianX" }],
  manifest: "/manifest.json",
  icons: {
    icon: "/guardianx-logo.png",
    apple: "/guardianx-logo.png",
  },
  appleWebApp: {
    capable: true,
    title: "GuardianX",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "GuardianX — Autonomous Security Operations Platform",
    description:
      "AI-driven SAST, DAST, exploit generation, adversarial patching, and VAPT reporting.",
    siteName: "GuardianX",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GuardianX",
    description: "Autonomous security operations platform.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
