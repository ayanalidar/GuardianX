"use client";
import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ShieldHalf, Zap, Clock, IndianRupee, Bot, FlaskConical, Rocket,
  Bug, Crosshair, ShieldCheck, FileText, AlertTriangle,
  Building2, Lock, Globe, ArrowRight, Cpu, Eye, Heart, Target,
  Brain, Activity, HeartPulse, Radar, Network, ShieldAlert, GitBranch, RotateCcw,
} from "lucide-react";

export default function CompanyPage() {
  return (
    <>
      <SiteHeader />
      <div className="scanlines cyber-vignette relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-30" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-40 left-1/4 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-violet-600/8 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto pt-16 max-w-5xl px-4 py-20 sm:px-6">
        {/* Hero */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-20 text-center">
          <Badge className="mb-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <Building2 className="size-3" /> Company
          </Badge>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-6xl">
            Your code's <span className="neon-emerald">autonomous</span><br />
            <span className="neon-red">immune</span> <span className="neon-violet">system</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            GuardianX detects threats like antibodies, attacks them like white blood cells, and heals vulnerabilities like skin regrows. One autonomous platform. Three closed-loop engines. Zero human delay.
          </p>
        </motion.div>

        {/* Mission */}
        <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-20">
          <div className="mb-8 text-center">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">{"// Our Mission"}</div>
            <h2 className="text-3xl font-bold text-zinc-50">Make world-class security accessible to every organization</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400">
              India has 1.6M+ registered companies but fewer than 500 certified penetration testers. GuardianX bridges that gap with AI, delivering the expertise of a 5-person security team in one autonomous platform, at 1/10th the cost.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: Target, title: "Autonomy First", desc: "Security shouldn't require a PhD in pentesting. GuardianX thinks, attacks, patches, and reports, autonomously.", color: "emerald" },
              { icon: Heart, title: "Built for India", desc: "DPDPA-compliant by design. Pricing in rupees. Built for the regulatory reality of Indian businesses, and scalable globally.", color: "rose" },
              { icon: Cpu, title: "AI-Native", desc: "Not a legacy tool with AI bolted on. GuardianX was built from day one around LLMs for vulnerability analysis, patch generation, and exploit synthesis.", color: "cyan" },
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="holo-card-sharp hud-corners p-5">
                <div className={`mx-auto mb-3 flex size-10 items-center justify-center rounded-lg border border-${item.color}-500/30 bg-${item.color}-500/10`}>
                  <item.icon className={`size-5 text-${item.color}-400`} />
                </div>
                <h3 className={`text-center text-sm font-bold text-${item.color}-400`}>{item.title}</h3>
                <p className="mt-2 text-center text-xs text-zinc-400">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* The Core Framework, THINKS / ATTACKS / HEALS */}
        <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-20">
          <div className="mb-8 text-center">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">{"// The Core Framework"}</div>
            <h2 className="text-3xl font-bold text-zinc-50">Think. Attack. Heal.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-400">
              GuardianX is built on a closed-loop autonomous security framework. Three engines work in continuous cycles so your defenses adapt as fast as adversaries evolve.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* 01 / THINKS */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.05 }}
              className="holo-card-sharp hud-corners relative overflow-hidden p-6"
            >
              <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-emerald-500/8 blur-3xl" />
              <div className="relative">
                <div className="mb-4 flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold tracking-widest text-emerald-400">01 / THINKS</span>
                  <div className="flex size-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                    <Brain className="size-5 text-emerald-400" />
                  </div>
                </div>
                <div className="mb-2 text-xs font-mono uppercase tracking-widest text-emerald-500/60">Adaptive Intelligence</div>
                <h3 className="text-lg font-bold text-zinc-50">Contextual AI that understands your exposure</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  Traditional tools trigger on isolated events. GuardianX maps your entire attack surface, predicting high-probability compromise paths before adversaries exploit them.
                </p>
                <div className="mt-4 space-y-2">
                  {[
                    { icon: Radar, text: "Real-time risk prioritization (zero noise, zero fatigue)" },
                    { icon: Network, text: "Dynamic behavior modeling across identity, network, and workloads" },
                    { icon: GitBranch, text: "Predictive attack-path graph analysis" },
                  ].map((cap, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                      <cap.icon className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
                      <span>{cap.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* 02 / ATTACKS */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.12 }}
              className="holo-card-sharp hud-corners relative overflow-hidden p-6"
            >
              <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-red-500/8 blur-3xl" />
              <div className="relative">
                <div className="mb-4 flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold tracking-widest text-red-400">02 / ATTACKS</span>
                  <div className="flex size-9 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10">
                    <Activity className="size-5 text-red-400" />
                  </div>
                </div>
                <div className="mb-2 text-xs font-mono uppercase tracking-widest text-red-500/60">Autonomous Adversary Emulation</div>
                <h3 className="text-lg font-bold text-zinc-50">Continuous validation. Zero assumptions.</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  You cannot defend what you have not stress-tested. GuardianX continuously simulates MITRE ATT&amp;CK TTPs to uncover misconfigurations, privilege leaks, and blind spots in real time.
                </p>
                <div className="mt-4 space-y-2">
                  {[
                    { icon: Crosshair, text: "Automated breach and attack simulation (BAS)" },
                    { icon: ShieldAlert, text: "Shadow asset discovery and identity risk profiling" },
                    { icon: ShieldCheck, text: "Real-world control validation (EDR, Firewall, IAM)" },
                  ].map((cap, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                      <cap.icon className="mt-0.5 size-3.5 shrink-0 text-red-400" />
                      <span>{cap.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* 03 / HEALS */}
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.19 }}
              className="holo-card-sharp hud-corners relative overflow-hidden p-6"
            >
              <div aria-hidden className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-violet-500/8 blur-3xl" />
              <div className="relative">
                <div className="mb-4 flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold tracking-widest text-violet-400">03 / HEALS</span>
                  <div className="flex size-9 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10">
                    <HeartPulse className="size-5 text-violet-400" />
                  </div>
                </div>
                <div className="mb-2 text-xs font-mono uppercase tracking-widest text-violet-500/60">Automated Remediation and Resilience</div>
                <h3 className="text-lg font-bold text-zinc-50">Closed-loop response at machine speed</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  Containment in milliseconds, not hours. When a flaw or active breach is detected, GuardianX automatically isolates, reconfigures, and restores systems to a hardened baseline.
                </p>
                <div className="mt-4 space-y-2">
                  {[
                    { icon: ShieldCheck, text: "Automated policy reconfiguration and exposure patching" },
                    { icon: Lock, text: "Blast-radius isolation without operational downtime" },
                    { icon: RotateCcw, text: "Instant rollback to known-secure state" },
                  ].map((cap, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                      <cap.icon className="mt-0.5 size-3.5 shrink-0 text-violet-400" />
                      <span>{cap.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Loop indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="mt-6 flex items-center justify-center gap-2 text-center text-[11px] text-zinc-500"
          >
            <span className="font-mono text-emerald-400">THINKS</span>
            <ArrowRight className="size-3 text-zinc-600" />
            <span className="font-mono text-red-400">ATTACKS</span>
            <ArrowRight className="size-3 text-zinc-600" />
            <span className="font-mono text-violet-400">HEALS</span>
            <ArrowRight className="size-3 text-zinc-600" />
            <span className="font-mono text-emerald-400">THINKS</span>
            <span className="ml-1 italic">(continuous loop)</span>
          </motion.div>
        </motion.section>

        {/* The Problem */}
        <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-20">
          <div className="mb-8 text-center">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-red-500/60">{"// The Problem"}</div>
            <h2 className="text-3xl font-bold text-zinc-50">A crisis hiding in plain sight</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Building2, stat: "1.6M+", label: "Registered companies in India", desc: "But fewer than 500 certified penetration testers to secure them", color: "red" },
              { icon: AlertTriangle, stat: "₹250 Cr", label: "DPDPA 2023 non-compliance fines", desc: "Mandates security assessments, failure is catastrophic", color: "amber" },
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

        {/* Advantages */}
        <motion.section initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-20">
          <div className="mb-8 text-center">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-violet-500/60">{"// Why We're Different"}</div>
            <h2 className="text-3xl font-bold text-zinc-50">5 advantages no other platform offers</h2>
          </div>
          <div className="space-y-4">
            {[
              { icon: Clock, title: "10× Faster", stat: "90 seconds", compare: "vs 2-4 weeks for manual VAPT", desc: "Full vulnerability assessment in under 2 minutes. AI analyzes code, attacks live targets, generates patches, and produces a 15-page report, all before your coffee gets cold.", color: "cyan" },
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

        {/* Contact strip */}
        <motion.section initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="mb-20">
          <div className="holo-card-sharp hud-corners p-6">
            <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-cyan-500/60">{"// Get In Touch"}</div>
            <div className="grid gap-4 sm:grid-cols-3">
              <a href="https://www.guardianx.cloud" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg border border-zinc-700 p-4 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5">
                <Globe className="size-5 text-emerald-400" />
                <div>
                  <div className="text-xs font-medium text-zinc-300">Website</div>
                  <div className="text-[11px] text-zinc-500">www.guardianx.cloud</div>
                </div>
              </a>
              <a href="mailto:hello@guardianx.in" className="flex items-center gap-3 rounded-lg border border-zinc-700 p-4 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5">
                <FileText className="size-5 text-cyan-400" />
                <div>
                  <div className="text-xs font-medium text-zinc-300">Email</div>
                  <div className="text-[11px] text-zinc-500">hello@guardianx.in</div>
                </div>
              </a>
              <a href="tel:+917006712347" className="flex items-center gap-3 rounded-lg border border-zinc-700 p-4 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5">
                <Building2 className="size-5 text-violet-400" />
                <div>
                  <div className="text-xs font-medium text-zinc-300">Phone</div>
                  <div className="text-[11px] text-zinc-500">+91 70067 12347</div>
                </div>
              </a>
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
                See the platform in action or request a personalized demo for your organization.
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <a href="/">
                  <Button size="lg" className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border">
                    <Rocket className="size-5" /> Enter the Lab <ArrowRight className="size-4" />
                  </Button>
                </a>
                <a href="/contact">
                  <Button size="lg" variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20">
                    <Zap className="size-5" /> Request Demo
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
      <SiteFooter />
    </>
  );
}
