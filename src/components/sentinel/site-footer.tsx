"use client";

import { motion } from "framer-motion";
import {
  ShieldHalf, Mail, Phone, Globe, Lock, Terminal,
  ArrowRight, Shield, Cpu, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const TRUST_BADGES = ["DPDPA Ready", "GDPR Aligned", "OWASP Top 10", "ISO 27001", "SOC 2", "NIST"];

const FOOTER_SECTIONS = [
  {
    title: "Platform",
    links: [
      { label: "Why GuardianX", href: "/why-guardianx" },
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
      { label: "Whitepaper", href: "/whitepaper" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Security", href: "/.well-known/security.txt" },
      { label: "Documentation", href: "/whitepaper" },
      { label: "Status", href: "/" },
    ],
  },
];

const SECURITY_STATS = [
  { icon: Lock, label: "AES-256-GCM", value: "Encryption" },
  { icon: Shield, label: "SHA-256", value: "Attestation" },
  { icon: Cpu, label: "JWT + 2FA", value: "Auth" },
  { icon: Zap, label: "bcrypt", value: "Hashing" },
];

export function SiteFooter() {
  return (
    <footer className="relative z-10 mt-auto overflow-hidden border-t border-emerald-500/15 bg-zinc-950/95 backdrop-blur-xl">
      {/* Top glow line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />

      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute -top-20 left-1/2 h-40 w-[60rem] -translate-x-1/2 rounded-full bg-emerald-500/5 blur-3xl" />

      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {/* CTA strip */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-12 flex flex-col items-center justify-between gap-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 via-zinc-900/40 to-violet-500/5 p-6 sm:flex-row"
        >
          <div className="text-center sm:text-left">
            <h3 className="text-lg font-bold text-zinc-50">Ready to secure your assets?</h3>
            <p className="mt-1 text-xs text-zinc-500">One click. Full VAPT. Professional report. AI-driven patches.</p>
          </div>
          <a href="/">
            <Button className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border">
              <Terminal className="size-4" /> Enter Lab Console <ArrowRight className="size-4" />
            </Button>
          </a>
        </motion.div>

        {/* Main footer grid */}
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-1">
            <a href="/" className="flex items-center gap-2.5">
              <div className="neon-border rounded-lg">
                <img src="/guardianx-logo.png" alt="GuardianX" className="size-9 rounded-lg object-contain" />
              </div>
              <span className="text-lg font-bold tracking-tight text-zinc-50">
                Guardian<span className="text-emerald-400 neon-emerald">X</span>
              </span>
            </a>
            <p className="mt-3 text-xs leading-relaxed text-zinc-500">
              Autonomous Security Operations Platform. AI-driven SAST, DAST, exploit generation, adversarial patching, and VAPT reporting — all in one.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {TRUST_BADGES.map((badge) => (
                <span key={badge} className="rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2 py-0.5 text-[9px] font-medium text-emerald-300/70">
                  {badge}
                </span>
              ))}
            </div>
          </div>

          {/* Link sections */}
          {FOOTER_SECTIONS.map((section) => (
            <div key={section.title}>
              <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">{section.title}</div>
              <div className="space-y-2">
                {section.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="group flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-emerald-400"
                  >
                    <span className="size-1 rounded-full bg-zinc-700 transition-colors group-hover:bg-emerald-400" />
                    {link.label}
                  </a>
                ))}
              </div>
            </div>
          ))}

          {/* Contact */}
          <div>
            <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">Contact</div>
            <div className="space-y-2.5">
              <a href="https://www.guardianx.in" target="_blank" rel="noopener noreferrer" className="group flex items-center gap-2 text-xs text-zinc-400 transition-colors hover:text-emerald-400">
                <Globe className="size-3.5 text-emerald-400/60 group-hover:text-emerald-400" />
                www.guardianx.in
              </a>
              <a href="mailto:hello@guardianx.in" className="group flex items-center gap-2 text-xs text-zinc-400 transition-colors hover:text-emerald-400">
                <Mail className="size-3.5 text-emerald-400/60 group-hover:text-emerald-400" />
                hello@guardianx.in
              </a>
              <a href="tel:+917006712347" className="group flex items-center gap-2 text-xs text-zinc-400 transition-colors hover:text-emerald-400">
                <Phone className="size-3.5 text-emerald-400/60 group-hover:text-emerald-400" />
                +91 70067 12347
              </a>
            </div>

            {/* Security indicators */}
            <div className="mt-4 grid grid-cols-2 gap-1.5">
              {SECURITY_STATS.map((stat) => (
                <div key={stat.label} className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/40 px-2 py-1">
                  <stat.icon className="size-2.5 text-emerald-400/60" />
                  <span className="text-[9px] font-mono text-zinc-500">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-zinc-800/60 pt-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <ShieldHalf className="size-4 text-emerald-400/50" />
            <span className="text-[11px] text-zinc-600">
              © {new Date().getFullYear()} GuardianX. All rights reserved. Built for autonomous security.
            </span>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-zinc-700">
            <a href="/privacy" className="transition-colors hover:text-emerald-400">Privacy</a>
            <span>·</span>
            <a href="/terms" className="transition-colors hover:text-emerald-400">Terms</a>
            <span>·</span>
            <span className="font-mono">v1.0.0</span>
          </div>
        </div>
      </div>

      {/* Bottom glow line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/10 to-transparent" />
    </footer>
  );
}
