"use client";

import { useCallback, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Play,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  XCircle,
} from "lucide-react";
import { motion } from "framer-motion";

// ── Types (mirror the API response shape) ────────────────────────────────────
type AttackType =
  | "alg-none"
  | "key-confusion"
  | "expired-token"
  | "weak-secret"
  | "token-tampering"
  | "session-fixation"
  | "missing-token"
  | "invalid-signature";

type Severity = "critical" | "high" | "medium";

interface JwtFinding {
  testId: string;
  attackType: AttackType;
  title: string;
  severity: Severity;
  cwe: string;
  vulnerable: boolean;
  tamperedToken?: string;
  proofRequest: string;
  proofResponse: string;
  description: string;
  remediation: string;
}

interface JwtResponse {
  engagementId: string;
  targetUrl: string;
  testedCount: number;
  vulnerableCount: number;
  criticalCount: number;
  findings: JwtFinding[];
  error?: string;
}

// ── Attack type metadata (label, color, icon-ish description) ───────────────
const ATTACK_META: Record<
  AttackType,
  { label: string; color: string; ring: string; bg: string }
> = {
  "alg-none": {
    label: "alg=none",
    color: "text-red-300",
    ring: "border-red-500/40",
    bg: "bg-red-500/10",
  },
  "key-confusion": {
    label: "Key Confusion",
    color: "text-red-300",
    ring: "border-red-500/40",
    bg: "bg-red-500/10",
  },
  "expired-token": {
    label: "Expired Token",
    color: "text-amber-300",
    ring: "border-amber-500/40",
    bg: "bg-amber-500/10",
  },
  "weak-secret": {
    label: "Weak Secret",
    color: "text-red-300",
    ring: "border-red-500/40",
    bg: "bg-red-500/10",
  },
  "token-tampering": {
    label: "Token Tampering",
    color: "text-red-300",
    ring: "border-red-500/40",
    bg: "bg-red-500/10",
  },
  "session-fixation": {
    label: "Session Fixation",
    color: "text-violet-300",
    ring: "border-violet-500/40",
    bg: "bg-violet-500/10",
  },
  "missing-token": {
    label: "Missing Token",
    color: "text-red-300",
    ring: "border-red-500/40",
    bg: "bg-red-500/10",
  },
  "invalid-signature": {
    label: "Invalid Signature",
    color: "text-red-300",
    ring: "border-red-500/40",
    bg: "bg-red-500/10",
  },
};

const SEVERITY_BADGE: Record<Severity, string> = {
  critical: "border-red-500/50 bg-red-500/15 text-red-300",
  high: "border-orange-500/50 bg-orange-500/15 text-orange-300",
  medium: "border-amber-500/50 bg-amber-500/15 text-amber-300",
};

const SEVERITY_GLOW: Record<Severity, string> = {
  critical: "neon-rose",
  high: "neon-amber",
  medium: "neon-violet",
};

// Order in which the API runs tests — used for the "live test results" view.
const ATTACK_ORDER: AttackType[] = [
  "alg-none",
  "key-confusion",
  "expired-token",
  "weak-secret",
  "token-tampering",
  "session-fixation",
  "missing-token",
  "invalid-signature",
];

export function JwtAuthTesting() {
  const { toast } = useToast();
  const [targetUrl, setTargetUrl] = useState("http://localhost:3004/api/protected");
  const [token, setToken] = useState(
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3MDAwMDAwMDB9.s3cr3t",
  );
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<JwtResponse | null>(null);
  const [activeStep, setActiveStep] = useState<AttackType | null>(null);
  const [hideTokens, setHideTokens] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!targetUrl.trim()) {
      toast({ variant: "destructive", title: "Target URL required" });
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      // Simulate "live test results" by cycling through attack types while
      // the request is in flight. Once the response arrives, the final
      // findings table replaces this animation.
      let i = 0;
      const interval = setInterval(() => {
        setActiveStep(ATTACK_ORDER[i % ATTACK_ORDER.length]);
        i += 1;
      }, 350);

      const res = await fetch("/api/vapt/jwt-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: targetUrl.trim(),
          token: token.trim() || undefined,
        }),
      });
      const data = (await res.json()) as JwtResponse;
      clearInterval(interval);
      setActiveStep(null);

      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "JWT tests failed",
          description: data.error ?? `HTTP ${res.status}`,
        });
      } else {
        setResult(data);
        if (data.vulnerableCount > 0) {
          toast({
            variant: "destructive",
            title: `${data.vulnerableCount} JWT auth vulnerability(ies) found`,
            description: `${data.criticalCount} critical of ${data.testedCount} tests`,
          });
        } else {
          toast({
            title: "JWT tests complete",
            description: `${data.testedCount} tests run, no vulnerabilities detected.`,
          });
        }
      }
    } catch (err) {
      setActiveStep(null);
      toast({
        variant: "destructive",
        title: "JWT tests failed",
        description: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      setRunning(false);
    }
  }, [targetUrl, token, toast]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Token copied to clipboard" });
  };

  const tested = result?.testedCount ?? 0;
  const vulnerable = result?.vulnerableCount ?? 0;
  const critical = result?.criticalCount ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-violet-400/60">
          <span className="size-1.5 rounded-full bg-violet-500 pulse-dot" />
          guardianx@jwt-auth-testing:~$
        </div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50 neon-rose sm:text-2xl">
          <KeyRound className="size-5 text-rose-400 sm:size-6" />
          JWT / Authentication Testing
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          Adversarial JWT attack suite: <span className="text-rose-300">alg=none</span>,{" "}
          <span className="text-rose-300">RS256→HS256 key confusion</span>,{" "}
          <span className="text-amber-300">expired token</span>,{" "}
          <span className="text-rose-300">weak secret brute force</span>,{" "}
          <span className="text-rose-300">payload tampering</span>,{" "}
          <span className="text-violet-300">session fixation</span>,{" "}
          <span className="text-rose-300">missing token</span>, and{" "}
          <span className="text-rose-300">invalid signature</span>.
        </p>
      </div>

      {/* Configuration */}
      <Card className="holo-card hud-corners gap-0 rounded-xl p-4 sm:p-6">
        <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-rose-400/70">
          Target & Sample Token
        </div>
        <div className="grid gap-4">
          <div>
            <Label className="text-xs text-zinc-400">Target URL (uses JWT auth)</Label>
            <Input
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://target.example.com/api/protected"
              className="mt-1 border-zinc-800 bg-zinc-900/60 font-mono text-sm text-zinc-200"
            />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">
              Sample JWT token <span className="text-zinc-600">(optional — a dummy HS256 token is used if omitted)</span>
            </Label>
            <Textarea
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              className="custom-scrollbar mt-1 min-h-[5rem] resize-y border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-300"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setHideTokens((v) => !v)}
            className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900/40 px-2.5 py-1 text-[10px] text-zinc-400 transition-colors hover:border-violet-500/40 hover:text-violet-300"
          >
            {hideTokens ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            {hideTokens ? "Reveal tokens" : "Mask tokens"}
          </button>
          <Button
            onClick={run}
            disabled={running || !targetUrl.trim()}
            className="bg-rose-600 text-white hover:bg-rose-500"
          >
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {running ? "Running JWT tests..." : "Run JWT Tests"}
          </Button>
        </div>
      </Card>

      {/* Live test results while running */}
      {running && (
        <Card className="holo-card hud-corners gap-0 rounded-xl border-rose-500/30 p-4 sm:p-6">
          <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-rose-400/80">
            <Loader2 className="size-3 animate-spin" />
            Running attacks — live
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ATTACK_ORDER.map((atk) => {
              const meta = ATTACK_META[atk];
              const isActive = activeStep === atk;
              return (
                <motion.div
                  key={atk}
                  animate={isActive ? { scale: 1.04 } : { scale: 1 }}
                  transition={{ duration: 0.18 }}
                  className={`rounded-lg border p-2.5 ${meta.ring} ${meta.bg} ${isActive ? "ring-2 ring-rose-500/40" : ""}`}
                >
                  <div className={`flex items-center gap-1.5 text-[10px] font-medium ${meta.color}`}>
                    {isActive ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Clock className="size-3 opacity-60" />
                    )}
                    {meta.label}
                  </div>
                  <div className="mt-1 font-mono text-[9px] text-zinc-500">
                    {isActive ? "firing..." : "queued"}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Summary tiles + findings table */}
      {result && !running && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
          {/* Summary tiles */}
          <div className="grid grid-cols-3 gap-3">
            <SummaryTile
              label="Tests Run"
              value={tested}
              icon={<Terminal className="size-4 text-emerald-400" />}
              accent="border-emerald-500/30 bg-emerald-500/5"
            />
            <SummaryTile
              label="Vulnerable"
              value={vulnerable}
              icon={<ShieldAlert className="size-4 text-rose-400" />}
              accent="border-rose-500/30 bg-rose-500/5"
            />
            <SummaryTile
              label="Critical"
              value={critical}
              icon={<AlertTriangle className="size-4 text-rose-400" />}
              accent="border-rose-500/30 bg-rose-500/5"
            />
          </div>

          {/* Engagement ID strip */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 font-mono text-[10px] text-zinc-500">
            <KeyRound className="size-3 text-violet-400" />
            engagement
            <code className="text-violet-300">{result.engagementId}</code>
            <span className="text-zinc-700">·</span>
            <span className="text-zinc-400">target</span>
            <code className="text-zinc-300">{result.targetUrl}</code>
          </div>

          {/* Findings table */}
          <Card className="holo-card hud-corners gap-0 rounded-xl p-4 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-rose-400/70">
                Findings ({result.findings.length})
              </span>
              <div className="flex items-center gap-1.5">
                {vulnerable > 0 ? (
                  <ShieldAlert className="size-4 text-rose-400" />
                ) : (
                  <ShieldCheck className="size-4 text-emerald-400" />
                )}
                <span className={`text-xs font-semibold ${vulnerable > 0 ? "text-rose-300" : "text-emerald-300"}`}>
                  {vulnerable > 0 ? `${vulnerable} vulnerable` : "secure"}
                </span>
              </div>
            </div>

            {/* Desktop table header */}
            <div className="hidden grid-cols-12 gap-2 border-b border-zinc-800 pb-2 font-mono text-[9px] uppercase tracking-wider text-zinc-500 md:grid">
              <div className="col-span-3">Attack</div>
              <div className="col-span-1">Sev</div>
              <div className="col-span-2">CWE</div>
              <div className="col-span-4">Tampered Token</div>
              <div className="col-span-2 text-right">Status</div>
            </div>

            <div className="custom-scrollbar max-h-[28rem] space-y-2 overflow-y-auto">
              {result.findings.map((f, i) => {
                const meta = ATTACK_META[f.attackType];
                const isExpanded = expandedRow === f.testId;
                const displayedToken = f.tamperedToken
                  ? hideTokens
                    ? "•".repeat(Math.min(f.tamperedToken.length, 32))
                    : f.tamperedToken.length > 80
                      ? `${f.tamperedToken.slice(0, 78)}…`
                      : f.tamperedToken
                  : "—";
                return (
                  <motion.div
                    key={f.testId}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className={`rounded-lg border p-3 ${f.vulnerable ? meta.ring + " " + meta.bg : "border-zinc-800 bg-zinc-900/30"}`}
                  >
                    {/* Row header (clickable to expand) */}
                    <button
                      type="button"
                      onClick={() => setExpandedRow(isExpanded ? null : f.testId)}
                      className="grid w-full grid-cols-12 items-center gap-2 text-left"
                    >
                      <div className="col-span-12 md:col-span-3">
                        <div className="flex items-center gap-1.5">
                          <Badge className={`border text-[9px] ${meta.ring} ${meta.bg} ${meta.color}`}>
                            {meta.label}
                          </Badge>
                        </div>
                        <div className="mt-1 text-[11px] font-medium text-zinc-200 line-clamp-1">{f.title}</div>
                      </div>
                      <div className="col-span-3 md:col-span-1">
                        <Badge className={`border text-[9px] ${SEVERITY_BADGE[f.severity]} ${SEVERITY_GLOW[f.severity]}`}>
                          {f.severity}
                        </Badge>
                      </div>
                      <div className="col-span-3 md:col-span-2">
                        <code className="font-mono text-[10px] text-violet-300">{f.cwe}</code>
                      </div>
                      <div className="col-span-12 md:col-span-4">
                        <code className="block truncate font-mono text-[10px] text-emerald-300">
                          {displayedToken}
                        </code>
                      </div>
                      <div className="col-span-6 md:col-span-2 flex items-center justify-end gap-1.5">
                        {f.vulnerable ? (
                          <XCircle className="size-3.5 text-rose-400" />
                        ) : (
                          <CheckCircle2 className="size-3.5 text-emerald-400" />
                        )}
                        <span className={`text-[10px] ${f.vulnerable ? "text-rose-300" : "text-emerald-300"}`}>
                          {f.vulnerable ? "VULN" : "safe"}
                        </span>
                      </div>
                    </button>

                    {/* Expanded proof panel */}
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="mt-3 space-y-3 border-t border-zinc-800 pt-3"
                      >
                        <div>
                          <div className="mb-1 flex items-center justify-between">
                            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                              Proof Request
                            </span>
                            {f.tamperedToken && (
                              <button
                                type="button"
                                onClick={() => copy(f.tamperedToken!)}
                                className="flex items-center gap-1 text-[9px] text-zinc-500 hover:text-emerald-400"
                              >
                                <Copy className="size-3" /> copy token
                              </button>
                            )}
                          </div>
                          <pre className="custom-scrollbar max-h-32 overflow-auto rounded border border-zinc-800 bg-black/50 p-2 font-mono text-[10px] text-zinc-300 whitespace-pre-wrap">
                            {f.proofRequest}
                          </pre>
                        </div>
                        <div>
                          <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                            Proof Response
                          </div>
                          <pre className="custom-scrollbar max-h-32 overflow-auto rounded border border-zinc-800 bg-black/50 p-2 font-mono text-[10px] text-zinc-300 whitespace-pre-wrap">
                            {f.proofResponse}
                          </pre>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded border border-rose-500/20 bg-rose-500/5 p-2">
                            <div className="mb-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-rose-400">
                              <Lock className="size-3" /> Description
                            </div>
                            <p className="text-[11px] text-zinc-300">{f.description}</p>
                          </div>
                          <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2">
                            <div className="mb-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-emerald-400">
                              <ShieldCheck className="size-3" /> Remediation
                            </div>
                            <p className="text-[11px] text-zinc-300">{f.remediation}</p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}

// ── Summary tile sub-component ───────────────────────────────────────────────
function SummaryTile({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <Card className={`hud-corners gap-0 rounded-xl p-3 text-center sm:p-4 ${accent}`}>
      <div className="mb-1 flex items-center justify-center gap-1.5">{icon}</div>
      <div className="font-mono text-2xl font-bold text-zinc-50 sm:text-3xl">{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-widest text-zinc-500 sm:text-[10px]">{label}</div>
    </Card>
  );
}
