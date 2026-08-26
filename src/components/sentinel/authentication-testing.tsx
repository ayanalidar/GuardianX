"use client";

import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Clock,
  Copy,
  Eye,
  KeyRound,
  Loader2,
  Lock,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  UserX,
  XCircle,
} from "lucide-react";

// ── Types (mirror the API response) ────────────────────────────────────────

type Severity = "info" | "low" | "medium" | "high" | "critical";

type AuthTestType =
  | "default_credentials"
  | "brute_force"
  | "credential_stuffing"
  | "password_policy"
  | "account_lockout"
  | "remember_me_bypass"
  | "username_enumeration";

interface AuthAttempt {
  username: string;
  password: string;
  status: number;
  durationMs: number;
  responseSnippet: string;
  loginOk: boolean;
}

interface AuthFinding {
  testType: AuthTestType;
  label: string;
  vulnerable: boolean;
  severity: Severity;
  cwe: string;
  attempts: AuthAttempt[];
  responseSnippet: string;
  description: string;
  remediation: string;
}

interface AuthResponse {
  engagementId?: string;
  targetUrl?: string;
  loginUrl?: string;
  usernameField?: string;
  passwordField?: string;
  probeLog?: string[];
  testedCount?: number;
  vulnerableCount?: number;
  criticalCount?: number;
  highCount?: number;
  mediumCount?: number;
  findings?: AuthFinding[];
  error?: string;
}

// ── Style maps ───────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: "border-red-500/50 bg-red-500/10 text-red-300",
  high: "border-orange-500/50 bg-orange-500/10 text-orange-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-zinc-600 bg-zinc-700/40 text-zinc-300",
  info: "border-zinc-700 bg-zinc-800/40 text-zinc-400",
};

const SEVERITY_DOT: Record<Severity, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-zinc-500",
  info: "bg-zinc-600",
};

// Test-type badges per spec:
// Default Creds=red, Brute Force=amber, Cred Stuffing=red, Password Policy=violet,
// Account Lockout=amber, Remember-Me=cyan, User Enumeration=sky
const TEST_TYPE_STYLE: Record<AuthTestType, string> = {
  default_credentials: "border-red-500/50 bg-red-500/10 text-red-300",
  brute_force: "border-amber-500/50 bg-amber-500/10 text-amber-300",
  credential_stuffing: "border-red-500/50 bg-red-500/10 text-red-300",
  password_policy: "border-violet-500/50 bg-violet-500/10 text-violet-300",
  account_lockout: "border-amber-500/50 bg-amber-500/10 text-amber-300",
  remember_me_bypass: "border-cyan-500/50 bg-cyan-500/10 text-cyan-300",
  username_enumeration: "border-sky-500/50 bg-sky-500/10 text-sky-300",
};

// Live progress phases (the API is single-shot).
const PROGRESS_PHASES = [
  "Resolving login endpoint",
  "Probing default credentials (24 pairs)",
  "Brute force (50 rapid attempts)",
  "Credential stuffing (10 breached pairs)",
  "Password policy (weak passwords)",
  "Account lockout (10 failed + 1 retry)",
  "Remember-me bypass (cookie inspection)",
  "Username enumeration (response diff)",
  "Persisting findings",
];

// ── Component ──────────────────────────────────────────────────────────────

export function AuthenticationTesting() {
  const { toast } = useToast();
  const [targetUrl, setTargetUrl] = useState("https://app.example.com");
  const [loginUrl, setLoginUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [result, setResult] = useState<AuthResponse | null>(null);

  const run = useCallback(async () => {
    if (!targetUrl.trim()) {
      toast({
        title: "Target URL required",
        description: "Enter the base URL of the target application.",
        variant: "destructive",
      });
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(targetUrl.trim());
    } catch {
      toast({ title: "Invalid URL", description: "Include the protocol (https://).", variant: "destructive" });
      return;
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      toast({ title: "Invalid scheme", description: "Only http/https.", variant: "destructive" });
      return;
    }
    if (
      parsed.hostname === "localhost" ||
      parsed.hostname.endsWith(".localhost") ||
      /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(parsed.hostname)
    ) {
      toast({
        title: "SSRF guard",
        description: "Private/loopback hosts are not allowed.",
        variant: "destructive",
      });
      return;
    }

    setRunning(true);
    setResult(null);
    setProgress(2);
    setPhaseIdx(0);

    const interval = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(p + Math.random() * 5, 92);
        const phaseFrac = next / 100;
        const idx = Math.min(
          Math.floor(phaseFrac * PROGRESS_PHASES.length),
          PROGRESS_PHASES.length - 1,
        );
        setPhaseIdx(idx);
        return next;
      });
    }, 400);

    try {
      const res = await fetch("/api/vapt/authentication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: targetUrl.trim(),
          ...(loginUrl.trim() ? { loginUrl: loginUrl.trim() } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as AuthResponse;

      if (!res.ok || data.error) {
        const msg = data.error || `Request failed with HTTP ${res.status}`;
        toast({ title: "Auth scan failed", description: msg, variant: "destructive" });
        setResult({ ...data, error: msg });
      } else {
        setResult(data);
        const vuln = data.vulnerableCount ?? 0;
        const crit = data.criticalCount ?? 0;
        if (crit > 0) {
          toast({
            variant: "destructive",
            title: `⚠ ${crit} CRITICAL auth finding(s)!`,
            description: `Default credentials accepted — immediate admin access. ${vuln} total vulnerable.`,
          });
        } else if (vuln > 0) {
          toast({
            variant: "destructive",
            title: `${vuln} auth finding(s)`,
            description: "Auth controls are weak — review findings.",
          });
        } else {
          toast({
            title: "Auth scan complete",
            description: `Tested ${data.testedCount ?? 0} checks. No auth vulnerabilities confirmed.`,
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast({ title: "Auth scan failed", description: msg, variant: "destructive" });
      setResult({ error: msg });
    } finally {
      clearInterval(interval);
      setProgress(100);
      setRunning(false);
      setTimeout(() => setProgress(0), 1200);
    }
  }, [targetUrl, loginUrl, toast]);

  const reset = () => {
    setResult(null);
    setExpanded(null);
    setProgress(0);
    setPhaseIdx(0);
  };

  const findings = result?.findings ?? [];
  const vulnerableFindings = findings.filter((f) => f.vulnerable);
  const hasCritical = (result?.criticalCount ?? 0) > 0;

  return (
    <div className="space-y-5 px-3 pb-10 pt-4 sm:px-5 md:px-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="hud-corners relative overflow-hidden rounded-xl border border-red-500/20 bg-zinc-950/60 p-4 sm:p-5">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.10),transparent_55%)]" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10">
              <Lock className="size-6 text-red-400" />
            </div>
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-zinc-50 sm:text-xl">
                AUTHENTICATION TESTING
                <Badge
                  variant="outline"
                  className="border-red-500/30 bg-red-500/10 text-[10px] text-red-300"
                >
                  <KeyRound className="size-3" /> OWASP A07
                </Badge>
              </h2>
              <p className="mt-1 text-xs text-zinc-400 sm:text-sm">
                Probes the target&apos;s login flow for default credentials, brute force,
                credential stuffing, weak password policy, account lockout, remember-me bypass,
                and username enumeration.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant="outline"
              className="border-zinc-700 bg-zinc-900/60 text-[10px] text-zinc-400"
            >
              <Terminal className="size-3" /> 7 test classes
            </Badge>
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300"
            >
              <ShieldAlert className="size-3" /> Authorized
            </Badge>
          </div>
        </div>
      </header>

      {/* ── Input form ─────────────────────────────────────────────────── */}
      <Card className="hud-corners gap-0 rounded-xl border-zinc-800 bg-zinc-950/60 p-4 sm:p-5">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-red-400/70">
          Auth Test Configuration
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="auth-target-url" className="text-xs font-medium text-zinc-300">
              Target URL <span className="text-red-400">*</span>
            </Label>
            <Input
              id="auth-target-url"
              placeholder="https://app.example.com"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              disabled={running}
              className="mt-1.5 border-zinc-700 bg-zinc-900/60 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-red-500/50 focus-visible:ring-red-500/20"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              The base URL of the target application. Private IPs are rejected (SSRF guard).
            </p>
          </div>
          <div>
            <Label htmlFor="auth-login-url" className="text-xs font-medium text-zinc-300">
              Login URL <span className="text-zinc-500">(optional)</span>
            </Label>
            <Input
              id="auth-login-url"
              placeholder="/login, /api/auth/login, /signin (auto-probed if blank)"
              value={loginUrl}
              onChange={(e) => setLoginUrl(e.target.value)}
              disabled={running}
              className="mt-1.5 border-zinc-700 bg-zinc-900/60 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-amber-500/50 focus-visible:ring-amber-500/20"
            />
            <p className="mt-1 text-[11px] text-zinc-500">
              If omitted, GuardianX probes common login paths:{" "}
              <code className="text-zinc-400">/login</code>,{" "}
              <code className="text-zinc-400">/api/auth/login</code>,{" "}
              <code className="text-zinc-400">/signin</code>,{" "}
              <code className="text-zinc-400">/admin/login</code> + 5 more.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
          <span className="text-[10px] text-zinc-500 sm:mr-auto">
            {loginUrl.trim()
              ? `Testing login endpoint: ${loginUrl.trim()}`
              : "Auto-detecting login endpoint from common paths"}
          </span>
          <Button
            onClick={run}
            disabled={running || !targetUrl.trim()}
            className="gap-2 border-red-500/40 bg-red-500/15 text-red-200 hover:bg-red-500/25 hover:text-red-100"
            variant="outline"
          >
            {running ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Testing…
              </>
            ) : (
              <>
                <Play className="size-4" /> Run Auth Tests
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* ── Live progress ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {running && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card className="hud-corners gap-0 rounded-xl border-red-500/30 bg-zinc-950/70 p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin text-red-400" />
                  <span className="text-sm font-medium text-zinc-200">
                    {PROGRESS_PHASES[phaseIdx]}…
                  </span>
                </div>
                <Badge className="border-red-500/30 bg-red-500/10 text-red-300">
                  {Math.round(progress)}%
                </Badge>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded bg-zinc-800">
                <motion.div
                  className="h-full bg-gradient-to-r from-red-500 to-amber-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ ease: "linear", duration: 0.3 }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-zinc-400">
                  <Clock className="size-3" /> ~30s ETA
                </Badge>
                <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-zinc-400">
                  <KeyRound className="size-3" /> 24+ default creds
                </Badge>
                <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-zinc-400">
                  <Eye className="size-3" /> 5s per-request timeout
                </Badge>
              </div>
              {/* Test classes live status */}
              <div className="mt-4 grid gap-1.5 sm:grid-cols-2">
                {[
                  { label: "Default Credentials", cwe: "CWE-798", testType: "default_credentials" as AuthTestType },
                  { label: "Brute Force", cwe: "CWE-307", testType: "brute_force" as AuthTestType },
                  { label: "Credential Stuffing", cwe: "CWE-521", testType: "credential_stuffing" as AuthTestType },
                  { label: "Password Policy", cwe: "CWE-521", testType: "password_policy" as AuthTestType },
                  { label: "Account Lockout", cwe: "CWE-307", testType: "account_lockout" as AuthTestType },
                  { label: "Remember-Me Bypass", cwe: "CWE-639", testType: "remember_me_bypass" as AuthTestType },
                  { label: "Username Enumeration", cwe: "CWE-204", testType: "username_enumeration" as AuthTestType },
                ].map((t, i) => {
                  // Map phase idx → test class idx (roughly).
                  const testIdx = i === 0 ? 1 : i === 1 ? 2 : i === 2 ? 3 : i === 3 ? 4 : i === 4 ? 5 : i === 5 ? 6 : 7;
                  const isActive = phaseIdx === testIdx;
                  const isDone = phaseIdx > testIdx;
                  return (
                    <div
                      key={t.label}
                      className={`flex items-center gap-2 rounded border p-1.5 transition-colors ${
                        isActive
                          ? `bg-zinc-900/60 ${TEST_TYPE_STYLE[t.testType]}`
                          : isDone
                            ? "border-emerald-500/20 bg-emerald-500/5"
                            : "border-zinc-800 bg-zinc-900/30"
                      }`}
                    >
                      {isActive ? (
                        <Loader2 className="size-3 animate-spin text-red-400" />
                      ) : isDone ? (
                        <ShieldCheck className="size-3 text-emerald-400" />
                      ) : (
                        <span className="size-3 rounded-full border border-zinc-700" />
                      )}
                      <span className="text-[10px] text-zinc-300">{t.label}</span>
                      <span className="ml-auto font-mono text-[9px] text-zinc-600">{t.cwe}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {result?.error && !running && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/5 p-4"
          >
            <XCircle className="mt-0.5 size-5 shrink-0 text-red-400" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-300">Scan failed</p>
              <p className="mt-0.5 text-xs text-zinc-300">{result.error}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={reset} className="text-zinc-400 hover:text-zinc-200">
              <RefreshCw className="size-3.5" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Critical alert ─────────────────────────────────────────────── */}
      {hasCritical && !running && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="hud-corners gap-0 rounded-xl border-red-500/60 bg-red-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-400" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-red-300">
                    CRITICAL — Authentication Bypass Confirmed
                  </span>
                  <Badge className="border border-red-500/50 bg-red-500/20 text-[9px] text-red-300">
                    CWE-798
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-red-200/80">
                  The target accepted one or more default / weak credential pairs. An attacker
                  can log in immediately with publicly-known credentials. Rotate all default
                  passwords and force a password change on first login.
                </p>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* ── Summary tiles ──────────────────────────────────────────────── */}
      {result && !result.error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {[
            {
              label: "Tested",
              value: result.testedCount ?? 0,
              color: "text-zinc-100",
              border: "border-zinc-800",
              icon: Terminal,
            },
            {
              label: "Vulnerable",
              value: result.vulnerableCount ?? 0,
              color: (result.vulnerableCount ?? 0) > 0 ? "text-red-400" : "text-emerald-400",
              border: (result.vulnerableCount ?? 0) > 0 ? "border-red-500/40" : "border-emerald-500/40",
              icon: (result.vulnerableCount ?? 0) > 0 ? ShieldAlert : ShieldCheck,
            },
            {
              label: "Critical",
              value: result.criticalCount ?? 0,
              color: "text-red-400",
              border: "border-red-500/40",
              icon: AlertTriangle,
            },
            {
              label: "High",
              value: result.highCount ?? 0,
              color: "text-orange-400",
              border: "border-orange-500/40",
              icon: ShieldAlert,
            },
          ].map((m, i) => {
            const Icon = m.icon;
            return (
              <div
                key={i}
                className={`hud-corners rounded-lg border ${m.border} bg-zinc-900/40 p-3 text-center`}
              >
                <Icon className="mx-auto mb-1 size-3.5 text-zinc-500" />
                <div className={`font-mono text-2xl font-bold ${m.color}`}>{m.value}</div>
                <div className="text-[9px] uppercase tracking-wide text-zinc-500">{m.label}</div>
              </div>
            );
          })}
        </motion.div>
      )}

      {/* ── Meta row ───────────────────────────────────────────────────── */}
      {result && !result.error && !running && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {result.engagementId && (
            <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-zinc-400">
              <Terminal className="size-3" /> Engagement:{" "}
              <span className="ml-1 font-mono text-zinc-300">
                {result.engagementId.slice(0, 12)}…
              </span>
            </Badge>
          )}
          {result.loginUrl && (
            <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-zinc-400">
              <KeyRound className="size-3" /> Login:{" "}
              <span className="ml-1 font-mono text-zinc-300">{result.loginUrl}</span>
            </Badge>
          )}
          {result.usernameField && result.passwordField && (
            <Badge variant="outline" className="border-zinc-700 bg-zinc-900/60 text-zinc-400">
              fields:{" "}
              <span className="ml-1 font-mono text-zinc-300">
                {result.usernameField}/{result.passwordField}
              </span>
            </Badge>
          )}
          {!!result.mediumCount && result.mediumCount > 0 && (
            <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-300">
              {result.mediumCount} medium
            </Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={reset}
            className="ml-auto text-zinc-400 hover:text-zinc-200"
          >
            <RefreshCw className="size-3.5" /> New run
          </Button>
        </div>
      )}

      {/* ── Findings table ─────────────────────────────────────────────── */}
      {result && !result.error && findings.length > 0 && (
        <Card className="hud-corners gap-0 rounded-xl p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-red-400" />
              <span className="text-sm font-bold text-zinc-100">Auth Test Results</span>
              <Badge className="border border-zinc-700 bg-zinc-900/50 text-[9px] text-zinc-400">
                {findings.length} tested
              </Badge>
              {vulnerableFindings.length > 0 && (
                <Badge className="border border-red-500/40 bg-red-500/10 text-[9px] text-red-300">
                  {vulnerableFindings.length} vulnerable
                </Badge>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {findings.map((f, i) => {
              const isOpen = expanded === `f-${i}`;
              return (
                <motion.div
                  key={`f-${i}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`rounded-lg border p-3 transition-colors ${
                    f.vulnerable
                      ? f.severity === "critical"
                        ? "border-red-500/60 bg-red-500/10"
                        : f.severity === "high"
                          ? "border-red-500/40 bg-red-500/5"
                          : "border-amber-500/30 bg-amber-500/5"
                      : "border-zinc-800 bg-zinc-900/30"
                  }`}
                >
                  <button
                    onClick={() => setExpanded(isOpen ? null : `f-${i}`)}
                    className="block w-full text-left"
                  >
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-1 size-2 shrink-0 rounded-full ${SEVERITY_DOT[f.severity]}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge
                            className={`border text-[9px] ${TEST_TYPE_STYLE[f.testType]}`}
                          >
                            {f.label}
                          </Badge>
                          <Badge className={`border text-[9px] ${SEVERITY_STYLE[f.severity]}`}>
                            {f.severity.toUpperCase()}
                          </Badge>
                          <span className="font-mono text-[9px] text-zinc-500">
                            CWE {f.cwe.replace("CWE-", "")}
                          </span>
                          <span className="font-mono text-[9px] text-zinc-600">
                            {f.attempts.length} attempts
                          </span>
                          {f.vulnerable && (
                            <AlertTriangle className="ml-auto size-3 text-red-400" />
                          )}
                          {!f.vulnerable && (
                            <ShieldCheck className="ml-auto size-3 text-emerald-400/60" />
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-zinc-300 line-clamp-2">
                          {f.description}
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="mt-3 space-y-2 border-t border-zinc-800 pt-2"
                    >
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                          Attempts ({f.attempts.length})
                        </div>
                        <div className="custom-scrollbar mt-1 max-h-48 overflow-y-auto rounded bg-black/50 p-2 font-mono text-[10px]">
                          {f.attempts.map((a, j) => (
                            <div
                              key={j}
                              className={`flex items-center gap-2 py-0.5 ${
                                a.loginOk ? "text-red-300" : "text-zinc-400"
                              }`}
                            >
                              {a.loginOk && <AlertTriangle className="size-2.5 text-red-400" />}
                              <span className="text-zinc-300">{a.username}</span>
                              <span className="text-zinc-600">:</span>
                              <span className="text-zinc-400">{a.password}</span>
                              <span className="ml-auto text-zinc-500">
                                HTTP {a.status} · {a.durationMs}ms
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                          Server response
                        </div>
                        <pre className="custom-scrollbar mt-1 max-h-32 overflow-auto rounded bg-black/50 p-2 font-mono text-[10px] text-zinc-300">
                          {f.responseSnippet}
                        </pre>
                      </div>
                      {f.vulnerable && f.remediation && (
                        <div className="flex items-start gap-2 rounded border border-zinc-800 bg-zinc-900/40 p-2">
                          <ShieldCheck className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                          <div>
                            <div className="font-mono text-[9px] uppercase tracking-wider text-emerald-400/80">
                              Remediation
                            </div>
                            <p className="mt-0.5 text-[10px] text-zinc-400">{f.remediation}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(
                              f.attempts.map((a) => `${a.username}:${a.password}`).join("\n"),
                            );
                            toast({ title: "Copied credential pairs", description: `${f.attempts.length} entries` });
                          }}
                          className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900/50 px-2 py-0.5 text-[9px] text-zinc-400 hover:border-red-500/40 hover:text-red-300"
                        >
                          <Copy className="size-2.5" /> Copy creds
                        </button>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Probe log ──────────────────────────────────────────────────── */}
      {result?.probeLog && result.probeLog.length > 0 && !running && (
        <Card className="hud-corners gap-0 rounded-xl border-zinc-800 bg-zinc-950/60 p-4">
          <div className="mb-2 flex items-center gap-2">
            <UserX className="size-4 text-zinc-500" />
            <span className="text-xs font-semibold text-zinc-300">Login Endpoint Probe Log</span>
          </div>
          <pre className="custom-scrollbar max-h-32 overflow-y-auto rounded bg-black/50 p-2 font-mono text-[10px] text-zinc-400">
            {result.probeLog.join("\n")}
          </pre>
        </Card>
      )}
    </div>
  );
}
