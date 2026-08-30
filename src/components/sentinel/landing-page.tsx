"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import { AnimatedDemo } from "./animated-demo";
import { HeroSection } from "./landing/hero-section";
import { VulnFeed } from "./landing/vuln-feed";
import { StatsStrip } from "./landing/stats-strip";
import { FeaturesSection } from "./landing/features-section";
import { HowItWorks } from "./landing/how-it-works";
import { LiveAttackMap } from "./landing/attack-map";
import { Testimonials } from "./landing/testimonials";
import { ComparisonTable } from "./landing/comparison-table";
import { FinalCTA } from "./landing/final-cta";
import { LatestBlogSection } from "./landing/latest-blog-section";

/**
 * Below-the-fold, code-heavy interactive sections are lazy-loaded with
 * `next/dynamic` + `ssr: false` so they don't ship in the initial JS
 * bundle. The homepage's first paint is dominated by Hero + VulnFeed +
 * StatsStrip; everything else can wait until the user scrolls.
 *
 * Components lazy-loaded here (estimated gzipped bundle weight saved on
 * initial load):
 *   - LiveDemo           (~757 lines, guided-tour modal with diff/code)
 *   - ScanWidget         (~656 lines, simulated scan + lead capture)
 *   - ArchitectureDiagram(~536 lines, interactive SVG with popovers)
 *   - ROICalculator      (~371 lines, animated number tweening)
 *   - CaseStudies        (~248 lines, count-up + score pairs)
 */
const LiveDemo = dynamic(
  () => import("./landing/live-demo").then((m) => m.LiveDemo),
  { ssr: false, loading: () => <SectionPlaceholder /> },
);
const ScanWidgetLazy = dynamic(
  () => import("./landing/scan-widget").then((m) => m.ScanWidget),
  { ssr: false, loading: () => <SectionPlaceholder /> },
);
const ArchitectureDiagram = dynamic(
  () => import("./landing/architecture-diagram").then((m) => m.ArchitectureDiagram),
  { ssr: false, loading: () => <SectionPlaceholder /> },
);
const ROICalculator = dynamic(
  () => import("./landing/roi-calculator").then((m) => m.ROICalculator),
  { ssr: false, loading: () => <SectionPlaceholder /> },
);
const CaseStudies = dynamic(
  () => import("./landing/case-studies").then((m) => m.CaseStudies),
  { ssr: false, loading: () => <SectionPlaceholder /> },
);

/** Tiny placeholder shown while a lazy section's chunk is loading. */
function SectionPlaceholder() {
  return (
    <section
      className="mx-auto max-w-6xl px-4 py-16 sm:px-6"
      aria-hidden
      style={{ minHeight: 280 }}
    />
  );
}

interface LandingPageProps {
  onEnter: () => void;
  onTryDemo: () => void;
}

const TECH_STACK = [
  "Next.js 16", "TypeScript", "Supabase", "Railway Engine", "Socket.IO",
  "ReportLab", "Bun Runtime", "Python 3", "Playwright", "AES-256-GCM",
  "SHA-256 Ledger", "OWASP Top 10", "CVSS v3.1", "DPDPA 2023",
];

const COMPLIANCE = ["OWASP Top 10", "PCI-DSS", "ISO 27001", "SOC 2", "NIST", "DPDPA", "GDPR", "HIPAA"];

/**
 * LandingPage — cinematic, animation-rich GuardianX homepage.
 *
 * Composed of:
 *   1. HeroSection       — particle bg, glow orb, threat counter, terminal typing, glow CTA
 *   1b. VulnFeed        — horizontal scrolling live findings ticker (DB-backed, mock fallback)
 *   2. StatsStrip        — animated count-up KPIs (useInView)
 *   2b. ScanWidget       — "Scan Your Website Free" simulated-scan + email lead capture
 *   3. AnimatedDemo      — existing live command-center 4-card grid
 *   4. HowItWorks        — 5-step pipeline with flowing data packets
 *   5. FeaturesSection   — 3D-tilt feature cards with cursor-follow glow + scan animation
 *   5b. LiveDemo         — "Try Live Demo" modal — guided 5-step tour (hardcoded)
 *   6. LiveAttackMap     — stylized world map with animated attack blips
 *   7. ComparisonTable   — GuardianX vs Burp / Snyk / Tenable
 *   8. CaseStudies       — 3 anonymized customer outcome cards (count-up metrics)
 *   9. ArchitectureDiagram — interactive SVG topology with flowing data packets
 *  10. Testimonials      — trusted-by row + rotating quote carousel
 *  11. TechStack + Compliance strip
 *  12. ROICalculator     — interactive breach-cost / ROI estimator
 *  13. FinalCTA          — full-width gradient banner + users-online counter
 *
 * Dark theme: zinc-950 base, emerald/cyan/violet/red accents.
 * Existing `SiteHeader` and `SiteFooter` preserved. `onEnter` prop preserved.
 */
export function LandingPage({ onEnter, onTryDemo }: LandingPageProps) {
  return (
    <div className="scanlines cyber-vignette relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient color glows, multi-color */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-40 left-1/4 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/12 blur-3xl" />
        <div className="absolute top-1/3 right-0 h-80 w-80 rounded-full bg-cyan-600/10 blur-3xl" />
        <div className="absolute bottom-1/4 left-0 h-80 w-80 rounded-full bg-violet-600/8 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-72 w-72 rounded-full bg-red-600/8 blur-3xl" />
      </div>

      <div className="relative z-10">
        <SiteHeader onEnter={onEnter} />

        <main>
          {/* 1. Hero */}
          <HeroSection onEnter={onEnter} onTryDemo={onTryDemo} />

          {/* 1b. Live vulnerability feed ticker (DB-backed, mock fallback) */}
          <VulnFeed />

          {/* 2. Stats strip */}
          <StatsStrip />

          {/* 2b. Scan Your Website Free — simulated scan + email lead capture */}
          <ScanWidgetLazy onEnter={onEnter} />

          {/* 3. Live command-center demo (existing) */}
          <AnimatedDemo />

          {/* 4. How it works */}
          <div className="gx-cv-auto">
            <HowItWorks />
          </div>

          {/* 5. Features */}
          <div className="gx-cv-auto">
            <FeaturesSection />
          </div>

          {/* 5b. Interactive live demo — guided 5-step tour (no signup) */}
          <LiveDemo onEnter={onEnter} />

          {/* 6. Live attack map */}
          <LiveAttackMap />

          {/* 7. Comparison */}
          <div className="gx-cv-auto">
            <ComparisonTable />
          </div>

          {/* 8. Case studies — real outcome cards */}
          <CaseStudies />

          {/* 9. Architecture diagram — interactive topology */}
          <ArchitectureDiagram />

          {/* 10. Testimonials + trusted-by */}
          <Testimonials />

          {/* 11. Tech stack + compliance */}
          <section
            className="mx-auto max-w-6xl px-4 py-12 sm:px-6 gx-cv-auto"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.5 }}
              className="grid gap-4 md:grid-cols-2"
            >
              <div className="holo-card-sharp hud-corners p-6 text-center">
                <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
                  {"// Built On"}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {TECH_STACK.map((tech) => (
                    <span
                      key={tech}
                      className="rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3 py-1 font-mono text-xs text-emerald-300/80 neon-border"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              </div>
              <div className="holo-card-sharp hud-corners p-6 text-center">
                <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-cyan-500/60">
                  {"// Compliance Frameworks"}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {COMPLIANCE.map((c) => (
                    <span
                      key={c}
                      className="rounded-full border border-cyan-500/30 bg-cyan-500/5 px-3 py-1 font-mono text-xs text-cyan-300/80"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          </section>

          {/* 12. ROI calculator — interactive breach-cost estimator */}
          <ROICalculator />

          {/* 13. Latest from the blog — 3 most recent posts */}
          <div className="gx-cv-auto">
            <LatestBlogSection />
          </div>

          {/* 14. Final CTA */}
          <FinalCTA onEnter={onEnter} />
        </main>

        <SiteFooter />
      </div>
    </div>
  );
}
