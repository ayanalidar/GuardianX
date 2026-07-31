"use client";

import { useState } from "react";
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
  Key,
  Loader2,
  Lock,
  Play,
  ShieldCheck,
  Terminal,
  XCircle,
  Eye,
  Copy,
} from "lucide-react";
import { motion } from "framer-motion";

interface VulnerableCredential {
  type: string;
  value: string;
  severity: string;
  context: string;
  source_url: string;
}

interface VulnerableData {
  total_findings: number;
  severity: string;
  credentials: VulnerableCredential[];
  by_type?: Record<string, number>;
  summary?: string;
}

interface AuditResult {
  audit_id?: string;
  status?: string;
  target_url?: string;
  execution_mode?: string;
  extracted_fields?: number;
  data?: Record<string, unknown>;
  vulnerable_data?: VulnerableData;
  audit_trail?: {
    started_at_utc?: string;
    completed_at_utc?: string;
    total_duration_ms?: number;
    request?: { url?: string; status_code?: number; duration_ms?: number; retries?: number; response_size_bytes?: number };
    selectors?: Array<{ field_name: string; success: boolean; raw_data_sha256?: string; match_count?: number; error?: string | null }>;
    integrity_hash?: string;
  };
  errors?: string[];
  fatal_error?: string;
  error?: string;
}

const SEVERITY_STYLE: Record<string, string> = {
  critical: "border-red-500/40 bg-red-500/10 text-red-300",
  high: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  none: "border-zinc-600 bg-zinc-700/40 text-zinc-300",
};

export function AuditScraperPanel() {
  const { toast } = useToast();
  const [url, setUrl] = useState("http://localhost:3004/.env");
  const [mode, setMode] = useState<"lightweight" | "browser">("lightweight");
  const [selectorsJson, setSelectorsJson] = useState(`[
  {"field_name":"page_content","selector":"body","selector_type":"css","required":true}
]`);
  const [sanitizationJson, setSanitizationJson] = useState(`[]`);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      let selectors: unknown[] = [];
      let sanitization: unknown[] = [];
      try { selectors = JSON.parse(selectorsJson); } catch { throw new Error("Invalid selectors JSON"); }
      try { sanitization = JSON.parse(sanitizationJson); } catch { throw new Error("Invalid sanitization JSON"); }

      const config = {
        target_url: url,
        execution_mode: mode,
        rate_limit_delay_ms: 0,
        target_selectors: selectors,
        sanitization_rules: sanitization,
      };

      const res = await fetch("/api/audit-scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = (await res.json()) as AuditResult;
      setResult(data);

      const vulnCount = data.vulnerable_data?.total_findings ?? 0;
      if (data.error) {
        toast({ variant: "destructive", title: "Audit failed", description: data.error });
      } else if (vulnCount > 0) {
        toast({
          title: `⚠ ${vulnCount} vulnerable data items found!`,
          description: `Severity: ${data.vulnerable_data?.severity?.toUpperCase()} — these need to be fixed.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Audit complete",
          description: `${data.extracted_fields ?? 0} fields extracted, no exposed credentials found.`,
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Audit failed",
        description: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      setRunning(false);
    }
  };

  const vulnData = result?.vulnerable_data;
  const credentials = vulnData?.credentials ?? [];
  const hasError = !!result?.error || !!result?.fatal_error;
  const errors = result?.errors ?? [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
          <span className="size-1.5 rounded-full bg-emerald-500 pulse-dot" />
          guardianx@audit-scraper:~$
        </div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50 neon-emerald">
          <Terminal className="size-5 text-violet-400" />
          Web Scraping Audit Engine
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Scrape authorized targets and automatically detect exposed credentials,
          passwords, API keys, user IDs, and PII. All findings are reported for
          remediation.
        </p>
      </div>

      {/* Configuration */}
      <Card className="holo-card hud-corners gap-0 rounded-xl p-5">
        <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-violet-400/70">
          Audit Task Configuration
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs text-zinc-400">Target URL</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://authorized-target.com"
              className="mt-1 border-zinc-800 bg-zinc-900/60 font-mono text-sm text-zinc-200" />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Execution Mode</Label>
            <div className="mt-1 flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1 text-xs">
              <button onClick={() => setMode("lightweight")} className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === "lightweight" ? "bg-emerald-500/15 text-emerald-300" : "text-zinc-400 hover:text-zinc-200"}`}>
                Lightweight (httpx+BS4)
              </button>
              <button onClick={() => setMode("browser")} className={`flex-1 rounded-md px-3 py-1.5 font-medium transition-colors ${mode === "browser" ? "bg-emerald-500/15 text-emerald-300" : "text-zinc-400 hover:text-zinc-200"}`}>
                Browser (Playwright)
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <Label className="text-xs text-zinc-400">Target Selectors (JSON)</Label>
            <Textarea value={selectorsJson} onChange={(e) => setSelectorsJson(e.target.value)}
              className="custom-scrollbar mt-1 min-h-[6rem] resize-y border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-300"
              placeholder='[{"field_name":"content","selector":"body","selector_type":"css"}]' />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Sanitization Rules (JSON — leave empty to show raw data)</Label>
            <Textarea value={sanitizationJson} onChange={(e) => setSanitizationJson(e.target.value)}
              className="custom-scrollbar mt-1 min-h-[6rem] resize-y border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-300"
              placeholder='[]' />
          </div>
        </div>

        {/* Quick target buttons */}
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-[10px] text-zinc-500">Quick targets:</span>
          {[
            { label: "Homepage", url: "http://localhost:3004" },
            { label: ".env leak", url: "http://localhost:3004/.env" },
            { label: "User API", url: "http://localhost:3004/api/user/1" },
            { label: "Login page", url: "http://localhost:3004/login" },
          ].map((t) => (
            <button key={t.label} onClick={() => setUrl(t.url)}
              className="rounded border border-zinc-700 bg-zinc-900/40 px-2 py-0.5 text-[10px] text-zinc-400 transition-colors hover:border-violet-500/40 hover:text-violet-300">
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <Button onClick={run} disabled={running || !url} className="bg-violet-600 text-white hover:bg-violet-500">
            {running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {running ? "Scraping..." : "Execute Audit Scrape"}
          </Button>
        </div>
      </Card>

      {/* Result */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Error state */}
          {hasError ? (
            <Card className="holo-card hud-corners gap-0 rounded-xl border-red-500/30 p-5">
              <div className="flex items-center gap-2">
                <XCircle className="size-5 text-red-400" />
                <span className="text-sm font-bold text-red-300">Audit Failed</span>
              </div>
              <p className="mt-2 text-xs text-zinc-400">{result.error || result.fatal_error}</p>
            </Card>
          ) : (
            <>
              {/* ── VULNERABLE DATA SECTION (the main feature) ─────────── */}
              {credentials.length > 0 && (
                <Card className="holo-card hud-corners mb-4 gap-0 rounded-xl border-red-500/30 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="size-5 text-red-400" />
                      <span className="text-sm font-bold text-red-300">
                        Exposed Credentials & Vulnerable Data
                      </span>
                    </div>
                    <Badge className={`border text-[9px] ${SEVERITY_STYLE[vulnData?.severity ?? "none"]}`}>
                      {vulnData?.severity?.toUpperCase() ?? "UNKNOWN"}
                    </Badge>
                  </div>

                  {/* Summary */}
                  <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2.5 text-center">
                      <div className="font-mono text-2xl font-bold text-red-400">{vulnData?.total_findings ?? 0}</div>
                      <div className="text-[9px] uppercase text-zinc-500">Total Findings</div>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5 text-center">
                      <div className="font-mono text-2xl font-bold text-red-400">
                        {credentials.filter(c => c.severity === "critical").length}
                      </div>
                      <div className="text-[9px] uppercase text-zinc-500">Critical</div>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5 text-center">
                      <div className="font-mono text-2xl font-bold text-orange-400">
                        {credentials.filter(c => c.severity === "high").length}
                      </div>
                      <div className="text-[9px] uppercase text-zinc-500">High</div>
                    </div>
                    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5 text-center">
                      <div className="font-mono text-2xl font-bold text-amber-400">
                        {credentials.filter(c => c.severity === "medium").length}
                      </div>
                      <div className="text-[9px] uppercase text-zinc-500">Medium</div>
                    </div>
                  </div>

                  {/* Credential list */}
                  <div className="mb-3 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-red-400">
                    <Key className="size-3" /> Found Credentials & Sensitive Data
                  </div>
                  <div className="custom-scrollbar max-h-80 space-y-2 overflow-y-auto">
                    {credentials.map((cred, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className={`rounded-lg border p-3 ${SEVERITY_STYLE[cred.severity] ?? SEVERITY_STYLE.low}`}
                      >
                        <div className="flex items-center gap-2">
                          <Lock className={`size-3.5 shrink-0 ${cred.severity === "critical" ? "text-red-400" : "text-orange-400"}`} />
                          <span className="text-xs font-medium text-zinc-200">{cred.type}</span>
                          <Badge className={`border text-[8px] ${SEVERITY_STYLE[cred.severity] ?? ""}`}>
                            {cred.severity.toUpperCase()}
                          </Badge>
                          <button
                            onClick={() => { navigator.clipboard.writeText(cred.value); toast({ title: "Copied", description: cred.type }); }}
                            className="ml-auto text-zinc-500 hover:text-emerald-400"
                          >
                            <Copy className="size-3" />
                          </button>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <code className="flex-1 truncate rounded bg-black/40 px-2 py-1 font-mono text-[10px] text-emerald-300">
                            {cred.value}
                          </code>
                        </div>
                        {cred.context && (
                          <div className="mt-1 text-[9px] text-zinc-500">
                            <span className="text-zinc-600">Context:</span> {cred.context}
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>

                  {/* Action note */}
                  <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px] text-emerald-300/80">
                    <ShieldCheck className="mr-1 inline size-3" />
                    These exposed credentials will be automatically flagged for remediation.
                    Use the Patch Review Queue or RedAgent VAPT to generate fixes.
                  </div>
                </Card>
              )}

              {/* Audit summary card */}
              <Card className="holo-card hud-corners gap-0 rounded-xl p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {result.status === "success" ? (
                      <CheckCircle2 className="size-5 text-emerald-400" />
                    ) : (
                      <XCircle className="size-5 text-amber-400" />
                    )}
                    <span className="text-sm font-bold text-zinc-100">
                      Audit {result.status === "success" ? "Complete" : result.status === "partial_success" ? "Partial Success" : "Failed"}
                    </span>
                  </div>
                  <Badge className="border border-zinc-700 bg-zinc-900/50 text-[9px] text-zinc-400">
                    {result.execution_mode?.toUpperCase()}
                  </Badge>
                </div>

                {/* Summary metrics */}
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Fields", value: result.extracted_fields ?? 0, color: "text-emerald-400" },
                    { label: "Duration", value: `${result.audit_trail?.total_duration_ms ?? 0}ms`, color: "text-sky-400" },
                    { label: "HTTP", value: result.audit_trail?.request?.status_code ?? "—", color: "text-cyan-400" },
                    { label: "Exposed Data", value: vulnData?.total_findings ?? 0, color: (vulnData?.total_findings ?? 0) > 0 ? "text-red-400" : "text-emerald-400" },
                  ].map((m, i) => (
                    <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5 text-center">
                      <div className={`font-mono text-lg font-bold ${m.color}`}>{m.value}</div>
                      <div className="text-[9px] uppercase text-zinc-500">{m.label}</div>
                    </div>
                  ))}
                </div>

                {/* Extracted data */}
                {result.data && Object.keys(result.data).length > 0 && (
                  <div className="mb-4">
                    <div className="mb-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                      <Eye className="size-3" /> Scraped Page Content
                    </div>
                    <pre className="custom-scrollbar max-h-48 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Selector results */}
                {result.audit_trail?.selectors && result.audit_trail.selectors.length > 0 && (
                  <div className="mb-4">
                    <div className="mb-2 font-mono text-[9px] uppercase tracking-wider text-zinc-500">Selector Results</div>
                    <div className="space-y-1">
                      {result.audit_trail.selectors.map((s, i) => (
                        <div key={i} className={`flex items-center gap-2 rounded border p-2 ${s.success ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                          {s.success ? <CheckCircle2 className="size-3 text-emerald-400" /> : <XCircle className="size-3 text-red-400" />}
                          <span className="font-mono text-[10px] text-zinc-300">{s.field_name}</span>
                          <span className="text-[9px] text-zinc-500">{s.match_count ?? 0} matches</span>
                          {s.raw_data_sha256 && (
                            <span className="ml-auto font-mono text-[8px] text-zinc-600">sha256: {s.raw_data_sha256.slice(0, 16)}…</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Integrity hash */}
                {result.audit_trail?.integrity_hash && (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                    <ShieldCheck className="size-4 shrink-0 text-emerald-400" />
                    <div>
                      <div className="text-[10px] font-semibold text-emerald-300">Audit Integrity Hash (SHA-256)</div>
                      <code className="font-mono text-[9px] text-zinc-500">{result.audit_trail.integrity_hash}</code>
                    </div>
                  </div>
                )}

                {/* Errors */}
                {errors.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                    <div className="text-[10px] font-semibold text-amber-300">Non-fatal Errors ({errors.length})</div>
                    {errors.map((e, i) => (
                      <div key={i} className="mt-1 text-[10px] text-amber-300/70">• {e}</div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}
