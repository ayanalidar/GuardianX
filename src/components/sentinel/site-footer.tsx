"use client";

import { ShieldHalf, Mail, Phone, Globe, FileText, Lock } from "lucide-react";

const TRUST_BADGES = ["DPDPA Ready", "GDPR Aligned", "OWASP Top 10", "ISO 27001", "SOC 2"];

const FOOTER_LINKS = {
  Platform: [
    { label: "Why GuardianX", href: "/why-guardianx" },
    { label: "Features", href: "/features" },
    { label: "Pricing", href: "/pricing" },
    { label: "Whitepaper", href: "/whitepaper" },
    { label: "Enter Lab", href: "/" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Security", href: "/.well-known/security.txt" },
  ],
  Contact: [
    { label: "www.guardianx.in", href: "https://www.guardianx.in" },
    { label: "hello@guardianx.in", href: "mailto:hello@guardianx.in" },
    { label: "+91 70067 12347", href: "tel:+917006712347" },
  ],
};

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-emerald-500/15 bg-zinc-950/90 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2">
              <img src="/guardianx-logo.png" alt="GuardianX" className="size-8 rounded-lg object-contain neon-border" />
              <span className="text-lg font-bold text-zinc-50">
                Guardian<span className="text-emerald-400 neon-emerald">X</span>
              </span>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              Autonomous Security Operations Platform. AI-driven SAST, DAST, exploit generation, adversarial patching, and VAPT reporting.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {TRUST_BADGES.map((badge) => (
                <span key={badge} className="rounded border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 text-[9px] text-emerald-300/70">
                  {badge}
                </span>
              ))}
            </div>
          </div>

          {/* Platform Links */}
          <div>
            <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">Platform</div>
            <div className="space-y-1.5">
              {FOOTER_LINKS.Platform.map((link) => (
                <a key={link.href} href={link.href} className="block text-xs text-zinc-400 transition-colors hover:text-emerald-400">
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          {/* Legal */}
          <div>
            <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">Legal</div>
            <div className="space-y-1.5">
              {FOOTER_LINKS.Legal.map((link) => (
                <a key={link.href} href={link.href} className="block text-xs text-zinc-400 transition-colors hover:text-emerald-400">
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          {/* Contact */}
          <div>
            <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">Contact</div>
            <div className="space-y-1.5">
              <a href="https://www.guardianx.in" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-emerald-400">
                <Globe className="size-3" /> www.guardianx.in
              </a>
              <a href="mailto:hello@guardianx.in" className="flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-emerald-400">
                <Mail className="size-3" /> hello@guardianx.in
              </a>
              <a href="tel:+917006712347" className="flex items-center gap-1.5 text-xs text-zinc-400 transition-colors hover:text-emerald-400">
                <Phone className="size-3" /> +91 70067 12347
              </a>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-zinc-800/60 pt-6 sm:flex-row">
          <div className="flex items-center gap-2">
            <ShieldHalf className="size-4 text-emerald-400/50" />
            <span className="text-xs text-zinc-500">© {new Date().getFullYear()} GuardianX. All rights reserved. Built for autonomous security.</span>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-zinc-600">
            <Lock className="size-3" /> AES-256-GCM · SHA-256 · JWT · bcrypt
          </div>
        </div>
      </div>
    </footer>
  );
}
