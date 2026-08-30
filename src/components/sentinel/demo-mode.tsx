"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GuardianXLogo } from "./guardianx-logo";
import {
  Building2,
  Boxes,
  ShieldAlert,
  ShieldCheck,
  Zap,
  Lock,
  LogIn,
  UserPlus,
  Film,
  Activity,
  Cpu,
  Crosshair,
  Rocket,
  RefreshCw,
  ChevronRight,
} from "lucide-react";

interface DemoModeProps {
  onSignUp: () => void;
  onSignIn: () => void;
}

// ── Mock data (read-only sample) ──────────────────────────────────────────

interface MockClient {
  id: string;
  name: string;
  industry: string;
  status: "active" | "onboarding";
  posture: number;
  codebases: number;
  findings: number;
  patches: number;
}

interface MockFinding {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium" | "low";
  client: string;
  codebase: string;
  cwe: string;
  status: "open" | "patched";
}

const MOCK_CLIENTS: MockClient[] = [
  {
    id: "c1",
    name: "Acme Financial",
    industry: "Fintech / Banking",
    status: "active",
    posture: 78,
    codebases: 3,
    findings: 14,
    patches: 9,
  },
  {
    id: "c2",
    name: "Helix Health",
    industry: "Healthcare / MedTech",
    status: "active",
    posture: 64,
    codebases: 2,
    findings: 8,
    patches: 5,
  },
  {
    id: "c3",
    name: "Northwind Retail",
    industry: "E-commerce / Retail",
    status: "onboarding",
    posture: 52,
    codebases: 1,
    findings: 6,
    patches: 2,
  },
];

const MOCK_CODEBASES = [
  { id: "cb1", name: "acme-payments-api", language: "TypeScript", client: "Acme Financial", patches: 4 },
  { id: "cb2", name: "acme-identity-svc", language: "JavaScript", client: "Acme Financial", patches: 5 },
  { id: "cb3", name: "helix-records", language: "Python", client: "Helix Health", patches: 5 },
  { id: "cb4", name: "northwind-storefront", language: "TypeScript", client: "Northwind Retail", patches: 2 },
];

const MOCK_FINDINGS: MockFinding[] = [
  {
    id: "f1",
    title: "SQL Injection in /api/user lookup",
    severity: "critical",
    client: "Acme Financial",
    codebase: "acme-payments-api",
    cwe: "CWE-89",
    status: "patched",
  },
  {
    id: "f2",
    title: "Hardcoded JWT secret in source",
    severity: "high",
    client: "Acme Financial",
    codebase: "acme-identity-svc",
    cwe: "CWE-798",
    status: "open",
  },
  {
    id: "f3",
    title: "Insecure deserialization in record loader",
    severity: "high",
    client: "Helix Health",
    codebase: "helix-records",
    cwe: "CWE-502",
    status: "open",
  },
  {
    id: "f4",
    title: "Missing rate-limit on auth endpoint",
    severity: "medium",
    client: "Acme Financial",
    codebase: "acme-identity-svc",
    cwe: "CWE-307",
    status: "patched",
  },
  {
    id: "f5",
    title: "Stored XSS in product reviews",
    severity: "medium",
    client: "Northwind Retail",
    codebase: "northwind-storefront",
    cwe: "CWE-79",
    status: "open",
  },
  {
    id: "f6",
    title: "Verbose error leaks stack trace",
    severity: "low",
    client: "Helix Health",
    codebase: "helix-records",
    cwe: "CWE-209",
    status: "patched",
  },
];

const SEVERITY_STYLES: Record<MockFinding["severity"], string> = {
  critical: "border-red-500/40 bg-red-500/10 text-red-300",
  high: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  medium: "border-yellow-500/40 bg-yellow-500/10 text-yellow-200",
  low: "border-sky-500/40 bg-sky-500/10 text-sky-300",
};

const LANG_COLORS: Record<string, string> = {
  TypeScript: "text-cyan-300",
  JavaScript: "text-amber-300",
  Python: "text-emerald-300",
};

/**
 * A read-only "Demo Mode" Command Center for unauthenticated visitors.
 *
 * Renders a simplified version of the GuardianX Command Center with mock
 * data so landing-page visitors can explore the platform before signing
 * up. All interactive buttons are disabled and wrapped in a tooltip that
 * reads "Sign up to use this feature".
 *
 * Props:
 *  - onSignUp — called when the visitor clicks "Sign Up" in the banner
 *  - onSignIn  — called when the visitor clicks "Sign In"  in the banner
 */
export function DemoMode({ onSignUp, onSignIn }: DemoModeProps) {
  const [tab, setTab] = useState<"overview" | "findings" | "clients" | "codebases">("overview");

  return (
    <TooltipProvider delayDuration={150}>
      <div className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
        {/* Ambient background glow */}
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute -top-40 left-1/4 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/12 blur-3xl" />
          <div className="absolute bottom-1/4 right-0 h-80 w-80 rounded-full bg-cyan-600/8 blur-3xl" />
        </div>

        <div className="relative z-10 flex min-h-screen flex-col">
          {/* ── Demo banner ─────────────────────────────────────────────── */}
          <header className="sticky top-0 z-20 border-b border-amber-500/25 bg-amber-500/5 backdrop-blur supports-[backdrop-filter]:bg-amber-500/10">
            <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-center gap-2 text-sm text-amber-200">
                <Film className="size-4 shrink-0" />
                <span className="font-medium">Demo Mode</span>
                <span className="text-amber-200/70">— exploring with sample data.</span>
                <button
                  type="button"
                  onClick={onSignUp}
                  className="ml-1 underline decoration-amber-400/50 underline-offset-2 hover:text-amber-100"
                >
                  Sign Up for Full Access
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={onSignIn}
                  variant="outline"
                  className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-emerald-500/50 hover:text-emerald-300"
                >
                  <LogIn className="mr-1 size-3.5" />
                  Sign In
                </Button>
                <Button
                  size="sm"
                  onClick={onSignUp}
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  <UserPlus className="mr-1 size-3.5" />
                  Sign Up
                </Button>
              </div>
            </div>
          </header>

          {/* ── Header strip ───────────────────────────────────────────── */}
          <div className="border-b border-zinc-800/80 bg-zinc-950/60">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <GuardianXLogo size={36} />
                <div>
                  <div className="text-sm font-bold tracking-tight text-zinc-50">
                    GuardianX Command Center
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
                    DEMO // READ-ONLY
                  </div>
                </div>
              </div>
              <DemoButton>
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="size-3.5" />
                  Refresh
                </span>
              </DemoButton>
            </div>
          </div>

          {/* ── Body ────────────────────────────────────────────────────── */}
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
            {/* KPI strip */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <KpiCard icon={Building2} label="Clients" value="3" accent="emerald" />
              <KpiCard icon={Boxes} label="Codebases" value="4" accent="cyan" />
              <KpiCard icon={ShieldAlert} label="Open Findings" value="3" accent="red" />
              <KpiCard icon={ShieldCheck} label="Patches Applied" value="6" accent="emerald" />
            </div>

            {/* Tab strip — navigation only, content area renders below */}
            <nav className="mt-6 flex flex-wrap gap-2 border-b border-zinc-800/80 pb-3">
              {(
                [
                  { id: "overview", label: "Overview", icon: Activity },
                  { id: "findings", label: "Findings", icon: ShieldAlert },
                  { id: "clients", label: "Clients", icon: Building2 },
                  { id: "codebases", label: "Codebases", icon: Boxes },
                ] as const
              ).map((t) => {
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    <t.icon className="size-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </nav>

            {/* Tab content */}
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className="mt-5"
            >
              {tab === "overview" && <OverviewPanel />}
              {tab === "findings" && <FindingsPanel />}
              {tab === "clients" && <ClientsPanel />}
              {tab === "codebases" && <CodebasesPanel />}
            </motion.div>

            {/* Demo-only call-to-action */}
            <div className="mt-8 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center hud-corners">
              <h3 className="text-lg font-bold text-zinc-50">Like what you see?</h3>
              <p className="mx-auto mt-1 max-w-md text-sm text-zinc-400">
                Create a free account to scan your own codebases, generate patches, and run the
                full autonomous pipeline.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button
                  onClick={onSignUp}
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  <UserPlus className="mr-1 size-4" />
                  Sign Up Free
                </Button>
                <Button
                  onClick={onSignIn}
                  variant="outline"
                  className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-emerald-500/50 hover:text-emerald-300"
                >
                  <LogIn className="mr-1 size-4" />
                  Sign In
                </Button>
              </div>
            </div>
          </main>

          {/* Footer */}
          <footer className="mt-auto border-t border-zinc-800/80 bg-zinc-950/60 px-4 py-4 text-center sm:px-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">
              GuardianX Demo Mode // sample data, read-only // sign up to unlock
            </p>
          </footer>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ── Panels ─────────────────────────────────────────────────────────────────

function OverviewPanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Posture card */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 hud-corners lg:col-span-1">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
            Avg posture score
          </span>
          <Crosshair className="size-4 text-emerald-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-bold tabular-nums text-emerald-300">64.7</span>
          <span className="text-xs text-zinc-500">/ 100</span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full w-[64%] rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300" />
        </div>
        <p className="mt-2 text-[10px] text-zinc-500">
          Aggregated across 3 demo clients. Sign up to track your real posture.
        </p>
      </div>

      {/* Pipeline card */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 hud-corners lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-cyan-500/60">
            Autonomous pipeline (sample)
          </span>
          <Cpu className="size-4 text-cyan-400" />
        </div>
        <ol className="space-y-2">
          {[
            { label: "Detect", desc: "SAST + LLM triage", done: true },
            { label: "Patch", desc: "AI candidate generation", done: true },
            { label: "Sandbox", desc: "Adversarial test harness", done: true },
            { label: "Review", desc: "Analyst approval", done: false },
          ].map((s, i) => (
            <li key={s.label} className="flex items-center gap-3 text-xs">
              <span
                className={`flex size-6 items-center justify-center rounded-full border font-mono text-[10px] ${
                  s.done
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                    : "border-zinc-700 bg-zinc-800 text-zinc-500"
                }`}
              >
                {i + 1}
              </span>
              <span className="font-medium text-zinc-200">{s.label}</span>
              <span className="text-zinc-500">— {s.desc}</span>
              <span className="ml-auto">
                {s.done ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-[9px] uppercase tracking-wider text-emerald-300"
                  >
                    Done
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/10 text-[9px] uppercase tracking-wider text-amber-300"
                  >
                    Pending
                  </Badge>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* Quick action cards — all locked */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 hud-corners lg:col-span-3">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-violet-400/60">
          Quick actions
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <LockedActionCard icon={Rocket} label="Run a new scan" />
          <LockedActionCard icon={Boxes} label="Add a codebase" />
          <LockedActionCard icon={Building2} label="Add a client" />
        </div>
      </div>
    </div>
  );
}

function FindingsPanel() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hud-corners">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-red-400/60">
          Recent findings (sample)
        </span>
        <Badge variant="outline" className="border-zinc-700 text-[10px] text-zinc-400">
          {MOCK_FINDINGS.length} items
        </Badge>
      </div>
      <ul className="custom-scrollbar max-h-[28rem] divide-y divide-zinc-800/60 overflow-y-auto">
        {MOCK_FINDINGS.map((f) => (
          <li
            key={f.id}
            className="flex items-start gap-3 px-1 py-3 transition-colors hover:bg-zinc-800/30"
          >
            <Badge
              variant="outline"
              className={`shrink-0 uppercase tracking-wider ${SEVERITY_STYLES[f.severity]}`}
            >
              {f.severity}
            </Badge>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-zinc-100">{f.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-zinc-500">
                <span>{f.client}</span>
                <span className="text-zinc-700">/</span>
                <span className="font-mono">{f.codebase}</span>
                <span className="text-zinc-700">/</span>
                <span className="font-mono text-cyan-400/80">{f.cwe}</span>
              </div>
            </div>
            <Badge
              variant="outline"
              className={`shrink-0 text-[10px] uppercase tracking-wider ${
                f.status === "patched"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
              }`}
            >
              {f.status}
            </Badge>
            <DemoButton compact>
              <ChevronRight className="size-3.5" />
            </DemoButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ClientsPanel() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {MOCK_CLIENTS.map((c) => (
        <div
          key={c.id}
          className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 hud-corners"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                <Building2 className="size-4 text-emerald-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-zinc-50">{c.name}</div>
                <div className="text-[10px] text-zinc-500">{c.industry}</div>
              </div>
            </div>
            <Badge
              variant="outline"
              className={`text-[10px] uppercase tracking-wider ${
                c.status === "active"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
              }`}
            >
              {c.status}
            </Badge>
          </div>

          {/* Posture */}
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[10px] text-zinc-500">
              <span>Posture</span>
              <span className="font-mono text-zinc-300">{c.posture}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300"
                style={{ width: `${c.posture}%` }}
              />
            </div>
          </div>

          {/* Stats */}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat label="Codebases" value={c.codebases} />
            <Stat label="Findings" value={c.findings} />
            <Stat label="Patches" value={c.patches} />
          </div>

          <div className="mt-4">
            <DemoButton className="w-full">
              <span className="flex items-center justify-center gap-1.5">
                View client
                <ChevronRight className="size-3.5" />
              </span>
            </DemoButton>
          </div>
        </div>
      ))}
    </div>
  );
}

function CodebasesPanel() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hud-corners">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-cyan-400/60">
          Codebases (sample)
        </span>
        <DemoButton size="sm">
          <span className="flex items-center gap-1.5">
            <Boxes className="size-3.5" />
            Add codebase
          </span>
        </DemoButton>
      </div>
      <ul className="divide-y divide-zinc-800/60">
        {MOCK_CODEBASES.map((cb) => (
          <li key={cb.id} className="flex items-center gap-3 py-3">
            <div className="flex size-9 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
              <Boxes className="size-4 text-cyan-400" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-sm text-zinc-100">{cb.name}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
                <span className={LANG_COLORS[cb.language] ?? "text-zinc-400"}>
                  {cb.language}
                </span>
                <span className="text-zinc-700">/</span>
                <span>{cb.client}</span>
              </div>
            </div>
            <Badge
              variant="outline"
              className="border-emerald-500/30 bg-emerald-500/10 text-[10px] uppercase tracking-wider text-emerald-300"
            >
              {cb.patches} patches
            </Badge>
            <DemoButton compact>
              <Zap className="size-3.5" />
            </DemoButton>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Small building blocks ─────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  accent: "emerald" | "cyan" | "red";
}) {
  const accentClass =
    accent === "emerald"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
      : accent === "cyan"
        ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-400"
        : "border-red-500/30 bg-red-500/10 text-red-400";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hud-corners">
      <div className={`flex size-10 items-center justify-center rounded-lg border ${accentClass}`}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold tabular-nums text-zinc-50">{value}</div>
        <div className="truncate text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/40 px-2 py-1.5">
      <div className="text-sm font-bold tabular-nums text-zinc-100">{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
    </div>
  );
}

function LockedActionCard({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="relative flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
      <div className="flex size-9 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10">
        <Icon className="size-4 text-violet-300" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-zinc-200">{label}</div>
        <div className="text-[10px] text-zinc-500">Locked in demo</div>
      </div>
      <Lock className="size-4 text-zinc-600" />
      <DemoButton
        compact
        className="absolute inset-0 flex items-center justify-center opacity-0"
        ariaHidden
      >
        <span className="sr-only">{label}</span>
      </DemoButton>
    </div>
  );
}

/**
 * A Button that is always disabled and wrapped in a tooltip explaining
 * that the visitor needs to sign up. Visual style mirrors the real
 * action buttons so the demo looks like the real Command Center.
 */
function DemoButton({
  children,
  size = "default",
  compact = false,
  className = "",
  ariaHidden = false,
}: {
  children: React.ReactNode;
  size?: "sm" | "default";
  compact?: boolean;
  className?: string;
  ariaHidden?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="button"
          aria-hidden={ariaHidden || undefined}
          aria-disabled="true"
          tabIndex={-1}
          className={`inline-flex cursor-not-allowed select-none items-center justify-center rounded-md border border-zinc-700 bg-zinc-900/60 text-zinc-500 opacity-80 hover:opacity-100 ${
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-xs"
          } ${compact ? "size-7 p-0" : ""} ${className}`}
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="border-emerald-500/30 bg-zinc-950 text-emerald-300"
      >
        <span className="flex items-center gap-1.5">
          <Lock className="size-3" />
          Sign up to use this feature
        </span>
      </TooltipContent>
    </Tooltip>
  );
}
