// Agent X — Context-Aware Tab Suggestions
// ─────────────────────────────────────────────────────────────────────────
// GET /api/agent-x/context?tab={currentTab}
//
// Auth required. Called when the user switches tabs (so Agent X can offer
// context-aware suggestions for the tab they're looking at + quick actions
// they can speak aloud or click).
//
// Returns:
//   { currentTab, tabTitle, tabDescription, suggestions, quickActions }
//
// For each of the 23 tabs, returns 2-3 specific suggestions that reference
// real platform state (counts, top patch IDs, top findings, etc.).

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { TABS, resolveTab, type TabInfo } from "@/lib/agent-x/knowledge";
import { gatherPlatformState, type PlatformState } from "@/lib/agent-x/state";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Response shape ──────────────────────────────────────────────────────

interface QuickAction {
  label: string;
  intent: "navigate" | "scan" | "approve" | "search" | "war_room" | "status" | "suggest" | "explain" | "help";
  target?: string;
  query?: string;
}

interface ContextResponse {
  currentTab: string;
  tabTitle: string;
  tabDescription: string;
  suggestions: string[];
  quickActions: QuickAction[];
}

// ─── GET handler ─────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const { userId } = auth.user;

  const url = new URL(req.url);
  const requestedTab = (url.searchParams.get("tab") || "dashboard").trim();

  // Resolve to a real tab key (handles aliases like "patches" → "patches",
  // "patch queue" → "patches", "vapt" → "redagent", etc.).
  const tabKey = resolveTab(requestedTab) ?? requestedTab;
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0];

  const state = await gatherPlatformState(userId);
  const ctx = buildTabContext(tab, state);

  return NextResponse.json<ContextResponse>({
    currentTab: tab.key,
    tabTitle: tab.label,
    tabDescription: tab.description,
    suggestions: ctx.suggestions,
    quickActions: ctx.quickActions,
  });
}

// ─── Tab-specific context builder ────────────────────────────────────────

interface TabContext {
  suggestions: string[];
  quickActions: QuickAction[];
}

function buildTabContext(tab: TabInfo, state: PlatformState): TabContext {
  // Common quick actions that show up on most tabs.
  const statusAction: QuickAction = { label: "What's our security posture?", intent: "status" };
  const patchesAction: QuickAction = { label: "Show me patches", intent: "navigate", target: "patches" };
  const codebasesAction: QuickAction = { label: "Show me codebases", intent: "navigate", target: "codebases" };

  switch (tab.key) {
    case "dashboard":
      return {
        suggestions: [
          state.activeScanCount > 0
            ? `Your overview shows ${state.activeScanCount} ${state.activeScanCount === 1 ? "active scan" : "active scans"}. Want a posture briefing?`
            : "Your overview is current. Want me to brief you on your security posture?",
          state.pendingPatchCount > 0
            ? `You have ${state.pendingPatchCount} pending patches${state.pendingCriticalCount > 0 ? ` (${state.pendingCriticalCount} critical)` : ""}. Say "approve patch <id>" to action one.`
            : "Your patch queue is clear — nothing pending right now.",
          `Posture score is ${state.postureScore}/100 (grade ${state.postureGrade}). ${state.postureScore >= 90 ? "Excellent work." : state.postureScore < 70 ? "Needs attention." : "Healthy."}`,
        ],
        quickActions: [
          statusAction,
          state.topPatch ? { label: `Approve patch ${state.topPatch.patchId}`, intent: "approve", target: state.topPatch.patchId } : patchesAction,
          codebasesAction,
        ],
      };

    case "clients":
      return {
        suggestions: [
          `You have ${state.clientCount} ${state.clientCount === 1 ? "client" : "clients"}${state.clientCount > 0 ? " — click any client to drill in." : " — add your first client to get started."}`,
          state.topPatch ? `Your most urgent patch is "${state.topPatch.title.slice(0, 50)}…" in ${state.topPatch.codebaseName}.` : "No pending patches across clients.",
          state.criticalFindingCount > 0 ? `${state.criticalFindingCount} critical ${state.criticalFindingCount === 1 ? "finding" : "findings"} need attention across clients.` : "No critical findings right now.",
        ],
        quickActions: [
          statusAction,
          patchesAction,
          { label: "Add a new client", intent: "navigate", target: "clients" },
        ],
      };

    case "pipelines":
      return {
        suggestions: [
          state.activeScanCount > 0
            ? `${state.activeScanCount} ${state.activeScanCount === 1 ? "scan is" : "scans are"} running right now. Watch the stage events for live progress.`
            : "No scans currently running. Start one from the Codebases tab.",
          state.recentScans[0] ? `Most recent scan: ${state.recentScans[0].codebaseName} — ${state.recentScans[0].status} (${relativeTimeShort(state.recentScans[0].startedAt)}).` : "No recent scans.",
          "Want a posture briefing while pipelines run?",
        ],
        quickActions: [
          statusAction,
          codebasesAction,
          patchesAction,
        ],
      };

    case "patches":
      return {
        suggestions: [
          state.pendingPatchCount > 0
            ? `You have ${state.pendingPatchCount} pending ${state.pendingPatchCount === 1 ? "patch" : "patches"}${state.pendingCriticalCount > 0 ? ` — ${state.pendingCriticalCount} critical` : ""}. Say "approve patch <id>" to action one.`
            : "Your patch queue is empty — great work keeping on top of things.",
          state.topPatch ? `Top priority: ${state.topPatch.patchId} (${state.topPatch.severity}) — "${state.topPatch.title.slice(0, 60)}" in ${state.topPatch.codebaseName}.` : "No critical patches pending.",
          "Tip: review the diff + sandbox pass + adversarial results before approving.",
        ],
        quickActions: [
          state.topPatch ? { label: `Approve ${state.topPatch.patchId}`, intent: "approve", target: state.topPatch.patchId } : statusAction,
          { label: "Approve last patch", intent: "approve", target: "last" },
          statusAction,
        ],
      };

    case "codebases":
      return {
        suggestions: [
          `You have ${state.codebaseCount} ${state.codebaseCount === 1 ? "codebase" : "codebases"}. Say "scan <name>" to start a SAST scan.`,
          state.codebaseWithMostFindings ? `${state.codebaseWithMostFindings.name} has the most findings (${state.codebaseWithMostFindings.findingCount}). Consider a re-scan to surface new issues.` : "No codebases with findings yet — add one and run a scan.",
          state.activeScanCount > 0 ? `${state.activeScanCount} ${state.activeScanCount === 1 ? "scan is" : "scans are"} running right now.` : "No scans currently running.",
        ],
        quickActions: [
          state.codebaseWithMostFindings ? { label: `Scan ${state.codebaseWithMostFindings.name}`, intent: "scan", target: state.codebaseWithMostFindings.name } : { label: "Help", intent: "help" },
          statusAction,
          patchesAction,
        ],
      };

    case "redagent":
      return {
        suggestions: [
          "Ready to run a DAST engagement? Say \"scan <target>\" and I'll start an authorized penetration test.",
          state.recentFindings.length > 0 ? `${state.recentFindings.length} recent findings from DAST engagements — top is "${state.recentFindings[0].title}".` : "No DAST findings yet — start your first engagement.",
          "RedAgent crawls your target, plans category-appropriate attacks, fires real HTTP payloads, and confirms exploitation with evidence.",
        ],
        quickActions: [
          { label: "Scan a target", intent: "scan" },
          { label: "Find critical findings", intent: "search", query: "critical" },
          statusAction,
        ],
      };

    case "compliance":
      return {
        suggestions: [
          "Map your findings to DPDPA, GDPR, HIPAA, PCI-DSS, ISO 27001, and SOC 2.",
          state.pendingPatchCount > 0 ? `Closing the ${state.pendingPatchCount} pending patches will improve your compliance posture across frameworks.` : "No pending patches — your compliance posture is clean.",
          "Need to draft a breach notification? I can walk you through the 72-hour DPDPA requirement.",
        ],
        quickActions: [
          statusAction,
          patchesAction,
          { label: "Explain DPDPA", intent: "explain", target: "DPDPA" },
        ],
      };

    case "soc":
      return {
        suggestions: [
          "Watch live process trees, configure alert rules, deploy honeypots, and configure webhooks from this tab.",
          state.activeScanCount > 0 ? `${state.activeScanCount} active ${state.activeScanCount === 1 ? "scan" : "scans"} — set up an alert rule to be notified when they complete.` : "No active scans — consider scheduling recurring scans via the SOC tab.",
          "Set up a canary token to detect data exfiltration attempts early.",
        ],
        quickActions: [
          statusAction,
          { label: "Show me exfil defense", intent: "navigate", target: "exfil" },
          patchesAction,
        ],
      };

    case "exfil":
      return {
        suggestions: [
          "Deploy canary tokens into your codebase — any unauthorized access fires an incident with source IP + user agent.",
          "Honeypot endpoints trap attackers probing your attack surface. Spin one up with a single click.",
          "Real-time egress monitoring learns your normal traffic patterns and flags anomalies — large uploads at 3am, slow-drip transfers, DNS tunneling.",
        ],
        quickActions: [
          statusAction,
          { label: "Show me SOC", intent: "navigate", target: "soc" },
          { label: "Show me DFIR", intent: "navigate", target: "dfir" },
        ],
      };

    case "scraper":
      return {
        suggestions: [
          "Scrape any URL for leaked secrets + PII — dual-mode lightweight + headless-browser engine.",
          "Every scrape produces an integrity-hashed audit trail for compliance.",
          "Tip: switch to browser mode for SPAs that need JavaScript rendering to expose content.",
        ],
        quickActions: [
          statusAction,
          { label: "Show me codebases", intent: "navigate", target: "codebases" },
          { label: "Help", intent: "help" },
        ],
      };

    case "dfir":
      return {
        suggestions: [
          state.criticalFindingCount > 0 ? `${state.criticalFindingCount} critical ${state.criticalFindingCount === 1 ? "finding" : "findings"} could auto-create incidents. Want me to open one?` : "No critical findings — incident queue is clear.",
          "Every artifact is SHA-256 hashed + timestamped on collection. The chain-of-custody ledger is court-admissible.",
          "Need to execute a response playbook? Try the SQLi or ransomware playbook — one click runs contain → isolate → snapshot → gather evidence → notify.",
        ],
        quickActions: [
          statusAction,
          { label: "Show me patches", intent: "navigate", target: "patches" },
          { label: "Show me SOC", intent: "navigate", target: "soc" },
        ],
      };

    case "rnd":
      return {
        suggestions: [
          "The Autonomous Research Agent crawls security blogs + GitHub repos overnight and writes gap-fix proposals — check the backlog.",
          "Run a benchmark to compare GuardianX's detection coverage against newly-disclosed techniques.",
          "Generate virtual patches (WAF rules, IaC manifests) when you can't patch code immediately.",
        ],
        quickActions: [
          statusAction,
          { label: "Show me advanced platform", intent: "navigate", target: "advanced" },
          { label: "Show me patches", intent: "navigate", target: "patches" },
        ],
      };

    case "advanced":
      return {
        suggestions: [
          "Advanced platform modules — predictive risk scoring, anomaly detection, threat briefing, attack graph DAG.",
          state.topFinding ? `Predictive risk: your top finding "${state.topFinding.title.slice(0, 50)}" on ${state.topFinding.targetName} has high blast radius.` : "No active threats to forecast.",
          "View the attack graph DAG to see how individual vulnerabilities chain into multi-step takeover paths.",
        ],
        quickActions: [
          { label: "Predictive forecast", intent: "navigate", target: "forecast" },
          { label: "Threat constellation", intent: "navigate", target: "constellation" },
          statusAction,
        ],
      };

    case "forecast":
      return {
        suggestions: [
          "Want me to predict your next likely attack vector? The forecast engine uses your finding history + global CVE disclosure rate.",
          state.recentFindings.length > 0 ? `Recent findings suggest your highest-risk category is "${state.recentFindings[0].category}".` : "Run more scans to give the forecaster more signal.",
          "The forecast predicts likely critical finding count next 7 days, at-risk codebase next sprint, and expected patch backlog in 30 days.",
        ],
        quickActions: [
          { label: "Run a predictive forecast", intent: "navigate", target: "forecast" },
          statusAction,
          { label: "Show me codebases", intent: "navigate", target: "codebases" },
        ],
      };

    case "quantum":
      return {
        suggestions: [
          "I can scan your code for quantum-vulnerable crypto (RSA, ECDSA, ECDH). Pick a codebase to start.",
          state.codebaseCount > 0 ? `You have ${state.codebaseCount} ${state.codebaseCount === 1 ? "codebase" : "codebases"} to assess for post-quantum readiness.` : "Add a codebase first to run the quantum scanner.",
          "Generates a phased migration plan to NIST-standardized PQC algorithms (ML-KEM, ML-DSA, SLH-DSA).",
        ],
        quickActions: [
          state.codebaseWithMostFindings
            ? { label: `Scan ${state.codebaseWithMostFindings.name} for quantum vulns`, intent: "scan", target: state.codebaseWithMostFindings.name }
            : { label: "Show me codebases", intent: "navigate", target: "codebases" },
          statusAction,
          { label: "Explain Shor's algorithm", intent: "explain", target: "Shor" },
        ],
      };

    case "constellation":
      return {
        suggestions: [
          "Your 3D threat constellation map is ready. Add more clients to populate it with finding stars.",
          "Each star is a finding, IOC, attacker TTP, or codebase — lines show correlation strength.",
          "Tip: spin the constellation slowly in the War Room for wall projection.",
        ],
        quickActions: [
          { label: "Open War Room", intent: "war_room" },
          statusAction,
          { label: "Show me patches", intent: "navigate", target: "patches" },
        ],
      };

    case "modules":
      return {
        suggestions: [
          `Browse all ${60}+ GuardianX modules. Filter by category or click any module to navigate to its tab.`,
          "Use the category filter to find what you need — SAST, DAST, DFIR, SOC, Defense, Platform, etc.",
          "Looking for something specific? Just ask me — I know every module by name.",
        ],
        quickActions: [
          { label: "Show me dashboard", intent: "navigate", target: "dashboard" },
          statusAction,
          { label: "Help", intent: "help" },
        ],
      };

    case "billing":
      return {
        suggestions: [
          "Manage your subscription plan — Free, Pro, or Enterprise. Upgrade via Stripe Checkout.",
          "View invoices, update payment methods, and see plan usage vs limits.",
          "Need to switch plans? The customer portal handles it self-serve.",
        ],
        quickActions: [
          statusAction,
          { label: "Show me settings", intent: "navigate", target: "settings" },
          { label: "Show me users", intent: "navigate", target: "users" },
        ],
      };

    case "settings":
      return {
        suggestions: [
          state.user?.twofaEnabled ? "2FA is enabled on your account — good." : "Enable 2FA / TOTP to secure your account — admins must have it on.",
          "Configure SMTP, SendGrid, or Postmark for transactional + alert email.",
          "Manage organizations, API keys, and session revocation from here.",
        ],
        quickActions: [
          statusAction,
          { label: "Show me users", intent: "navigate", target: "users" },
          { label: "Show me billing", intent: "navigate", target: "billing" },
        ],
      };

    case "users":
      return {
        suggestions: [
          "Invite users by email, assign roles, approve/reject signups, suspend bad actors.",
          "Admins must have 2FA enabled — enforce it org-wide from here.",
          "Every action is audit-logged with actor + IP + timestamp.",
        ],
        quickActions: [
          { label: "Show me user activity", intent: "navigate", target: "user-activity" },
          statusAction,
          { label: "Show me settings", intent: "navigate", target: "settings" },
        ],
      };

    case "user-activity":
      return {
        suggestions: [
          "Watch what every user is doing in real time — page views, scans, patches, exports, API calls.",
          "Anomaly detection flags 'user from a new country', 'API key used at 3am', 'bulk export of findings'.",
          "Catches insider threats before they become incidents.",
        ],
        quickActions: [
          { label: "Show me users", intent: "navigate", target: "users" },
          { label: "Show me DFIR", intent: "navigate", target: "dfir" },
          statusAction,
        ],
      };

    case "content":
      return {
        suggestions: [
          "Edit marketing site copy, write blog posts, upload images. Changes go live on save.",
          "SEO metadata, OpenGraph images, and sitemap.xml auto-generate per post.",
          "Admin-only — only admins see this tab.",
        ],
        quickActions: [
          statusAction,
          { label: "Show me settings", intent: "navigate", target: "settings" },
          { label: "Show me users", intent: "navigate", target: "users" },
        ],
      };

    case "contributors":
      return {
        suggestions: [
          "Live roster of every GuardianX contributor — PR counts, merged-PR velocity, leaderboard.",
          "Auto-synced nightly via the GitHub API.",
          "Public credit where credit is due — visible on the /company page.",
        ],
        quickActions: [
          statusAction,
          { label: "Show me dashboard", intent: "navigate", target: "dashboard" },
          { label: "Help", intent: "help" },
        ],
      };

    default:
      return {
        suggestions: [
          `You're on the ${tab.label} tab. ${tab.canDo}`,
          state.pendingPatchCount > 0 ? `You have ${state.pendingPatchCount} pending patches waiting.` : "Your patch queue is clear.",
          "Want a posture briefing?",
        ],
        quickActions: [
          statusAction,
          patchesAction,
          codebasesAction,
        ],
      };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function relativeTimeShort(date: Date): string {
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 0) return "just now";
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toISOString().slice(0, 10);
}
