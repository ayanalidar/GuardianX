// Agent X — Platform Knowledge Base + Intent Parser
// ─────────────────────────────────────────────────────────────────────────
// This module gives Agent X complete knowledge of the GuardianX platform:
// every feature, every tab, every intent a user might express in chat or
// voice. It is pure TypeScript (no LLM, no DB) so it runs in <1ms and
// never fails.
//
// Used by:
//   - /api/agent-x/chat    → parseIntent() + buildKnowledgeContext()
//   - /api/agent-x/briefing → TABS for tab-aware suggestions
//   - /api/agent-x/context  → TABS + TAB_SUGGESTIONS for context-aware tips
//
// Catalog sources (kept in sync with the UI):
//   - FEATURES  → from @/components/sentinel/landing/features-data
//   - TABS      → mirrors the sidebar in src/app/page.tsx (23 tabs)
//   - INTENT_PATTERNS → regex patterns for natural language intent

import { FEATURES } from "@/components/sentinel/landing/features-data";

// ─── Types ────────────────────────────────────────────────────────────────

export interface PlatformFeature {
  title: string;
  category: string;
  desc: string;
}

export interface TabInfo {
  key: string;
  label: string;
  description: string;
  /** What you can do there — a short imperative sentence. */
  canDo: string;
  /** Aliases that should resolve to this tab when the user says them. */
  aliases: string[];
}

export interface ParsedIntent {
  intent:
    | "navigate"
    | "scan"
    | "approve"
    | "status"
    | "explain"
    | "suggest"
    | "greet"
    | "search"
    | "help"
    | "war_room"
    | "unknown";
  target?: string;
  query?: string;
  raw: string;
}

export interface IntentPattern {
  intent: ParsedIntent["intent"];
  pattern: RegExp;
  /** Extractor: receives the regex match, returns { target?, query? }. */
  extract: (m: RegExpMatchArray, raw: string) => { target?: string; query?: string };
}

// ─── Platform features (re-exported with a trimmed shape) ─────────────────

export const PLATFORM_FEATURES: PlatformFeature[] = FEATURES.map((f) => ({
  title: f.title,
  category: f.category,
  desc: f.desc,
}));

// ─── Tabs (mirrors src/app/page.tsx sidebar — 23 tabs) ────────────────────

export const TABS: TabInfo[] = [
  {
    key: "dashboard",
    label: "Overview",
    description: "Command overview — top-line metrics, threat level, live activity feed, pipeline stages per client.",
    canDo: "View your security posture at a glance, see active scans + pending patches, jump into any client.",
    aliases: ["overview", "dashboard", "home", "main", "command center", "command overview", "command-overview"],
  },
  {
    key: "clients",
    label: "All Clients",
    description: "Every client you protect, with their codebases, targets, findings, patch queue, and compliance status.",
    canDo: "Add clients, drill into a specific client, see per-client critical findings and pending patches.",
    aliases: ["clients", "client", "all clients", "customer", "customers", "tenant", "tenants"],
  },
  {
    key: "pipelines",
    label: "Pipelines",
    description: "Active SAST + DAST pipelines with live stage events — scanning, patching, sandboxing, attesting.",
    canDo: "Watch live scans progress stage-by-stage, see real-time pipeline events, kill stuck scans.",
    aliases: ["pipelines", "pipeline", "active pipelines", "scan pipeline", "stages"],
  },
  {
    key: "patches",
    label: "Patch Queue",
    description: "Every AI-generated patch awaiting human approval — sorted by severity with sandbox pass + adversarial results.",
    canDo: "Review patch diffs, approve/reject patches, view PoC exploits, generate PRs, view patch lineage.",
    aliases: ["patches", "patch", "patch queue", "pending patches", "patch review", "patching", "approval", "approve"],
  },
  {
    key: "codebases",
    label: "Codebases",
    description: "All source codebases under scan — name, language, source code, last scan, finding count.",
    canDo: "Add codebases from URL or paste, browse source, run a SAST scan, view scan history.",
    aliases: ["codebases", "codebase", "source code", "code", "repo", "repos", "repository", "repositories"],
  },
  {
    key: "redagent",
    label: "RedAgent VAPT",
    description: "Autonomous DAST penetration testing — RedAgent crawls a target, plans category-appropriate attacks, fires real HTTP payloads, confirms exploitation.",
    canDo: "Start a DAST engagement against an authorized target, watch the attack plan unfold, view confirmed findings with PoC.",
    aliases: ["redagent", "red agent", "dast", "vapt", "pentest", "pen test", "penetration", "red team", "engagement", "attacker"],
  },
  {
    key: "compliance",
    label: "Compliance",
    description: "DPDPA, GDPR, HIPAA, PCI-DSS, ISO 27001, SOC 2 mapping — section-level compliance, audit reports, breach notifications.",
    canDo: "Map findings to compliance frameworks, see section-level gaps, generate audit reports, draft breach notifications.",
    aliases: ["compliance", "grc", "dpdpa", "gdpr", "hipaa", "pci", "iso", "soc2", "soc 2", "audit", "regulation"],
  },
  {
    key: "soc",
    label: "SOC & DevSecOps",
    description: "Runtime monitoring, alert rules, canaries, honeypots, API access logs, webhook configs, scheduled scans.",
    canDo: "Watch live process trees, build alert rules, deploy honeypots, configure webhooks, schedule recurring scans.",
    aliases: ["soc", "devsecops", "dev sec ops", "security operations", "runtime", "monitor", "alert", "canary", "honeypot", "siem"],
  },
  {
    key: "exfil",
    label: "Exfil Defense",
    description: "Behavioral egress monitoring, canary token injection, honeypot endpoints, real-time data flow analysis.",
    canDo: "Deploy canary tokens, watch outbound traffic anomalies, deploy honeypot endpoints, see exfil alerts.",
    aliases: ["exfil", "exfiltration", "data loss", "dlp", "canary", "data exfil", "egress"],
  },
  {
    key: "scraper",
    label: "Audit Scraper",
    description: "Dual-mode (lightweight + browser) scraping engine with PII sanitization + credential leak detection in responses.",
    canDo: "Scrape any URL for leaked secrets + PII, generate integrity-hashed audit trails, switch to headless-browser mode.",
    aliases: ["scraper", "scrape", "audit scraper", "scraping", "audit scraping", "crawl", "scraping engine"],
  },
  {
    key: "dfir",
    label: "DFIR Command",
    description: "Incident response coordinator, evidence chain-of-custody vault, IOC tracker, playbook automation engine.",
    canDo: "Open + track incidents, gather evidence with SHA-256 chain of custody, track IOCs, execute response playbooks.",
    aliases: ["dfir", "incident", "incidents", "forensics", "incident response", "evidence", "ioc", "iocs", "playbook", "chain of custody"],
  },
  {
    key: "rnd",
    label: "R&D Lab",
    description: "Autonomous research agent, benchmark engine, protocol fuzzer, attack graph DAG, behavioral monitor, virtual patching, IaC remediation.",
    canDo: "Let the autonomous agent research new attacks, run benchmarks, fuzz protocols, generate virtual patches + IaC manifests.",
    aliases: ["rnd", "r&d", "research", "lab", "rd lab", "r and d", "benchmark", "fuzzer", "protocol fuzzer", "research agent"],
  },
  {
    key: "advanced",
    label: "Advanced Platform",
    description: "Advanced platform modules — predictive risk scoring, anomaly detection, threat briefing, attack graph DAG, virtual patching.",
    canDo: "See advanced analytics, predict attack vectors, detect anomalies, view attack graphs, generate virtual patches.",
    aliases: ["advanced", "advanced platform", "predictive risk", "anomaly", "threat briefing", "attack graph"],
  },
  {
    key: "forecast",
    label: "Predictive Forecast",
    description: "Time-series model trained on your finding history + global CVE disclosure rate — predicts likely critical finding count next 7 days, at-risk codebase, expected backlog.",
    canDo: "Predict your next likely attack vector, forecast patch backlog, see at-risk codebase next sprint.",
    aliases: ["forecast", "predictive forecast", "predict", "prediction", "predictive threat", "forecasting"],
  },
  {
    key: "quantum",
    label: "Quantum Scanner",
    description: "Post-quantum readiness scanner — flags RSA/ECDSA/ECDH and rates migration urgency per codebase. Generates a phased PQC migration plan.",
    canDo: "Scan your crypto primitives for quantum vulnerability, see migration urgency, generate a PQC migration plan.",
    aliases: ["quantum", "post-quantum", "pqc", "shor", "quantum scanner", "quantum-safe", "quantum vulnerable"],
  },
  {
    key: "constellation",
    label: "Threat Constellation",
    description: "3D force-directed graph where every finding, IOC, attacker TTP, and codebase is a star — connection lines show correlation strength.",
    canDo: "Visualize your threat universe as a 3D constellation, zoom into star systems, find correlated attack chains.",
    aliases: ["constellation", "threat constellation", "threat map", "3d map", "constellation map", "threat universe"],
  },
  {
    key: "modules",
    label: "All Modules",
    description: "Every GuardianX module (60+) catalogued with icon, category, and description — the index of the whole platform.",
    canDo: "Browse all 60+ modules, filter by category, click any module to navigate to its tab.",
    aliases: ["modules", "all modules", "module list", "catalog", "features", "all features"],
  },
  {
    key: "billing",
    label: "Billing",
    description: "Stripe-powered subscription management — Free / Pro / Enterprise tiers, customer portal, webhook-synced state.",
    canDo: "Upgrade plan, view invoices, update payment methods, see plan usage vs limits.",
    aliases: ["billing", "subscription", "stripe", "plan", "upgrade", "invoice", "pricing"],
  },
  {
    key: "settings",
    label: "Settings",
    description: "2FA / TOTP, SMTP email delivery, organization management, API keys, session revocation, break-glass recovery.",
    canDo: "Enable 2FA, configure SMTP, manage organizations, rotate API keys, revoke sessions.",
    aliases: ["settings", "setting", "2fa", "totp", "smtp", "email delivery", "api key", "api keys", "config", "configuration"],
  },
  {
    key: "users",
    label: "User Management",
    description: "Invite users, assign roles, approve/reject signups, suspend bad actors, force-password-reset. Admin-only.",
    canDo: "Invite users, approve signups, suspend accounts, view last-login timestamps, enforce 2FA org-wide.",
    aliases: ["users", "user management", "user", "members", "team", "accounts", "signup", "signups"],
  },
  {
    key: "user-activity",
    label: "User Activity",
    description: "Live per-user activity feed with anomaly detection — page views, scans, patches, exports, API calls.",
    canDo: "Watch what every user is doing in real time, detect anomalies like 'bulk export at 3am', catch insider threats.",
    aliases: ["user activity", "activity monitor", "user monitor", "audit user", "user actions"],
  },
  {
    key: "content",
    label: "Content Editor",
    description: "Admin-only CMS for the public marketing site — hero copy, pricing, blog posts, SEO metadata. Changes go live on save.",
    canDo: "Edit marketing site copy, write blog posts, upload images, manage SEO metadata.",
    aliases: ["content", "content editor", "cms", "blog", "blog post", "marketing", "edit content"],
  },
  {
    key: "contributors",
    label: "Contributions",
    description: "Live roster of every GuardianX contributor — PR counts, merged-PR velocity, top-contributor leaderboard, recent activity.",
    canDo: "View contributor leaderboard, see recent contributions, sync from GitHub.",
    aliases: ["contributors", "contributions", "contribution", "github", "leaderboard", "open source"],
  },
];

// ─── Tab lookup helpers ──────────────────────────────────────────────────

const TAB_ALIASES = new Map<string, string>();
for (const tab of TABS) {
  for (const alias of tab.aliases) {
    TAB_ALIASES.set(alias.toLowerCase().trim(), tab.key);
  }
}

/** Resolve a free-text tab reference (e.g. "patch queue", "patches", "the patches tab")
 *  to a tab key. Returns null if no match. */
export function resolveTab(text: string): string | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  // Exact alias match first.
  const exact = TAB_ALIASES.get(t);
  if (exact) return exact;
  // Substring match: any alias contained in the text.
  for (const [alias, key] of TAB_ALIASES) {
    if (t.includes(alias)) return key;
  }
  return null;
}

// ─── Intent patterns ─────────────────────────────────────────────────────
//
// Order matters: the FIRST matching pattern wins. So we put more specific
// patterns (scan <target>, approve <id>) before more general ones
// (navigate <target>, plain "hello"). All patterns operate on
// lower-cased, single-spaced input.

export const INTENT_PATTERNS: IntentPattern[] = [
  // ── War Room ──
  {
    intent: "war_room",
    pattern: /\b(war\s*room|war-room|activate gesture|gesture control|open war room|enter war room)\b/,
    extract: () => ({}),
  },

  // ── Approve (specific patch id) ──
  {
    intent: "approve",
    pattern: /\b(?:approve|accept|sign[\s-]?off|green[\s-]?light|ok|okay|yes|confirm)\s+(?:patch\s+)?((?:SP|Patch|patch)?[-\s]?\d{3,}[a-z0-9-]*)/i,
    extract: (m) => ({ target: (m[1] || "").trim().replace(/\s+/g, "-") }),
  },
  // ── Approve (last / most-recent / latest patch) ──
  {
    intent: "approve",
    pattern: /\b(?:approve|accept|sign[\s-]?off|green[\s-]?light)\s+(?:the\s+)?(?:last|most recent|latest|newest|top|next|first)\s+(?:patch|fix|update|change)\b/i,
    extract: () => ({ target: "last" }),
  },
  // ── Approve all patches ──
  {
    intent: "approve",
    pattern: /\b(?:approve|accept|sign[\s-]?off)\s+(?:all|every|each)\s+(?:patch|fix|update)s?\b/i,
    extract: () => ({ target: "all" }),
  },

  // ── Scan (target = codebase name) ──
  {
    intent: "scan",
    pattern: /\b(?:scan|run[\s-]+a[\s-]+scan|start[\s-]+a[\s-]+scan|kick[\s-]+off[\s-]+a[\s-]+scan|begin[\s-]+scan|re-?scan|sast(?:\s+scan)?)\s+(?:the\s+|codebase\s+|repo\s+|file\s+)?(.+)/i,
    extract: (m) => ({ target: (m[2] || m[1] || "").trim() }),
  },
  // ── Scan (bare — "scan", "run a scan") ──
  {
    intent: "scan",
    pattern: /^\s*(?:scan|run[\s-]+a[\s-]+scan|start[\s-]+a[\s-]+scan)\s*$/i,
    extract: () => ({}),
  },

  // ── Search findings ──
  {
    intent: "search",
    pattern: /\b(?:search|find|look\s+up|query|filter|grep|lookup)\s+(?:findings?\s+(?:for|containing|matching|about|on|in)\s+|vulns?\s+(?:for|named|matching)\s+|vulnerabilities?\s+(?:for|named|matching)\s+)?(.+)/i,
    extract: (m) => ({ query: (m[1] || "").trim() }),
  },
  // ── Find critical/high severity findings ──
  {
    intent: "search",
    pattern: /\b(?:find|show|list|get)\s+(all\s+|the\s+)?(critical|high|medium|low|info)\s+(?:vulnerabilit(?:y|ies)|vulns?|findings?|issues?)/i,
    extract: (m) => ({ query: (m[2] || "").trim().toLowerCase() }),
  },

  // ── Status / posture ──
  {
    intent: "status",
    pattern: /\b(?:what(?:'s| is|s)\s+(?:our|the)\s+(?:security\s+)?posture|security posture|posture report|status report|status brief(?:ing)?|threat level|how are we doing|how'?s?\s+(?:our\s+)?security|give me a status|sitrep|situation report|overall health|security health|security status)\b/i,
    extract: () => ({}),
  },

  // ── Suggest / recommend ──
  {
    intent: "suggest",
    pattern: /\b(?:what should i do|what next|what'?s next|suggest(?:ion)?s?|recommend(?:ation)?s?|what'?s the priority|what'?s the priority|priorities?|what do you recommend|next steps?|what to do|advice|guidance|where should i start|what'?s my top priority)\b/i,
    extract: () => ({}),
  },

  // ── Explain (topic) ──
  {
    intent: "explain",
    pattern: /\b(?:explain|what is|what are|what'?s|tell me about|describe|define|how does|how do)\s+(?:a\s+|an\s+|the\s+)?(.+)/i,
    extract: (m, raw) => {
      const topic = (m[1] || "").trim().replace(/[?.!]+$/g, "");
      // If the topic is really a tab name, treat it as navigate instead.
      if (resolveTab(topic)) return {};
      return { target: topic };
    },
  },

  // ── Help ──
  {
    intent: "help",
    pattern: /^\s*(?:help|what can you do|what do you do|who are you|what are you|capabilities|commands?|how do (?:i|you) (?:use|work) you)\s*$/i,
    extract: () => ({}),
  },
  {
    intent: "help",
    pattern: /\bhelp me\b/i,
    extract: () => ({}),
  },

  // ── Greet ──
  {
    intent: "greet",
    pattern: /^\s*(?:hi|hello|hey|yo|sup|hiya|howdy|greetings|good (?:morning|afternoon|evening)|gm|gn)\b/i,
    extract: () => ({}),
  },
  {
    intent: "greet",
    pattern: /\b(?:hey|hi|hello)\s+(?:agent\s*x|guardian|x)\b/i,
    extract: () => ({}),
  },
];

// ─── parseIntent (pure, no LLM, no DB) ────────────────────────────────────

export function parseIntent(message: string): ParsedIntent {
  const raw = (message || "").trim();
  const normalized = raw.toLowerCase().replace(/\s+/g, " ");

  if (!normalized) {
    return { intent: "unknown", raw };
  }

  // Try each intent pattern in order.
  for (const p of INTENT_PATTERNS) {
    const m = normalized.match(p.pattern);
    if (m) {
      const { target, query } = p.extract(m, raw);
      // Special case: explain-with-tab → navigate.
      if (p.intent === "explain" && !target) {
        // extract() returned empty because the topic was a tab name.
        // Re-resolve from the raw text.
        const tabKey = resolveTab(normalized.replace(/^.*?(what is|what's|explain|tell me about|describe|define)\s+/i, "").trim());
        if (tabKey) {
          return { intent: "navigate", target: tabKey, raw };
        }
      }
      return { intent: p.intent, target, query, raw };
    }
  }

  // No specific pattern matched. Check if the message contains a tab alias
  // (e.g. "show me patches", "open the patch queue", "take me to billing").
  const navMatch = normalized.match(/\b(?:show|go to|open|switch to|view|take me to|jump to|navigate to|visit|see)\s+(?:the\s+|my\s+)?(.+)/i);
  if (navMatch && navMatch[1]) {
    const tabKey = resolveTab(navMatch[1]);
    if (tabKey) {
      return { intent: "navigate", target: tabKey, raw };
    }
    // Bare "show me <something>" without a tab match — treat as navigate.
    return { intent: "navigate", target: navMatch[1].trim(), raw };
  }

  // Bare tab alias anywhere in the message → navigate.
  const tabKey = resolveTab(normalized);
  if (tabKey) {
    return { intent: "navigate", target: tabKey, raw };
  }

  // "show patches" / "open quantum" / etc. style.
  const bareTabMatch = normalized.match(/\b(?:patches?|quantum|constellation|forecast|exfil|dfir|compliance|redagent|vapt|billing|settings|users?)\b/);
  if (bareTabMatch) {
    const key = resolveTab(bareTabMatch[0]);
    if (key) return { intent: "navigate", target: key, raw };
  }

  return { intent: "unknown", raw };
}

// ─── Knowledge context (for the LLM system prompt) ───────────────────────

export function buildKnowledgeContext(): string {
  const featureSummary = PLATFORM_FEATURES.slice(0, 30)
    .map((f, i) => `  ${i + 1}. ${f.title} [${f.category}] — ${f.desc.slice(0, 120)}${f.desc.length > 120 ? "…" : ""}`)
    .join("\n");
  const tabSummary = TABS.map(
    (t) => `  • ${t.key} (${t.label}) — ${t.canDo}`,
  ).join("\n");

  return [
    "You are Agent X, the autonomous AI security operations assistant for the GuardianX platform.",
    "You have full knowledge of the platform's 60+ modules and 23 sidebar tabs.",
    "You can navigate to any tab, start scans, approve patches, explain vulnerabilities, search findings, and brief the user on security posture.",
    "Your responses must be conversational, reference real platform data provided to you, and NEVER say 'I don't have access to that' — always answer or offer to navigate to the relevant tab.",
    "",
    "PLATFORM TABS (you can navigate to any of these):",
    tabSummary,
    "",
    "PLATFORM FEATURES (top 30 of " + PLATFORM_FEATURES.length + " total):",
    featureSummary,
    "",
    "INTENT HANDLING:",
    "If the user wants to navigate → respond naturally + include an action object {type: 'navigate', target: <tab key>}.",
    "If the user wants to scan a codebase → {type: 'scan', target: <codebase name>}.",
    "If the user wants to approve a patch → {type: 'approve', target: <patch id or 'last'/'all'>}.",
    "If the user wants to search findings → {type: 'search', query: <term>}.",
    "Always reference the real platform state (counts, finding titles, patch IDs) provided in the user context.",
    "Keep responses concise (1-3 sentences) unless the user explicitly asks for detail.",
  ].join("\n");
}

// ─── Common security topics for the `explain` intent ────────────────────
//
// When the heuristic fallback handles an `explain` intent, it looks the
// topic up here. If found, it returns the templated explanation. If not
// found, it returns a generic "I can navigate you to the <topic> tab" reply.

export interface SecurityTopic {
  keywords: string[];
  title: string;
  explanation: string;
  remediation: string;
  cwe?: string;
}

export const SECURITY_TOPICS: SecurityTopic[] = [
  {
    keywords: ["sql injection", "sqli", "sql"],
    title: "SQL Injection",
    cwe: "CWE-89",
    explanation:
      "SQL injection happens when user input is concatenated directly into a SQL query instead of being parameterized. An attacker can break out of the intended query and execute arbitrary SQL — read any table, modify data, drop the database, or in some cases get RCE via stacked queries or file-write primitives like INTO OUTFILE.",
    remediation:
      "Use parameterized queries (prepared statements) everywhere — never string-concat user input into SQL. In Node.js, use `db.query('SELECT * FROM users WHERE id = $1', [id])` not `db.query('SELECT * FROM users WHERE id = ' + id)`. Validate input types and enforce least-privilege DB credentials so a successful injection can't reach sensitive tables.",
  },
  {
    keywords: ["xss", "cross site scripting", "cross-site scripting", "script injection"],
    title: "Cross-Site Scripting (XSS)",
    cwe: "CWE-79",
    explanation:
      "XSS happens when user-controlled input is rendered into the page without escaping. An attacker can inject a <script> tag that runs in another user's browser, stealing their session cookie, performing actions as them, or redirecting them to a phishing page. Stored XSS persists in the DB; reflected XSS comes from a URL parameter; DOM XSS runs purely client-side.",
    remediation:
      "Escape output by default — render text as text, not HTML. Use a templating engine with auto-escaping (React's JSX does this by default). For places where you must render HTML, use a sanitization library like DOMPurify. Set a strict Content-Security-Policy header that blocks inline scripts. Mark session cookies as HttpOnly so JavaScript can't read them.",
  },
  {
    keywords: ["csrf", "cross site request forgery", "cross-site request forgery", "xsrf"],
    title: "Cross-Site Request Forgery (CSRF)",
    cwe: "CWE-352",
    explanation:
      "CSRF happens when an attacker tricks a logged-in user's browser into making a request to your app that performs a state-changing action (transfer money, change password, delete account). The browser includes the user's session cookie automatically, so the request looks legitimate to the server.",
    remediation:
      "Require an anti-CSRF token on every state-changing request — a random value the server knows belongs to the user, embedded in a hidden form field or a custom header. SameSite=Lax (or Strict) cookies also block most CSRF attacks. For APIs, require a custom header like X-Requested-With which browsers won't send in a plain form submission.",
  },
  {
    keywords: ["ssrf", "server side request forgery", "server-side request forgery"],
    title: "Server-Side Request Forgery (SSRF)",
    cwe: "CWE-918",
    explanation:
      "SSRF happens when your server fetches a URL the user supplies without validating it. An attacker can make your server fetch http://169.254.169.254/latest/meta-data/ (AWS instance metadata — which contains IAM credentials), http://localhost:6379/ (Redis), or hit internal-only admin endpoints. The request comes from your server, so internal firewalls don't block it.",
    remediation:
      "Maintain an allowlist of permitted hostnames and reject everything else. Resolve the hostname yourself and block private IP ranges (10.x, 192.168.x, 172.16-31.x, 127.x, 169.254.x, ::1, fc00::/7) — also block DNS rebinding by re-checking the IP right before connecting. Disable HTTP redirects or re-validate after each redirect. Run the fetcher in a network-isolated sandbox with no access to internal services.",
  },
  {
    keywords: ["idor", "insecure direct object reference", "broken access control", "object reference"],
    title: "Insecure Direct Object Reference (IDOR)",
    cwe: "CWE-639",
    explanation:
      "IDOR happens when your app uses an object identifier from the URL/request (e.g. /api/orders/123) but doesn't verify the requesting user owns that object. An attacker just increments the ID (124, 125, …) and reads every other user's data. It's the #1 most common API vulnerability on the OWASP API Top 10.",
    remediation:
      "On every object access, verify ownership: `SELECT * FROM orders WHERE id = ? AND user_id = ?` not just `WHERE id = ?`. Use unguessable identifiers (UUIDs) instead of sequential integers to reduce enumeration, but don't rely on UUIDs alone — verify ownership server-side. Centralize authorization checks in middleware, not in each route handler.",
  },
  {
    keywords: ["rce", "remote code execution", "command injection", "code injection", "os command"],
    title: "Remote Code Execution (RCE)",
    cwe: "CWE-77 / CWE-94",
    explanation:
      "RCE is the worst-case vulnerability — an attacker can run arbitrary code on your server. Causes: shell command injection (passing user input to exec()), eval() of user input, deserialization of untrusted data, server-side template injection (SSTI), or file upload + path traversal that writes a .php/.js file into a served directory.",
    remediation:
      "Never pass user input to shell commands — use parameterized APIs (execFile with args array, not exec with a string). Never eval() user input. For deserialization, use safe formats (JSON, Protobuf) and avoid language-native deserializers. For file uploads, store them OUTSIDE the webroot with random names, validate MIME types server-side, and disable script execution in the upload directory.",
  },
  {
    keywords: ["lfi", "local file inclusion", "path traversal", "directory traversal", "file inclusion"],
    title: "Path Traversal / Local File Inclusion (LFI)",
    cwe: "CWE-22",
    explanation:
      "Path traversal happens when user input is used to construct a file path without sanitization. An attacker passes ../../etc/passwd or ..\\..\\windows\\win.ini and your server happily reads the file. LFI is the variant where the traversed file is included/executed (e.g. PHP include(), Node require()) — this often escalates to RCE.",
    remediation:
      "Never trust user input for file paths. Use an allowlist of permitted filenames, or generate the path from a server-side ID. If you must accept a user filename, sanitize aggressively: reject any path containing '..', '/', '\\', or null bytes. Use path.resolve() + verify the resolved path starts with the allowed base directory (path.relative(base, resolved) shouldn't start with '..').",
  },
  {
    keywords: ["rfi", "remote file inclusion"],
    title: "Remote File Inclusion (RFI)",
    cwe: "CWE-98",
    explanation:
      "RFI is the more dangerous sibling of LFI: the server fetches and includes a file from a URL the attacker controls. The attacker hosts a PHP/Node file on their server, your app fetches and executes it — instant RCE. Most common in PHP apps with allow_url_include=On and Node apps with dynamic require() of a URL.",
    remediation:
      "Never include/require/eval a URL. Disable allow_url_include in PHP. Use an allowlist of permitted module names and resolve them to local paths. Treat any user input that ends up in require()/include() as a critical RCE risk.",
  },
  {
    keywords: ["open redirect", "redirect", "url redirect", "unvalidated redirect"],
    title: "Open Redirect",
    cwe: "CWE-601",
    explanation:
      "An open redirect is when your app takes a URL from a query parameter (e.g. /login?next=https://evil.com) and redirects to it without validation. Attackers use this for phishing: they send a victim a link to your-trusted-app.com/login?next=https://evil-trusted-app-lookalike.com — the victim trusts the link because it goes to your domain, but ends up on the attacker's site.",
    remediation:
      "Never redirect to an absolute URL from user input. Maintain an allowlist of permitted redirect destinations (paths only, relative to your domain). If you must allow absolute URLs, verify the hostname matches your own. For 'next' parameters, only accept relative paths starting with '/' and reject anything starting with '//'.",
  },
  {
    keywords: ["authentication bypass", "auth bypass", "broken authentication", "weak password", "brute force"],
    title: "Authentication Bypass",
    cwe: "CWE-287",
    explanation:
      "Auth bypass is any vulnerability that lets an attacker authenticate as a user without their password. Causes: predictable tokens (e.g. JWT signed with 'secret'), missing rate limiting (brute force), SQL injection in the login query (OR 1=1), session fixation, or accepting 'admin' as a role claim without verifying it server-side.",
    remediation:
      "Use a vetted auth library (NextAuth.js, Lucia, Auth.js) — don't roll your own. Hash passwords with bcrypt (12+ rounds) or argon2 — never SHA-256 or MD5. Enforce rate limiting on login (5 attempts / 15 min / IP). Use strong, random session tokens (32+ bytes from crypto.randomBytes). Sign JWTs with a strong secret from env. Re-verify every authorization decision server-side — never trust client-side role claims.",
  },
  {
    keywords: ["xxe", "xml external entity", "xml injection"],
    title: "XML External Entity (XXE)",
    cwe: "CWE-611",
    explanation:
      "XXE happens when an XML parser resolves external entity references in user-supplied XML. An attacker can read local files (/etc/passwd), perform SSRF, or cause denial-of-service via the billion-laughs attack. Most common in older XML parsers (libxml2 with default settings, Java SAX parser).",
    remediation:
      "Disable external entity resolution in your XML parser. In libxml2 (PHP, Python lxml): libxml_disable_entity_loader(true). In Java: FEATURE_SECURE_PROCESSING + disallow-doctype-decl. Better: use JSON instead of XML where possible. Validate that the input is well-formed before parsing.",
  },
  {
    keywords: ["deserialization", "insecure deserialization", "object deserialization"],
    title: "Insecure Deserialization",
    cwe: "CWE-502",
    explanation:
      "Insecure deserialization happens when your app calls unserialize()/ObjectInputStream.readObject()/pickle.loads() on user-controlled data. The data can include a gadget chain that triggers arbitrary code execution during object construction — before any of your application code runs. PHP, Java, and Python are most affected; Node is less so but JSON.parse with a 'reviver' can be vulnerable.",
    remediation:
      "Never deserialize native object formats (PHP serialized, Java ObjectOutputStream, Python pickle) from untrusted input. Use JSON or Protobuf. If you must accept serialized data, sign it with an HMAC and verify the signature before deserializing. Pin the allowed class allowlist in Java (ObjectInputFilter) and PHP (allowed_classes).",
  },
  {
    keywords: ["ssti", "server side template injection", "template injection"],
    title: "Server-Side Template Injection (SSTI)",
    cwe: "CWE-1336",
    explanation:
      "SSTI happens when user input is concatenated into a server-side template string (Jinja2, Twig, Handlebars, EJS, Freemarker) before rendering. The attacker can inject template directives ({{7*7}} → 49) and escalate to RCE via template engine escape gadgets — Jinja2 has CTF-famous RCE payloads via __class__.__mro__[1].__subclasses__().",
    remediation:
      "Never concatenate user input into template strings. Pass user input as a template variable (render(template, { user_input }) not render(template + user_input)). Use auto-escaping templates. Sandbox the template engine if you must accept user-authored templates (Jinja2 SandboxedEnvironment).",
  },
  {
    keywords: ["privilege escalation", "privesc", "horizontal escalation", "vertical escalation", "broken access"],
    title: "Privilege Escalation",
    cwe: "CWE-269",
    explanation:
      "Privilege escalation is when a low-privilege user gains the permissions of a higher-privilege user. Horizontal: user A accesses user B's data (an IDOR). Vertical: a viewer becomes an admin. Causes: client-side role checks (role stored in JWT but never verified server-side), predictable admin URLs (/admin) with no server-side check, mass assignment (user sets role=admin in a POST body), or JWT alg:none attacks.",
    remediation:
      "Verify every authorization decision server-side. Never trust client-side role checks. Use an allowlist of updatable fields in your ORM (don't blindly assign req.body to the model). Reject JWTs with alg:none. Use a middleware-based authorization layer (requireAdmin, requireAnalyst) instead of inline checks that are easy to forget.",
  },
  {
    keywords: ["mass assignment", "over posting", "overposting"],
    title: "Mass Assignment",
    cwe: "CWE-915",
    explanation:
      "Mass assignment happens when you bind an entire request body to a model without filtering fields. A request to PUT /api/users/me with {name: 'Alice', role: 'admin'} updates both fields — and the user is now an admin. The vulnerability is invisible: no broken access control, no injection, just one extra field silently accepted.",
    remediation:
      "Never spread req.body into your ORM update directly. Maintain an allowlist of updatable fields per route (e.g. PATCH /users/me only allows name, email, avatar — never role, password, or tokenVersion). Use a DTO library (zod, class-validator, joi) to validate input shape and reject unknown fields.",
  },
  {
    keywords: ["jwt", "json web token", "token"],
    title: "JSON Web Token (JWT) Vulnerabilities",
    cwe: "CWE-347",
    explanation:
      "JWTs are signed tokens used for stateless auth. Common vulnerabilities: alg:none attack (an attacker sets the alg header to 'none' and removes the signature — some libraries accept it), weak signing secret ('secret', 'password'), algorithm confusion (RS256 token verified as HS256 with the public key as HMAC secret), and storing sensitive data in the JWT payload (it's only base64-encoded, not encrypted).",
    remediation:
      "Use a vetted JWT library (jsonwebtoken for Node) and pin the allowed algorithms to a single one (HS256 or RS256). Never accept alg:none. Use a strong random secret (32+ bytes from crypto.randomBytes). Don't store sensitive data in JWT — only an identifier + role. Set short expiry (15 min) + refresh tokens. Re-verify the user's role + approval status on every request, not just at JWT issuance.",
  },
];

/** Look up a security topic by free-text query. Returns the topic if a
 *  keyword matches (case-insensitive, word-boundary aware), else null. */
export function findSecurityTopic(query: string): SecurityTopic | null {
  const q = query.toLowerCase().trim();
  if (!q) return null;
  for (const topic of SECURITY_TOPICS) {
    for (const kw of topic.keywords) {
      if (q.includes(kw)) return topic;
    }
  }
  return null;
}

// ─── Time-of-day helper (used by briefing + chat greet) ───────────────────

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export function getTimeOfDay(timezone = "Asia/Calcutta"): TimeOfDay {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    const hour = parseInt(fmt.format(now), 10);
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  } catch {
    // Fallback to UTC if the timezone is invalid.
    const hour = new Date().getUTCHours();
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 21) return "evening";
    return "night";
  }
}

/** Friendly greeting prefix based on time of day. */
export function greetingPrefix(tod: TimeOfDay): string {
  switch (tod) {
    case "morning": return "Good morning";
    case "afternoon": return "Good afternoon";
    case "evening": return "Good evening";
    case "night": return "Working late";
  }
}

// ─── Severity ordering (for sorting pending patches) ─────────────────────

export const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function severityRank(s: string): number {
  return SEVERITY_ORDER[(s || "").toLowerCase()] ?? 99;
}

// ─── Posture grade helper ─────────────────────────────────────────────────

export function postureGrade(score: number): string {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}
