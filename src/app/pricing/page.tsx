"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2, Zap, Building2, Crown, ArrowRight, IndianRupee,
  Globe, Sparkles,
} from "lucide-react";

const TIERS = [
  {
    name: "Starter",
    icon: Zap,
    priceINR: "₹15,000",
    priceUSD: "$99",
    period: "/month",
    desc: "For startups & small teams getting started with security",
    color: "emerald",
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/5",
    features: [
      "Up to 3 clients",
      "Unlimited SAST scans",
      "Unlimited DAST scans",
      "AI patch generation",
      "VAPT PDF reports (5/month)",
      "Audit scraper",
      "Passive reconnaissance",
      "Email support",
      "Community access",
    ],
    notIncluded: [
      "Multi-tenant RBAC",
      "Slack/Teams integration",
      "War Room mode",
      "R&D Lab access",
    ],
  },
  {
    name: "Professional",
    icon: Building2,
    priceINR: "₹50,000",
    priceUSD: "$499",
    period: "/month",
    desc: "For growing companies that need continuous security",
    color: "cyan",
    border: "border-cyan-500/40",
    bg: "bg-cyan-500/5",
    popular: true,
    features: [
      "Up to 25 clients",
      "Everything in Starter, plus:",
      "24/7 autonomous threat hunter",
      "Adversarial patching arena",
      "Guardian AI assistant",
      "War Room mode",
      "Behavioral anomaly detection",
      "Virtual patching (WAF rules)",
      "IaC remediation (Terraform/Ansible)",
      "Slack/Teams integration",
      "Multi-tenant RBAC (admin/analyst/viewer)",
      "Priority support (4h response)",
    ],
    notIncluded: [
      "R&D Lab access",
      "Custom AI model training",
    ],
  },
  {
    name: "Enterprise",
    icon: Crown,
    priceINR: "₹2,00,000",
    priceUSD: "$2,000",
    period: "/month",
    desc: "For large enterprises, banks & MSSPs",
    color: "violet",
    border: "border-violet-500/40",
    bg: "bg-violet-500/5",
    features: [
      "Unlimited clients",
      "Everything in Professional, plus:",
      "R&D Lab (self-improving AI)",
      "Attack graph DAG modeling",
      "Protocol fuzzing engine",
      "Custom compliance frameworks",
      "Dedicated infrastructure",
      "API access (full REST API)",
      "White-label reports (your branding)",
      "Dedicated account manager",
      "24/7 phone support",
      "Custom AI model training",
      "On-premise deployment option",
    ],
    notIncluded: [],
  },
];

export default function PricingPage() {
  return (
    <div className="scanlines cyber-vignette relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-30" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-40 left-1/3 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-6xl px-4 py-20 sm:px-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-16 text-center">
          <Badge className="mb-6 border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
            <Sparkles className="size-3" /> Pricing
          </Badge>
          <h1 className="text-4xl font-bold tracking-tight text-zinc-50 sm:text-5xl">
            Security that pays for itself
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-zinc-400">
            Replace ₹5-15 lakh per assessment with a single subscription. One platform, unlimited scans, autonomous 24/7 protection.
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid gap-6 lg:grid-cols-3">
          {TIERS.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className={`holo-card-sharp hud-corners relative overflow-hidden p-6 ${tier.border} ${tier.bg} ${tier.popular ? "lg:scale-105" : ""}`}
            >
              {tier.popular && (
                <div className="absolute right-0 top-0 rounded-bl-lg bg-cyan-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                  ★ Most Popular
                </div>
              )}
              <div className="mb-4">
                <tier.icon className={`size-8 text-${tier.color}-400`} />
                <h3 className={`mt-2 text-xl font-bold text-${tier.color}-400`}>{tier.name}</h3>
                <p className="mt-1 text-xs text-zinc-500">{tier.desc}</p>
              </div>
              <div className="mb-6 flex items-baseline gap-2">
                <span className={`text-4xl font-bold text-zinc-50`}>{tier.priceINR}</span>
                <span className="text-sm text-zinc-500">{tier.period}</span>
              </div>
              <div className="mb-4 flex items-center gap-2 text-xs text-zinc-600">
                <Globe className="size-3" />
                <span>Global: {tier.priceUSD}{tier.period}</span>
              </div>
              <Button className={`w-full ${tier.popular ? "bg-cyan-600 text-white hover:bg-cyan-500" : "border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"} mb-6`} variant={tier.popular ? "default" : "outline"}>
                Get Started <ArrowRight className="size-4" />
              </Button>
              <div className="space-y-2">
                {tier.features.map((f, j) => (
                  <div key={j} className="flex items-start gap-2 text-xs">
                    <CheckCircle2 className={`mt-0.5 size-3.5 shrink-0 text-${tier.color}-400`} />
                    <span className={f.includes("Everything") ? "font-bold text-zinc-200" : "text-zinc-400"}>{f}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Comparison Table */}
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="mt-16">
          <div className="holo-card-sharp hud-corners p-6">
            <h3 className="mb-4 text-sm font-bold text-zinc-200">Cost Comparison: GuardianX vs Traditional VAPT</h3>
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
                    { metric: "Compliance mapping", guardian: "✅ All frameworks", traditional: "❌ Separate consultant" },
                    { metric: "VAPT report", guardian: "✅ 15-page PDF, auto-generated", traditional: "❌ Manual, 3-5 days" },
                    { metric: "Annual cost", guardian: "₹1.8L-₹24L", traditional: "₹10L-₹50L+" },
                  ].map((row, i) => (
                    <tr key={i}>
                      <td className="py-2 pr-4 text-zinc-400">{row.metric}</td>
                      <td className="py-2 pr-4 font-medium text-emerald-300">{row.guardian}</td>
                      <td className="py-2 text-zinc-500">{row.traditional}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.div>

        {/* FAQ */}
        <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="mt-16">
          <h3 className="mb-6 text-center text-2xl font-bold text-zinc-50">Frequently Asked Questions</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { q: "Is there a free trial?", a: "Yes — the first 7 days are free. No credit card required. Scan unlimited codebases and targets." },
              { q: "Can I cancel anytime?", a: "Yes. No long-term contracts. Cancel from the dashboard and you won't be billed again." },
              { q: "Do you offer custom pricing?", a: "For MSSPs and enterprises with 50+ clients, we offer custom pricing. Contact hello@guardianx.in." },
              { q: "Is my data secure?", a: "Yes. All data is encrypted at rest (AES-256-GCM) and in transit (TLS 1.3). Credentials are never stored in plaintext." },
              { q: "Do you support on-premise?", a: "Enterprise tier supports on-premise deployment. Your data never leaves your infrastructure." },
              { q: "What compliance frameworks?", a: "DPDPA, GDPR, HIPAA, PCI-DSS, ISO 27001, SOC 2, NIST, OWASP Top 10 — all automatically mapped." },
            ].map((faq, i) => (
              <div key={i} className="holo-card-sharp hud-corners p-4">
                <h4 className="text-sm font-bold text-zinc-200">{faq.q}</h4>
                <p className="mt-1 text-xs text-zinc-500">{faq.a}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <a href="/">
            <Button size="lg" className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border">
              Start Free Trial <ArrowRight className="size-4" />
            </Button>
          </a>
          <p className="mt-3 text-xs text-zinc-600">No credit card required · Cancel anytime · 7-day full access</p>
        </div>
      </div>
    </div>
  );
}
