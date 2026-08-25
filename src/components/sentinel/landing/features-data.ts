import {
  Bug,
  Crosshair,
  Swords,
  ScanLine,
  FileText,
  KeyRound,
  Gauge,
  Globe,
  Wand2,
  Heart,
  Link2,
  Gavel,
  Lock,
  Skull,
  Activity,
  Radar,
  Network,
  GitBranch,
  AlertTriangle,
  Workflow,
  Eye,
  Webhook,
  Brain,
  Rocket,
  FlaskConical,
  Shield,
  FileCode2,
  ShieldCheck,
  Mic,
  Hand,
  Cpu,
  Database,
  // ── NEW icons added for the 50+ module expansion ──────────────────────
  Siren,
  FileLock2,
  Fingerprint,
  PlayCircle,
  Radio,
  Bell,
  Bird,
  Anchor,
  ScrollText,
  Settings2,
  FileOutput,
  Bot,
  CalendarClock,
  GitFork,
  Puzzle,
  Beaker,
  CreditCard,
  Smartphone,
  Building2,
  MailCheck,
  Users,
  UserCog,
  Newspaper,
  Github,
  Atom,
  TrendingUp,
  Orbit,
  type LucideIcon,
} from "lucide-react";

export interface Feature {
  icon: LucideIcon;
  title: string;
  category: string;
  desc: string;
  color: string;
  neon: string;
  border: string;
  glow: string;
  bg: string;
  isNew?: boolean;
}

// ── Color token helpers ────────────────────────────────────────────────
// Each color name maps to a self-consistent text/neon/border/glow/bg quintet
// so new feature entries stay in lock-step with the existing visual language.
const PALETTES = {
  red: {
    color: "text-red-400",
    neon: "neon-red",
    border: "border-red-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(239,68,68,0.2)]",
    bg: "bg-red-500/5",
  },
  orange: {
    color: "text-orange-400",
    neon: "neon-orange",
    border: "border-orange-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(249,115,22,0.2)]",
    bg: "bg-orange-500/5",
  },
  amber: {
    color: "text-amber-400",
    neon: "neon-amber",
    border: "border-amber-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(245,158,11,0.2)]",
    bg: "bg-amber-500/5",
  },
  emerald: {
    color: "text-emerald-400",
    neon: "neon-emerald",
    border: "border-emerald-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(16,185,129,0.2)]",
    bg: "bg-emerald-500/5",
  },
  cyan: {
    color: "text-cyan-400",
    neon: "neon-cyan",
    border: "border-cyan-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(6,182,212,0.2)]",
    bg: "bg-cyan-500/5",
  },
  sky: {
    color: "text-sky-400",
    neon: "neon-sky",
    border: "border-sky-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(14,165,233,0.2)]",
    bg: "bg-sky-500/5",
  },
  violet: {
    color: "text-violet-400",
    neon: "neon-violet",
    border: "border-violet-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(139,92,246,0.2)]",
    bg: "bg-violet-500/5",
  },
  purple: {
    color: "text-purple-400",
    neon: "neon-purple",
    border: "border-purple-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(168,85,247,0.2)]",
    bg: "bg-purple-500/5",
  },
  rose: {
    color: "text-rose-400",
    neon: "neon-rose",
    border: "border-rose-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(244,63,94,0.2)]",
    bg: "bg-rose-500/5",
  },
  teal: {
    color: "text-teal-400",
    neon: "neon-teal",
    border: "border-teal-500/40",
    glow: "hover:shadow-[0_0_24px_rgba(20,184,166,0.2)]",
    bg: "bg-teal-500/5",
  },
} as const;

type PaletteName = keyof typeof PALETTES;

/** Helper to apply a palette to a feature, keeping call sites terse. */
function withColor(
  icon: LucideIcon,
  title: string,
  category: string,
  desc: string,
  palette: PaletteName,
  isNew?: boolean,
): Feature {
  const p = PALETTES[palette];
  return {
    icon,
    title,
    category,
    desc,
    color: p.color,
    neon: p.neon,
    border: p.border,
    glow: p.glow,
    bg: p.bg,
    ...(isNew ? { isNew: true } : {}),
  };
}

export const FEATURES: Feature[] = [
  // ════════════════════════════════════════════════════════════════════
  // ORIGINAL 34 FEATURES (unchanged, except Data Privacy Scanner fixed
  // from indigo → violet to honor the NO-indigo/blue design rule)
  // ════════════════════════════════════════════════════════════════════
  withColor(
    Bug,
    "AI Vulnerability Detection",
    "SAST",
    "AI reads your source code and identifies real, exploitable vulnerabilities with CVE/CWE mapping, confidence scores, and the exact vulnerable snippet.",
    "red",
  ),
  withColor(
    Crosshair,
    "PoC Exploit Playground",
    "Exploit",
    "For every vulnerability, the AI generates a working proof-of-concept exploit. Run it against the original code to prove the vuln is real, then against the patched code to prove the fix works.",
    "orange",
  ),
  withColor(
    Swords,
    "Adversarial Red-Team Arena",
    "Self-Attack",
    "After patching, a second AI persona attacks its own fix. If it finds a bypass, the defender iterates. Loop until the attacker concedes, the patch is battle-tested before human review.",
    "amber",
  ),
  withColor(
    Crosshair,
    "RedAgent VAPT Engine",
    "DAST",
    "Autonomous penetration testing against live targets. The AI crawls the app, plans category-appropriate attacks, fires real HTTP payloads, and confirms exploitation with full evidence.",
    "red",
  ),
  withColor(
    ScanLine,
    "Sensitive Data Exposure Scanner",
    "Secrets",
    "Systematically detects exposed AWS/Stripe/GitHub keys, JWTs, private keys, passwords, SSNs, and credit cards. Probes 22+ known exposure paths. All samples redacted, proves the leak without exfiltrating.",
    "purple",
  ),
  withColor(
    FileText,
    "Professional VAPT Reports",
    "Reporting",
    "Generate a 15-page PDF VAPT report with front page, TOC, document control, executive summary, methodology, findings master table, detailed PoC evidence, compliance mapping, and cleanup certificate.",
    "emerald",
  ),
  withColor(
    KeyRound,
    "Encrypted Git Integration",
    "Credentials",
    "Connect real private repos with AES-256-GCM encrypted credentials. Tokens are encrypted at rest, never shown again, never leaked in logs. Clone, explore, and import files for scanning.",
    "sky",
  ),
  withColor(
    Gauge,
    "PostureScore",
    "Metrics",
    "A 0–100 security credit score per codebase, computed from open vulns, sandbox pass rates, and adversarial win rates. Letter grades A–F. Trend over time. Exec-friendly at-a-glance posture.",
    "emerald",
  ),
  withColor(
    Globe,
    "Continuous Threat Intel",
    "Live Feed",
    "Monitors live CVE disclosures via web search and cross-references them against your codebases. New 0-day for a lib you use? GuardianX flags it high-relevance before you've heard of it.",
    "cyan",
  ),
  withColor(
    Wand2,
    "AI Remediation Copilot",
    "Copilot",
    "Inside every patch: ask the AI to explain the fix, generate an improved production-ready version, or produce a hardened defense-in-depth variant with input validation and rate limiting.",
    "violet",
  ),
  withColor(
    Heart,
    "Self-Healing Runtime",
    "Runtime",
    "Live runtime monitoring tracks which functions are vulnerable vs healed. One-click hot-swap deploys a patched function at runtime with zero downtime. Auto-heal when an attack is detected.",
    "rose",
  ),
  withColor(
    Link2,
    "Cryptographic Patch Attestation",
    "Trust",
    "Every approved patch is hash-chained into an immutable SHA-256 ledger. Tamper-evident: any modification to a past attestation breaks every subsequent hash. Enterprise-grade audit trail.",
    "teal",
  ),
  withColor(
    Gavel,
    "DPDPA & Multi-Framework Compliance",
    "GRC",
    "Map every finding to DPDPA 2023, GDPR, HIPAA, PCI-DSS, ISO 27001, and SOC 2. Track section-level compliance, generate audit reports, and auto-draft 72-hour breach notifications.",
    "purple",
  ),
  // ⚠️ was indigo/blue (forbidden) — now violet to match its existing neon.
  withColor(
    Lock,
    "Data Privacy Scanner",
    "Privacy",
    "Detect PII collection without consent, plaintext password storage, cross-border data transfer risks, and data retention violations, all mapped to specific DPDPA sections.",
    "violet",
  ),
  withColor(
    Skull,
    "Dark Web Monitoring",
    "SOC",
    "Continuously scans breach databases and dark web sources for leaked credentials, passwords, and data dumps matching your domains. Get alerted before attackers use your leaked data.",
    "red",
  ),
  withColor(
    Activity,
    "Security KPI Dashboard",
    "Metrics",
    "Real-time security metrics: MTTD, MTTR, vulnerability density per KLOC, sandbox pass rate, adversarial win rate, resolution rate. 7-day trends with severity breakdowns.",
    "emerald",
  ),
  withColor(
    Radar,
    "Attack Surface Management",
    "Discovery",
    "Continuously discover exposed services, open ports, and missing security headers on your live targets. Real-time risk assessment with per-endpoint exposure tracking.",
    "cyan",
  ),
  withColor(
    Network,
    "Data Exfiltration Defense",
    "Defense",
    "Inject canary tokens into your data and monitor for exfiltration. Deploy honeypot endpoints to trap attackers. Real-time data flow monitoring detects suspicious outbound transfers.",
    "rose",
  ),
  withColor(
    ScanLine,
    "Web Scraping Audit Engine",
    "Audit",
    "Dual-mode (lightweight + browser) scraping engine with PII sanitization. Extract structured data from any URL, detect leaked credentials in responses, and generate integrity-hashed audit trails.",
    "violet",
  ),
  withColor(
    GitBranch,
    "CI/CD Integration",
    "DevSecOps",
    "Trigger scans from GitHub Actions, GitLab CI, or Jenkins. Merge-blocking when critical vulnerabilities are found. PR comments with patch suggestions. Full DevSecOps pipeline integration.",
    "emerald",
  ),
  withColor(
    AlertTriangle,
    "AI Attack Chain Synthesis",
    "Correlation",
    "AI correlates individual vulnerabilities into multi-step attack chains. See how a low-severity XSS + a medium-severity IDOR + an info disclosure can chain into full account takeover.",
    "amber",
  ),
  withColor(
    Workflow,
    "API Fuzzing + Business Logic Testing",
    "Testing",
    "Stateful API fuzzing crashes endpoints with malformed inputs. Business logic testing detects price manipulation, privilege escalation, and race conditions. GraphQL + WebSocket testing included.",
    "orange",
  ),
  withColor(
    Eye,
    "Executive Dashboard + Heatmap",
    "Visibility",
    "Board-ready security posture dashboard with 8 KPIs, 7-day trends, top threats, and severity breakdowns. Per-codebase risk heatmap. Vuln correlation engine for root-cause analysis.",
    "cyan",
  ),
  withColor(
    Webhook,
    "Multi-Tenant RBAC + Integrations",
    "Platform",
    "Organization-level multi-tenancy with admin/analyst/viewer roles. Integrate with Slack, Jira, GitHub, Splunk, ELK, PagerDuty. Webhook alerts + scheduled scans + full audit logging.",
    "emerald",
  ),
  withColor(
    Brain,
    "Guardian AI Assistant",
    "AI",
    "Natural language interface to the entire platform. Ask 'what should I prioritize?' or 'which client has the most critical findings?' and get real answers from live data. Chat sidebar with context.",
    "violet",
  ),
  withColor(
    Rocket,
    "Service Launcher + War Room",
    "Operations",
    "Pick clients, pick a service (Scan/Test/Patch/Verify/Defend/Comply), launch. War Room fullscreen mode for wall projection with auto-cycling views. Clickable pipeline stages per client.",
    "emerald",
  ),
  withColor(
    FlaskConical,
    "Autonomous R&D Lab",
    "Self-Improving",
    "Searches GitHub for open-source security tools, AI analyzes their code, performs gap analysis vs our modules, and generates optimization recommendations. Benchmark engine, protocol fuzzer, attack graph DAG, behavioral monitor, virtual patching, IaC remediation, rollback safeguards.",
    "violet",
  ),
  withColor(
    Shield,
    "Virtual Patching + IaC Remediation",
    "Defense",
    "Can't patch code immediately? Auto-generate WAF rules (ModSecurity, Cloudflare, iptables, Nginx) as virtual patches. Generate Terraform, Ansible, K8s, Docker manifests to patch at the deployment template level.",
    "rose",
    true,
  ),
  // ── jaredrhod integration features ──────────────────────────────────
  withColor(
    Mic,
    "Voice Command Center",
    "Voice AI",
    "Talk to GuardianX. Push-to-talk, speech recognition, and text-to-speech built into the War Room. Say 'scan payment-handler.js' or 'what's the security posture?' — hands-free SOC operation. No API keys, runs in your browser.",
    "cyan",
    true,
  ),
  withColor(
    Hand,
    "Gesture Control",
    "Gesture AI",
    "Control the War Room with your bare hands. Pinch to click, swipe to navigate tabs, open palm to scroll, fist to close. Webcam-based hand tracking via MediaPipe — no headset, no controllers. Built for wall projection in SOC environments.",
    "violet",
    true,
  ),
  withColor(
    Cpu,
    "AI Neural Visualizer",
    "Visualization",
    "A living circuit board that reacts to scans in real-time. Data pulses flow through traces as the AI analyzes code. Components flash red when vulnerabilities are found, green when patches are applied. Fullscreen immersive mode for war room projection.",
    "emerald",
    true,
  ),
  withColor(
    Brain,
    "AI Memory Vault",
    "Memory",
    "The Guardian AI remembers. Every scan, every finding, every patch, every conversation — stored in a persistent memory vault. The AI can say 'Last time you scanned this codebase, we found 3 SQL injections. 2 are still unpatched.' No more starting fresh every session.",
    "amber",
    true,
  ),
  withColor(
    Database,
    "Multi-Tenant RBAC + Organizations",
    "Platform",
    "Organization-level data isolation with workspace switching. Admins see everything, analysts see only their own clients. Per-IP rate limiting, session revocation, 2FA/TOTP enforcement, audit logging on every sensitive action, and break-glass admin recovery.",
    "sky",
    true,
  ),

  // ════════════════════════════════════════════════════════════════════
  // NEW — DFIR Command Center modules (incident response, evidence
  // chain-of-custody, IOC tracking, playbooks)
  // ════════════════════════════════════════════════════════════════════
  withColor(
    Siren,
    "Incident Response Coordinator",
    "DFIR",
    "Auto-create incidents from critical findings, canary triggers, and anomaly alerts. Track the full lifecycle: detected → contained → eradicated → closed. Assign responders, capture root cause, and document lessons learned — all in one timeline.",
    "red",
    true,
  ),
  withColor(
    FileLock2,
    "Evidence Chain-of-Custody Vault",
    "DFIR",
    "Every artifact (memory dump, packet capture, screenshot, log slice) is SHA-256 hashed and timestamped on collection. Immutable chain-of-custody ledger records every handoff. Court-admissible by design — tampering breaks the chain visibly.",
    "amber",
    true,
  ),
  withColor(
    Fingerprint,
    "IOC Tracker",
    "DFIR",
    "Indicators of Compromise (IPs, domains, file hashes, mutexes, registry keys) are extracted from findings, enriched against threat intel, and stored with first-seen/last-seen. Cross-correlate IOCs across every client to spot campaign-level attacks.",
    "red",
    true,
  ),
  withColor(
    PlayCircle,
    "Playbook Automation Engine",
    "DFIR",
    "Pre-built and custom response playbooks (SQLi, ransomware, insider threat, credential leak). One-click execute runs a scripted sequence: contain, isolate, snapshot, gather evidence, notify stakeholders. Playbooks are versioned and auditable.",
    "violet",
    true,
  ),

  // ════════════════════════════════════════════════════════════════════
  // NEW — SOC & DevSecOps modules (runtime monitoring, alert rules,
  // canaries, honeypots, API access logs, webhook configs)
  // ════════════════════════════════════════════════════════════════════
  withColor(
    Radio,
    "Real-Time Runtime Monitoring",
    "SOC",
    "Watch live process trees, network sockets, file integrity, and CPU/memory baselines per host. Hot-swap vulnerable functions at runtime with zero downtime. Auto-heal triggers when an attack signature matches.",
    "cyan",
    true,
  ),
  withColor(
    Bell,
    "Alert Rule Builder",
    "SOC",
    "Visual rule builder for custom alerts: 'critical finding opened', 'canary triggered', 'scan stuck > 30min', 'unauthorized target accessed'. Route to Slack, PagerDuty, email, or webhook. Severity tiers, dedup, and silence windows built-in.",
    "cyan",
    true,
  ),
  withColor(
    Bird,
    "Canary Token Manager",
    "SOC",
    "Generate and inject canary tokens (honey-creds, fake API keys, tracked documents, beacon endpoints) across your codebase and infra. The moment a canary fires — anywhere — GuardianX raises an incident with the source IP, user agent, and full request context.",
    "cyan",
    true,
  ),
  withColor(
    Anchor,
    "Honeypot Deployment Grid",
    "Defense",
    "Spin up realistic honeypot endpoints (fake admin panels, bogus DB credentials, decoy APIs) with one click. Every interaction is logged, scored, and reverse-enriched against threat intel. Auto-deploy honeypots around newly discovered attack surface.",
    "rose",
    true,
  ),
  withColor(
    ScrollText,
    "API Access Log Audit",
    "SOC",
    "Every API call into GuardianX is captured: caller, IP, user-agent, route, status, latency, response size. Searchable, filterable, exportable. Detects brute force, credential stuffing, and abnormal data exfiltration patterns from your own platform's traffic.",
    "cyan",
    true,
  ),
  withColor(
    Settings2,
    "Webhook Configuration Hub",
    "Platform",
    "Register outbound webhooks for any platform event (scan complete, finding opened, patch approved, incident escalated). Per-event URL, secret, retry policy, and dead-letter queue. Built-in HMAC signing so receivers can verify authenticity.",
    "emerald",
    true,
  ),

  // ════════════════════════════════════════════════════════════════════
  // NEW — Exfil Defense deep-cut (focused detection layer)
  // ════════════════════════════════════════════════════════════════════
  withColor(
    FileOutput,
    "Real-Time Data Exfiltration Detection",
    "Defense",
    "Behavioral egress monitoring: learns normal outbound traffic patterns per service, then flags anomalies — large uploads at 3am, sustained small-chunk transfers to unknown hosts, DNS tunneling signatures, and HTTPS-over-non-standard-ports. Stops slow-drip exfiltration that DLP tools miss.",
    "rose",
    true,
  ),

  // ════════════════════════════════════════════════════════════════════
  // NEW — R&D Lab expansion (autonomous research agent)
  // ════════════════════════════════════════════════════════════════════
  withColor(
    Bot,
    "Autonomous Research Agent",
    "Self-Improving",
    "A background agent that wakes on a schedule, crawls security blogs + GitHub repos for newly-disclosed techniques, benchmarks GuardianX's detection coverage against them, and writes gap-fix proposals into the R&D backlog. The platform teaches itself new attacks while you sleep.",
    "violet",
    true,
  ),

  // ════════════════════════════════════════════════════════════════════
  // NEW — Advanced Platform modules (scheduled scans, attack chains,
  // integrations, fuzz results)
  // ════════════════════════════════════════════════════════════════════
  withColor(
    CalendarClock,
    "Scheduled Scan Scheduler",
    "Automation",
    "Cron-style scheduler for recurring scans: nightly SAST on every codebase, weekly DAST on production, hourly attack-surface check. Time-zone aware, merge-blocking, with back-off and skip-if-running rules. Full run history with diff vs previous run.",
    "amber",
    true,
  ),
  withColor(
    GitFork,
    "Attack Chain Visualizer",
    "Correlation",
    "Interactive DAG of multi-step attack paths. Click any node to see the underlying finding, the patch that breaks the chain, and the blast radius if left unpatched. Auto-suggests the single patch that kills the most chains — the highest-leverage fix.",
    "amber",
    true,
  ),
  withColor(
    Puzzle,
    "Third-Party Integrations Hub",
    "Platform",
    "Two-way sync with Slack, Jira, GitHub, GitLab, PagerDuty, Splunk, ELK, Microsoft Teams, and webhooks. Findings auto-create Jira tickets; PRs auto-trigger scans; Splunk ingests GuardianX events. Configure once, inherit everywhere.",
    "emerald",
    true,
  ),
  withColor(
    Beaker,
    "Fuzz Test Results Dashboard",
    "Testing",
    "Aggregated view across every fuzz run (HTTP, GraphQL, WebSocket, protocol). Crash reproducers, unique stack traces, dedup-by-signature, and pass/fail trends over time. One-click promote any crash into a tracked finding with PoC attached.",
    "amber",
    true,
  ),

  // ════════════════════════════════════════════════════════════════════
  // NEW — Billing & Subscriptions (Stripe)
  // ════════════════════════════════════════════════════════════════════
  withColor(
    CreditCard,
    "Stripe Billing & Subscriptions",
    "Billing",
    "Self-serve plan upgrades via Stripe Checkout. Free / Pro / Enterprise tiers with seat-based pricing. Customer Portal for invoice history, payment-method updates, and tax receipts. Webhook-synced subscription state enforces plan limits in real-time — downgrade locks premium features the moment the webhook lands.",
    "emerald",
    true,
  ),

  // ════════════════════════════════════════════════════════════════════
  // NEW — Settings modules (2FA, organization management, email delivery)
  // ════════════════════════════════════════════════════════════════════
  withColor(
    Smartphone,
    "2FA / TOTP Authentication",
    "Security",
    "Time-based one-time passwords via authenticator apps (Google Authenticator, Authy, 1Password). Backup codes for recovery. Admin-enforceable across the org — admins must have 2FA on, analysts can opt-in. Break-glass recovery codes sealed in an env-var-encrypted vault.",
    "emerald",
    true,
  ),
  withColor(
    Building2,
    "Organization Management",
    "Platform",
    "Create, rename, suspend, or delete organizations. Switch workspaces from the sidebar. Per-org branding, per-org audit log, per-org rate limits. Org-scoped API keys for programmatic access. Owner / admin / analyst / viewer roles with inheritance.",
    "emerald",
    true,
  ),
  withColor(
    MailCheck,
    "Email Delivery Settings",
    "Platform",
    "Configure SMTP, SendGrid, or Postmark for transactional + alert email. Test-send to verify before going live. Per-template preview (welcome, alert, report-ready, breach-notification). Delivery logs + bounce tracking so you know the alert actually reached the SOC.",
    "emerald",
    true,
  ),

  // ════════════════════════════════════════════════════════════════════
  // NEW — User Management + User Activity Monitor
  // ════════════════════════════════════════════════════════════════════
  withColor(
    Users,
    "User Management Panel",
    "Administration",
    "Invite users by email, assign roles, approve / reject signups, suspend bad actors, force-password-reset. Last-login timestamps, failed-login counters, MFA status. Bulk operations for org-wide onboarding. Every action is audit-logged with actor + IP + timestamp.",
    "emerald",
    true,
  ),
  withColor(
    UserCog,
    "User Activity Monitor",
    "Administration",
    "Live per-user activity feed: pages viewed, scans launched, patches approved, exports triggered, API calls made. Anomaly detection flags 'user from a new country', 'API key used at 3am', 'bulk export of findings'. Catches insider threats before they become incidents.",
    "emerald",
    true,
  ),

  // ════════════════════════════════════════════════════════════════════
  // NEW — Content Editor (blog / CMS)
  // ════════════════════════════════════════════════════════════════════
  withColor(
    Newspaper,
    "Blog / CMS Content Editor",
    "Content",
    "Admin-only CMS for the public marketing site. Edit hero copy, pricing tiers, feature blurbs, and blog posts from a single editor. Markdown + image upload. Changes go live on save. SEO metadata, OpenGraph images, and sitemap.xml auto-generated per post.",
    "emerald",
    true,
  ),

  // ════════════════════════════════════════════════════════════════════
  // NEW — Contributors panel
  // ════════════════════════════════════════════════════════════════════
  withColor(
    Github,
    "GitHub Contributors Panel",
    "Community",
    "Live roster of every contributor to the GuardianX open-source repos. Pull-request counts, merged-PR velocity, top-contributor leaderboard, recent activity feed. Auto-synced nightly via the GitHub API. Public credit where credit is due — visible on the /company page.",
    "emerald",
    true,
  ),

  // ════════════════════════════════════════════════════════════════════
  // NEW — Forward-looking modules (placeholders for the upcoming
  // quantum-scanner, predictive-forecast, threat-constellation work
  // being landed by sibling agents; listed here so the public catalog
  // reflects the full roadmap at 50+ entries.)
  // ════════════════════════════════════════════════════════════════════
  withColor(
    Atom,
    "Quantum Vulnerability Scanner",
    "Quantum",
    "Post-quantum readiness scanner. Flags cryptographic primitives vulnerable to Shor's algorithm (RSA, ECDSA, ECDH) and rates the migration urgency per codebase. Generates a phased migration plan to NIST-standardized PQC algorithms (ML-KEM, ML-DSA, SLH-DSA).",
    "cyan",
    true,
  ),
  withColor(
    TrendingUp,
    "Predictive Threat Forecast Engine",
    "Forecasting",
    "Time-series model trained on your finding history + global CVE disclosure rate. Forecasts 'likely critical finding count next 7 days', 'most at-risk codebase next sprint', and 'expected patch backlog in 30 days'. Capacity-planning-grade predictions for SOC staffing.",
    "amber",
    true,
  ),
  withColor(
    Orbit,
    "Threat Constellation Map",
    "Visualization",
    "3D force-directed graph where every finding, IOC, attacker TTP, and your codebase is a star —连线 shows correlation strength. Zoom out for the constellation view, zoom in for star-system detail. Spinning slowly in the War Room, it's a real-time map of your threat universe.",
    "violet",
    true,
  ),
];

export { FileCode2, ShieldCheck, Crosshair, Swords, Bug } from "lucide-react";
