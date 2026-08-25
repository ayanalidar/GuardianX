"use client";

import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";
import { ModulesOverview } from "@/components/sentinel/modules-overview";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldHalf, Cpu, Terminal, ArrowRight, Rocket,
} from "lucide-react";
import { FEATURES, type Feature } from "@/components/sentinel/landing/features-data";
import { useRouter } from "next/navigation";

/**
 * FeaturesPage
 * ===========
 * Public catalog of every GuardianX module. The list is driven entirely
 * from the canonical FEATURES array in
 * `src/components/sentinel/landing/features-data.ts` (currently 50+
 * entries across ~35 categories) so this page can never drift out of
 * sync with the rest of the marketing site again.
 *
 * The page keeps its original hero + animated background + final CTA,
 * but the old hardcoded FEATURE_CATEGORIES grid is replaced by the new
 * searchable/filterable <ModulesOverview /> component.
 */
export default function FeaturesPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef });
  const heroY = useTransform(scrollYProgress, [0, 0.3], [0, -100]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.2], [1, 0]);
  const router = useRouter();

  // Map a feature → /features#deep-link is not useful since this IS the
  // features page; route into the dashboard tab most relevant instead.
  // (The Command Center sidebar in src/app/page.tsx owns the tab IDs.)
  const handleSelect = (feature: Feature) => {
    // Best-effort tab inference from category — fall back to / (dashboard).
    const CATEGORY_TO_TAB: Record<string, string> = {
      SAST: "codebases",
      DAST: "redagent",
      Exploit: "redagent",
      "Self-Attack": "redagent",
      Secrets: "codebases",
      Reporting: "advanced",
      Credentials: "codebases",
      Metrics: "dashboard",
      "Live Feed": "soc",
      Copilot: "patches",
      Runtime: "soc",
      Trust: "advanced",
      GRC: "compliance",
      Privacy: "compliance",
      SOC: "soc",
      Discovery: "soc",
      Defense: "exfil",
      Audit: "scraper",
      DevSecOps: "advanced",
      Correlation: "advanced",
      Testing: "advanced",
      Visibility: "dashboard",
      Platform: "settings",
      AI: "dashboard",
      Operations: "dashboard",
      "Self-Improving": "rnd",
      "Voice AI": "dashboard",
      "Gesture AI": "dashboard",
      Visualization: "dashboard",
      Memory: "dashboard",
      DFIR: "dfir",
      Automation: "advanced",
      Forecasting: "rnd",
      Quantum: "rnd",
      Community: "contributors",
      Content: "content",
      Administration: "users",
      Billing: "billing",
      Security: "settings",
    };
    const tab = CATEGORY_TO_TAB[feature.category] ?? "dashboard";
    router.push(`/?tab=${tab}`);
  };

  return (
    <>
      <SiteHeader />
      <div ref={containerRef} className="scanlines cyber-vignette relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-20" />
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <motion.div animate={{ x: [0, 200, 0], y: [0, -100, 0], scale: [1, 1.3, 1] }} transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }} className="absolute top-0 left-0 h-[500px] w-[500px] rounded-full bg-emerald-500/8 blur-[150px]" />
          <motion.div animate={{ x: [0, -150, 0], y: [0, 100, 0], scale: [1, 1.5, 1] }} transition={{ duration: 35, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-violet-500/8 blur-[150px]" />
          <motion.div animate={{ x: [0, 100, 0], y: [0, -80, 0], scale: [1, 1.2, 1] }} transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }} className="absolute top-1/2 left-1/2 h-[400px] w-[400px] rounded-full bg-red-500/5 blur-[150px]" />
        </div>

        {/* ── Hero ─────────────────────────────────────────────────── */}
        <motion.div style={{ y: heroY, opacity: heroOpacity }} className="relative z-10 flex min-h-[80vh] flex-col items-center justify-center px-4 pt-20">
          <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ duration: 1, type: "spring" }} className="mb-8">
            <div className="relative">
              <div className="absolute inset-0 animate-ping rounded-2xl bg-emerald-500/20" />
              <div className="relative flex size-20 items-center justify-center rounded-2xl border border-emerald-500/50 bg-emerald-500/10" style={{ boxShadow: "0 0 40px rgba(16,185,129,0.3)" }}>
                <ShieldHalf className="size-10 text-emerald-400" />
              </div>
            </div>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Badge className="mb-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-300"><Cpu className="size-3" /> {FEATURES.length}+ Modules · 5 Categories</Badge>
          </motion.div>
          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.8 }} className="text-center text-5xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-7xl">
            Everything you need<br />to <span className="gradient-text">secure your code</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mt-6 max-w-2xl text-center text-lg text-zinc-400">
            From AI-powered vulnerability detection to autonomous penetration testing, from self-healing patches to compliance-ready reports. Search all {FEATURES.length} modules below.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }} className="mt-10 flex gap-4">
            <a href="/"><Button size="lg" className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border"><Terminal className="size-5" /> Enter Lab Console</Button></a>
            <a href="/pricing"><Button size="lg" variant="outline" className="border-zinc-700 bg-zinc-900 text-zinc-300">View Pricing</Button></a>
          </motion.div>
        </motion.div>

        {/* ── Module catalog (driven by FEATURES) ──────────────────── */}
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <ModulesOverview onSelect={handleSelect} />

          {/* ── Final CTA ─────────────────────────────────────────── */}
          <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="mt-24 text-center">
            <div className="holo-card-sharp hud-corners relative overflow-hidden p-12">
              <div aria-hidden className="cyber-grid pointer-events-none absolute inset-0 opacity-20" />
              <div className="relative">
                <ShieldHalf className="mx-auto size-12 text-emerald-400 neon-emerald" />
                <h2 className="mt-4 text-3xl font-bold text-zinc-50">Ready to secure everything?</h2>
                <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-400">{FEATURES.length}+ modules. One platform. One click. Full VAPT.</p>
                <a href="/"><Button size="lg" className="mt-6 bg-emerald-600 text-white hover:bg-emerald-500 neon-border"><Rocket className="size-5" /> Enter the Lab Console <ArrowRight className="size-4" /></Button></a>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
