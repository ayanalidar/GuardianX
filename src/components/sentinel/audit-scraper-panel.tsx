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
  CheckCircle2,
  Copy,
  Download,
  Eye,
  Loader2,
  Play,
  ShieldCheck,
  Terminal,
  XCircle,
} from "lucide-react";
import { motion } from "framer-motion";

interface AuditResult {
  audit_id: string;
  status: string;
  target_url: string;
  execution_mode: string;
  extracted_fields: number;
  data: Record<string, unknown>;
  audit_trail: {
    started_at_utc: string;
    completed_at_utc: string;
    total_duration_ms: number;
    request: { url: string; status_code: number; duration_ms: number; retries: number; response_size_bytes: number };
    selectors: Array<{ field_name: string; success: boolean; raw_data_sha256: string; match_count: number; error: string | null }>;
    integrity_hash: string;
  };
  errors: string[];
  fatal_error?: string;
}

export function AuditScraperPanel() {
  const { toast } = useToast();
  const [url, setUrl] = useState("http://localhost:3004");
  const [mode, setMode] = useState<"lightweight" | "browser">("lightweight");
  const [selectorsJson, setSelectorsJson] = useState(`[
  {"field_name":"title","selector":"h1","selector_type":"css","required":true},
  {"field_name":"links","selector":"a","selector_type":"css","attribute":"href","multiple":true,"required":false}
]`);
  const [sanitizationJson, setSanitizationJson] = useState(`[
  {"key":"email","replacement":"[EMAIL_REDACTED]"},
  {"key":"api_key","replacement":"[REDACTED]"},
  {"key":"ssn","replacement":"[SSN_REDACTED]"}
]`);
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
      toast({
        title: data.status === "success" ? "Audit scrape complete" : `Audit ${data.status}`,
        description: `${data.extracted_fields} fields extracted in ${data.audit_trail?.total_duration_ms ?? 0}ms`,
      });
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
          Production-ready dual-mode scraper (httpx+BS4 / Playwright) with PII sanitization,
          SHA-256 integrity hashing, and full audit trail logging.
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
              className="custom-scrollbar mt-1 min-h-[8rem] resize-y border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-300"
              placeholder='[{"field_name":"title","selector":"h1","selector_type":"css"}]' />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Sanitization Rules (JSON)</Label>
            <Textarea value={sanitizationJson} onChange={(e) => setSanitizationJson(e.target.value)}
              className="custom-scrollbar mt-1 min-h-[8rem] resize-y border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-300"
              placeholder='[{"key":"email","replacement":"[REDACTED]"}]' />
          </div>
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
          <Card className="holo-card hud-corners gap-0 rounded-xl p-5">
            {/* Status header */}
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
              <Badge className={`border text-[9px] ${result.status === "success" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-amber-500/40 bg-amber-500/10 text-amber-300"}`}>
                {result.execution_mode.toUpperCase()}
              </Badge>
            </div>

            {/* Summary metrics */}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Fields", value: result.extracted_fields, color: "text-emerald-400" },
                { label: "Duration", value: `${result.audit_trail?.total_duration_ms ?? 0}ms`, color: "text-sky-400" },
                { label: "HTTP Status", value: result.audit_trail?.request?.status_code ?? "—", color: "text-cyan-400" },
                { label: "Retries", value: result.audit_trail?.request?.retries ?? 0, color: "text-amber-400" },
              ].map((m, i) => (
                <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5 text-center">
                  <div className={`font-mono text-lg font-bold ${m.color}`}>{m.value}</div>
                  <div className="text-[9px] uppercase text-zinc-500">{m.label}</div>
                </div>
              ))}
            </div>

            {/* Extracted data */}
            <div className="mb-4">
              <div className="mb-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                <Eye className="size-3" /> Extracted & Sanitized Data
              </div>
              <pre className="custom-scrollbar max-h-64 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-emerald-300">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </div>

            {/* Selector results */}
            <div className="mb-4">
              <div className="mb-2 font-mono text-[9px] uppercase tracking-wider text-zinc-500">Selector Extraction Results</div>
              <div className="space-y-1">
                {result.audit_trail?.selectors?.map((s, i) => (
                  <div key={i} className={`flex items-center gap-2 rounded border p-2 ${s.success ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                    {s.success ? <CheckCircle2 className="size-3 text-emerald-400" /> : <XCircle className="size-3 text-red-400" />}
                    <span className="font-mono text-[10px] text-zinc-300">{s.field_name}</span>
                    <span className="text-[9px] text-zinc-500">{s.match_count} matches</span>
                    <span className="ml-auto font-mono text-[8px] text-zinc-600">sha256: {s.raw_data_sha256?.slice(0, 16)}…</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Integrity */}
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <ShieldCheck className="size-4 shrink-0 text-emerald-400" />
              <div>
                <div className="text-[10px] font-semibold text-emerald-300">Audit Integrity Hash (SHA-256)</div>
                <code className="font-mono text-[9px] text-zinc-500">{result.audit_trail?.integrity_hash}</code>
              </div>
            </div>

            {/* Errors */}
            {result.errors.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <div className="text-[10px] font-semibold text-amber-300">Non-fatal Errors ({result.errors.length})</div>
                {result.errors.map((e, i) => (
                  <div key={i} className="mt-1 text-[10px] text-amber-300/70">• {e}</div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      )}
    </div>
  );
}
