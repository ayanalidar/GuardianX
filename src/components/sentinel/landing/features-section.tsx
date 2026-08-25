"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Code2, Terminal } from "lucide-react";
import { FEATURES, type Feature } from "./features-data";
import { TiltCard } from "./tilt-card";

/**
 * Per-feature mini code snippets.
 * Each feature card shows a DIFFERENT code example on hover,
 * relevant to what that module actually does.
 */
const FEATURE_SNIPPETS: Record<string, { code: string[]; badge: string; lang: string }> = {
  "AI Vulnerability Detection": {
    lang: "vuln.js",
    code: [
      "function login(user, pass) {",
      "  const q = `SELECT * FROM users",
      "    WHERE id = ` + user.id;",
      "  return db.query(q);",
      "}",
    ],
    badge: "CWE-89: SQL Injection",
  },
  "PoC Exploit Playground": {
    lang: "exploit.py",
    code: [
      "payload = \"' OR '1'='1\"",
      "r = requests.post(url,",
      "  data={'user': payload})",
      "assert 'admin' in r.text",
      "# Exploit confirmed ✓",
    ],
    badge: "PoC verified: auth bypass",
  },
  "Adversarial Red-Team Arena": {
    lang: "round-3.js",
    code: [
      "// Attacker tries bypass:",
      "payload = \"' UNION SELECT--\"",
      "// Defender blocks ✓",
      "// Attacker concedes",
      "patch_confidence: 95%",
    ],
    badge: "Defender won round 3/5",
  },
  "RedAgent VAPT Engine": {
    lang: "dast.log",
    code: [
      "[14:32] Crawling target...",
      "[14:33] Found: /api/user?id=1",
      "[14:33] Firing SQLi payload",
      "[14:34] ✓ SQLi confirmed!",
      "[14:34] Finding persisted",
    ],
    badge: "7 vulnerabilities found",
  },
  "Sensitive Data Exposure Scanner": {
    lang: "scan.js",
    code: [
      "GET /.env HTTP/1.1",
      "200 OK",
      "DB_PASSWORD=prod_secret",
      "STRIPE_KEY=sk_live_...",
      "# Exfiltration detected!",
    ],
    badge: "3 secrets exposed",
  },
  "Professional VAPT Reports": {
    lang: "report.pdf",
    code: [
      "═══════════════════════",
      "  VAPT Report — Q3 2026",
      "═══════════════════════",
      "Findings: 23 (2 critical)",
      "Compliance: DPDPA ✓",
    ],
    badge: "15-page PDF generated",
  },
  "Encrypted Git Integration": {
    lang: "credential.enc",
    code: [
      "// Token encrypted at rest",
      "cipher: AES-256-GCM",
      "key: derived from env",
      "iv: random per-credential",
      "// Never shown again ✓",
    ],
    badge: "AES-256-GCM encrypted",
  },
  "PostureScore": {
    lang: "score.json",
    code: [
      '{ "codebase": "api-server",',
      '  "postureScore": 78,',
      '  "grade": "C+",',
      '  "trend": "+12 this week",',
      '  "critical": 2 }',
    ],
    badge: "Score: 78/100 (C+)",
  },
  "Continuous Threat Intel": {
    lang: "threat-feed.json",
    code: [
      '{ "cve": "CVE-2026-1234",',
      '  "lib": "express@4.18",',
      '  "severity": "critical",',
      '  "your_code": "affected",',
      '  "action": "upgrade now" }',
    ],
    badge: "New 0-day matches your code",
  },
  "AI Remediation Copilot": {
    lang: "patch.diff",
    code: [
      "- const q = `SELECT...`+id",
      "+ const q = `SELECT...`",
      "+   WHERE id = $1",
      "+ db.query(q, [id])",
      "// Parameterized ✓",
    ],
    badge: "AI-generated patch",
  },
  "Self-Healing Runtime": {
    lang: "runtime.js",
    code: [
      "// Vulnerable function detected",
      "hotSwap('login', patchedFn)",
      "// Zero downtime deploy",
      "attacker -> blocked ✓",
      "healed: 1 function",
    ],
    badge: "Hot-swapped at runtime",
  },
  "Cryptographic Patch Attestation": {
    lang: "chain.json",
    code: [
      '{ "patch": "SP-2026-0039",',
      '  "hash": "sha256:a1b2...",',
      '  "prevHash": "sha256:c3d4...",',
      '  "verified": true,',
      '  "tampered": false }',
    ],
    badge: "SHA-256 chain verified",
  },
  "DPDPA & Multi-Framework Compliance": {
    lang: "compliance.json",
    code: [
      '{ "framework": "DPDPA 2023",',
      '  "sections": 14,',
      '  "automated_checks": 32,',
      '  "passing": 23,',
      '  "score": "71/100" }',
    ],
    badge: "DPDPA: 71% compliant",
  },
  "Data Privacy Scanner": {
    lang: "privacy.js",
    code: [
      "// Scanning for PII...",
      "FOUND: email collected",
      "  consent: missing ✗",
      "FOUND: SSN in response",
      "  mapped: DPDPA §11",
    ],
    badge: "2 privacy violations",
  },
  "Dark Web Monitoring": {
    lang: "breach-alert.json",
    code: [
      '{ "source": "darkweb",',
      '  "domain": "guardianx.cloud",',
      '  "leaked": "admin@...",',
      '  "password": "hashed",',
      '  "found": "2026-08-04" }',
    ],
    badge: "Credential leak detected",
  },
  "Security KPI Dashboard": {
    lang: "kpis.json",
    code: [
      '{ "MTTD": "2.3 hours",',
      '  "MTTR": "4.1 hours",',
      '  "vuln_density": "3.2/KLOC",',
      '  "sandbox_pass": "87%",',
      '  "trend": "↑ 12%" }',
    ],
    badge: "MTTR: 4.1h (↓ 23%)",
  },
  "Attack Surface Management": {
    lang: "nmap.txt",
    code: [
      "PORT     STATE  SERVICE",
      "22/tcp   open   ssh",
      "80/tcp   open   http",
      "443/tcp  open   https",
      "3306/tcp open   mysql",
    ],
    badge: "4 ports exposed",
  },
  "Data Exfiltration Defense": {
    lang: "canary.log",
    code: [
      "// Canary token injected",
      "token: CANARY-abc123",
      "DETECTED: token at",
      "  evil.com/upload",
      "ALERT: exfiltration!",
    ],
    badge: "Canary triggered",
  },
  "Web Scraping Audit Engine": {
    lang: "scraper.py",
    code: [
      "url = 'https://target.com'",
      "data = scrape(url)",
      "pii_found = sanitize(data)",
      "audit_log.write(data)",
      "integrity: sha256 ✓",
    ],
    badge: "Audit trail created",
  },
  "CI/CD Integration": {
    lang: ".github/workflows.yml",
    code: [
      "- name: GuardianX Scan",
      "  run: guardianx scan",
      "  on: pull_request",
      "  block_if: critical",
      "  comment: patch suggestions",
    ],
    badge: "PR scan: 2 findings",
  },
  "AI Attack Chain Synthesis": {
    lang: "chain.json",
    code: [
      '{ "chain": [',
      '  {"step":1,"vuln":"XSS"},',
      '  {"step":2,"vuln":"IDOR"},',
      '  {"step":3,"result":"account',
      '   takeover" } ] }',
    ],
    badge: "3-step attack chain found",
  },
  "API Fuzzing + Business Logic Testing": {
    lang: "fuzz.log",
    code: [
      "POST /api/transfer",
      "  amount: -999999",
      "  → 200 OK (bug!)",
      "POST /api/checkout",
      "  price: 0.01 (manipulated)",
    ],
    badge: "Business logic bug found",
  },
  "Executive Dashboard + Heatmap": {
    lang: "dashboard.json",
    code: [
      '{ "clients": 12,',
      '  "critical": 3,',
      '  "high": 7,',
      '  "heatmap": "rendered",',
      '  "trend": "7-day ↓18%" }',
    ],
    badge: "Board-ready view",
  },
  "Multi-Tenant RBAC + Integrations": {
    lang: "rbac.json",
    code: [
      '{ "org": "Acme Corp",',
      '  "members": 8,',
      '  "roles": ["admin",',
      '    "analyst","viewer"],',
      '  "data_isolated": true }',
    ],
    badge: "Org isolation active",
  },
  "Guardian AI Assistant": {
    lang: "chat.gx",
    code: [
      "> Which client has most",
      "  critical findings?",
      "GuardianX: CyberShield has",
      "  2 critical (SQLi + XSS).",
      "  Recommend: patch SP-0039",
    ],
    badge: "Natural language query",
  },
  "Service Launcher + War Room": {
    lang: "warroom.bat",
    code: [
      "SELECT: CyberShield",
      "SERVICE: Scan + Patch",
      "STATUS: running...",
      "[████████░░] 80%",
      "ETA: 2 minutes",
    ],
    badge: "Multi-client launch",
  },
  "Autonomous R&D Lab": {
    lang: "research.json",
    code: [
      '{ "scanned": "github.com",',
      '  "tools_found": 47,',
      '  "analyzed": 12,',
      '  "gaps_identified": 3,',
      '  "recommendations": 8 }',
    ],
    badge: "3 gaps identified",
  },
  "Virtual Patching + IaC Remediation": {
    lang: "virtual-patch.conf",
    code: [
      "# WAF rule generated:",
      "SecRule ARGS \"sql_inj\"",
      "  \"deny,log,status:403\"",
      "# Terraform patch:",
      "  aws_wafv2_rule_group { ... }",
    ],
    badge: "WAF + IaC patch ready",
  },
  "Voice Command Center": {
    lang: "voice.log",
    code: [
      "[listening] say a command...",
      "USER: scan payment.js",
      "[processing] starting scan...",
      "AI: Scan started. I'll",
      "  notify you of findings.",
    ],
    badge: "Push-to-talk active",
  },
  "Gesture Control": {
    lang: "gesture.log",
    code: [
      "[tracking] hand detected",
      "PINCH → clicked: Scan button",
      "SWIPE LEFT → patches tab",
      "FIST → closed dialog",
      "[tracking] hand lost",
    ],
    badge: "MediaPipe tracking",
  },
  "AI Neural Visualizer": {
    lang: "visualizer.json",
    code: [
      '{ "state": "scanning",',
      '  "pulses": 47,',
      '  "findings": 3,',
      '  "patches": 2,',
      '  "mode": "immersive" }',
    ],
    badge: "Circuit board live",
  },
  "AI Memory Vault": {
    lang: "memory.json",
    code: [
      '{ "vault": {',
      '  "scans": 23,',
      '  "findings": 87,',
      '  "patches": 45,',
      '  "conversations": 156 } }',
    ],
    badge: "23 memories stored",
  },
  "Multi-Tenant RBAC + Organizations": {
    lang: "rbac.json",
    code: [
      '{ "orgs": 2,',
      '  "users": 8,',
      '  "roles": ["admin",',
      '    "analyst","viewer"],',
      '  "isolated": true }',
    ],
    badge: "Org isolation active",
  },
};

function FeatureCardScan({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  const snippet = FEATURE_SNIPPETS[feature.title] || {
    code: ["// Module active", "scanning...", "analysis complete"],
    badge: "Module ready",
    lang: "module.js",
  };
  return (
    <div className="relative mb-3 overflow-hidden rounded-md border border-zinc-800 bg-black/70 p-2 font-mono text-[10px] leading-snug">
      <div className="mb-1 flex items-center gap-1 text-zinc-600">
        <Icon className={`size-3 ${feature.color}`} />
        <span>{snippet.lang}</span>
        <span className="ml-auto size-1.5 rounded-full bg-emerald-500/70" />
      </div>
      <div className="space-y-0.5">
        {snippet.code.map((line, i) => (
          <div key={i} className={i === 0 ? "text-zinc-500" : "text-zinc-400"}>
            {line}
          </div>
        ))}
      </div>
      {/* Sweep highlight */}
      <div className="feature-sweep pointer-events-none absolute inset-x-0 top-0 h-12 -translate-x-full bg-gradient-to-r from-transparent via-emerald-400/30 to-transparent group-hover:animate-[feature-sweep_1.8s_ease-in-out_infinite]" />
      {/* Result badge */}
      <div className="mt-2 inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-300">
        <Sparkles className="size-2.5" /> {snippet.badge}
      </div>
    </div>
  );
}

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const Icon = feature.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.5, delay: (index % 3) * 0.08 }}
      className="[transform-style:preserve-3d]"
    >
      <TiltCard className={`group h-full rounded-md border ${feature.border} ${feature.bg} ${feature.glow} transition-shadow duration-300`}>
        {/* Cursor-follow glow border */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-md opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(220px circle at var(--mx,50%) var(--my,50%), rgba(16,185,129,0.10), transparent 65%)",
          }}
        />
        <div className="relative p-5">
          {feature.isNew && (
            <div className="absolute -right-1 -top-1 z-10 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-white shadow-[0_0_12px_rgba(16,185,129,0.5)]">
              NEW
            </div>
          )}
          <div className="mb-3 flex items-center justify-between">
            <div className={`flex size-10 items-center justify-center rounded-lg border ${feature.border} bg-zinc-950/60`} style={{ transform: "translateZ(40px)" }}>
              <Icon className={`size-5 ${feature.color}`} />
            </div>
            <Badge variant="outline" className={`border-zinc-700 bg-zinc-900/50 text-[9px] uppercase tracking-wider ${feature.color}`}>
              {feature.category}
            </Badge>
          </div>
          <h3 className={`text-sm font-bold ${feature.color}`} style={{ transform: "translateZ(30px)" }}>
            {feature.title}
          </h3>
          <div className="mt-1.5 max-h-0 overflow-hidden opacity-0 transition-all duration-300 group-hover:max-h-40 group-hover:opacity-100">
            <FeatureCardScan feature={feature} />
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">{feature.desc}</p>
        </div>
      </TiltCard>
    </motion.div>
  );
}

export function FeaturesSection() {
  return (
    <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mb-10 text-center">
        <div className="mb-2 flex items-center justify-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
          <Code2 className="size-3" /> {"// Capabilities"}
        </div>
        <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">Everything you need to secure your code</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
          <span className="neon-emerald text-emerald-400 font-bold">50+ integrated modules</span> across SAST, DAST,
          AI autonomy, active defense, R&D engineering, and multi-tenant operations.
          <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
            6 NEW
          </span>
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <FeatureCard key={f.title} feature={f} index={i} />
        ))}
      </div>
      <div className="mt-8 flex justify-center">
        <a
          href="/features"
          className="inline-flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-300 transition-colors hover:bg-emerald-500/20"
        >
          <Terminal className="size-4" /> See all 50+ modules
        </a>
      </div>
    </section>
  );
}
