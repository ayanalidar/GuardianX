"use client";

import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { sentinelApi } from "@/lib/sentinel/api";
import {
  AlertTriangle, Activity, BarChart3, Bug, CheckCircle2, Clock,
  Cpu, GitBranch, Globe, Loader2, Network, Play, Plus, Radar,
  RefreshCw, Shield, ShieldCheck, Sparkles, Trash2, TrendingUp,
  XCircle, Zap, Workflow,
} from "lucide-react";
import { motion } from "framer-motion";

type SubTab = "exec" | "chains" | "heatmap" | "cicd" | "alerts" | "schedules" | "fuzz" | "bizlogic" | "correlation" | "rbac" | "integrations" | "graphql" | "ws" | "k8s" | "auditlog";

export function AdvancedPanel() {
  const [sub, setSub] = useState<SubTab>("exec");
  const tabs: { id: SubTab; label: string; icon: React.ComponentType<{ className?: string }>; group: string }[] = [
    { id: "exec", label: "Executive Dashboard", icon: BarChart3, group: "Overview" },
    { id: "chains", label: "Attack Chains", icon: Network, group: "Overview" },
    { id: "heatmap", label: "Security Heatmap", icon: Shield, group: "Overview" },
    { id: "correlation", label: "Vuln Correlation", icon: Sparkles, group: "Overview" },
    { id: "cicd", label: "CI/CD Integration", icon: GitBranch, group: "Automation" },
    { id: "alerts", label: "Alerting", icon: AlertTriangle, group: "Automation" },
    { id: "schedules", label: "Scheduled Scans", icon: Clock, group: "Automation" },
    { id: "fuzz", label: "API Fuzzing", icon: Bug, group: "Testing" },
    { id: "bizlogic", label: "Business Logic", icon: Workflow, group: "Testing" },
    { id: "graphql", label: "GraphQL Testing", icon: Globe, group: "Testing" },
    { id: "ws", label: "WebSocket Testing", icon: Network, group: "Testing" },
    { id: "k8s", label: "K8s Scanning", icon: Cpu, group: "Testing" },
    { id: "rbac", label: "Multi-Tenant RBAC", icon: ShieldCheck, group: "Platform" },
    { id: "integrations", label: "Integrations", icon: Plus, group: "Platform" },
    { id: "auditlog", label: "Audit Log", icon: Activity, group: "Platform" },
  ];

  const groups = [...new Set(tabs.map(t => t.group))];

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
          <span className="size-1.5 rounded-full bg-emerald-500 pulse-dot" />
          guardianx@advanced:~$
        </div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50 neon-emerald">
          <Sparkles className="size-5 text-amber-400" />
          Advanced Security Platform
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          CI/CD integration, attack chain synthesis, security heatmap, alerting, scheduled scans, API fuzzing, business logic testing, vulnerability correlation, multi-tenant RBAC, SIEM export, GraphQL/WS/K8s testing, and audit logging.
        </p>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-1.5">
        {groups.map(group => (
          <div key={group} className="flex items-center gap-1">
            <span className="px-1 font-mono text-[9px] uppercase tracking-widest text-zinc-600">{group}</span>
            {tabs.filter(t => t.group === group).map(t => (
              <button key={t.id} onClick={() => setSub(t.id)}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  sub === t.id ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30" : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
                }`}>
                <t.icon className="size-3" />
                <span className="hidden lg:inline">{t.label}</span>
              </button>
            ))}
            <span className="mx-1 text-zinc-700">|</span>
          </div>
        ))}
      </div>

      {/* Content */}
      <div className="fade-in">
        {sub === "exec" && <ExecDashboard />}
        {sub === "chains" && <AttackChains />}
        {sub === "heatmap" && <Heatmap />}
        {sub === "correlation" && <Correlation />}
        {sub === "cicd" && <CICDPanel />}
        {sub === "alerts" && <AlertsPanel />}
        {sub === "schedules" && <SchedulesPanel />}
        {sub === "fuzz" && <FuzzPanel />}
        {sub === "bizlogic" && <BizLogicPanel />}
        {sub === "graphql" && <GraphQLPanel />}
        {sub === "ws" && <WebSocketPanel />}
        {sub === "k8s" && <K8sPanel />}
        {sub === "rbac" && <RBACPanel />}
        {sub === "integrations" && <IntegrationsPanel />}
        {sub === "auditlog" && <AuditLogPanel />}
      </div>
    </div>
  );
}

// ── Executive Dashboard ─────────────────────────────────────────────────────
function ExecDashboard() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    sentinelApi.execDashboard().then(setData).catch(() => null).finally(() => setLoading(false));
    const id = setInterval(() => sentinelApi.execDashboard().then(setData).catch(() => null), 30_000);
    return () => clearInterval(id);
  }, []);
  if (loading) return <Skeleton className="h-64 bg-amber-500/10" />;
  if (!data) return null;
  const posture = data.posture_score as number;
  const postureColor = posture >= 80 ? "#10b981" : posture >= 50 ? "#f59e0b" : "#ef4444";
  const cards = [
    { label: "Posture Score", value: `${posture} (${data.posture_grade})`, color: postureColor },
    { label: "Total Vulns", value: data.total_vulns as number, color: "#ef4444" },
    { label: "Critical Open", value: data.critical_open as number, color: data.critical_open ? "#ef4444" : "#10b981" },
    { label: "Resolution Rate", value: `${data.resolution_rate}%`, color: "#10b981" },
    { label: "Codebases", value: data.codebases_monitored as number, color: "#0ea5e9" },
    { label: "Patches Attested", value: data.patches_attested as number, color: "#a78bfa" },
    { label: "Canary Breaches", value: data.canary_breaches as number, color: data.canary_breaches ? "#ef4444" : "#10b981" },
    { label: "Hours Saved", value: (data.budget_metrics as Record<string, number>)?.manual_hours_saved ?? 0, color: "#10b981" },
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((c, i) => (
          <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }}
            className="holo-card hud-corners rounded-xl p-4 text-center">
            <div className="font-mono text-2xl font-bold" style={{ color: c.color }}>{c.value}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">{c.label}</div>
          </motion.div>
        ))}
      </div>
      {/* Trend */}
      <Card className="holo-card hud-corners rounded-xl p-5">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-emerald-400/70">7-Day Vulnerability Trend</div>
        <div className="flex items-end gap-2" style={{ height: 80 }}>
          {((data.trend as Array<{ day: string; vulns: number; resolved: number }>) || []).map((d, i) => {
            const max = Math.max(...((data.trend as Array<{ vulns: number }>) || []).map(t => t.vulns), 1);
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-full w-full items-end gap-0.5">
                  <div className="flex-1 rounded-t bg-red-500/60" style={{ height: `${(d.vulns / max) * 100}%` }} />
                  <div className="flex-1 rounded-t bg-emerald-500/60" style={{ height: `${(d.resolved / max) * 100}%` }} />
                </div>
                <span className="font-mono text-[8px] text-zinc-600">{d.day}</span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-center gap-4 text-[9px] text-zinc-500">
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-red-500/60" /> Vulns Found</span>
          <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-500/60" /> Resolved</span>
        </div>
      </Card>
      {/* Top threats + severity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="holo-card hud-corners rounded-xl p-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-red-400/70">Top Threats</div>
          {(data.top_threats as string[] || []).map((t, i) => (
            <div key={i} className="flex items-center gap-2 border-b border-zinc-800/40 py-1.5 text-xs text-zinc-300">
              <span className="font-mono text-red-400">{i + 1}.</span> {t}
            </div>
          ))}
        </Card>
        <Card className="holo-card hud-corners rounded-xl p-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-400/70">Severity Breakdown</div>
          {Object.entries((data.severity_breakdown as Record<string, number>) || {}).map(([sev, count]) => (
            <div key={sev} className="flex items-center gap-2 py-1">
              <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold ${sev === "critical" ? "border-red-500/40 bg-red-500/10 text-red-300" : sev === "high" ? "border-orange-500/40 bg-orange-500/10 text-orange-300" : sev === "medium" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-sky-500/40 bg-sky-500/10 text-sky-300"}`}>{sev.toUpperCase()}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full" style={{ width: `${(count / (data.total_vulns || 1)) * 100}%`, background: sev === "critical" ? "#ef4444" : sev === "high" ? "#f97316" : sev === "medium" ? "#f59e0b" : "#0ea5e9" }} />
              </div>
              <span className="font-mono text-xs text-zinc-400">{count}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ── Attack Chains ───────────────────────────────────────────────────────────
function AttackChains() {
  const { toast } = useToast();
  const [chains, setChains] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [synthesizing, setSynthesizing] = useState(false);
  const load = useCallback(async () => { try { setChains(await sentinelApi.attackChains() as unknown[]); } catch {} finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const synthesize = async () => {
    setSynthesizing(true);
    try { const r = await sentinelApi.synthesizeChains(); toast({ title: `${r.total} attack chain(s) synthesized` }); load(); }
    catch (e) { toast({ variant: "destructive", title: "Failed", description: e instanceof Error ? e.message : "unknown" }); }
    finally { setSynthesizing(false); }
  };
  if (loading) return <Skeleton className="h-48 bg-amber-500/10" />;
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={synthesize} disabled={synthesizing} className="bg-amber-600 text-white hover:bg-amber-500">
          {synthesizing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          AI Synthesize Chains
        </Button>
      </div>
      {chains.length === 0 ? (
        <Card className="holo-card hud-corners rounded-xl p-8 text-center text-sm text-zinc-500">
          <Network className="mx-auto size-8 text-zinc-700" />
          <p className="mt-2">No attack chains yet. Run AI synthesis to discover how individual vulnerabilities chain into full compromise.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {chains.map((c, i) => {
            const chain = c as { title: string; description: string; severity: string; steps: unknown[] };
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                <Card className="holo-card hud-corners rounded-xl p-4">
                  <div className="flex items-center gap-2">
                    <Badge className={`border text-[9px] ${chain.severity === "critical" ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-orange-500/40 bg-orange-500/10 text-orange-300"}`}>{chain.severity.toUpperCase()}</Badge>
                    <span className="text-sm font-bold text-zinc-100">{chain.title}</span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">{chain.description}</p>
                  <div className="mt-3 space-y-1">
                    {(chain.steps as Array<{ step: number; action: string; result: string }>).map((s, j) => (
                      <div key={j} className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/40 p-2 text-xs">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 font-mono text-[10px] text-amber-400">{s.step}</span>
                        <span className="text-zinc-300">{s.action}</span>
                        <span className="ml-auto text-emerald-400">→ {s.result}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Heatmap ─────────────────────────────────────────────────────────────────
function Heatmap() {
  const [data, setData] = useState<{ codebases: Array<{ codebase: string; files: Array<{ file: string; riskScore: number; heat: string; total: number; critical: number }> }> } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { sentinelApi.heatmap().then(setData).catch(() => null).finally(() => setLoading(false)); }, []);
  if (loading) return <Skeleton className="h-48 bg-amber-500/10" />;
  if (!data) return null;
  const heatColor: Record<string, string> = { critical: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#0ea5e9", clean: "#10b981" };
  return (
    <div className="space-y-4">
      {data.codebases.map((cb, i) => (
        <Card key={i} className="holo-card hud-corners rounded-xl p-4">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-zinc-400">{cb.codebase}</div>
          <div className="space-y-1.5">
            {cb.files.map((f, j) => (
              <div key={j} className="flex items-center gap-2">
                <span className="w-40 shrink-0 truncate font-mono text-[10px] text-zinc-400" title={f.file}>{f.file}</span>
                <div className="h-4 flex-1 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full transition-all" style={{ width: `${f.riskScore}%`, background: heatColor[f.heat] }} />
                </div>
                <span className="w-8 shrink-0 text-right font-mono text-[10px] font-bold" style={{ color: heatColor[f.heat] }}>{f.riskScore}</span>
                <span className="w-16 shrink-0 text-right text-[9px] text-zinc-500">{f.critical} crit / {f.total} total</span>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── Correlation ─────────────────────────────────────────────────────────────
function Correlation() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { sentinelApi.correlation().then(setData).catch(() => null).finally(() => setLoading(false)); }, []);
  if (loading) return <Skeleton className="h-48 bg-amber-500/10" />;
  if (!data) return null;
  const correlations = (data.correlations as Array<{ title: string; severity: string; sources: string[]; description: string; relatedFindings: string[] }>) || [];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-3 text-center">
        {Object.entries((data.modules_correlated as Record<string, number>) || {}).map(([k, v]) => (
          <div key={k} className="holo-card hud-corners rounded-lg p-2">
            <div className="font-mono text-lg font-bold text-emerald-400">{v}</div>
            <div className="text-[9px] uppercase text-zinc-500">{k.replace("_", " ")}</div>
          </div>
        ))}
      </div>
      {correlations.length === 0 ? (
        <Card className="holo-card hud-corners rounded-xl p-8 text-center text-sm text-zinc-500">
          <Sparkles className="mx-auto size-8 text-zinc-700" />
          <p className="mt-2">No cross-module correlations found.</p>
        </Card>
      ) : correlations.map((c, i) => (
        <Card key={i} className="holo-card hud-corners rounded-xl p-4">
          <div className="flex items-center gap-2">
            <Badge className={`border text-[9px] ${c.severity === "critical" ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-orange-500/40 bg-orange-500/10 text-orange-300"}`}>{c.severity.toUpperCase()}</Badge>
            <span className="text-sm font-bold text-zinc-100">{c.title}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-400">{c.description}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {c.relatedFindings.map((f, j) => (
              <span key={j} className="rounded border border-zinc-700 bg-zinc-900/40 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400">{f}</span>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ── CI/CD ───────────────────────────────────────────────────────────────────
function CICDPanel() {
  const { toast } = useToast();
  const [codebaseId, setCodebaseId] = useState("");
  const [branch, setBranch] = useState("main");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const run = async () => {
    setRunning(true);
    try {
      const r = await sentinelApi.cicdScan(codebaseId, { branch });
      toast({ title: "CI/CD scan started", description: `Scan ${r.scanId} queued for branch ${branch}` });
      // Poll status
      const poll = setInterval(async () => {
        const s = await sentinelApi.cicdStatus(r.scanId);
        setStatus(s as unknown as Record<string, unknown>);
        if (s.status === "completed" || s.status === "failed") { clearInterval(poll); setRunning(false); toast({ title: s.blockMerge ? "⚠ MERGE BLOCKED" : "✓ Safe to merge", description: s.reason, variant: s.blockMerge ? "destructive" : "default" }); }
      }, 3000);
    } catch (e) { toast({ variant: "destructive", title: "Failed", description: e instanceof Error ? e.message : "unknown" }); setRunning(false); }
  };
  return (
    <Card className="holo-card hud-corners rounded-xl p-5">
      <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-violet-400/70">CI/CD Pipeline Integration</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label className="text-xs text-zinc-400">Codebase ID</Label><Input value={codebaseId} onChange={e => setCodebaseId(e.target.value)} placeholder="cms6..." className="mt-1 border-zinc-800 bg-zinc-900/60 font-mono text-sm" /></div>
        <div><Label className="text-xs text-zinc-400">Branch</Label><Input value={branch} onChange={e => setBranch(e.target.value)} className="mt-1 border-zinc-800 bg-zinc-900/60 text-sm" /></div>
      </div>
      <Button onClick={run} disabled={running || !codebaseId} className="mt-4 bg-violet-600 text-white hover:bg-violet-500">
        {running ? <Loader2 className="size-4 animate-spin" /> : <GitBranch className="size-4" />} Trigger CI/CD Scan
      </Button>
      {status && (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-center gap-2">
            {(status.blockMerge as boolean) ? <XCircle className="size-4 text-red-400" /> : <CheckCircle2 className="size-4 text-emerald-400" />}
            <span className="text-sm font-bold text-zinc-100">Status: {status.status as string}</span>
            {(status.blockMerge as boolean) && <Badge className="border border-red-500/40 bg-red-500/10 text-[9px] text-red-300">MERGE BLOCKED</Badge>}
          </div>
          <p className="mt-1 text-xs text-zinc-400">{status.reason as string}</p>
        </div>
      )}
    </Card>
  );
}

// ── Simple panels for the rest ──────────────────────────────────────────────
function AlertsPanel() {
  const [rules, setRules] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { sentinelApi.alerts().then(r => setRules(r as unknown[])).catch(() => null).finally(() => setLoading(false)); }, []);
  if (loading) return <Skeleton className="h-32 bg-amber-500/10" />;
  return (
    <Card className="holo-card hud-corners rounded-xl p-5">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-amber-400/70">Alert Rules</div>
      {rules.length === 0 ? <p className="text-sm text-zinc-500">No alert rules configured. Create rules to get notified when vulnerabilities, breaches, or posture drops are detected.</p> :
        rules.map((r, i) => <div key={i} className="border-b border-zinc-800 py-2 text-xs text-zinc-300">{JSON.stringify(r)}</div>)}
    </Card>
  );
}

function SchedulesPanel() {
  const [schedules, setSchedules] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { sentinelApi.scheduledScans().then(r => setSchedules(r as unknown[])).catch(() => null).finally(() => setLoading(false)); }, []);
  if (loading) return <Skeleton className="h-32 bg-amber-500/10" />;
  return (
    <Card className="holo-card hud-corners rounded-xl p-5">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-cyan-400/70">Scheduled Scans</div>
      {schedules.length === 0 ? <p className="text-sm text-zinc-500">No scheduled scans. Create recurring scans to run continuously (e.g. nightly SAST, daily DAST).</p> :
        schedules.map((s, i) => <div key={i} className="border-b border-zinc-800 py-2 text-xs text-zinc-300">{JSON.stringify(s)}</div>)}
    </Card>
  );
}

function FuzzPanel() {
  const { toast } = useToast();
  const [url, setUrl] = useState("http://localhost:3004");
  const [endpoint, setEndpoint] = useState("/search");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const run = async () => {
    setRunning(true);
    try { const r = await sentinelApi.fuzz(url, endpoint, "GET"); setResult(r as Record<string, unknown>); toast({ title: "Fuzzing complete", description: `${r.total_requests} requests sent` }); }
    catch (e) { toast({ variant: "destructive", title: "Failed" }); }
    finally { setRunning(false); }
  };
  return (
    <Card className="holo-card hud-corners rounded-xl p-5">
      <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-red-400/70">API Fuzzing Engine</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><Label className="text-xs text-zinc-400">Target URL</Label><Input value={url} onChange={e => setUrl(e.target.value)} className="mt-1 border-zinc-800 bg-zinc-900/60 font-mono text-sm" /></div>
        <div><Label className="text-xs text-zinc-400">Endpoint</Label><Input value={endpoint} onChange={e => setEndpoint(e.target.value)} className="mt-1 border-zinc-800 bg-zinc-900/60 font-mono text-sm" /></div>
      </div>
      <Button onClick={run} disabled={running} className="mt-4 bg-red-600 text-white hover:bg-red-500">{running ? <Loader2 className="size-4 animate-spin" /> : <Bug className="size-4" />} Start Fuzzing</Button>
      {result && (
        <div className="mt-4 space-y-2">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2"><div className="font-mono text-lg font-bold text-zinc-300">{result.total_requests as number}</div><div className="text-[9px] uppercase text-zinc-500">Requests</div></div>
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2"><div className="font-mono text-lg font-bold text-red-400">{result.crashes as number}</div><div className="text-[9px] uppercase text-zinc-500">Crashes</div></div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2"><div className="font-mono text-lg font-bold text-amber-400">{result.anomalies_found as number}</div><div className="text-[9px] uppercase text-zinc-500">Anomalies</div></div>
          </div>
          {((result.anomalies as Array<Record<string, unknown>>) || []).slice(0, 5).map((a, i) => (
            <div key={i} className="rounded border border-amber-500/20 bg-amber-500/5 p-2 text-[10px] text-zinc-300">⚠ {a.anomaly as string}: payload="{a.payload as string}"</div>
          ))}
        </div>
      )}
    </Card>
  );
}

function BizLogicPanel() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const run = async () => {
    setRunning(true);
    try { const r = await sentinelApi.businessLogicTest("http://localhost:3004"); setResult(r as Record<string, unknown>); toast({ title: `${r.total} business logic test(s) generated` }); }
    catch { toast({ variant: "destructive", title: "Failed" }); }
    finally { setRunning(false); }
  };
  return (
    <Card className="holo-card hud-corners rounded-xl p-5">
      <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-violet-400/70">Business Logic Testing</div>
      <p className="mb-4 text-xs text-zinc-400">AI generates attack scenarios for race conditions, price manipulation, workflow bypass, privilege escalation, and IDOR chains.</p>
      <Button onClick={run} disabled={running} className="bg-violet-600 text-white hover:bg-violet-500">{running ? <Loader2 className="size-4 animate-spin" /> : <Workflow className="size-4" />} Generate Tests</Button>
      {result && (
        <div className="mt-4 space-y-2">
          {((result.tests as Array<Record<string, unknown>>) || []).map((t, i) => (
            <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="flex items-center gap-2"><Badge className="border border-violet-500/30 bg-violet-500/10 text-[9px] text-violet-300">{(t.category as string).toUpperCase()}</Badge><span className="text-xs font-bold text-zinc-200">{t.title as string}</span></div>
              <p className="mt-1 text-[11px] text-zinc-400">{t.description as string}</p>
              <div className="mt-1 space-y-0.5">{((t.steps as string[]) || []).map((s, j) => <div key={j} className="text-[10px] text-zinc-500">{j + 1}. {s}</div>)}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function GraphQLPanel() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const run = async () => {
    setRunning(true);
    try { const r = await sentinelApi.graphqlTest("http://localhost:3004"); setResult(r as Record<string, unknown>); toast({ title: "GraphQL test complete" }); }
    catch { toast({ variant: "destructive", title: "Failed" }); }
    finally { setRunning(false); }
  };
  return (
    <Card className="holo-card hud-corners rounded-xl p-5">
      <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-cyan-400/70">GraphQL Security Testing</div>
      <Button onClick={run} disabled={running} className="bg-cyan-600 text-white hover:bg-cyan-500">{running ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />} Test GraphQL</Button>
      {result && <div className="mt-4 space-y-2">{((result.results as Array<Record<string, unknown>>) || []).map((r, i) => (
        <div key={i} className={`rounded border p-2 ${r.vulnerable ? "border-red-500/30 bg-red-500/5" : "border-emerald-500/20 bg-emerald-500/5"}`}>
          <div className="flex items-center gap-2">{r.vulnerable ? <XCircle className="size-3 text-red-400" /> : <CheckCircle2 className="size-3 text-emerald-400" />}<span className="text-xs text-zinc-300">{r.test as string}</span></div>
          <p className="mt-0.5 text-[10px] text-zinc-500">{r.description as string}</p>
        </div>
      ))}</div>}
    </Card>
  );
}

function WebSocketPanel() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const run = async () => {
    setRunning(true);
    try { const r = await sentinelApi.wsTest("http://localhost:3004"); setResult(r as Record<string, unknown>); toast({ title: "WebSocket test complete" }); }
    catch { toast({ variant: "destructive", title: "Failed" }); }
    finally { setRunning(false); }
  };
  return (
    <Card className="holo-card hud-corners rounded-xl p-5">
      <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-cyan-400/70">WebSocket Security Testing</div>
      <Button onClick={run} disabled={running} className="bg-cyan-600 text-white hover:bg-cyan-500">{running ? <Loader2 className="size-4 animate-spin" /> : <Network className="size-4" />} Test WebSocket</Button>
      {result && <div className="mt-4 space-y-2">{((result.results as Array<Record<string, unknown>>) || []).map((r, i) => (
        <div key={i} className={`rounded border p-2 ${r.vulnerable ? "border-red-500/30 bg-red-500/5" : "border-emerald-500/20 bg-emerald-500/5"}`}>
          <div className="flex items-center gap-2">{r.vulnerable ? <XCircle className="size-3 text-red-400" /> : <CheckCircle2 className="size-3 text-emerald-400" />}<span className="text-xs text-zinc-300">{r.test as string}</span></div>
          <p className="mt-0.5 text-[10px] text-zinc-500">{r.description as string}</p>
        </div>
      ))}</div>}
    </Card>
  );
}

function K8sPanel() {
  const { toast } = useToast();
  const [manifest, setManifest] = useState("apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: vuln-app\nspec:\n  template:\n    spec:\n      hostNetwork: true\n      containers:\n      - name: app\n        image: myapp:latest\n        securityContext:\n          privileged: true");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const run = async () => {
    setRunning(true);
    try { const r = await sentinelApi.k8sScan(manifest); setResult(r as Record<string, unknown>); toast({ title: "K8s scan complete", description: `${r.findings} misconfigurations found` }); }
    catch { toast({ variant: "destructive", title: "Failed" }); }
    finally { setRunning(false); }
  };
  return (
    <Card className="holo-card hud-corners rounded-xl p-5">
      <div className="mb-4 font-mono text-[10px] uppercase tracking-widest text-violet-400/70">Kubernetes Manifest Scanner</div>
      <textarea value={manifest} onChange={e => setManifest(e.target.value)} className="custom-scrollbar min-h-[8rem] w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-300" />
      <Button onClick={run} disabled={running} className="mt-3 bg-violet-600 text-white hover:bg-violet-500">{running ? <Loader2 className="size-4 animate-spin" /> : <Cpu className="size-4" />} Scan Manifest</Button>
      {result && <div className="mt-4 space-y-2">
        <div className="text-sm text-zinc-300">{result.summary as string}</div>
        {((result.findings_list as Array<Record<string, string>>) || []).map((f, i) => (
          <div key={i} className={`rounded border p-2 ${f.severity === "critical" ? "border-red-500/30 bg-red-500/5" : f.severity === "high" ? "border-orange-500/30 bg-orange-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
            <div className="flex items-center gap-2"><Badge className="border text-[8px] text-zinc-300">{f.severity.toUpperCase()}</Badge><span className="text-xs text-zinc-200">{f.title}</span></div>
            <p className="mt-0.5 text-[10px] text-zinc-500">{f.description}</p>
            <p className="mt-0.5 text-[10px] text-emerald-400">Fix: {f.fix}</p>
          </div>
        ))}
      </div>}
    </Card>
  );
}

function RBACPanel() {
  const [orgs, setOrgs] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { sentinelApi.orgs().then(r => setOrgs(r as unknown[])).catch(() => null).finally(() => setLoading(false)); }, []);
  if (loading) return <Skeleton className="h-32 bg-amber-500/10" />;
  return (
    <Card className="holo-card hud-corners rounded-xl p-5">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-emerald-400/70">Multi-Tenant RBAC</div>
      {orgs.length === 0 ? <p className="text-sm text-zinc-500">No organizations configured. Create organizations, invite team members, and assign roles (admin/analyst/viewer) for multi-tenant access control.</p> :
        orgs.map((o, i) => <div key={i} className="border-b border-zinc-800 py-2 text-xs text-zinc-300">{JSON.stringify(o)}</div>)}
    </Card>
  );
}

function IntegrationsPanel() {
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportFormat, setExportFormat] = useState("jira");
  const [exportResult, setExportResult] = useState<Record<string, unknown> | null>(null);
  const load = useCallback(() => { sentinelApi.integrations().then(r => setIntegrations(r as unknown[])).catch(() => null).finally(() => setLoading(false)); }, []);
  useEffect(() => { load(); }, [load]);
  const doExport = async () => {
    try { const r = await sentinelApi.exportSIEM(exportFormat); setExportResult(r as Record<string, unknown>); toast({ title: `Exported as ${exportFormat.toUpperCase()}`, description: `${(r as Record<string, number>).eventCount || (r as Record<string, number>).docCount || (r as Record<string, number>).ticketCount || 0} items` }); }
    catch { toast({ variant: "destructive", title: "Export failed" }); }
  };
  return (
    <div className="space-y-4">
      <Card className="holo-card hud-corners rounded-xl p-5">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-emerald-400/70">Integrations</div>
        {loading ? <Skeleton className="h-20 bg-emerald-500/10" /> : integrations.length === 0 ? <p className="text-sm text-zinc-500">No integrations configured. Connect Jira, Splunk, ELK, Slack, or GitHub.</p> :
          integrations.map((i, idx) => <div key={idx} className="border-b border-zinc-800 py-2 text-xs text-zinc-300">{JSON.stringify(i)}</div>)}
      </Card>
      <Card className="holo-card hud-corners rounded-xl p-5">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-violet-400/70">SIEM / Ticket Export</div>
        <div className="flex gap-2">
          <select value={exportFormat} onChange={e => setExportFormat(e.target.value)} className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 text-sm text-zinc-200">
            <option value="jira">Jira Tickets</option><option value="splunk">Splunk HEC</option><option value="elk">ELK Bulk</option>
          </select>
          <Button onClick={doExport} className="bg-violet-600 text-white hover:bg-violet-500"><Play className="size-4" /> Export</Button>
        </div>
        {exportResult && <pre className="custom-scrollbar mt-3 max-h-48 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[10px] text-emerald-300">{JSON.stringify(exportResult, null, 2).slice(0, 2000)}</pre>}
      </Card>
    </div>
  );
}

function AuditLogPanel() {
  const [logs, setLogs] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { sentinelApi.auditLog(50).then(r => setLogs(r as unknown[])).catch(() => null).finally(() => setLoading(false)); }, []);
  if (loading) return <Skeleton className="h-32 bg-amber-500/10" />;
  return (
    <Card className="holo-card hud-corners rounded-xl p-5">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-widest text-emerald-400/70">System Audit Log</div>
      {logs.length === 0 ? <p className="text-sm text-zinc-500">No audit log entries yet.</p> :
        <div className="custom-scrollbar max-h-96 space-y-1 overflow-y-auto">
          {logs.map((l, i) => {
            const log = l as { action: string; entity: string | null; actor: string; timestamp: string };
            return (
              <div key={i} className="flex items-center gap-2 border-b border-zinc-800/40 py-1.5 text-xs">
                <span className="font-mono text-[9px] text-zinc-600">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <Badge className="border border-emerald-500/20 bg-emerald-500/5 text-[8px] text-emerald-300">{log.action}</Badge>
                <span className="text-zinc-400">{log.entity || "—"}</span>
                <span className="ml-auto text-[9px] text-zinc-600">{log.actor}</span>
              </div>
            );
          })}
        </div>}
    </Card>
  );
}
