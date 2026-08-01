"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldHalf, Zap, Clock, IndianRupee, Bot, FlaskConical, Rocket,
  Bug, Crosshair, ShieldCheck, FileText, AlertTriangle, TrendingUp,
  Building2, Lock, Globe, ArrowRight, CheckCircle2, Cpu, Eye,
} from "lucide-react";

export default function WhyGuardianXPage() {
  return (
    <div className="scanlines cyber-vignette relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-30" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-40 left-1/4 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-violet-600/8 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-20 sm:px-6">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-20 text-center">
          <Badge className="mb-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <Zap className="size-3" /> Why GuardianX
          </Badge>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-6xl">
            Security that <span className="neon-emerald">thinks</span>,<br />
            <span className="neon-red">attacks</span>, and <span className="neon-violet">heals itself</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            The first autonomous security platform that closes the loop from code to live target to patch to report — all AI-driven, all in one.
          </p>
        </motion.div>

        {/* The Problem */}
        <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-20">
          <div className="mb-8 text-center">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-red-500/60">{"// The Problem"}</div>
            <h2 className="text-3xl font-bold text-zinc-50">A crisis hiding in plain sight</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Building2, stat: "1.6M+", label: "Registered companies in India", desc: "But fewer than 500 certified penetration testers to secure them", color: "red" },
              { icon: AlertTriangle, stat: "₹250 Cr", label: "DPDPA 2023 non-compliance fines", desc: "Mandates security assessments — failure is catastrophic", color: "amber" },
              { icon: Lock, stat: "RBI + SEBI", label: "Annual VAPT mandatory", desc: "All banks, NBFCs, fintechs, and listed companies must comply", color: "emerald" },
              { icon: Clock, stat: "6 hours", label: "CERT-In breach reporting window", desc: "Without continuous monitoring, breaches go undetected for months", color: "cyan" },
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="holo-card-sharp hud-corners border border-zinc-700 p-5">
                <div className="flex items-start gap-3">
                  <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg border border-${item.color}-500/30 bg-${item.color}-500/10`}>
                    <item.icon className={`size-5 text-${item.color}-400`} />
                  </div>
                  <div>
                    <div className={`text-2xl font-bold text-${item.color}-400`}>{item.stat}</div>
                    <div className="text-sm font-medium text-zinc-200">{item.label}</div>
                    <p className="mt-1 text-xs text-zinc-500">{item.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* The Solution */}
        <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-20">
          <div className="mb-8 text-center">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">{"// The Solution"}</div>
            <h2 className="text-3xl font-bold text-zinc-50">GuardianX replaces an entire security team</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">One autonomous platform does what normally requires 5 specialists + 4 separate tools</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Bug, title: "SAST Scanner", replaces: "Static Analysis Engineer", color: "cyan" },
              { icon: Crosshair, title: "RedAgent DAST", replaces: "Penetration Tester", color: "red" },
              { icon: ShieldCheck, title: "AI Patch Engine", replaces: "Security Developer", color: "emerald" },
              { icon: FileText, title: "VAPT Reports", replaces: "Report Writer", color: "violet" },
              { icon: Lock, title: "Compliance Engine", replaces: "GRC Consultant", color: "amber" },
              { icon: Eye, title: "24/7 Monitoring", replaces: "SOC Analyst", color: "sky" },
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="holo-card-sharp hud-corners p-4 text-center">
                <div className={`mx-auto mb-2 flex size-10 items-center justify-center rounded-lg border border-${item.color}-500/30 bg-${item.color}-500/10`}>
                  <item.icon className={`size-5 text-${item.color}-400`} />
                </div>
                <div className="text-sm font-bold text-zinc-100">{item.title}</div>
                <div className="mt-1 text-[10px] text-zinc-500">Replaces: {item.replaces}</div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Advantages with visual demo */}
        <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-20">
          <div className="mb-8 text-center">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-violet-500/60">{"// Why We're Different"}</div>
            <h2 className="text-3xl font-bold text-zinc-50">5 advantages no other platform offers</h2>
          </div>
          <div className="space-y-4">
            {[
              { icon: Clock, title: "10× Faster", stat: "90 seconds", compare: "vs 2-4 weeks for manual VAPT", desc: "Full vulnerability assessment in under 2 minutes. AI analyzes code, attacks live targets, generates patches, and produces a 15-page report — all before your coffee gets cold.", color: "cyan" },
              { icon: IndianRupee, title: "10× Cheaper", stat: "₹15K/mo", compare: "vs ₹5-15 lakh per assessment", desc: "AI does the work of 5 security engineers. No consultants, no retainers, no per-engagement fees. One subscription covers unlimited scans.", color: "emerald" },
              { icon: Bot, title: "24/7 Autonomous", stat: "Hourly", compare: "Threat hunter never sleeps", desc: "The AI Threat Hunter runs every hour, scanning for new vulnerabilities across all your clients. Zero human intervention needed.", color: "violet" },
              { icon: FlaskConical, title: "Self-Improving", stat: "R&D Lab", compare: "Studies GitHub for new techniques", desc: "The only security platform that gets smarter on its own. Our R&D Lab searches GitHub for open-source security tools, analyzes their code, and integrates optimizations into our own modules.", color: "amber" },
              { icon: Rocket, title: "One-Click VAPT", stat: "1 URL", compare: "Enter URL → get report", desc: "Just enter a website URL and click 'Full VAPT'. GuardianX automatically discovers assets, runs passive recon, launches SAST+DAST, scans for leaked secrets, generates fixes, and produces a professional PDF report.", color: "rose" },
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="holo-card-sharp hud-corners p-5">
                <div className="flex items-start gap-4">
                  <div className={`flex size-12 shrink-0 items-center justify-center rounded-lg border border-${item.color}-500/40 bg-${item.color}-500/10`}>
                    <item.icon className={`size-6 text-${item.color}-400`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className={`text-lg font-bold text-${item.color}-400`}>{item.title}</h3>
                      <span className={`font-mono text-2xl font-bold text-${item.color}-400`}>{item.stat}</span>
                    </div>
                    <p className="text-xs text-zinc-500">{item.compare}</p>
                    <p className="mt-2 text-sm text-zinc-300">{item.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Lab Demo Visual */}
        <motion.section initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="mb-20">
          <div className="mb-8 text-center">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">{"// The Lab"}</div>
            <h2 className="text-3xl font-bold text-zinc-50">A glimpse inside the Command Center</h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="holo-card-sharp hud-corners p-5">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-emerald-400/60">Live Exploit Terminal</div>
              <div className="rounded-lg border border-zinc-800 bg-black/80 p-3 font-mono text-[10px] leading-relaxed">
                <div className="text-emerald-400">$ redagent --target https://app.target.com</div>
                <div className="text-zinc-400">[*] Crawling endpoints...</div>
                <div className="text-emerald-300">[+] Found 42 endpoints</div>
                <div className="text-zinc-400">[*] Testing SQL injection on /api/login...</div>
                <div className="text-red-400">[!] VULNERABLE: SQL injection confirmed</div>
                <div className="text-amber-400">[*] Payload: ' OR 1=1-- bypassed auth</div>
                <div className="text-emerald-300">[+] Exploit confirmed — finding saved</div>
                <div className="text-zinc-400">[*] Generating patch...</div>
                <div className="text-emerald-400">[+] Patch generated: SP-2026-001</div>
                <div className="text-emerald-300">[✓] Sandbox PASSED — safe to deploy</div>
                <span className="animate-pulse text-emerald-400">█</span>
              </div>
            </div>
            <div className="holo-card-sharp hud-corners p-5">
              <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-cyan-400/60">7-Stage Pipeline</div>
              <div className="space-y-2">
                {[
                  { stage: "Onboard", status: "✓ Complete", color: "emerald" },
                  { stage: "Scan", status: "✓ 26 vulns found", color: "cyan" },
                  { stage: "Test", status: "✓ 6 exploits confirmed", color: "amber" },
                  { stage: "Patch", status: "⚡ 13 patches generated", color: "violet" },
                  { stage: "Verify", status: "○ Pending", color: "zinc" },
                  { stage: "Defend", status: "○ Pending", color: "zinc" },
                  { stage: "Comply", status: "○ Pending", color: "zinc" },
                ].map((s, i) => (
                  <div key={i} className={`flex items-center gap-2 rounded border border-${s.color}-500/20 bg-${s.color}-500/5 p-2`}>
                    <span className={`flex size-5 items-center justify-center rounded-full bg-${s.color}-500/20 text-[10px] font-bold text-${s.color}-400`}>{i + 1}</span>
                    <span className="text-xs font-medium text-zinc-200">{s.stage}</span>
                    <span className={`ml-auto text-[10px] text-${s.color}-400`}>{s.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.section>

        {/* CTA */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="text-center">
          <div className="holo-card-sharp hud-corners relative overflow-hidden p-10">
            <div aria-hidden className="cyber-grid pointer-events-none absolute inset-0 opacity-20" />
            <div className="relative">
              <ShieldHalf className="mx-auto size-12 text-emerald-400 neon-emerald" />
              <h2 className="mt-4 text-3xl font-bold text-zinc-50">Ready to secure your assets?</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-400">
                Launch the GuardianX console. One click. Full VAPT. Professional report.
              </p>
              <a href="/">
                <Button size="lg" className="mt-6 bg-emerald-600 text-white hover:bg-emerald-500 neon-border">
                  <Rocket className="size-5" /> Enter the Lab Console <ArrowRight className="size-4" />
                </Button>
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
