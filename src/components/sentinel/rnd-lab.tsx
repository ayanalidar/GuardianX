"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Search, GitBranch, Brain, Gauge, Bug, Network, Eye, Shield, FileCode,
  RotateCcw, Loader2, FlaskConical, Activity, AlertTriangle, CheckCircle2,
  ExternalLink, Star, Cpu, Zap,
} from "lucide-react";

const SUGGESTED_QUERIES = [
  "vulnerability scanner", "exploit framework", "network scanner",
  "sql injection tool", "web application fuzzer", "WAF rule generator",
  "intrusion detection system", "secrets detection", "container security",
];

const OUR_MODULES = [
  "sast-scanner", "dast-engine", "exploit-generator", "patch-generator",
  "adversarial-arena", "exposure-scanner", "compliance-engine", "anomaly-detector",
];

type SubTab = "research" | "benchmark" | "fuzzer" | "attack-graph" | "behavioral" | "virtual-patch" | "iac" | "rollback";

export function RnDLab() {
  const [subTab, setSubTab] = useState<SubTab>("research");

  const SUB_TABS: { key: SubTab; label: string; icon: typeof Brain; color: string }[] = [
    { key: "research", label: "Research Agent", icon: Search, color: "violet" },
    { key: "benchmark", label: "Benchmark", icon: Gauge, color: "emerald" },
    { key: "fuzzer", label: "Protocol Fuzzer", icon: Bug, color: "amber" },
    { key: "attack-graph", label: "Attack Graph", icon: Network, color: "red" },
    { key: "behavioral", label: "Behavioral Monitor", icon: Eye, color: "cyan" },
    { key: "virtual-patch", label: "Virtual Patching", icon: Shield, color: "rose" },
    { key: "iac", label: "IaC Remediation", icon: FileCode, color: "sky" },
    { key: "rollback", label: "Rollback Safeguard", icon: RotateCcw, color: "emerald" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
          <FlaskConical className="size-5 text-violet-400 neon-violet" />
          R&D Lab
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Autonomous security engineering: research open-source tools, benchmark performance, fuzz protocols, model attack graphs, and generate virtual patches.
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="holo-card-sharp hud-corners flex flex-wrap gap-1 p-2">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              subTab === t.key
                ? `bg-${t.color}-500/15 text-${t.color}-300 ring-1 ring-${t.color}-500/30`
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
            }`}
          >
            <t.icon className="size-3.5" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <motion.div
        key={subTab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {subTab === "research" && <ResearchAgent />}
        {subTab === "benchmark" && <BenchmarkEngine />}
        {subTab === "fuzzer" && <ProtocolFuzzer />}
        {subTab === "attack-graph" && <AttackGraphBuilder />}
        {subTab === "behavioral" && <BehavioralMonitor />}
        {subTab === "virtual-patch" && <VirtualPatching />}
        {subTab === "iac" && <IaCRemediation />}
        {subTab === "rollback" && <RollbackSafeguard />}
      </motion.div>
    </div>
  );
}

// ── 1. Research Agent ──────────────────────────────────────────────────────
function ResearchAgent() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [gapModule, setGapModule] = useState("");
  const [gapResult, setGapResult] = useState<string | null>(null);
  const [gapLoading, setGapLoading] = useState(false);

  const search = async () => {
    if (!query) return;
    setSearching(true);
    setResults([]);
    try {
      const res = await fetch("/api/research-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "search", query }),
      });
      const data = await res.json();
      setResults(data.results || []);
      toast({ title: `Found ${data.count || 0} repositories` });
    } catch {
      toast({ variant: "destructive", title: "Search failed" });
    }
    setSearching(false);
  };

  const analyze = async (repoUrl: string, name: string) => {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await fetch("/api/research-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze", repoUrl }),
      });
      const data = await res.json();
      setAnalysis(`# Analysis: ${name}\n\n${data.analysis}`);
    } catch {
      toast({ variant: "destructive", title: "Analysis failed" });
    }
    setAnalyzing(false);
  };

  const gapAnalysis = async () => {
    if (!gapModule) return;
    setGapLoading(true);
    setGapResult(null);
    try {
      const res = await fetch("/api/research-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "gap_analysis", module: gapModule }),
      });
      const data = await res.json();
      setGapResult(data.gap_analysis);
    } catch {
      toast({ variant: "destructive", title: "Gap analysis failed" });
    }
    setGapLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="holo-card-sharp hud-corners p-4">
        <h3 className="mb-3 section-header text-sm font-bold text-violet-300">
          <Search className="inline size-4 mr-1" />
          GitHub Security Tool Search
        </h3>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="vulnerability scanner, exploit framework, WAF generator..."
            className="border-violet-500/30 bg-zinc-900/60 text-zinc-200 focus-visible:border-violet-500/50"
          />
          <Button onClick={search} disabled={searching} className="bg-violet-600 text-white hover:bg-violet-500">
            {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Search
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTED_QUERIES.map((q) => (
            <button
              key={q}
              onClick={() => setQuery(q)}
              className="rounded-full border border-zinc-700 bg-zinc-900/50 px-2 py-0.5 text-[10px] text-zinc-400 hover:border-violet-500/30 hover:text-violet-300"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="holo-card-sharp hud-corners p-4">
          <h3 className="mb-3 text-sm font-bold text-zinc-300">Results ({results.length})</h3>
          <div className="space-y-2">
            {results.map((r) => (
              <div key={r.url} className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GitBranch className="size-4 text-violet-400" />
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-zinc-200 hover:text-violet-300">
                      {r.name}
                    </a>
                    <Badge className="border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-300">
                      <Star className="size-2.5" /> {r.stars}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => analyze(r.url, r.name)}
                    disabled={analyzing}
                    className="border-violet-500/30 bg-violet-500/5 text-violet-300 hover:bg-violet-500/10"
                  >
                    <Brain className="size-3" /> Analyze
                  </Button>
                </div>
                {r.description && <p className="mt-1 text-xs text-zinc-500">{r.description}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analysis */}
      {analyzing && (
        <div className="holo-card-sharp hud-corners p-4 text-center">
          <Loader2 className="mx-auto size-6 animate-spin text-violet-400" />
          <p className="mt-2 text-sm text-zinc-400">AI analyzing repository code...</p>
        </div>
      )}
      {analysis && (
        <div className="holo-card-sharp hud-corners p-4">
          <h3 className="mb-2 text-sm font-bold text-violet-300">AI Code Analysis</h3>
          <pre className="custom-scrollbar max-h-96 overflow-y-auto whitespace-pre-wrap text-xs text-zinc-300">{analysis}</pre>
        </div>
      )}

      {/* Gap Analysis */}
      <div className="holo-card-sharp hud-corners p-4">
        <h3 className="mb-3 section-header text-sm font-bold text-amber-300">
          <AlertTriangle className="inline size-4 mr-1" />
          Gap Analysis
        </h3>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {OUR_MODULES.map((m) => (
            <button
              key={m}
              onClick={() => setGapModule(m)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all ${
                gapModule === m
                  ? "border-amber-500/40 bg-amber-500/15 text-amber-300"
                  : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <Button onClick={gapAnalysis} disabled={!gapModule || gapLoading} size="sm" className="bg-amber-600 text-white hover:bg-amber-500">
          {gapLoading ? <Loader2 className="size-3 animate-spin" /> : <AlertTriangle className="size-3" />}
          Run Gap Analysis
        </Button>
        {gapResult && (
          <pre className="custom-scrollbar mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">{gapResult}</pre>
        )}
      </div>
    </div>
  );
}

// ── 2. Benchmark Engine ────────────────────────────────────────────────────
function BenchmarkEngine() {
  const { toast } = useToast();
  const [module, setModule] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!module) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, iterations: 3 }),
      });
      const data = await res.json();
      setResult(data);
      toast({ title: "Benchmark complete", description: data.verdict });
    } catch {
      toast({ variant: "destructive", title: "Benchmark failed" });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="holo-card-sharp hud-corners p-4">
        <h3 className="mb-3 section-header text-sm font-bold text-emerald-300">
          <Gauge className="inline size-4 mr-1" />
          Performance Benchmark
        </h3>
        <p className="mb-3 text-xs text-zinc-400">
          Compare GuardianX module performance against baseline open-source tools.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {OUR_MODULES.map((m) => (
            <button
              key={m}
              onClick={() => setModule(m)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all ${
                module === m
                  ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                  : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <Button onClick={run} disabled={!module || loading} className="bg-emerald-600 text-white hover:bg-emerald-500">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Gauge className="size-4" />}
          Run Benchmark
        </Button>
      </div>

      {result && (
        <div className="holo-card-sharp hud-corners p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-200">Results: {result.module}</h3>
            <Badge className={result.improvement > 0 ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-red-500/30 bg-red-500/10 text-red-300"}>
              {result.improvement > 0 ? "PASS" : "FAIL"} ({result.improvement}%)
            </Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="text-xs font-bold text-emerald-300">GuardianX</div>
              <div className="mt-2 space-y-1 text-xs text-zinc-400">
                <div>Duration: <span className="text-emerald-400">{result.guardian_metrics.duration_ms}ms</span></div>
                <div>Accuracy: <span className="text-emerald-400">{result.guardian_metrics.accuracy.toFixed(1)}%</span></div>
                <div>Memory: <span className="text-emerald-400">{result.guardian_metrics.memory_mb}MB</span></div>
                <div>Findings: <span className="text-emerald-400">{result.guardian_metrics.findings}</span></div>
              </div>
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-3">
              <div className="text-xs font-bold text-zinc-400">Baseline (OSS)</div>
              <div className="mt-2 space-y-1 text-xs text-zinc-500">
                <div>Duration: {result.baseline_metrics.duration_ms}ms</div>
                <div>Accuracy: {result.baseline_metrics.accuracy.toFixed(1)}%</div>
                <div>Memory: {result.baseline_metrics.memory_mb}MB</div>
                <div>Findings: {result.baseline_metrics.findings}</div>
              </div>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-300">
            {result.verdict}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 3. Protocol Fuzzer ─────────────────────────────────────────────────────
function ProtocolFuzzer() {
  const { toast } = useToast();
  const [targetUrl, setTargetUrl] = useState("");
  const [protocol, setProtocol] = useState("http");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!targetUrl) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/protocol-fuzzer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl, protocol, maxMutations: 20 }),
      });
      const data = await res.json();
      setResult(data);
      toast({ title: "Fuzzing complete", description: data.summary });
    } catch {
      toast({ variant: "destructive", title: "Fuzzing failed" });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="holo-card-sharp hud-corners p-4">
        <h3 className="mb-3 section-header text-sm font-bold text-amber-300">
          <Bug className="inline size-4 mr-1" />
          Mutation-Based Protocol Fuzzer
        </h3>
        <p className="mb-3 text-xs text-zinc-400">
          Injects malformed data structures (integer overflows, null bytes, deep nesting, injection meta-chars) to reveal edge-case faults.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            value={targetUrl}
            onChange={(e) => setTargetUrl(e.target.value)}
            placeholder="https://target.com/api/endpoint"
            className="flex-1 border-amber-500/30 bg-zinc-900/60 text-zinc-200 focus-visible:border-amber-500/50"
          />
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value)}
            className="rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200"
          >
            <option value="http">HTTP/REST</option>
            <option value="graphql">GraphQL</option>
            <option value="websocket">WebSocket</option>
          </select>
          <Button onClick={run} disabled={!targetUrl || loading} className="bg-amber-600 text-white hover:bg-amber-500">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Bug className="size-4" />}
            Fuzz
          </Button>
        </div>
      </div>

      {result && (
        <div className="holo-card-sharp hud-corners p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-200">Fuzzing Results</h3>
            <div className="flex gap-2">
              <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300">{result.total_mutations} sent</Badge>
              {result.crashes > 0 && <Badge className="border-red-500/30 bg-red-500/10 text-red-300">{result.crashes} crashes</Badge>}
              {result.anomalies > 0 && <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300">{result.anomalies} anomalies</Badge>}
            </div>
          </div>
          <div className="custom-scrollbar max-h-96 space-y-1 overflow-y-auto">
            {result.results.map((r: any, i: number) => (
              <div key={i} className={`flex items-center gap-2 rounded border p-2 text-xs ${
                r.anomaly ? "border-red-500/30 bg-red-500/5" : "border-zinc-800 bg-zinc-900/40"
              }`}>
                <span className="font-mono text-[10px] text-zinc-600">{r.response_status}</span>
                <span className="font-mono text-[10px] text-zinc-500">{r.response_time}ms</span>
                <span className="flex-1 truncate text-zinc-400">{r.mutation}: {r.payload}</span>
                {r.anomaly && <span className="text-[10px] font-bold text-red-400">⚠ {r.anomaly}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 4. Attack Graph ────────────────────────────────────────────────────────
function AttackGraphBuilder() {
  const { toast } = useToast();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const build = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/attack-graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setResult(data);
      toast({ title: "Attack graph built", description: data.message });
    } catch {
      toast({ variant: "destructive", title: "Failed to build graph" });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="holo-card-sharp hud-corners p-4">
        <h3 className="mb-3 section-header text-sm font-bold text-red-300">
          <Network className="inline size-4 mr-1" />
          Graph-Based Attack Path DAG
        </h3>
        <p className="mb-3 text-xs text-zinc-400">
          Models how low-severity issues on separate hosts can chain into full network compromise. AI generates multi-step attack paths.
        </p>
        <Button onClick={build} disabled={loading} className="bg-red-600 text-white hover:bg-red-500">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Network className="size-4" />}
          Build Attack Graph
        </Button>
      </div>

      {result && (
        <div className="space-y-3">
          {/* Attack chains */}
          {result.attack_chains?.map((chain: any, i: number) => (
            <div key={i} className="holo-card-sharp hud-corners p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-bold text-red-300">{chain.title}</h4>
                <Badge className={`border-${chain.severity === "critical" ? "red" : "amber"}-500/30 bg-${chain.severity === "critical" ? "red" : "amber"}-500/10 text-${chain.severity === "critical" ? "red" : "amber"}-300`}>
                  {chain.severity?.toUpperCase()}
                </Badge>
              </div>
              <p className="text-xs text-zinc-400">{chain.description}</p>
              <div className="mt-2 space-y-1">
                {chain.steps?.map((step: any, j: number) => (
                  <div key={j} className="flex items-center gap-2 text-xs">
                    <span className="flex size-5 items-center justify-center rounded-full bg-red-500/10 text-[10px] font-bold text-red-400">{j + 1}</span>
                    <span className="text-zinc-500">→</span>
                    <span className="text-zinc-300">{step.technique}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="text-xs text-zinc-500">
            {result.total_vulnerabilities} vulnerabilities → {result.total_chains} attack paths modeled
          </div>
        </div>
      )}
    </div>
  );
}

// ── 5. Behavioral Monitor ──────────────────────────────────────────────────
function BehavioralMonitor() {
  const { toast } = useToast();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const check = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/behavioral-monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check" }),
      });
      const data = await res.json();
      setResult(data);
      toast({ title: "Behavioral check complete", description: data.message });
    } catch {
      toast({ variant: "destructive", title: "Check failed" });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="holo-card-sharp hud-corners p-4">
        <h3 className="mb-3 section-header text-sm font-bold text-cyan-300">
          <Eye className="inline size-4 mr-1" />
          Behavioral Anomaly Detection
        </h3>
        <p className="mb-3 text-xs text-zinc-400">
          Flags deviations from baseline: web server executing shells, unexpected high CPU (crypto miner), binary modifications, hidden user creation.
        </p>
        <Button onClick={check} disabled={loading} className="bg-cyan-600 text-white hover:bg-cyan-500">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
          Run Behavior Check
        </Button>
      </div>

      {result && (
        <div className="space-y-3">
          <div className={`holo-card-sharp hud-corners p-4 border ${result.threat_level === "CRITICAL" ? "border-red-500/40" : result.threat_level === "ELEVATED" ? "border-amber-500/40" : "border-emerald-500/40"}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-zinc-200">Threat Level</span>
              <span className={`font-mono text-lg font-bold ${
                result.threat_level === "CRITICAL" ? "text-red-400" :
                result.threat_level === "ELEVATED" ? "text-amber-400" : "text-emerald-400"
              }`}>{result.threat_level}</span>
            </div>
            <p className="mt-1 text-xs text-zinc-400">{result.message}</p>
          </div>
          {result.anomalies?.map((a: any, i: number) => (
            <div key={i} className={`holo-card-sharp p-3 border ${a.severity === "critical" ? "border-red-500/30" : "border-amber-500/30"}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-200">{a.anomaly}</span>
                <Badge className={a.severity === "critical" ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300"}>
                  {a.severity.toUpperCase()}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-zinc-400">{a.detail}</p>
              <p className="mt-1 text-[10px] text-zinc-600">Process: {a.process}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 6. Virtual Patching ────────────────────────────────────────────────────
function VirtualPatching() {
  const { toast } = useToast();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/virtual-patch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "all" }),
      });
      const data = await res.json();
      setResult(data);
      toast({ title: "Virtual patches generated", description: data.message });
    } catch {
      toast({ variant: "destructive", title: "Generation failed" });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="holo-card-sharp hud-corners p-4">
        <h3 className="mb-3 section-header text-sm font-bold text-rose-300">
          <Shield className="inline size-4 mr-1" />
          Virtual Patching (WAF/iptables)
        </h3>
        <p className="mb-3 text-xs text-zinc-400">
          Auto-generates WAF rules (ModSecurity, Cloudflare, Nginx) + iptables rules to block exploits when code can't be patched immediately.
        </p>
        <Button onClick={generate} disabled={loading} className="bg-rose-600 text-white hover:bg-rose-500">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Shield className="size-4" />}
          Generate Virtual Patches
        </Button>
      </div>

      {result?.rules && (
        <div className="space-y-3">
          {Object.entries(result.rules).map(([target, rules]) => (
            <div key={target} className="holo-card-sharp hud-corners p-4">
              <h4 className="mb-2 text-sm font-bold text-rose-300 capitalize">{target} Rules</h4>
              <pre className="custom-scrollbar max-h-64 overflow-y-auto rounded-lg border border-zinc-800 bg-black/60 p-3 text-[10px] text-zinc-300">
                {rules as string}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 7. IaC Remediation ─────────────────────────────────────────────────────
function IaCRemediation() {
  const { toast } = useToast();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/iac-remediation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "all" }),
      });
      const data = await res.json();
      setResult(data);
      toast({ title: "IaC manifests generated", description: data.message });
    } catch {
      toast({ variant: "destructive", title: "Generation failed" });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="holo-card-sharp hud-corners p-4">
        <h3 className="mb-3 section-header text-sm font-bold text-sky-300">
          <FileCode className="inline size-4 mr-1" />
          Infrastructure-as-Code Remediation
        </h3>
        <p className="mb-3 text-xs text-zinc-400">
          Generates Terraform, Ansible, Kubernetes, and Docker manifests to patch vulnerabilities at the root deployment template, no live server modifications.
        </p>
        <Button onClick={generate} disabled={loading} className="bg-sky-600 text-white hover:bg-sky-500">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <FileCode className="size-4" />}
          Generate IaC Manifests
        </Button>
      </div>

      {result?.manifests && (
        <div className="space-y-3">
          {Object.entries(result.manifests).map(([target, manifest]) => (
            <div key={target} className="holo-card-sharp hud-corners p-4">
              <h4 className="mb-2 text-sm font-bold text-sky-300 capitalize">{target} Manifest</h4>
              <pre className="custom-scrollbar max-h-64 overflow-y-auto rounded-lg border border-zinc-800 bg-black/60 p-3 text-[10px] text-zinc-300">
                {manifest as string}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 8. Rollback Safeguard ──────────────────────────────────────────────────
function RollbackSafeguard() {
  const { toast } = useToast();
  const [patchId, setPatchId] = useState("");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"snapshot" | "health_check" | "rollback">("snapshot");

  const run = async () => {
    if (!patchId) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/rollback-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, patchId }),
      });
      const data = await res.json();
      setResult(data);
      toast({ title: `${action} complete`, description: data.message || data.recommendation });
    } catch {
      toast({ variant: "destructive", title: "Failed" });
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="holo-card-sharp hud-corners p-4">
        <h3 className="mb-3 section-header text-sm font-bold text-emerald-300">
          <RotateCcw className="inline size-4 mr-1" />
          Zero-Downtime Rollback Safeguard
        </h3>
        <p className="mb-3 text-xs text-zinc-400">
          Captures pre-patch state, runs post-patch health checks, and auto-rolls back if the service crashes or degrades.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            value={patchId}
            onChange={(e) => setPatchId(e.target.value)}
            placeholder="Patch ID (e.g. SP-2026-GLO-001)"
            className="flex-1 border-emerald-500/30 bg-zinc-900/60 text-zinc-200 focus-visible:border-emerald-500/50"
          />
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as typeof action)}
            className="rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200"
          >
            <option value="snapshot">Snapshot (pre-patch)</option>
            <option value="health_check">Health Check (post-patch)</option>
            <option value="rollback">Rollback</option>
          </select>
          <Button onClick={run} disabled={!patchId || loading} className="bg-emerald-600 text-white hover:bg-emerald-500">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            Execute
          </Button>
        </div>
      </div>

      {result && (
        <div className="holo-card-sharp hud-corners p-4">
          <pre className="whitespace-pre-wrap text-xs text-zinc-300">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
