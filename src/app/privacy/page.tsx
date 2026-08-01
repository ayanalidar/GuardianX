"use client";

import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";
import { Lock } from "lucide-react";

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <div className="scanlines cyber-vignette premium-bg relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-20" />
        <div className="relative z-10 mx-auto max-w-3xl px-4 pt-24 py-20 sm:px-6">
          <div className="mb-10">
            <div className="mb-2 flex items-center gap-2">
              <Lock className="size-6 text-emerald-400" />
              <h1 className="text-3xl font-bold text-zinc-50">Privacy Policy</h1>
            </div>
            <p className="text-xs text-zinc-600">Last updated: {new Date().getFullYear()} · GuardianX</p>
          </div>
          <div className="space-y-8 text-sm leading-relaxed text-zinc-400">
            <section>
              <h2 className="mb-2 text-lg font-bold text-emerald-300">1. Data We Collect</h2>
              <ul className="mt-2 space-y-1 pl-4">
                <li>• Account: name, email, password (bcrypt-hashed)</li>
                <li>• Client data: company name, target URLs, source code (for SAST)</li>
                <li>• Scan results: vulnerabilities, HTTP evidence, generated patches</li>
                <li>• Credentials: Git tokens (AES-256-GCM encrypted, never displayed)</li>
              </ul>
            </section>
            <section>
              <h2 className="mb-2 text-lg font-bold text-emerald-300">2. Data Security</h2>
              <ul className="space-y-1 pl-4">
                <li>• AES-256-GCM encryption for credentials</li>
                <li>• TLS 1.3 in transit · bcrypt hashing · JWT auth</li>
                <li>• 2FA (TOTP) available · Rate limiting</li>
                <li>• SHA-256 hash-chained attestation ledger</li>
              </ul>
            </section>
            <section>
              <h2 className="mb-2 text-lg font-bold text-emerald-300">3. Your Rights (DPDPA 2023)</h2>
              <ul className="space-y-1 pl-4">
                <li>• Access, correction, erasure, portability</li>
                <li>• Objection to AI model training</li>
                <li>• Breach notification within 72 hours</li>
              </ul>
            </section>
            <section>
              <h2 className="mb-2 text-lg font-bold text-emerald-300">4. Contact</h2>
              <p>For privacy concerns: <a href="mailto:hello@guardianx.in" className="text-emerald-400 hover:underline">hello@guardianx.in</a></p>
            </section>
          </div>
        </div>
        <SiteFooter />
      </div>
    </>
  );
}
