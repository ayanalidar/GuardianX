"use client";

// /docs — public knowledge base (Task #10-customer-success).
//
// A self-serve reference for users + prospects. Six categories, each with 3-5
// articles (placeholder content — outlines live in docs/KNOWLEDGE-BASE.md).
// Includes a client-side search bar (filters articles by title/keywords as
// you type), a link to the interactive API docs at /api-doc, and a "contact
// support" CTA that opens the in-app chat (for logged-in users) or the
// /contact page (for visitors).
//
// Article content is intentionally short — full articles are tracked in
// docs/KNOWLEDGE-BASE.md. When the content grows beyond ~200 lines, split
// each category into its own /docs/[category]/[slug] page backed by MDX.

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Search,
  Code2,
  LifeBuoy,
  Rocket,
  Bug,
  ShieldCheck,
  FileCheck2,
  Wrench,
  ArrowRight,
} from "lucide-react";

interface Article {
  slug: string;
  title: string;
  summary: string;
  body: string;
  keywords?: string[];
}

interface Category {
  id: string;
  label: string;
  icon: typeof BookOpen;
  color: string;
  description: string;
  articles: Article[];
}

const CATEGORIES: Category[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    icon: Rocket,
    color: "emerald",
    description: "From signup to your first scan in under 5 minutes.",
    articles: [
      {
        slug: "create-account",
        title: "Create your GuardianX account",
        summary: "Sign up, verify your email, and get admin-approved.",
        body:
          "Visit /, click Enter Lab, then Sign up. After verifying your email, an admin approves your account (the first signup is auto-approved and becomes the workspace admin). Once approved, you can create clients, upload codebases, and start scans.",
        keywords: ["signup", "approval", "email verification", "first user"],
      },
      {
        slug: "first-scan",
        title: "Run your first SAST scan",
        summary: "Upload a codebase and start a scan in 3 clicks.",
        body:
          "1. Click + Add Codebase. 2. Paste your source (or import from a Git URL). 3. Click Start Scan. The pipeline runs SAST → patch generation → sandbox test → adversarial validation. You'll see patches appear in the Patches tab within ~60 seconds for a typical 5k-LOC codebase.",
        keywords: ["scan", "codebase", "sast", "upload", "pipeline"],
      },
      {
        slug: "console-tour",
        title: "Tour of the console",
        summary: "The 8 main tabs and what each is for.",
        body:
          "Dashboard (overview), Clients (multi-tenant grouping), Pipelines (live scans), Codebases (source files), Patches (AI-generated fixes), RedAgent (DAST against live targets), Compliance (DPDPA/GDPR/ISO), DFIR (incident response). The Help button (bottom-right) opens a guided tour.",
        keywords: ["tabs", "navigation", "console", "ui", "tour"],
      },
      {
        slug: "roles-permissions",
        title: "Roles & permissions",
        summary: "Admin vs Viewer — what each role can do.",
        body:
          "Admins can approve users, manage credentials, configure SMTP, and see all clients. Viewers can only see clients they own, cannot manage credentials or settings, but can run scans, review patches, and create incidents. The first signup becomes admin; subsequent signups need admin approval.",
        keywords: ["admin", "viewer", "rbac", "permissions", "roles"],
      },
    ],
  },
  {
    id: "scanning-vapt",
    label: "Scanning & VAPT",
    icon: Bug,
    color: "red",
    description: "SAST, DAST, secret scanning, and full VAPT reports.",
    articles: [
      {
        slug: "sast-vs-dast",
        title: "SAST vs DAST — when to use each",
        summary: "Static analysis finds code bugs; DAST attacks live endpoints.",
        body:
          "SAST scans source code without running it (fast, finds SQL injection, XSS, hardcoded secrets, weak crypto). DAST (RedAgent) attacks a running URL with real HTTP requests (finds auth bypass, IDOR, business-logic flaws). For full coverage, run SAST on every codebase AND DAST on every deployment.",
        keywords: ["sast", "dast", "redagent", "scanning", "difference"],
      },
      {
        slug: "full-vapt",
        title: "Run a full VAPT in one click",
        summary: "Enter a URL → get a 15-page PDF report.",
        body:
          "On the RedAgent tab, click Full VAPT, enter the target URL, and click Start. GuardianX runs passive recon, crawl, SAST (if source is available), DAST, secret scan, and produces a professional PDF report with executive summary, findings, CVSS scores, and remediation guidance — typically in under 5 minutes.",
        keywords: ["vapt", "report", "pdf", "full", "redagent"],
      },
      {
        slug: "interpreting-findings",
        title: "Interpreting finding severities",
        summary: "Critical / High / Medium / Low — what each means.",
        body:
          "Critical = remote code execution, auth bypass, or data breach. High = privilege escalation, sensitive data exposure. Medium = business-logic flaws, weak crypto. Low = information disclosure, missing headers. Each finding includes a proof-of-concept request/response and a confidence score (0-1).",
        keywords: ["severity", "findings", "cvss", "critical", "high"],
      },
      {
        slug: "secret-scanning",
        title: "Secret scanning (audit-scraper)",
        summary: "Detect leaked API keys, tokens, and credentials in source.",
        body:
          "The audit-scraper module scans your codebase for AWS keys, GitHub PATs, database URLs, JWT secrets, and 40+ other credential patterns. Findings appear on the Codebases tab → Audit Scraper sub-tab. Each match includes file:line and a remediation suggestion (rotate the secret + remove from source).",
        keywords: ["secrets", "credentials", "audit-scraper", "leaked", "tokens"],
      },
    ],
  },
  {
    id: "patch-management",
    label: "Patch Management",
    icon: ShieldCheck,
    color: "violet",
    description: "AI-generated patches, sandbox testing, and approval flow.",
    articles: [
      {
        slug: "patch-lifecycle",
        title: "The patch lifecycle",
        summary: "Generated → sandbox-tested → approved → applied → verified.",
        body:
          "Each SAST finding spawns a Patch row. The pipeline: (1) AI generates a candidate fix. (2) The fix is sandbox-tested against the original exploit. (3) An adversarial round-trip re-attacks the patched code. (4) The patch enters 'pending' status awaiting your review. (5) Approve to mark it ready; reject to discard.",
        keywords: ["patch", "lifecycle", "approve", "sandbox", "adversarial"],
      },
      {
        slug: "reviewing-patches",
        title: "Reviewing a patch",
        summary: "Diff view, AI reasoning, exploit replay, and the chat panel.",
        body:
          "Click any patch to open the review dialog. You'll see the original vs patched code side-by-side, the AI's reasoning, sandbox logs, and the exploit used to validate the fix. The chat panel lets you ask the AI questions ('Why this fix?', 'Other exploits?'). Approve / Reject / Rollback buttons are at the bottom.",
        keywords: ["review", "diff", "chat", "approve", "reject"],
      },
      {
        slug: "adversarial-patching",
        title: "Adversarial patching explained",
        summary: "Why we re-attack the patched code.",
        body:
          "After the AI proposes a fix, a second AI (the 'adversary') tries to bypass it with a new exploit. If the adversary wins, the original patch is regenerated with the new info. This loop runs up to 5 rounds. The patch card shows the rounds played + who won, so you know how hardened the fix is.",
        keywords: ["adversarial", "rounds", "bypass", "validation"],
      },
      {
        slug: "rollback",
        title: "Rolling back a patch",
        summary: "What if a patch breaks production?",
        body:
          "Every approved patch can be rolled back from the Patches tab → Rollback button. This reverts the codebase to its pre-patch state and creates an Incident row for audit. Rollback is also exposed via POST /api/patches/[id]/rollback for CI/CD integration.",
        keywords: ["rollback", "revert", "undo", "incident"],
      },
    ],
  },
  {
    id: "compliance",
    label: "Compliance",
    icon: FileCheck2,
    color: "amber",
    description: "DPDPA, GDPR, ISO 27001, SOC 2, PCI-DSS mappings.",
    articles: [
      {
        slug: "frameworks-supported",
        title: "Compliance frameworks supported",
        summary: "DPDPA, GDPR, ISO 27001, SOC 2, PCI-DSS, NIST CSF.",
        body:
          "GuardianX maps each finding to one or more compliance frameworks. The Compliance tab shows your posture per framework, with each control's status (pass/fail/warning) and the findings that drove it. Switch frameworks via the dropdown.",
        keywords: ["compliance", "frameworks", "dpdpa", "gdpr", "iso", "soc2"],
      },
      {
        slug: "dpdpa-2023",
        title: "DPDPA 2023 — what to know",
        summary: "India's Digital Personal Data Protection Act.",
        body:
          "DPDPA mandates reasonable security practices + breach notification within 72 hours. GuardianX's DPDPA profile maps findings to the Act's sections (e.g., Section 8(5) security safeguards, Section 8(6) breach notification). The compliance dashboard shows your readiness score + a checklist of controls.",
        keywords: ["dpdpa", "india", "data protection", "breach notification"],
      },
      {
        slug: "attestations",
        title: "Cryptographic attestations",
        summary: "SHA-256 hashed audit trail for every approved patch.",
        body:
          "Each approved patch is hashed (SHA-256) and chained to the previous patch's hash, producing a tamper-evident audit trail. The Attestation tab shows the chain; you can export it as JSON for compliance evidence. The chain is stored in the Attestation table.",
        keywords: ["attestation", "sha-256", "audit trail", "hash", "evidence"],
      },
      {
        slug: "audit-export",
        title: "Exporting audit logs",
        summary: "CSV / JSON export for SIEM ingestion.",
        body:
          "Settings → Audit Log → Export. Choose CSV (for spreadsheets) or JSON (for SIEM / Splunk / Elastic). The export includes every AuditLog row for the selected time range. Larger exports are paginated; contact support for exports >10k rows.",
        keywords: ["audit", "export", "csv", "json", "siem"],
      },
    ],
  },
  {
    id: "api-integration",
    label: "API Integration",
    icon: Code2,
    color: "cyan",
    description: "REST API, webhooks, and CI/CD integration.",
    articles: [
      {
        slug: "authentication",
        title: "Authenticating with the API",
        summary: "Bearer JWT tokens, 7-day expiry, cookie + header.",
        body:
          "POST /api/auth/login with email + password to get a JWT. Send it as Authorization: Bearer <token> on every subsequent request, OR rely on the guardianx-token HTTP-only cookie set by the login response. Tokens expire after 7 days. To revoke, POST /api/auth/revoke-sessions (admin or self).",
        keywords: ["api", "auth", "jwt", "bearer", "token"],
      },
      {
        slug: "rate-limits",
        title: "Rate limits",
        summary: "300 req/min/IP for the general API; stricter for auth.",
        body:
          "General API: 300 req/min per IP. Auth endpoints: 10-20 req/15 min per IP (per-endpoint buckets). Demo gate: 5 views/day per IP. 429 responses include Retry-After + X-RateLimit-* headers. For higher limits, contact hello@guardianx.in.",
        keywords: ["rate limit", "429", "throttle", "retry-after"],
      },
      {
        slug: "webhooks",
        title: "Configuring webhooks",
        summary: "Get notified on patch_approved, incident_created, etc.",
        body:
          "Settings → Webhooks → Add Webhook. Enter a URL + select events (patch_approved, incident_created, finding_detected, scan_completed). Each delivery includes an HMAC-SHA256 signature in the X-GuardianX-Signature header — verify it with your webhook secret. Failed deliveries retry 3x with exponential backoff.",
        keywords: ["webhooks", "notifications", "hmac", "signature"],
      },
      {
        slug: "ci-cd",
        title: "CI/CD integration",
        summary: "Block merges on critical findings via GitHub Actions.",
        body:
          "Add a step to your workflow that calls POST /api/ci-cd/scan with your codebase + a GuardianX API token. The endpoint returns a pass/fail verdict based on the severity threshold you configure. See docs/API-INTEGRATION.md for a copy-paste GitHub Actions example.",
        keywords: ["ci", "cd", "github actions", "pipeline", "block merge"],
      },
      {
        slug: "openapi-spec",
        title: "Browsing the OpenAPI spec",
        summary: "Interactive Swagger UI at /api-doc.",
        body:
          "Visit /api-doc for an interactive Swagger UI rendered from /api/openapi.json. Click Authorize, paste your JWT, and try any endpoint directly from the browser. The spec is OpenAPI 3.0.3 — you can import it into Postman, Insomnia, or your own SDK generator.",
        keywords: ["openapi", "swagger", "api-doc", "postman"],
      },
    ],
  },
  {
    id: "troubleshooting",
    label: "Troubleshooting",
    icon: Wrench,
    color: "rose",
    description: "Common issues, error codes, and how to get help.",
    articles: [
      {
        slug: "pending-approval",
        title: "Account stuck on 'pending approval'",
        summary: "Why your account isn't active yet + how to escalate.",
        body:
          "After signup, an admin must approve your account. If you're stuck on 'pending' for >24h, email hello@guardianx.in with your signup email. The first signup on a fresh deployment is auto-approved and becomes the admin — subsequent signups need that admin's approval.",
        keywords: ["pending", "approval", "stuck", "waiting"],
      },
      {
        slug: "scan-failures",
        title: "Why did my scan fail?",
        summary: "Common scan failure modes and fixes.",
        body:
          "Most scan failures are: (1) codebase too large (>5MB source) — split into smaller files; (2) unsupported language — we support JS/TS, Python, Go, Java, PHP, Ruby; (3) sandbox timeout — the patch's exploit replay took >60s, retry; (4) DB unreachable — check /status. Open a ticket via the chat widget (bottom-right) with the scan ID.",
        keywords: ["scan", "failed", "error", "timeout", "language"],
      },
      {
        slug: "email-not-sending",
        title: "Email delivery issues",
        summary: "SMTP config, test emails, and the Email Log.",
        body:
          "Settings → Email (SMTP) → Send Test Email. If it fails, check the Email Log tab — each row shows the SMTP error. Common fixes: use port 587 with STARTTLS (not 465), ensure your SMTP host allows relaying from your server's IP, and verify the FROM address matches your SMTP account.",
        keywords: ["email", "smtp", "delivery", "failed", "test"],
      },
      {
        slug: "db-init",
        title: "Database not initialized",
        summary: "Running /supabase/migrations/0001_init.sql.",
        body:
          "If /api/health returns 'DB_NOT_INITIALIZED', open Supabase Dashboard → SQL Editor → paste the contents of supabase/migrations/0001_init.sql → Run. Then POST /api/db-init to seed demo data. The migrations are idempotent — safe to re-run.",
        keywords: ["database", "init", "supabase", "migration", "schema"],
      },
      {
        slug: "contact-support",
        title: "How to contact support",
        summary: "In-app chat, email, and the status page.",
        body:
          "Logged-in users: click the chat bubble (bottom-right) — tickets are created with each message and we respond within 24h. For urgent issues, email hello@guardianx.in directly. Check /status for current system health. Admin-submitted tickets get priority triage.",
        keywords: ["support", "contact", "email", "chat", "urgent"],
      },
    ],
  },
];

const ALL_ARTICLES = CATEGORIES.flatMap((c) =>
  c.articles.map((a) => ({ ...a, categoryId: c.id, categoryLabel: c.label, categoryColor: c.color }))
);

const COLOR_CLASSES: Record<string, { text: string; bg: string; border: string; ring: string }> = {
  emerald: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", ring: "ring-emerald-500/20" },
  red: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", ring: "ring-red-500/20" },
  violet: { text: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/30", ring: "ring-violet-500/20" },
  amber: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", ring: "ring-amber-500/20" },
  cyan: { text: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/30", ring: "ring-cyan-500/20" },
  rose: { text: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/30", ring: "ring-rose-500/20" },
};

export default function DocsPage() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_ARTICLES.filter((a) => {
      if (activeCategory !== "all" && a.categoryId !== activeCategory) return false;
      if (!q) return true;
      const haystack = (
        a.title +
        " " +
        a.summary +
        " " +
        a.body +
        " " +
        (a.keywords || []).join(" ")
      ).toLowerCase();
      return haystack.includes(q);
    });
  }, [query, activeCategory]);

  const openArticle = openSlug ? ALL_ARTICLES.find((a) => a.slug === openSlug) : null;

  return (
    <>
      <SiteHeader />
      <div className="scanlines cyber-vignette relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-20" />
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-4 pt-24 py-16 sm:px-6">
          {/* Hero */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center">
            <BookOpen className="mx-auto size-10 text-emerald-400 neon-emerald" />
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-zinc-50">
              Knowledge Base
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
              Self-serve docs for GuardianX. Search articles, browse categories,
              or open the in-app chat for direct support.
            </p>
          </motion.div>

          {/* Search bar */}
          <div className="mx-auto mb-8 max-w-xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search articles… (e.g. 'rate limits', 'DPDPA', 'rollback')"
                className="border-zinc-700 bg-zinc-900/60 pl-9 text-zinc-200 focus-visible:border-emerald-500/50"
              />
            </div>
          </div>

          {/* Quick links */}
          <div className="mx-auto mb-10 flex max-w-xl items-center justify-center gap-3">
            <a
              href="/api-doc"
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-1.5 text-xs text-cyan-300 transition-colors hover:bg-cyan-500/10"
            >
              <Code2 className="size-3.5" /> API Docs
            </a>
            <a
              href="/contact"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/10"
            >
              <LifeBuoy className="size-3.5" /> Contact Support
            </a>
            <a
              href="/status"
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/40 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              System Status
            </a>
          </div>

          {/* Category filter */}
          <div className="mb-8 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setActiveCategory("all")}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                activeCategory === "all"
                  ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30"
                  : "text-zinc-400 hover:bg-zinc-800/60"
              }`}
            >
              All ({ALL_ARTICLES.length})
            </button>
            {CATEGORIES.map((c) => {
              const cls = COLOR_CLASSES[c.color] || COLOR_CLASSES.emerald;
              const active = activeCategory === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCategory(c.id)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${
                    active
                      ? `${cls.bg} ${cls.text} ring-1 ${cls.ring}`
                      : "text-zinc-400 hover:bg-zinc-800/60"
                  }`}
                >
                  {c.label} ({c.articles.length})
                </button>
              );
            })}
          </div>

          {/* Article list / detail */}
          {openArticle ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="holo-card-sharp hud-corners mx-auto max-w-3xl p-6"
            >
              <button
                type="button"
                onClick={() => setOpenSlug(null)}
                className="mb-4 inline-flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-emerald-400"
              >
                ← Back to all articles
              </button>
              <Badge
                className={`mb-3 border ${COLOR_CLASSES[openArticle.categoryColor]?.border || ""} ${COLOR_CLASSES[openArticle.categoryColor]?.bg || ""} ${COLOR_CLASSES[openArticle.categoryColor]?.text || ""}`}
              >
                {openArticle.categoryLabel}
              </Badge>
              <h2 className="text-2xl font-bold text-zinc-50">{openArticle.title}</h2>
              <p className="mt-2 text-sm text-zinc-400">{openArticle.summary}</p>
              <div className="mt-5 border-t border-zinc-800 pt-4 text-sm leading-relaxed text-zinc-300">
                {openArticle.body}
              </div>
              {openArticle.keywords && openArticle.keywords.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-1.5">
                  {openArticle.keywords.map((k) => (
                    <span
                      key={k}
                      className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-0.5 text-[10px] text-zinc-500"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.length === 0 && (
                <div className="col-span-full rounded-lg border border-dashed border-zinc-800 bg-zinc-900/30 p-10 text-center">
                  <p className="text-sm text-zinc-400">
                    No articles match <span className="text-zinc-200">"{query}"</span>.
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Try a different search, or{" "}
                    <a href="/contact" className="text-emerald-400 hover:underline">
                      contact support
                    </a>
                    .
                  </p>
                </div>
              )}
              {filtered.map((a, i) => {
                const cls = COLOR_CLASSES[a.categoryColor] || COLOR_CLASSES.emerald;
                return (
                  <motion.button
                    key={a.slug}
                    type="button"
                    onClick={() => setOpenSlug(a.slug)}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    className="holo-card-sharp hud-corners group p-5 text-left transition-colors hover:border-emerald-500/40"
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span
                        className={`rounded-md border ${cls.border} ${cls.bg} px-2 py-0.5 text-[10px] font-medium ${cls.text}`}
                      >
                        {a.categoryLabel}
                      </span>
                      <ArrowRight className="size-3.5 text-zinc-600 transition-colors group-hover:text-emerald-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-100">{a.title}</h3>
                    <p className="mt-1 text-xs text-zinc-400">{a.summary}</p>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
        <SiteFooter />
      </div>
    </>
  );
}
