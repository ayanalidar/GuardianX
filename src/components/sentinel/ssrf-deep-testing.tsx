"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  Cloud,
  Database,
  FolderTree,
  Globe,
  Loader2,
  Network,
  Play,
  Radio,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  XCircle,
  Eye,
  Copy,
} from "lucide-react";
import { motion } from "framer-motion";

// ─── Types (mirrors the API response) ────────────────────────────────────

type Severity = "info" | "low" | "medium" | "high" | "critical";
type Category =
  | "Cloud Metadata"
  | "Internal Port Scan"
  | "DNS Rebinding"
  | "Blind SSRF"
  | "Protocol Smuggling";

interface Finding {
  name: string;
  category: Category;
  severity: Severity;
  cwe: string;
  vulnerable: boolean;
  payload: string;
  paramUsed: string;
  status: number;
  durationMs: number;
  proofResponse: string;
  remediation: string;
}

interface SsrfDeepResponse {
  engagementId?: string;
  targetUrl?: string;
  ssrfParamsTested?: string[];
  testedCount?: number;
  vulnerableCount?: number;
  criticalCount?: number;
  highCount?: number;
  findings?: Finding[];
  error?: string;
}

// ─── Style maps ─────────────────────────────────────────────────────────

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

const CATEGORY_META: Record<
  Category,
  { icon: typeof Cloud; color: string; bar: string; label: string }
> = {
  "Cloud Metadata": { icon: Cloud, color: "text-red-400", bar: "bg-red-500", label: "Cloud Metadata" },
  "Internal Port Scan": { icon: Server, color: "text-orange-400", bar: "bg-orange-500", label: "Internal Ports" },
  "DNS Rebinding": { icon: Network, color: "text-amber-400", bar: "bg-amber-500", label: "DNS Rebinding" },
  "Blind SSRF": { icon: Radio, color: "text-amber-400", bar: "bg-amber-500", label: "Blind SSRF" },
  "Protocol Smuggling": { icon: FolderTree, color: "text-orange-400", bar: "bg-orange-500", label: "Protocol Smuggling" },
};

// ─── Component ──────────────────────────────────────────────────────────

const CATEGORIES: Category[] = [
  "Cloud Metadata",
  "Internal Port Scan",
  "DNS Rebinding",
  "Blind SSRF",
  "Protocol Smuggling",
];

export function SsrfDeepTesting() {
  const { toast } = useToast();
  const [targetUrl, setTargetUrl] = useState("https://app.example.com/fetch");
  const [ssrfParam, setSsrfParam] = useState("");
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [result, setResult] = useState<SsrfDeepResponse | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/vapt/ssrf-deep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl,
          ...(ssrfParam.trim() ? { ssrfParam: ssrfParam.trim() } : {}),
        }),
      });
      const data = (await res.json()) as SsrfDeepResponse;
      setResult(data);

      if (data.error) {
        toast({ variant: "destructive", title: "SSRF scan failed", description: data.error });
        return;
      }
      const vuln = data.vulnerableCount ?? 0;
      const crit = data.criticalCount ?? 0;
      if (crit > 0) {
        toast({
          variant: "destructive",
          title: `⚠ ${crit} CRITICAL SSRF finding(s)!`,
          description: `Cloud metadata or local file access likely exposed. ${vuln} total vulnerable.`,
        });
      } else if (vuln > 0) {
        toast({
          variant: "destructive",
          title: `${vuln} SSRF finding(s)`,
          description: `No critical exposure, but the target is SSRF-vulnerable.`,
        });
      } else {
        toast({
          title: "SSRF scan complete",
          description: `Tested ${data.testedCount ?? 0} payloads. No SSRF confirmed.`,
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "SSRF scan failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setRunning(false);
    }
  };

  const findings = result?.findings ?? [];
  const vulnerableFindings = findings.filter((f) => f.vulnerable);
  const cloudFindings = findings.filter(
    (f) => f.category === "Cloud Metadata" && f.vulnerable
  );
  const hasCritical = (result?.criticalCount ?? 0) > 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-red-500/70">
          <span className="size-1.5 rounded-full bg-red-500 pulse-dot" />
          guardianx@ssrf-deep:~$
        </div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
          <Network className="size-5 text-red-400" />
          SSRF DEEP TESTING
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Probe a target URL for Server-Side Request Forgery. Cloud metadata
          endpoints (AWS / GCP / Azure / Alibaba), internal port scanning,
          DNS rebinding, blind SSRF callbacks, and protocol smuggling.
        </p>
      </div>

      {/* Configuration */}
      <Card className="holo-card hud-corners gap-0 rounded-xl p-5">
        <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-red-400/70">
          SSRF Test Configuration
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-zinc-400">Target URL *</Label>
            <Input
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://app.example.com/fetch"
              className="mt-1 border-zinc-800 bg-zinc-900/60 font-mono text-sm text-zinc-200"
            />
            <p className="mt-1 text-[10px] text-zinc-500">
              The endpoint on the target that accepts a URL as a query parameter.
            </p>
          </div>
          <div>
            <Label className="text-xs text-zinc-400">SSRF Parameter Name (optional)</Label>
            <Input
              value={ssrfParam}
              onChange={(e) => setSsrfParam(e.target.value)}
              placeholder="url (auto-tries url, fetch, image, webhook, callback, redirect)"
              className="mt-1 border-zinc-800 bg-zinc-900/60 font-mono text-sm text-zinc-200"
            />
            <p className="mt-1 text-[10px] text-zinc-500">
              The query-param name the target uses to fetch URLs. Leave blank to auto-try common ones.
            </p>
          </div>
        </div>

        {/* Quick payload preview */}
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="mb-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
            Preview payloads
          </div>
          <div className="custom-scrollbar flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
            {[
              "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
              "http://169.254.169.254/latest/meta-data/instance-id",
              "http://metadata.google.internal/computeMetadata/v1/",
              "http://169.254.169.254/metadata/instance?api-version=2021-02-01",
              "http://100.100.100.200/latest/meta-data/",
              "http://localhost:6379/",
              "http://localhost:5432/",
              "http://localhost:2375/",
              "http://127.0.0.1/",
              "http://0.0.0.0/",
              "http://[::1]/",
              "file:///etc/passwd",
              "gopher://localhost:6379/_INFO",
              "dict://localhost:11211/stat",
              "ftp://localhost:21/",
            ].map((p) => (
              <code
                key={p}
                className="rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
              >
                {p}
              </code>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col items-end gap-2 sm:flex-row sm:justify-end">
          <span className="text-[10px] text-zinc-500 sm:mr-auto">
            {ssrfParam.trim()
              ? `Testing only ?${ssrfParam.trim()}=...`
              : "Auto-trying 6 most common SSRF params"}
          </span>
          <Button
            onClick={run}
            disabled={running || !targetUrl}
            className="bg-red-600 text-white hover:bg-red-500"
          >
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {running ? "Scanning..." : "Run SSRF Tests"}
          </Button>
        </div>
      </Card>

      {/* Cloud-metadata critical alert */}
      {cloudFindings.length > 0 && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="hud-corners gap-0 rounded-xl border-red-500/60 bg-red-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-400" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-red-300">
                    CRITICAL — Cloud Metadata Exposed
                  </span>
                  <Badge className="border border-red-500/50 bg-red-500/20 text-[9px] text-red-300">
                    CWE-918
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-red-200/80">
                  The target fetched cloud metadata and returned it in the response. IAM keys,
                  instance IDs, or project metadata may be exposed. Rotate credentials immediately
                  and block egress to {`169.254.169.254`}.
                </p>
                <div className="mt-2 space-y-1.5">
                  {cloudFindings.map((f, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-red-500/30 bg-black/40 p-2 font-mono text-[10px] text-red-200"
                    >
                      <span className="text-red-400">[{f.severity.toUpperCase()}]</span>{" "}
                      {f.payload}{" "}
                      <span className="text-zinc-500">via ?{f.paramUsed}=</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      {/* Summary tiles */}
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

      {/* Findings table */}
      {result && !result.error && findings.length > 0 && (
        <Card className="holo-card hud-corners gap-0 rounded-xl p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-red-400" />
              <span className="text-sm font-bold text-zinc-100">Findings</span>
              <Badge className="border border-zinc-700 bg-zinc-900/50 text-[9px] text-zinc-400">
                {findings.length} tested
              </Badge>
              {vulnerableFindings.length > 0 && (
                <Badge className="border border-red-500/40 bg-red-500/10 text-[9px] text-red-300">
                  {vulnerableFindings.length} vulnerable
                </Badge>
              )}
            </div>
            {result.engagementId && (
              <code className="font-mono text-[9px] text-zinc-500">
                engagement: {result.engagementId.slice(0, 12)}…
              </code>
            )}
          </div>

          {/* Group by category */}
          <div className="space-y-4">
            {CATEGORIES.map((cat) => {
              const catFindings = findings.filter((f) => f.category === cat);
              if (catFindings.length === 0) return null;
              const meta = CATEGORY_META[cat];
              const Icon = meta.icon;
              const catVuln = catFindings.filter((f) => f.vulnerable).length;
              return (
                <div key={cat} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className={`size-4 ${meta.color}`} />
                    <span className="text-xs font-semibold text-zinc-200">{meta.label}</span>
                    <span className="text-[10px] text-zinc-500">
                      ({catFindings.length} tested
                      {catVuln > 0 ? `, ${catVuln} vulnerable` : ""})
                    </span>
                    {catVuln > 0 && (
                      <span className="ml-auto size-1.5 rounded-full bg-red-500 pulse-dot" />
                    )}
                  </div>

                  {/* Table header (hidden on mobile, columns stack) */}
                  <div className="hidden gap-2 px-2 text-[9px] uppercase tracking-wider text-zinc-500 sm:grid sm:grid-cols-[1fr_180px_80px_60px_40px]">
                    <div>Payload</div>
                    <div>Param / Status</div>
                    <div>Severity</div>
                    <div>CWE</div>
                    <div></div>
                  </div>

                  <div className="custom-scrollbar mt-1 max-h-[420px] space-y-1.5 overflow-y-auto">
                    {catFindings.map((f, i) => {
                      const isOpen = expanded === `${cat}-${i}`;
                      const isCloudVuln =
                        f.vulnerable && f.category === "Cloud Metadata";
                      return (
                        <motion.div
                          key={`${cat}-${i}`}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className={`rounded-md border p-2 transition-colors ${
                            f.vulnerable
                              ? isCloudVuln
                                ? "border-red-500/60 bg-red-500/10"
                                : "border-orange-500/40 bg-orange-500/5"
                              : "border-zinc-800 bg-zinc-900/30"
                          }`}
                        >
                          <button
                            onClick={() => setExpanded(isOpen ? null : `${cat}-${i}`)}
                            className="block w-full text-left"
                          >
                            {/* Mobile layout */}
                            <div className="flex items-start gap-2 sm:hidden">
                              <span
                                className={`mt-1 size-1.5 shrink-0 rounded-full ${SEVERITY_DOT[f.severity]}`}
                              />
                              <div className="min-w-0 flex-1">
                                <div className="truncate font-mono text-[10px] text-zinc-300">
                                  {f.payload}
                                </div>
                                <div className="mt-0.5 flex items-center gap-1.5">
                                  <Badge
                                    className={`border text-[8px] ${SEVERITY_STYLE[f.severity]}`}
                                  >
                                    {f.severity.toUpperCase()}
                                  </Badge>
                                  <span className="font-mono text-[9px] text-zinc-500">
                                    HTTP {f.status} · {f.durationMs}ms
                                  </span>
                                  {f.vulnerable && (
                                    <AlertTriangle className="ml-auto size-3 text-red-400" />
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Desktop grid layout */}
                            <div className="hidden items-center gap-2 sm:grid sm:grid-cols-[1fr_180px_80px_60px_40px]">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`size-1.5 shrink-0 rounded-full ${SEVERITY_DOT[f.severity]}`}
                                />
                                <code className="truncate font-mono text-[11px] text-zinc-300">
                                  {f.payload}
                                </code>
                                {f.vulnerable && (
                                  <AlertTriangle className="size-3 shrink-0 text-red-400" />
                                )}
                              </div>
                              <div className="font-mono text-[10px] text-zinc-500">
                                ?{f.paramUsed}=
                                <br />
                                <span className="text-zinc-600">
                                  HTTP {f.status} · {f.durationMs}ms
                                </span>
                              </div>
                              <Badge
                                className={`border text-[8px] ${SEVERITY_STYLE[f.severity]}`}
                              >
                                {f.severity.toUpperCase()}
                              </Badge>
                              <span className="font-mono text-[9px] text-zinc-500">{f.cwe}</span>
                              <Eye className="size-3 text-zinc-500 hover:text-red-300" />
                            </div>
                          </button>

                          {/* Expanded detail */}
                          {isOpen && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              className="mt-2 space-y-2 border-t border-zinc-800 pt-2"
                            >
                              <div>
                                <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                                  Target response
                                </div>
                                <pre className="custom-scrollbar mt-1 max-h-48 overflow-auto rounded bg-black/50 p-2 font-mono text-[10px] text-zinc-300">
                                  {f.proofResponse}
                                </pre>
                              </div>
                              <div className="flex items-start gap-2 rounded border border-zinc-800 bg-zinc-900/40 p-2">
                                <ShieldCheck className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                                <div>
                                  <div className="font-mono text-[9px] uppercase tracking-wider text-emerald-400/80">
                                    Remediation
                                  </div>
                                  <p className="mt-0.5 text-[10px] text-zinc-400">{f.remediation}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(f.payload);
                                    toast({ title: "Copied payload", description: f.payload });
                                  }}
                                  className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900/50 px-2 py-0.5 text-[9px] text-zinc-400 hover:border-red-500/40 hover:text-red-300"
                                >
                                  <Copy className="size-2.5" /> Copy payload
                                </button>
                                <span className="font-mono text-[9px] text-zinc-600">
                                  ?{f.paramUsed}={encodeURIComponent(f.payload)}
                                </span>
                              </div>
                            </motion.div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Live progress (during scan) */}
      {running && (
        <Card className="hud-corners gap-0 rounded-xl border-red-500/30 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Loader2 className="size-4 animate-spin text-red-400" />
            <span className="text-sm font-semibold text-red-300">
              SSRF scan in progress…
            </span>
          </div>
          <div className="space-y-2">
            {CATEGORIES.map((cat, i) => {
              const meta = CATEGORY_META[cat];
              const Icon = meta.icon;
              return (
                <div
                  key={cat}
                  className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/40 p-2"
                >
                  <Icon className={`size-3.5 ${meta.color}`} />
                  <span className="text-[11px] text-zinc-300">{meta.label}</span>
                  <div className="ml-2 flex-1">
                    <div className="h-1 overflow-hidden rounded bg-zinc-800">
                      <motion.div
                        initial={{ width: "0%" }}
                        animate={{ width: ["0%", "100%", "0%"] }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          delay: i * 0.3,
                        }}
                        className={`h-full ${meta.bar}`}
                      />
                    </div>
                  </div>
                  <Globe className="size-3 text-zinc-600" />
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] text-zinc-500">
            Each payload is sent with a 5s timeout. The route budget is 30s total.
          </p>
        </Card>
      )}

      {/* Error state */}
      {result?.error && (
        <Card className="hud-corners gap-0 rounded-xl border-red-500/30 p-5">
          <div className="flex items-center gap-2">
            <XCircle className="size-5 text-red-400" />
            <span className="text-sm font-bold text-red-300">Scan Failed</span>
          </div>
          <p className="mt-2 text-xs text-zinc-400">{result.error}</p>
        </Card>
      )}
    </div>
  );
}
