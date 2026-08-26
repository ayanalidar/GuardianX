"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { GuardianXLogo } from "./guardianx-logo";
import {
  Shield, ShieldCheck, Loader2, LogOut, Lock, Mail, ArrowRight,
  AlertTriangle, AlertCircle, Bug, FileDown, Activity, CheckCircle2,
  Clock, XCircle, Building2, Globe, RefreshCw, FileText,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────

interface PortalAuthResponse {
  token: string;
  client: {
    id: string;
    name: string;
    description: string | null;
    frameworks: string[];
    status: string;
  };
  message: string;
}

interface PortalData {
  client: {
    name: string;
    description: string | null;
    status: string;
    frameworks: string[];
    target_url: string | null;
  };
  stats: {
    codebases: number;
    targets: number;
    total_patches: number;
    pending_patches: number;
    approved_patches: number;
    rejected_patches: number;
    critical_patches: number;
    total_findings: number;
    critical_findings: number;
  };
  findings_by_severity: Record<string, number>;
  patches_by_status: Record<string, number>;
  risk: { score: number; level: string; posture_score: number };
  compliance: { name: string; score: number; status: string; mapped_findings: number }[];
  recent_findings: { title: string; severity: string; endpoint: string; category: string; createdAt: string }[];
  recent_patches: { title: string; severity: string; status: string; patchId: string; createdAt: string }[];
  recent_incidents: { id: string; title: string; severity: string; status: string; category: string; detectedAt: string }[];
  engagement_ids: string[];
  generated_at: string;
}

// ── Severity helpers ─────────────────────────────────────────────────────

const SEVERITY_META: Record<string, { color: string; bg: string; border: string; label: string }> = {
  critical: { color: "text-red-300", bg: "bg-red-500/15", border: "border-red-500/40", label: "Critical" },
  high: { color: "text-orange-300", bg: "bg-orange-500/15", border: "border-orange-500/40", label: "High" },
  medium: { color: "text-amber-300", bg: "bg-amber-500/15", border: "border-amber-500/40", label: "Medium" },
  low: { color: "text-sky-300", bg: "bg-sky-500/15", border: "border-sky-500/40", label: "Low" },
  info: { color: "text-zinc-300", bg: "bg-zinc-500/15", border: "border-zinc-500/40", label: "Info" },
};

function sevMeta(sev: string) {
  return SEVERITY_META[(sev || "info").toLowerCase()] || SEVERITY_META.info;
}

const PATCH_STATUS_META: Record<string, { color: string; bg: string; border: string; icon: typeof Clock; label: string }> = {
  pending: { color: "text-amber-300", bg: "bg-amber-500/15", border: "border-amber-500/40", icon: Clock, label: "Pending" },
  approved: { color: "text-emerald-300", bg: "bg-emerald-500/15", border: "border-emerald-500/40", icon: CheckCircle2, label: "Approved" },
  rejected: { color: "text-red-300", bg: "bg-red-500/15", border: "border-red-500/40", icon: XCircle, label: "Rejected" },
};

function patchStatusMeta(status: string) {
  return PATCH_STATUS_META[(status || "pending").toLowerCase()] || PATCH_STATUS_META.pending;
}

function postureColor(score: number): string {
  if (score >= 90) return "#10b981";
  if (score >= 75) return "#84cc16";
  if (score >= 60) return "#f59e0b";
  if (score >= 40) return "#f97316";
  return "#ef4444";
}

function timeAgo(iso: string): string {
  try {
    const d = new Date(iso).getTime();
    const diff = Date.now() - d;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "n/a";
  }
}

// ── Component ────────────────────────────────────────────────────────────

export function ClientPortal() {
  const { toast } = useToast();
  const [authed, setAuthed] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PortalData | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Restore session on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("portal-client-id");
      const name = localStorage.getItem("portal-client-name");
      const token = localStorage.getItem("portal-token");
      if (saved && token) {
        setClientId(saved);
        setClientName(name || "");
        setAuthed(true);
        return;
      }
    } catch {
      // localStorage unavailable
    }
    setLoading(false);
  }, []);

  const handleLogout = useCallback(() => {
    try {
      localStorage.removeItem("portal-client-id");
      localStorage.removeItem("portal-client-name");
      localStorage.removeItem("portal-token");
    } catch {
      // ignore
    }
    setAuthed(false);
    setClientId(null);
    setClientName("");
    setData(null);
    setLoading(false);
    toast({ title: "Signed out", description: "You have been logged out of the portal." });
  }, [toast]);

  // Fetch portal data whenever clientId changes
  const loadData = useCallback(async (id: string, silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("portal-token") : null;
      const res = await fetch(`/api/client-portal?clientId=${encodeURIComponent(id)}`, {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 401) {
        // Token expired or invalid, force re-login.
        toast({
          variant: "destructive",
          title: "Session expired",
          description: "Please sign in again.",
        });
        handleLogout();
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to load portal data");
      }
      setData(json as PortalData);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load dashboard",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast, handleLogout]);

  useEffect(() => {
    if (authed && clientId) {
      setLoading(true);
      loadData(clientId);
    }
  }, [authed, clientId, loadData]);

  // Auto-refresh every 60s
  useEffect(() => {
    if (!authed || !clientId) return;
    const id = setInterval(() => loadData(clientId, true), 60_000);
    return () => clearInterval(id);
  }, [authed, clientId, loadData]);

  // ── Login screen ──────────────────────────────────────────────────────
  if (!authed) {
    return <PortalLogin onSuccess={(resp) => {
      try {
        localStorage.setItem("portal-client-id", resp.client.id);
        localStorage.setItem("portal-client-name", resp.client.name);
        localStorage.setItem("portal-token", resp.token);
      } catch {
        // localStorage may be unavailable; session will not persist
      }
      setClientId(resp.client.id);
      setClientName(resp.client.name);
      setAuthed(true);
    }} />;
  }

  // ── Loading skeleton ──────────────────────────────────────────────────
  if (loading || !data) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100">
        <PortalHeader clientName={clientName} onLogout={handleLogout} onRefresh={() => clientId && loadData(clientId)} refreshing={refreshing} />
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl border border-zinc-800 bg-zinc-900/40" />
            ))}
          </div>
          <Skeleton className="mt-4 h-64 rounded-xl border border-zinc-800 bg-zinc-900/40" />
        </div>
      </div>
    );
  }

  // ── Dashboard ─────────────────────────────────────────────────────────
  const posture = data.risk.posture_score;
  const pColor = postureColor(posture);
  const engagementId = data.engagement_ids?.[0] || clientId || "";

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <PortalHeader
        clientName={clientName}
        onLogout={handleLogout}
        onRefresh={() => clientId && loadData(clientId)}
        refreshing={refreshing}
        lastUpdated={data.generated_at}
      />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {/* Hero / PostureScore */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6 overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-900/60 p-6 sm:p-8"
        >
          <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-400/80">
                <ShieldCheck className="size-3.5" />
                Security Posture
              </div>
              <h1 className="mt-2 text-2xl font-bold text-zinc-50 sm:text-3xl">{data.client.name}</h1>
              {data.client.description && (
                <p className="mt-1 max-w-2xl text-sm text-zinc-400">{data.client.description}</p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                {data.client.target_url && (
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1">
                    <Globe className="size-3" />
                    {data.client.target_url}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1">
                  <Building2 className="size-3" />
                  <span className="capitalize">{data.client.status}</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1">
                  <Activity className="size-3" />
                  Updated {timeAgo(data.generated_at)}
                </span>
              </div>
              {engagementId && (
                <div className="mt-4">
                  <Button
                    onClick={async () => {
                      try {
                        const token = typeof window !== "undefined" ? localStorage.getItem("portal-token") : null;
                        const res = await fetch(`/api/engagements/${engagementId}/report-html`, {
                          headers: token ? { Authorization: `Bearer ${token}` } : {},
                        });
                        if (!res.ok) {
                          toast({
                            variant: "destructive",
                            title: "Report failed",
                            description: `HTTP ${res.status} ${res.statusText}`,
                          });
                          return;
                        }
                        const html = await res.text();
                        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
                        const blobUrl = URL.createObjectURL(blob);
                        window.open(blobUrl, "_blank");
                        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
                      } catch (err) {
                        toast({
                          variant: "destructive",
                          title: "Report failed",
                          description: err instanceof Error ? err.message : "unknown error",
                        });
                      }
                    }}
                    className="bg-emerald-600 text-white hover:bg-emerald-500"
                  >
                    <FileDown className="size-4" />
                    Download Report
                  </Button>
                </div>
              )}
            </div>

            {/* PostureScore gauge */}
            <PostureGauge score={posture} color={pColor} level={data.risk.level} />
          </div>
        </motion.section>

        {/* Stats row */}
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile label="Total findings" value={data.stats.total_findings} icon={Bug} accent="text-amber-400" />
          <StatTile label="Critical" value={data.stats.critical_findings} icon={AlertTriangle} accent="text-red-400" />
          <StatTile label="Pending patches" value={data.stats.pending_patches} icon={Clock} accent="text-amber-400" />
          <StatTile label="Approved" value={data.stats.approved_patches} icon={CheckCircle2} accent="text-emerald-400" />
          <StatTile label="Rejected" value={data.stats.rejected_patches} icon={XCircle} accent="text-red-400" />
          <StatTile label="Codebases" value={data.stats.codebases} icon={FileText} accent="text-sky-400" />
        </section>

        {/* Main grid */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Open findings by severity */}
          <Card className="lg:col-span-2">
            <CardHeader title="Open findings by severity" subtitle="From DAST engagements across all targets" icon={Bug} />
            <CardBody>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {(["critical", "high", "medium", "low", "info"] as const).map((sev) => {
                  const count = data.findings_by_severity?.[sev] ?? 0;
                  const meta = sevMeta(sev);
                  return (
                    <div key={sev} className={`rounded-lg border ${meta.border} ${meta.bg} p-3 text-center`}>
                      <div className={`text-2xl font-bold ${meta.color}`}>{count}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-400">{meta.label}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Recent findings</div>
                {data.recent_findings.length === 0 ? (
                  <EmptyState text="No findings recorded yet." />
                ) : (
                  <ul className="max-h-72 space-y-2 overflow-y-auto custom-scrollbar pr-1">
                    {data.recent_findings.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 p-2.5">
                        <Badge className={`shrink-0 border ${sevMeta(f.severity).border} ${sevMeta(f.severity).bg} text-[9px] uppercase ${sevMeta(f.severity).color}`}>
                          {f.severity}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-zinc-200">{f.title}</div>
                          <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">{f.endpoint}</div>
                        </div>
                        <span className="shrink-0 text-[10px] text-zinc-600">{timeAgo(f.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Patch status */}
          <Card>
            <CardHeader title="Patch status" subtitle="AI-generated SAST patches" icon={Shield} />
            <CardBody>
              <div className="space-y-3">
                {(["pending", "approved", "rejected"] as const).map((status) => {
                  const count = data.patches_by_status?.[status] ?? 0;
                  const meta = patchStatusMeta(status);
                  const total = data.stats.total_patches || 1;
                  const pct = Math.round((count / total) * 100);
                  const Icon = meta.icon;
                  return (
                    <div key={status}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-zinc-300">
                          <Icon className={`size-3.5 ${meta.color}`} />
                          {meta.label}
                        </span>
                        <span className={`font-bold ${meta.color}`}>{count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pct}%`, background: meta.color.replace("text-", "").replace("-300", "-500") }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {data.recent_patches.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Latest patches</div>
                  <ul className="space-y-2">
                    {data.recent_patches.slice(0, 4).map((p, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 p-2">
                        <Badge className={`shrink-0 border ${sevMeta(p.severity).border} ${sevMeta(p.severity).bg} text-[9px] uppercase ${sevMeta(p.severity).color}`}>
                          {p.severity}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-zinc-200">{p.title}</div>
                          <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">{p.patchId}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Recent incidents */}
          <Card className="lg:col-span-2">
            <CardHeader title="Recent incidents" subtitle="Active and recently closed" icon={AlertCircle} />
            <CardBody>
              {!data.recent_incidents || data.recent_incidents.length === 0 ? (
                <EmptyState text="No incidents on record. Stay vigilant." icon={ShieldCheck} />
              ) : (
                <ul className="max-h-80 space-y-2 overflow-y-auto custom-scrollbar pr-1">
                  {data.recent_incidents.map((inc) => (
                    <li key={inc.id} className="flex items-start gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
                      <Badge className={`shrink-0 border ${sevMeta(inc.severity).border} ${sevMeta(inc.severity).bg} text-[9px] uppercase ${sevMeta(inc.severity).color}`}>
                        {inc.severity}
                      </Badge>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-zinc-100">{inc.title}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
                          <span className="capitalize">{inc.category}</span>
                          <span>·</span>
                          <span className="capitalize">{inc.status}</span>
                          <span>·</span>
                          <span>{timeAgo(inc.detectedAt)}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Compliance status */}
          <Card>
            <CardHeader title="Compliance" subtitle="Framework posture" icon={ShieldCheck} />
            <CardBody>
              <ul className="space-y-2.5">
                {data.compliance.map((c) => {
                  const color = c.score >= 80 ? "#10b981" : c.score >= 50 ? "#f59e0b" : "#ef4444";
                  const statusLabel = c.status === "compliant" ? "Compliant" : c.status === "at-risk" ? "At risk" : "Non-compliant";
                  return (
                    <li key={c.name} className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-200">{c.name}</span>
                        <span className="text-sm font-bold" style={{ color }}>{c.score}</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                        <div className="h-full rounded-full" style={{ width: `${c.score}%`, background: color }} />
                      </div>
                      <div className="mt-1 text-[10px] text-zinc-500">
                        {statusLabel} · {c.mapped_findings} mapped finding{c.mapped_findings === 1 ? "" : "s"}
                      </div>
                    </li>
                  );
                })}
                {data.compliance.length === 0 && (
                  <EmptyState text="No compliance frameworks configured for this client." />
                )}
              </ul>
            </CardBody>
          </Card>
        </div>

        {/* Footer note */}
        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-zinc-900 pt-6 text-[11px] text-zinc-600 sm:flex-row">
          <span>GuardianX Autonomous Security Operations · Read-only client portal</span>
          <span className="font-mono">Session active for {data.client.name}</span>
        </div>
      </main>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function PortalHeader({
  clientName,
  onLogout,
  onRefresh,
  refreshing,
  lastUpdated,
}: {
  clientName: string;
  onLogout: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  lastUpdated?: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <GuardianXLogo size={36} />
          <div>
            <div className="text-sm font-bold text-zinc-50">
              Guardian<span className="text-emerald-400">X</span>
              <span className="ml-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">Client Portal</span>
            </div>
            <div className="text-[11px] text-zinc-500">{clientName || "Client"}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="hidden text-[10px] text-zinc-600 sm:inline">Updated {timeAgo(lastUpdated)}</span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
          >
            {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            className="border-red-500/30 bg-red-500/5 text-red-300 hover:bg-red-500/10"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </div>
    </header>
  );
}

function PostureGauge({ score, color, level }: { score: number; color: string; level: string }) {
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (score / 100) * circumference;
  const levelLabel =
    level === "CRITICAL" ? "Critical risk" :
    level === "ELEVATED" ? "Elevated risk" :
    level === "MODERATE" ? "Moderate risk" : "Low risk";
  return (
    <div className="flex flex-col items-center">
      <div className="relative size-40">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
          <circle
            cx="60" cy="60" r="52" fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1.2s ease", filter: `drop-shadow(0 0 6px ${color}66)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold" style={{ color }}>{score}</span>
          <span className="text-[10px] uppercase tracking-widest text-zinc-500">out of 100</span>
        </div>
      </div>
      <div className="mt-2 text-center">
        <div className="text-xs font-semibold" style={{ color }}>{levelLabel}</div>
        <div className="text-[10px] text-zinc-500">PostureScore</div>
      </div>
    </div>
  );
}

function StatTile({ label, value, icon: Icon, accent }: { label: string; value: number; icon: typeof Bug; accent: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 sm:p-4">
      <div className="flex items-center justify-between">
        <Icon className={`size-3.5 ${accent}`} />
      </div>
      <div className={`mt-2 text-xl font-bold sm:text-2xl ${accent}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ title, subtitle, icon: Icon }: { title: string; subtitle?: string; icon: typeof Bug }) {
  return (
    <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <Icon className="size-4 text-emerald-400" />
      <div className="min-w-0">
        <div className="text-sm font-semibold text-zinc-100">{title}</div>
        {subtitle && <div className="truncate text-[10px] text-zinc-500">{subtitle}</div>}
      </div>
    </div>
  );
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="p-4">{children}</div>;
}

function EmptyState({ text, icon: Icon = AlertCircle }: { text: string; icon?: typeof Bug }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <Icon className="size-6 text-zinc-700" />
      <p className="mt-2 text-xs text-zinc-500">{text}</p>
    </div>
  );
}

// ── Login screen ─────────────────────────────────────────────────────────

function PortalLogin({ onSuccess }: { onSuccess: (resp: PortalAuthResponse) => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [portalCode, setPortalCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !portalCode) return;
    setLoading(true);
    try {
      const res = await fetch("/api/client-portal-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, portalCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Authentication failed");
      }
      toast({
        title: "Portal access granted",
        description: `Welcome, ${json.client.name}.`,
      });
      onSuccess(json as PortalAuthResponse);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Access denied",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 p-4">
      {/* Background accents */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-40 left-1/2 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-emerald-700/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8 backdrop-blur"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto flex justify-center">
            <GuardianXLogo size={72} />
          </div>
          <h1 className="mt-3 text-2xl font-bold text-zinc-50">
            Guardian<span className="text-emerald-400">X</span>
          </h1>
          <p className="mt-1 text-xs text-zinc-400">Client Security Portal</p>
        </div>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-zinc-400">Contact email</Label>
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="you@company.com"
                className="border-zinc-700 bg-zinc-900/60 pl-9 text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Portal access code</Label>
            <div className="relative mt-1">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <Input
                type="password"
                value={portalCode}
                onChange={(e) => setPortalCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="Your portal code"
                className="border-zinc-700 bg-zinc-900/60 pl-9 font-mono text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
              />
            </div>
          </div>
          <Button
            onClick={handleSubmit}
            disabled={loading || !email || !portalCode}
            className="w-full bg-emerald-600 py-2.5 text-white hover:bg-emerald-500"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                Access Dashboard
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-center text-[11px] text-zinc-500">
            <Shield className="mb-1 inline size-3.5 text-emerald-400/70" />
            <div>This portal is read-only. Your portal code was issued by your GuardianX security team.</div>
          </div>
        </div>

        <div className="mt-6 text-center text-[10px] text-zinc-600">
          www.guardianx.in · hello@guardianx.in · +91 70067 12347
        </div>
      </motion.div>
    </div>
  );
}
