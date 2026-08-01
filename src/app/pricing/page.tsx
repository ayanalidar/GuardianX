"use client";
import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Zap, Building2, Crown, ArrowRight, Globe,
  Sparkles, Shield, TrendingUp, Cpu,
} from "lucide-react";

const TIERS = [
  {
    name: "MSME",
    icon: Zap,
    price: "₹6,999",
    period: "/month",
    desc: "For small businesses & startups taking their first step into security",
    color: "emerald",
    gradient: "from-emerald-500/20 via-emerald-600/5 to-transparent",
    border: "border-emerald-500/30",
    glow: "hover:shadow-[0_0_40px_rgba(16,185,129,0.15)]",
    features: [
      "Up to 3 clients",
      "Unlimited SAST + DAST scans",
      "AI patch generation",
      "5 VAPT PDF reports / month",
      "Audit scraper",
      "Passive reconnaissance",
      "Email support",
    ],
  },
  {
    name: "Professional",
    icon: Building2,
    price: "₹39,999",
    period: "/month",
    desc: "For growing companies that need continuous, autonomous protection",
    color: "cyan",
    gradient: "from-cyan-500/20 via-cyan-600/5 to-transparent",
    border: "border-cyan-500/40",
    glow: "hover:shadow-[0_0_50px_rgba(6,182,212,0.2)]",
    popular: true,
    features: [
      "Up to 25 clients",
      "Everything in MSME, plus:",
      "24/7 autonomous threat hunter",
      "Adversarial patching arena",
      "Guardian AI assistant",
      "War Room mode",
      "Behavioral anomaly detection",
      "Virtual patching (WAF rules)",
      "Slack/Teams integration",
      "Multi-tenant RBAC",
      "Risk trend charts",
      "Custom report branding",
      "Priority support (4h response)",
    ],
  },
  {
    name: "Enterprise",
    icon: Crown,
    price: "₹9,99,999",
    period: "/month",
    desc: "For large enterprises, banks, MSSPs & government organizations",
    color: "violet",
    gradient: "from-violet-500/20 via-violet-600/5 to-transparent",
    border: "border-violet-500/40",
    glow: "hover:shadow-[0_0_60px_rgba(139,92,246,0.2)]",
    features: [
      "Unlimited clients",
      "Everything in Professional, plus:",
      "R&D Lab (self-improving AI)",
      "Attack graph DAG modeling",
      "Protocol fuzzing engine",
      "2FA authentication",
      "Client portal (white-label)",
      "Dedicated infrastructure",
      "Full REST API access",
      "On-premise deployment",
      "Dedicated account manager",
      "24/7 phone support",
      "Custom AI model training",
    ],
  },
];

export default function PricingPage() {
  return (
    <>
      <SiteHeader />
      <div className="scanlines cyber-vignette premium-bg relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Animated background */}
      <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-20" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <motion.div
          animate={{ x: [0, 100, 0], y: [0, -50, 0], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-20 left-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-[120px]"
        />
        <motion.div
          animate={{ x: [0, -80, 0], y: [0, 60, 0], opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-20 right-1/4 h-96 w-96 rounded-full bg-violet-500/10 blur-[120px]"
        />
      </div>

      <div className="relative z-10 mx-auto pt-16 max-w-6xl px-4 py-20 sm:px-6">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-20 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring" }}
            className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-500/10"
            style={{ boxShadow: "0 0 30px rgba(16,185,129,0.3)" }}
          >
            <Shield className="size-8 text-emerald-400" />
          </motion.div>
          <Badge className="mb-4 border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <Sparkles className="size-3" /> Pricing
          </Badge>
          <h1 className="text-5xl font-bold tracking-tight text-zinc-50 sm:text-6xl">
            Security that <span className="gradient-text">pays for itself</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            Replace a ₹15 lakh security assessment with a single subscription.
            <br />One platform. Unlimited scans. Autonomous 24/7 protection.
          </p>
        </motion.div>

        {/* Pricing Cards — Cinematic */}
        <div className="grid gap-8 lg:grid-cols-3">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 40, rotateX: 15 }}
              whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15, duration: 0.6 }}
              whileHover={{ y: -8, scale: 1.02 }}
              className={`relative ${tier.popular ? "lg:-mt-4 lg:mb-4" : ""}`}
            >
              {/* Glow effect */}
              <div className={`absolute -inset-0.5 rounded-2xl bg-gradient-to-b ${tier.gradient} opacity-50 blur-xl`} />

              {/* Card */}
              <div className={`neon-card relative overflow-hidden rounded-2xl border ${tier.border} ${tier.glow} transition-all duration-500`}>
                {/* Animated gradient header */}
                <div className={`bg-gradient-to-b ${tier.gradient} p-6`}>
                  {tier.popular && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute right-4 top-4"
                    >
                      <div className="flex items-center gap-1 rounded-full border border-cyan-500/40 bg-cyan-500/20 px-3 py-1">
                        <Sparkles className="size-2.5 text-cyan-300" />
                        <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Popular</span>
                      </div>
                    </motion.div>
                  )}

                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    whileInView={{ scale: 1, rotate: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.15 + 0.3, type: "spring" }}
                    className={`mb-3 flex size-12 items-center justify-center rounded-xl border border-${tier.color}-500/40 bg-${tier.color}-500/10`}
                  >
                    <tier.icon className={`size-6 text-${tier.color}-400`} />
                  </motion.div>

                  <h3 className={`text-2xl font-bold text-${tier.color}-400`}>{tier.name}</h3>
                  <p className="mt-1 text-xs text-zinc-500">{tier.desc}</p>
                </div>

                {/* Price */}
                <div className="border-b border-zinc-800 p-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-bold text-zinc-50">{tier.price}</span>
                    <span className="text-sm text-zinc-500">{tier.period}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
                    <Globe className="size-3" />
                    <span>Billed monthly · Cancel anytime</span>
                  </div>
                </div>

                {/* Features */}
                <div className="p-6">
                  <div className="space-y-3">
                    {tier.features.map((f, j) => (
                      <motion.div
                        key={j}
                        initial={{ opacity: 0, x: -10 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.1 + j * 0.05 }}
                        className="flex items-start gap-2 text-xs"
                      >
                        <CheckCircle2 className={`mt-0.5 size-4 shrink-0 text-${tier.color}-400`} />
                        <span className={f.includes("Everything") ? "font-bold text-zinc-200" : "text-zinc-400"}>{f}</span>
                      </motion.div>
                    ))}
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.98 }}
                    className={`mt-6 flex w-full items-center justify-center gap-2 rounded-lg py-3 text-sm font-bold transition-all ${
                      tier.popular
                        ? `bg-cyan-600 text-white hover:bg-cyan-500`
                        : `border border-${tier.color}-500/40 bg-${tier.color}-500/10 text-${tier.color}-300 hover:bg-${tier.color}-500/20`
                    }`}
                  >
                    Get Started <ArrowRight className="size-4" />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Comparison Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-20"
        >
          <div className="neon-card overflow-hidden p-6">
            <div className="mb-4 flex items-center gap-2">
              <TrendingUp className="size-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-zinc-200">Cost Comparison: GuardianX vs Traditional VAPT</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 text-left text-zinc-500">
                    <th className="pb-2 pr-4">Metric</th>
                    <th className="pb-2 pr-4 text-emerald-400">GuardianX</th>
                    <th className="pb-2 text-zinc-500">Traditional VAPT</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {[
                    { metric: "Time to results", guardian: "90 seconds", traditional: "2-4 weeks" },
                    { metric: "Cost per assessment", guardian: "₹0 (included)", traditional: "₹5-15 lakh" },
                    { metric: "Assessments per year", guardian: "Unlimited", traditional: "1-2 (budget limited)" },
                    { metric: "24/7 monitoring", guardian: "✅ Included", traditional: "❌ ₹2L+/month extra" },
                    { metric: "AI-generated patches", guardian: "✅ Included", traditional: "❌ Manual" },
                    { metric: "VAPT report", guardian: "✅ Auto-generated (15-page PDF)", traditional: "❌ Manual (3-5 days)" },
                    { metric: "Annual cost", guardian: "₹84K - ₹12L", traditional: "₹10L - ₹50L+" },
                  ].map((row, i) => (
                    <motion.tr
                      key={i}
                      initial={{ opacity: 0 }}
                      whileInView={{ opacity: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.05 }}
                    >
                      <td className="py-2.5 pr-4 text-zinc-400">{row.metric}</td>
                      <td className="py-2.5 pr-4 font-medium text-emerald-300">{row.guardian}</td>
                      <td className="py-2.5 text-zinc-500">{row.traditional}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>

        {/* FAQ */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-20"
        >
          <h3 className="mb-8 text-center text-3xl font-bold text-zinc-50">Frequently Asked Questions</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { q: "Is there a free trial?", a: "Yes — the first 7 days are free. No credit card required. Scan unlimited codebases and targets." },
              { q: "Can I cancel anytime?", a: "Yes. No long-term contracts. Cancel from the dashboard and you won't be billed again." },
              { q: "Do you offer custom pricing?", a: "For MSSPs and enterprises with 50+ clients, we offer custom pricing. Contact hello@guardianx.in." },
              { q: "Is my data secure?", a: "Yes. AES-256-GCM encryption at rest, TLS 1.3 in transit, bcrypt password hashing, JWT auth, 2FA support." },
              { q: "Do you support on-premise?", a: "Enterprise tier supports on-premise deployment. Your data never leaves your infrastructure." },
              { q: "What compliance frameworks?", a: "DPDPA, GDPR, HIPAA, PCI-DSS, ISO 27001, SOC 2, NIST, OWASP Top 10 — all automatically mapped." },
            ].map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                whileHover={{ scale: 1.02 }}
                className="neon-card p-5"
              >
                <h4 className="text-sm font-bold text-zinc-200">{faq.q}</h4>
                <p className="mt-2 text-xs leading-relaxed text-zinc-500">{faq.a}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="mt-20 text-center"
        >
          <a href="/">
            <Button size="lg" className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border">
              Start Free Trial <ArrowRight className="size-4" />
            </Button>
          </a>
          <p className="mt-3 text-xs text-zinc-600">No credit card required · Cancel anytime · 7-day full access</p>
        </motion.div>
      </div>
    </div>
      <SiteFooter />
    </>
  );
}
