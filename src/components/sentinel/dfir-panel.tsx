"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert, Activity, FileText, Lock, Crosshair, Bug, Bird,
  AlertTriangle, ShieldCheck, ArrowRight, Plus, ChevronLeft,
  Search, Clock, Zap, Terminal, Trash2, CheckCircle2, Eye,
  Fingerprint, Globe, Ban, Play, Loader2, RefreshCw, Hash,
  Network, User, Tag, ChevronDown, ChevronRight, Wand2, Radio,
  Cpu, Database, Server, Skull, FileLock2, ListChecks, ClipboardList,
} from "lucide-react";

// ── Shared types ────────────────────────────────────────────────────────────
interface Incident {
  id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  category: string;
  source: string;
  sourceId: string | null;
  assignee: string | null;
  detectedAt: string;
  containedAt: string | null;
  eradicatedAt: string | null;
  closedAt: string | null;
  rootCause: string | null;
  lessonsLearned: string | null;
  createdAt: string;
  updatedAt: string;
  eventCount?: number;
  evidenceCount?: number;
}

// Normalized timeline entry - the backend returns entries with either
// { timestamp, type } (unified timeline) or { occurredAt, eventType } (raw
// IncidentEvent). We normalize both to this shape.
interface TimelineEntry {
  id: string;
  eventType: string;
  source: string;
  sourceId: string | null;
  title: string;
  description: string | null;
  severity: string;
  metadata: string | null;
  actor: string | null;
  occurredAt: string;
}

interface Evidence {
  id: string;
  evidenceType: string;
  filename: string;
  sha256: string;
  collectedBy: string;
  collectedAt: string;
  description: string | null;
  fileSize: number;
  chainOfCustody: Array<Record<string, unknown>>;
  isImmutable: boolean;
}

interface IOC {
  id: string;
  iocType: string;
  value: string;
  confidence: string;
  source: string;
  tags: string[] | string | null;
  firstSeen: string;
  lastSeen: string;
  hitCount: number;
  isActive: boolean;
}

// Playbook steps come in two shapes depending on origin:
// - Seed data + my create modal: { order, action, description, automated }
// - Parallel agent's create endpoint + execute response: { index, title, description, automated, status? }
interface PlaybookStep {
  order?: number;
  index?: number;
  action?: string;
  title?: string;
  description: string;
  automated: boolean;
  status?: string;
  eventId?: string;
}

interface Playbook {
  id: string;
  name: string;
  description: string | null;
  category: string;
  trigger: string;
  steps: PlaybookStep[];
  severity: string;
  isActive: boolean;
  createdAt: string;
}

// ── Style helpers ───────────────────────────────────────────────────────────
const SEVERITY_STYLE: Record<string, { text: string; bg: string; border: string; dot: string }> = {
  critical: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", dot: "bg-red-500" },
  high:     { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", dot: "bg-amber-500" },
  medium:   { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", dot: "bg-yellow-500" },
  low:      { text: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/30", dot: "bg-sky-500" },
  info:     { text: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/30", dot: "bg-zinc-500" },
  warning:  { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", dot: "bg-amber-500" },
};

const STATUS_STYLE: Record<string, { text: string; bg: string; border: string; label: string }> = {
  open:         { text: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/30",     label: "Open" },
  investigating:{ text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30",   label: "Investigating" },
  contained:    { text: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/30",    label: "Contained" },
  eradicated:   { text: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/30",  label: "Eradicated" },
  closed:       { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", label: "Closed" },
};

const EVENT_TYPE_CONFIG: Record<string, { icon: typeof Bug; color: string; label: string }> = {
  anomaly:        { icon: AlertTriangle, color: "text-amber-400", label: "Anomaly" },
  canary:         { icon: Bird,          color: "text-rose-400",  label: "Canary" },
  honeypot:       { icon: Bug,           color: "text-violet-400",label: "Honeypot" },
  finding:        { icon: Crosshair,     color: "text-red-400",   label: "Finding" },
  patch:          { icon: ShieldCheck,   color: "text-emerald-400",label: "Patch" },
  containment:    { icon: Lock,          color: "text-cyan-400",  label: "Containment" },
  note:           { icon: FileText,      color: "text-zinc-400",  label: "Note" },
  status_change:  { icon: ArrowRight,    color: "text-sky-400",   label: "Status" },
  audit:          { icon: FileText,      color: "text-zinc-400",  label: "Audit" },
  api_access:     { icon: Activity,      color: "text-amber-400", label: "API" },
};

// Map a raw timeline "type" string to one of our EVENT_TYPE_CONFIG keys.
function normalizeEventType(rawType: string): string {
  if (!rawType) return "note";
  // strip "incident." prefix if present
  const t = rawType.startsWith("incident.") ? rawType.slice("incident.".length) : rawType;
  if (t in EVENT_TYPE_CONFIG) return t;
  if (t === "audit") return "note";
  if (t === "api_access" || t === "api_log") return "anomaly";
  return "note";
}

const IOC_TYPE_ICON: Record<string, typeof Globe> = {
  ip: Network,
  hash: Fingerprint,
  domain: Globe,
  url: Globe,
  email: User,
  user_agent: Cpu,
};

const STATUS_FLOW = ["open", "investigating", "contained", "eradicated", "closed"];

function timeAgo(iso: string): string {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function truncateHash(h: string, len = 16): string {
  if (!h) return "";
  if (h.length <= len * 2) return h;
  return `${h.slice(0, len)}...${h.slice(-8)}`;
}

// Safely unwrap an API response that may be either a bare array or an
// object wrapping the array under a known key. The parallel-agent routes
// wrap responses as { iocs: [...] }, { evidence: [...] }, { playbooks: [...] },
// { timeline: [...] }, while the older list endpoints return bare arrays.
function unwrapList<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj[key])) return obj[key] as T[];
  }
  return [];
}

// Normalize a raw timeline entry (which may come from the unified timeline
// endpoint with { timestamp, type, title, description, severity, source,
// metadata } OR from a raw IncidentEvent with { occurredAt, eventType, ... })
// into our TimelineEntry shape.
function normalizeTimelineEntry(raw: Record<string, unknown>): TimelineEntry {
  const meta = raw.metadata as Record<string, unknown> | string | null;
  const metaObj = typeof meta === "string" ? (() => { try { return JSON.parse(meta); } catch { return {}; } })() : (meta || {});
  const ts = (raw.occurredAt || raw.timestamp || new Date().toISOString()) as string;
  return {
    id: (raw.id as string) || (metaObj?.eventId as string) || `${ts}-${raw.title}`,
    eventType: normalizeEventType((raw.eventType as string) || (raw.type as string) || "note"),
    source: (raw.source as string) || "system",
    sourceId: (raw.sourceId as string) || null,
    title: (raw.title as string) || "Untitled event",
    description: (raw.description as string) || null,
    severity: (raw.severity as string) || "info",
    metadata: typeof meta === "string" ? meta : (meta ? JSON.stringify(meta) : null),
    actor: (raw.actor as string) || (metaObj?.actor as string) || null,
    occurredAt: ts,
  };
}

// ── Main component ──────────────────────────────────────────────────────────
export function DfirPanel() {
  const [tab, setTab] = useState<"incidents" | "ioc" | "playbooks">("incidents");
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-red-500/60">
          <span className="size-1.5 rounded-full bg-red-500 pulse-dot" />
          dfir@guardianx:~$ incident-response --live
        </div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
          <ShieldAlert className="size-5 text-red-400" />
          DFIR Command
          <span className="font-mono text-sm text-zinc-500">{"// Digital Forensics & Incident Response"}</span>
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          Triage incidents, lock down evidence with hash chains, track IOCs, and run IR playbooks.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="holo-card-sharp hud-corners flex flex-wrap gap-1 p-1.5">
        {([
          { id: "incidents", label: "Incidents", icon: ShieldAlert, color: "red" },
          { id: "ioc", label: "IOC Tracker", icon: Fingerprint, color: "amber" },
          { id: "playbooks", label: "Playbooks", icon: ClipboardList, color: "violet" },
        ] as const).map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          const colorClasses: Record<string, string> = {
            red: "bg-red-500/15 text-red-300 border-red-500/40 neon-border-red",
            amber: "bg-amber-500/15 text-amber-300 border-amber-500/40 neon-border-amber",
            violet: "bg-violet-500/15 text-violet-300 border-violet-500/40 neon-border-violet",
          };
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-all ${
                isActive ? colorClasses[t.color] : "border-transparent text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`}
            >
              <Icon className="size-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {tab === "incidents" && (
            selectedIncidentId ? (
              <IncidentDetail
                incidentId={selectedIncidentId}
                onBack={() => setSelectedIncidentId(null)}
              />
            ) : (
              <IncidentsList onSelect={setSelectedIncidentId} />
            )
          )}
          {tab === "ioc" && <IocTracker />}
          {tab === "playbooks" && <PlaybooksTab />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// INCIDENTS LIST (Overview Tab)
// ════════════════════════════════════════════════════════════════════════════
function IncidentsList({ onSelect }: { onSelect: (id: string) => void }) {
  const { toast } = useToast();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [autoCreating, setAutoCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (severityFilter !== "all") params.set("severity", severityFilter);
      const res = await fetch(`/api/incidents?${params.toString()}`);
      const data = await res.json();
      setIncidents(unwrapList<Incident>(data, "incidents"));
    } catch {
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, severityFilter]);

  useEffect(() => {
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [load]);

  const filtered = incidents.filter((inc) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      inc.title.toLowerCase().includes(q) ||
      inc.category.toLowerCase().includes(q) ||
      inc.source.toLowerCase().includes(q) ||
      (inc.assignee?.toLowerCase().includes(q) ?? false)
    );
  });

  const stats = {
    open: incidents.filter((i) => i.status === "open" || i.status === "investigating").length,
    critical: incidents.filter((i) => i.severity === "critical").length,
    contained: incidents.filter((i) => i.status === "contained" || i.status === "eradicated").length,
    avgResponse: "-",
  };

  const handleAutoCreate = async () => {
    setAutoCreating(true);
    try {
      const res = await fetch("/api/incidents/auto-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Auto-create failed");
      const created = (data.created as number) ?? (data.createdCount as number) ?? 0;
      toast({
        title: created > 0 ? `${created} incident(s) created` : "Auto-create complete",
        description: data.message || (created > 0
          ? `${created} incident(s) created from anomalies.`
          : "No new anomalies found."),
      });
      load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Auto-create failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setAutoCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={ShieldAlert} label="Open Incidents" value={stats.open} color="text-red-400" border="border-red-500/20" />
        <StatTile icon={Skull} label="Critical" value={stats.critical} color="text-rose-400" border="border-rose-500/20" />
        <StatTile icon={Lock} label="Contained" value={stats.contained} color="text-cyan-400" border="border-cyan-500/20" />
        <StatTile icon={Clock} label="Avg Response" value={stats.avgResponse} color="text-emerald-400" border="border-emerald-500/20" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search incidents..."
              className="border-zinc-800 bg-zinc-900/60 pl-9 text-zinc-200 placeholder:text-zinc-500 focus-visible:border-red-500/50"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-red-500/50 focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="investigating">Investigating</option>
            <option value="contained">Contained</option>
            <option value="eradicated">Eradicated</option>
            <option value="closed">Closed</option>
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-red-500/50 focus:outline-none"
          >
            <option value="all">All Severity</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleAutoCreate}
            disabled={autoCreating}
            variant="outline"
            className="border-violet-500/40 bg-violet-500/5 text-violet-300 hover:bg-violet-500/15"
          >
            {autoCreating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            <span className="hidden sm:inline">Auto-Create</span>
          </Button>
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-red-600 text-white hover:bg-red-500 neon-border-red"
          >
            <Plus className="size-4" /> Create Incident
          </Button>
        </div>
      </div>

      {/* Incident list */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 bg-zinc-900/40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="holo-card-sharp hud-corners flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/30">
            <ShieldAlert className="size-7 text-red-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-200">
            {query || statusFilter !== "all" || severityFilter !== "all"
              ? "No incidents match your filters"
              : "No incidents yet"}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-400">
            Create an incident manually, or run "Auto-Create from Anomalies" to scan canaries, honeypots, and findings.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((inc, i) => {
            const sev = SEVERITY_STYLE[inc.severity] || SEVERITY_STYLE.medium;
            const stat = STATUS_STYLE[inc.status] || STATUS_STYLE.open;
            return (
              <motion.div
                key={inc.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
                onClick={() => onSelect(inc.id)}
                className="holo-card-sharp hud-corners glow-hover group cursor-pointer border border-zinc-800 p-4 hover:border-red-500/40"
              >
                {/* Header */}
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className={`flex size-8 items-center justify-center rounded-md border ${sev.border} ${sev.bg}`}>
                      <ShieldAlert className={`size-4 ${sev.text}`} />
                    </div>
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${sev.border} ${sev.bg} ${sev.text}`}>
                      {inc.severity}
                    </span>
                  </div>
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${stat.border} ${stat.bg} ${stat.text}`}>
                    {stat.label}
                  </span>
                </div>

                {/* Title */}
                <h3 className="line-clamp-2 text-sm font-bold text-zinc-100 group-hover:text-red-300">
                  {inc.title}
                </h3>

                {/* Meta row */}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Tag className="size-3" />
                    {inc.category}
                  </span>
                  <span className="text-zinc-700">|</span>
                  <span className="flex items-center gap-1">
                    <Radio className="size-3" />
                    {inc.source}
                  </span>
                  <span className="text-zinc-700">|</span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3" />
                    {timeAgo(inc.detectedAt)}
                  </span>
                </div>

                {/* Footer */}
                <div className="mt-3 flex items-center justify-between border-t border-zinc-800/60 pt-2">
                  <div className="flex items-center gap-1.5 text-[10px] text-zinc-400">
                    <User className="size-3 text-zinc-500" />
                    {inc.assignee || "unassigned"}
                  </div>
                  <div className="flex items-center gap-2 font-mono text-[10px]">
                    {typeof inc.eventCount === "number" && (
                      <span className="flex items-center gap-1 text-cyan-400">
                        <Activity className="size-3" />
                        {inc.eventCount}
                      </span>
                    )}
                    {typeof inc.evidenceCount === "number" && (
                      <span className="flex items-center gap-1 text-violet-400">
                        <FileLock2 className="size-3" />
                        {inc.evidenceCount}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create incident modal */}
      {createOpen && (
        <CreateIncidentModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            load();
          }}
        />
      )}
    </div>
  );
}

// ── Stat tile ──
function StatTile({
  icon: Icon, label, value, color, border,
}: { icon: typeof ShieldAlert; label: string; value: string | number; color: string; border: string }) {
  return (
    <div className={`holo-card-sharp hud-corners border ${border} p-4`}>
      <div className="flex items-center justify-between">
        <Icon className={`size-4 ${color}`} />
        <span className="text-[9px] uppercase tracking-widest text-zinc-600">{label}</span>
      </div>
      <div className={`mt-1 font-mono text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

// ── Create Incident Modal ──
function CreateIncidentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    severity: "medium",
    category: "other",
  });

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create incident");
      toast({ title: "Incident created", description: form.title });
      onCreated();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to create incident",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="holo-card-sharp hud-corners w-full max-w-lg rounded-lg p-6"
      >
        <div className="mb-4 flex items-center gap-2">
          <ShieldAlert className="size-5 text-red-400" />
          <h2 className="text-lg font-bold text-zinc-50">Create Incident Case</h2>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-zinc-400">Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Suspicious data exfiltration from web-app-01"
              className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-red-500/50"
            />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Description</Label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What happened, when, and what is the suspected impact..."
              rows={3}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-red-500/50 focus:outline-none"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-zinc-400">Severity</Label>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-red-500/50 focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Category</Label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-red-500/50 focus:outline-none"
              >
                <option value="other">Other</option>
                <option value="data_exfiltration">Data Exfiltration</option>
                <option value="intrusion">Intrusion</option>
                <option value="malware">Malware</option>
                <option value="phishing">Phishing</option>
                <option value="vulnerability">Vulnerability</option>
                <option value="misconfiguration">Misconfiguration</option>
                <option value="insider_threat">Insider Threat</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !form.title.trim()} className="bg-red-600 text-white hover:bg-red-500">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create Case
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// INCIDENT DETAIL (Command Center)
// ════════════════════════════════════════════════════════════════════════════
function IncidentDetail({ incidentId, onBack }: { incidentId: string; onBack: () => void }) {
  const { toast } = useToast();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [containOpen, setContainOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [selectedPlaybook, setSelectedPlaybook] = useState<string>("");
  const [executingPb, setExecutingPb] = useState(false);
  const [executedSteps, setExecutedSteps] = useState<PlaybookStep[] | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [rootCause, setRootCause] = useState("");
  const [lessons, setLessons] = useState("");
  const [savingField, setSavingField] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const loadAll = useCallback(async () => {
    try {
      const [incRes, tlRes, evRes, pbRes] = await Promise.all([
        fetch(`/api/incidents/${incidentId}`),
        fetch(`/api/incidents/${incidentId}/timeline`),
        fetch(`/api/incidents/${incidentId}/evidence`),
        fetch(`/api/playbooks?includeInactive=true`),
      ]);
      const [inc, tl, ev, pb] = await Promise.all([
        incRes.json(), tlRes.json(), evRes.json(), pbRes.json(),
      ]);
      if (!incRes.ok) throw new Error(inc.error || "Failed to load incident");
      setIncident(inc);
      // Timeline endpoint returns either a bare array OR { timeline: [...] }
      const tlList = unwrapList<Record<string, unknown>>(tl, "timeline");
      setTimeline(tlList.map(normalizeTimelineEntry));
      // Evidence endpoint returns either a bare array OR { evidence: [...] }
      const evList = unwrapList<Evidence>(ev, "evidence");
      setEvidence(evList);
      const pbList = unwrapList<Playbook>(pb, "playbooks");
      setPlaybooks(pbList);
      setRootCause(inc.rootCause || "");
      setLessons(inc.lessonsLearned || "");
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load incident",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, [incidentId, toast]);

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 15_000);
    return () => clearInterval(id);
  }, [loadAll]);

  // auto-scroll timeline to bottom when new events arrive
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [timeline]);

  const transitionStatus = async (newStatus: string) => {
    if (!incident) return;
    try {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      toast({ title: `Status changed to ${newStatus}`, description: incident.title });
      loadAll();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Status update failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    }
  };

  const handleContain = async () => {
    setContainOpen(false);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/contain`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "isolate" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Containment failed");
      toast({
        title: "Incident contained",
        description: data.message || "Asset isolated, source IP blocked, sessions revoked.",
      });
      loadAll();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Containment failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    }
  };

  const saveField = async (field: "rootCause" | "lessonsLearned" | "title", value: string) => {
    setSavingField(field);
    try {
      const res = await fetch(`/api/incidents/${incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast({ title: "Saved", description: field === "title" ? "Incident title updated" : field === "rootCause" ? "Root cause saved" : "Lessons learned saved" });
      loadAll();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setSavingField(null);
      if (field === "title") setTitleEditing(false);
    }
  };

  const executePlaybook = async () => {
    if (!selectedPlaybook) return;
    setExecutingPb(true);
    try {
      const res = await fetch(`/api/playbooks/${selectedPlaybook}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incidentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Execution failed");
      toast({
        title: "Playbook executed",
        description: data.message || `${data.steps?.length || 0} steps added to timeline.`,
      });
      // steps may be { index, title, description, automated, status } OR { order, action, description, automated }
      const steps = (data.steps || []) as PlaybookStep[];
      setExecutedSteps(steps);
      setCheckedSteps(new Set(steps.filter((s) => s.status === "executed").map((s) => s.order ?? s.index ?? 0)));
      loadAll();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Execution failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setExecutingPb(false);
    }
  };

  if (loading || !incident) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 bg-zinc-900/40" />
        <Skeleton className="h-64 bg-zinc-900/40" />
        <Skeleton className="h-64 bg-zinc-900/40" />
      </div>
    );
  }

  const sev = SEVERITY_STYLE[incident.severity] || SEVERITY_STYLE.medium;
  const stat = STATUS_STYLE[incident.status] || STATUS_STYLE.open;
  const currentStatusIdx = STATUS_FLOW.indexOf(incident.status);

  return (
    <div className="space-y-4">
      {/* Back button + header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex-1">
          <button
            onClick={onBack}
            className="mb-2 flex items-center gap-1 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
          >
            <ChevronLeft className="size-3.5" />
            Back to incidents
          </button>
          {titleEditing ? (
            <div className="flex items-center gap-2">
              <Input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                className="max-w-2xl border-zinc-700 bg-zinc-900/60 text-lg font-bold text-zinc-100 focus-visible:border-red-500/50"
                autoFocus
              />
              <Button size="sm" onClick={() => saveField("title", titleDraft)} disabled={savingField === "title"}>
                {savingField === "title" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setTitleEditing(false)} className="border-zinc-700 bg-zinc-900 text-zinc-300">
                Cancel
              </Button>
            </div>
          ) : (
            <h2
              className="cursor-text text-xl font-bold text-zinc-50 hover:text-red-300"
              onClick={() => { setTitleDraft(incident.title); setTitleEditing(true); }}
              title="Click to edit title"
            >
              {incident.title}
            </h2>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${sev.border} ${sev.bg} ${sev.text}`}>
              {incident.severity}
            </span>
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${stat.border} ${stat.bg} ${stat.text}`}>
              {stat.label}
            </span>
            <Badge variant="outline" className="border-zinc-700 text-[10px] text-zinc-400">
              <Tag className="mr-1 size-3" />{incident.category}
            </Badge>
            <Badge variant="outline" className="border-zinc-700 text-[10px] text-zinc-400">
              <Radio className="mr-1 size-3" />{incident.source}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <User className="size-3.5 text-zinc-500" />
          <span className="font-mono">{incident.assignee || "unassigned"}</span>
        </div>
      </div>

      {/* Workflow status bar */}
      <div className="holo-card-sharp hud-corners p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">Status Workflow</span>
          <Button
            onClick={() => setContainOpen(true)}
            disabled={incident.status === "closed" || incident.status === "contained" || incident.status === "eradicated"}
            size="sm"
            className="bg-cyan-600 text-white hover:bg-cyan-500 neon-border-cyan"
          >
            <Lock className="size-3.5" /> Contain Now
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FLOW.map((s, idx) => {
            const cfg = STATUS_STYLE[s];
            const isCurrent = idx === currentStatusIdx;
            const isDone = idx < currentStatusIdx;
            const isNext = idx === currentStatusIdx + 1;
            const isClickable = idx <= currentStatusIdx + 1 && !isCurrent && !isDone;
            return (
              <div key={s} className="flex items-center gap-1.5">
                <button
                  onClick={() => isClickable && transitionStatus(s)}
                  disabled={!isClickable}
                  className={`rounded-md border px-3 py-1.5 text-[11px] font-semibold transition-all ${
                    isCurrent
                      ? `${cfg.border} ${cfg.bg} ${cfg.text} neon-border-cyan`
                      : isDone
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : isNext
                      ? `${cfg.border} ${cfg.bg} ${cfg.text} hover:opacity-80`
                      : "border-zinc-800 bg-zinc-900/40 text-zinc-600"
                  } ${isClickable ? "cursor-pointer" : "cursor-default"}`}
                  title={isCurrent ? "Current status" : isDone ? "Completed" : isNext ? `Transition to ${s}` : "Locked"}
                >
                  {isDone && <CheckCircle2 className="mr-1 inline size-3" />}
                  {cfg.label}
                </button>
                {idx < STATUS_FLOW.length - 1 && (
                  <ArrowRight className="size-3 text-zinc-700" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Two-column layout: timeline + evidence */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Timeline (60%) */}
        <div className="lg:col-span-3">
          <div className="holo-card-sharp hud-corners h-full p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="size-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-zinc-100">Forensic Timeline</h3>
                <span className="font-mono text-[10px] text-zinc-500">({timeline.length} events)</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setNoteOpen(true)}
                className="border-cyan-500/30 bg-cyan-500/5 text-cyan-300 hover:bg-cyan-500/15"
              >
                <Plus className="size-3.5" /> Add Note
              </Button>
            </div>

            <div
              ref={timelineRef}
              className="custom-scrollbar max-h-96 space-y-2 overflow-y-auto pr-1"
            >
              {timeline.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-xs text-zinc-600">
                  No events yet. Add a note or execute a playbook.
                </div>
              ) : (
                timeline.map((ev, i) => {
                  const cfg = EVENT_TYPE_CONFIG[ev.eventType] || EVENT_TYPE_CONFIG.note;
                  const evSev = SEVERITY_STYLE[ev.severity] || SEVERITY_STYLE.info;
                  const Icon = cfg.icon;
                  return (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.3) }}
                      className="flex gap-3 rounded-md border border-zinc-800/60 bg-zinc-900/40 p-2.5 hover:border-zinc-700"
                    >
                      <div className={`flex size-7 shrink-0 items-center justify-center rounded-md border ${evSev.border} ${evSev.bg}`}>
                        <Icon className={`size-3.5 ${cfg.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-xs font-semibold text-zinc-100">{ev.title}</h4>
                          <span className="shrink-0 font-mono text-[9px] text-zinc-600">
                            {new Date(ev.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                        </div>
                        {ev.description && (
                          <p className="mt-0.5 whitespace-pre-line text-[11px] leading-relaxed text-zinc-400">{ev.description}</p>
                        )}
                        <div className="mt-1 flex items-center gap-2 text-[9px] text-zinc-600">
                          <span className={`rounded border px-1 py-0.5 ${evSev.border} ${evSev.bg} ${evSev.text}`}>{ev.eventType}</span>
                          <span>by {ev.actor || ev.source}</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Evidence locker (40%) */}
        <div className="lg:col-span-2">
          <div className="holo-card-sharp hud-corners h-full p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileLock2 className="size-4 text-violet-400" />
                <h3 className="text-sm font-bold text-zinc-100">Evidence Locker</h3>
                <span className="font-mono text-[10px] text-zinc-500">({evidence.length})</span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEvidenceOpen(true)}
                className="border-violet-500/30 bg-violet-500/5 text-violet-300 hover:bg-violet-500/15"
              >
                <Plus className="size-3.5" /> Add
              </Button>
            </div>

            <div className="custom-scrollbar max-h-96 space-y-2 overflow-y-auto pr-1">
              {evidence.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-xs text-zinc-600">
                  No evidence collected. Hash-locked artifacts appear here.
                </div>
              ) : (
                evidence.map((ev) => {
                  const chainLen = Array.isArray(ev.chainOfCustody) ? ev.chainOfCustody.length : 0;
                  return (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-md border border-zinc-800/60 bg-zinc-900/40 p-2.5 hover:border-violet-500/30"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span title={ev.isImmutable ? "Immutable (hash-locked)" : "Mutable"}>
                            {ev.isImmutable ? (
                              <Lock className="size-3 shrink-0 text-emerald-400" />
                            ) : (
                              <FileText className="size-3 shrink-0 text-zinc-500" />
                            )}
                          </span>
                          <FileText className="size-3 shrink-0 text-zinc-500" />
                          <span className="truncate text-xs font-medium text-zinc-200">{ev.filename}</span>
                        </div>
                        <Badge variant="outline" className="shrink-0 border-zinc-700 text-[9px] text-zinc-400">
                          {ev.evidenceType}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[9px] text-zinc-500">
                        <Hash className="size-2.5" />
                        <span className="truncate" title={ev.sha256}>{truncateHash(ev.sha256)}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[9px] text-zinc-600">
                        <span>by {ev.collectedBy}</span>
                        <span>{timeAgo(ev.collectedAt)}</span>
                      </div>
                      {chainLen > 0 && (
                        <div className="mt-1.5 flex items-center gap-1 border-t border-zinc-800/60 pt-1 text-[9px] text-zinc-600">
                          <Eye className="size-2.5" />
                          {chainLen} custody entr{chainLen === 1 ? "y" : "ies"}
                          <span className="text-zinc-700">|</span>
                          {ev.fileSize > 0 && <span>{ev.fileSize} B</span>}
                        </div>
                      )}
                    </motion.div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Root cause + lessons learned */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="holo-card-sharp hud-corners p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Crosshair className="size-4 text-amber-400" />
              <h3 className="text-sm font-bold text-zinc-100">Root Cause Analysis</h3>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => saveField("rootCause", rootCause)}
              disabled={savingField === "rootCause"}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              {savingField === "rootCause" ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
              Save
            </Button>
          </div>
          <textarea
            value={rootCause}
            onChange={(e) => setRootCause(e.target.value)}
            placeholder="What was the underlying cause of this incident? (e.g. misconfigured S3 bucket, leaked credentials, unpatched CVE-2024-XXXX)..."
            rows={4}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-amber-500/50 focus:outline-none"
          />
        </div>
        <div className="holo-card-sharp hud-corners p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-zinc-100">Lessons Learned</h3>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => saveField("lessonsLearned", lessons)}
              disabled={savingField === "lessonsLearned"}
              className="text-xs text-zinc-400 hover:text-zinc-200"
            >
              {savingField === "lessonsLearned" ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3" />}
              Save
            </Button>
          </div>
          <textarea
            value={lessons}
            onChange={(e) => setLessons(e.target.value)}
            placeholder="What did we learn? What controls failed? What will we change to prevent recurrence?..."
            rows={4}
            className="w-full rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Playbook execution */}
      <div className="holo-card-sharp hud-corners p-4">
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList className="size-4 text-violet-400" />
          <h3 className="text-sm font-bold text-zinc-100">Playbook Execution</h3>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label className="text-xs text-zinc-400">Select Playbook</Label>
            <select
              value={selectedPlaybook}
              onChange={(e) => setSelectedPlaybook(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500/50 focus:outline-none"
            >
              <option value="">Choose a playbook...</option>
              {playbooks.filter((p) => p.isActive).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.steps.length} steps, {p.severity})
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={executePlaybook}
            disabled={!selectedPlaybook || executingPb}
            className="bg-violet-600 text-white hover:bg-violet-500 neon-border-violet"
          >
            {executingPb ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Execute
          </Button>
        </div>

        {/* Step checklist after execution */}
        {executedSteps && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Execution Checklist ({checkedSteps.size}/{executedSteps.length} done)
              </span>
              <span className="font-mono text-[10px] text-zinc-600">
                {executedSteps.length > 0 ? Math.round((checkedSteps.size / executedSteps.length) * 100) : 0}% complete
              </span>
            </div>
            <div className="space-y-1.5">
              {executedSteps.map((step, i) => {
                const stepNum = step.order ?? step.index ?? i + 1;
                const stepTitle = step.action ?? step.title ?? `Step ${i + 1}`;
                const checked = checkedSteps.has(stepNum);
                return (
                  <button
                    key={stepNum}
                    onClick={() => {
                      setCheckedSteps((prev) => {
                        const next = new Set(prev);
                        if (next.has(stepNum)) next.delete(stepNum);
                        else next.add(stepNum);
                        return next;
                      });
                    }}
                    className={`flex w-full items-start gap-2.5 rounded-md border p-2.5 text-left transition-all ${
                      checked
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700"
                    }`}
                  >
                    <div className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded ${
                      checked ? "bg-emerald-500 text-zinc-950" : "border border-zinc-700 bg-zinc-900"
                    }`}>
                      {checked && <CheckCircle2 className="size-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-zinc-500">#{stepNum}</span>
                        <span className={`text-xs font-semibold ${checked ? "text-emerald-300 line-through" : "text-zinc-100"}`}>
                          {stepTitle}
                        </span>
                        {step.automated ? (
                          <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/5 text-[9px] text-cyan-300">
                            <Zap className="mr-0.5 size-2.5" /> AUTO
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/5 text-[9px] text-amber-300">
                            <User className="mr-0.5 size-2.5" /> MANUAL
                          </Badge>
                        )}
                        {step.status === "executed" && (
                          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/5 text-[9px] text-emerald-300">
                            EXECUTED
                          </Badge>
                        )}
                      </div>
                      {step.description && (
                        <p className="mt-0.5 text-[11px] text-zinc-500">{step.description}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Containment confirmation dialog */}
      {containOpen && (
        <ConfirmDialog
          title="Confirm Containment Action"
          description="This will isolate the affected asset, block the source IP via virtual WAF, and revoke all active sessions. The incident will be marked as contained. This action is logged to the forensic timeline."
          confirmLabel="Contain & Isolate"
          onConfirm={handleContain}
          onCancel={() => setContainOpen(false)}
          color="cyan"
        />
      )}

      {/* Add note modal */}
      {noteOpen && (
        <AddNoteModal
          onClose={() => setNoteOpen(false)}
          onAdded={() => { setNoteOpen(false); loadAll(); }}
          incidentId={incidentId}
        />
      )}

      {/* Add evidence modal */}
      {evidenceOpen && (
        <AddEvidenceModal
          onClose={() => setEvidenceOpen(false)}
          onAdded={() => { setEvidenceOpen(false); loadAll(); }}
          incidentId={incidentId}
        />
      )}
    </div>
  );
}

// ── Confirm dialog ──
function ConfirmDialog({
  title, description, confirmLabel, onConfirm, onCancel, color = "red",
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  color?: "red" | "cyan" | "violet";
}) {
  const colorMap = {
    red: "bg-red-600 hover:bg-red-500 neon-border-red",
    cyan: "bg-cyan-600 hover:bg-cyan-500 neon-border-cyan",
    violet: "bg-violet-600 hover:bg-violet-500 neon-border-violet",
  };
  const iconMap = { red: AlertTriangle, cyan: Lock, violet: ShieldCheck };
  const Icon = iconMap[color];
  const iconColor = { red: "text-red-400", cyan: "text-cyan-400", violet: "text-violet-400" };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="holo-card-sharp hud-corners w-full max-w-md rounded-lg p-6"
      >
        <div className="mb-3 flex items-center gap-2">
          <Icon className={`size-5 ${iconColor[color]}`} />
          <h2 className="text-lg font-bold text-zinc-50">{title}</h2>
        </div>
        <p className="text-sm text-zinc-400">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            Cancel
          </Button>
          <Button onClick={onConfirm} className={colorMap[color]}>
            {confirmLabel}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Add Note Modal ──
function AddNoteModal({
  onClose, onAdded, incidentId,
}: { onClose: () => void; onAdded: () => void; incidentId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", severity: "info" });

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, eventType: "note" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add note");
      toast({ title: "Note added to timeline" });
      onAdded();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to add note",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="holo-card-sharp hud-corners w-full max-w-md rounded-lg p-6"
      >
        <div className="mb-4 flex items-center gap-2">
          <FileText className="size-5 text-cyan-400" />
          <h2 className="text-lg font-bold text-zinc-50">Add Timeline Note</h2>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-zinc-400">Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="e.g. Contacted SOC escalation team"
              className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-cyan-500/50"
              autoFocus
            />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Description</Label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Add details, observations, or context..."
              rows={3}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-cyan-500/50 focus:outline-none"
            />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Severity</Label>
            <select
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value })}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-cyan-500/50 focus:outline-none"
            >
              <option value="info">Info</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !form.title.trim()} className="bg-cyan-600 text-white hover:bg-cyan-500">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add Note
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Add Evidence Modal ──
function AddEvidenceModal({
  onClose, onAdded, incidentId,
}: { onClose: () => void; onAdded: () => void; incidentId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    evidenceType: "log",
    filename: "",
    content: "",
    description: "",
  });

  const handleSubmit = async () => {
    if (!form.filename.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to collect evidence");
      toast({
        title: "Evidence collected",
        description: data.sha256 ? `SHA-256: ${truncateHash(data.sha256, 12)}... locked.` : data.message || "Hash-locked and sealed.",
      });
      onAdded();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to collect evidence",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="holo-card-sharp hud-corners max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg p-6"
      >
        <div className="mb-4 flex items-center gap-2">
          <FileLock2 className="size-5 text-violet-400" />
          <h2 className="text-lg font-bold text-zinc-50">Collect Evidence</h2>
        </div>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-zinc-400">Evidence Type</Label>
              <select
                value={form.evidenceType}
                onChange={(e) => setForm({ ...form, evidenceType: e.target.value })}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500/50 focus:outline-none"
              >
                <option value="log">Log</option>
                <option value="pcap">PCAP</option>
                <option value="memory_dump">Memory Dump</option>
                <option value="disk_image">Disk Image</option>
                <option value="screenshot">Screenshot</option>
                <option value="config">Configuration</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Filename *</Label>
              <Input
                value={form.filename}
                onChange={(e) => setForm({ ...form, filename: e.target.value })}
                placeholder="auth-logs-2024.txt"
                className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-violet-500/50"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Content (will be SHA-256 hashed)</Label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              placeholder="Paste log lines, JSON payload, config snippet, or any text artifact..."
              rows={6}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-violet-500/50 focus:outline-none"
            />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Where was this collected from?"
              className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-violet-500/50"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !form.filename.trim()} className="bg-violet-600 text-white hover:bg-violet-500">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
            Hash-Lock & Collect
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// IOC TRACKER TAB
// ════════════════════════════════════════════════════════════════════════════
function IocTracker() {
  const { toast } = useToast();
  const [iocs, setIocs] = useState<IOC[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (activeFilter !== "all") params.set("active", activeFilter);
      if (query) params.set("q", query);
      const res = await fetch(`/api/iocs?${params.toString()}`);
      const data = await res.json();
      setIocs(unwrapList<IOC>(data, "iocs"));
    } catch {
      setIocs([]);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, activeFilter, query]);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const toggleActive = async (ioc: IOC) => {
    try {
      const res = await fetch(`/api/iocs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ioc.id, isActive: !ioc.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      toast({ title: `IOC ${!ioc.isActive ? "activated" : "deactivated"}`, description: ioc.value });
      load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    }
  };

  const checkIoc = async (ioc: IOC) => {
    setCheckingId(ioc.id);
    try {
      const res = await fetch(`/api/iocs/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: ioc.value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Check failed");
      if (data.found) {
        toast({
          title: "IOC re-confirmed",
          description: `${ioc.value} matched. Hit count now ${data.ioc?.hitCount || ioc.hitCount + 1}.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "No match found",
          description: data.message || `${ioc.value} not seen in threat intel.`,
        });
      }
      load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "IOC check failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setCheckingId(null);
    }
  };

  const stats = {
    total: iocs.length,
    active: iocs.filter((i) => i.isActive).length,
    ip: iocs.filter((i) => i.iocType === "ip").length,
    hash: iocs.filter((i) => i.iocType === "hash").length,
    domain: iocs.filter((i) => i.iocType === "domain" || i.iocType === "url").length,
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Fingerprint} label="Total IOCs" value={stats.total} color="text-amber-400" border="border-amber-500/20" />
        <StatTile icon={Activity} label="Active" value={stats.active} color="text-red-400" border="border-red-500/20" />
        <StatTile icon={Network} label="IP Addresses" value={stats.ip} color="text-cyan-400" border="border-cyan-500/20" />
        <StatTile icon={Hash} label="Hashes + Domains" value={stats.hash + stats.domain} color="text-violet-400" border="border-violet-500/20" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search IOC value..."
              className="border-zinc-800 bg-zinc-900/60 pl-9 font-mono text-zinc-200 placeholder:text-zinc-500 focus-visible:border-amber-500/50"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500/50 focus:outline-none"
          >
            <option value="all">All Types</option>
            <option value="ip">IP</option>
            <option value="hash">Hash</option>
            <option value="domain">Domain</option>
            <option value="url">URL</option>
            <option value="email">Email</option>
            <option value="user_agent">User Agent</option>
          </select>
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500/50 focus:outline-none"
          >
            <option value="all">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
        <Button onClick={() => setAddOpen(true)} className="bg-amber-600 text-white hover:bg-amber-500 neon-border-amber">
          <Plus className="size-4" /> Add IOC
        </Button>
      </div>

      {/* IOC table */}
      {loading ? (
        <Skeleton className="h-64 bg-zinc-900/40" />
      ) : iocs.length === 0 ? (
        <div className="holo-card-sharp hud-corners flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-amber-500/10 ring-1 ring-amber-500/30">
            <Fingerprint className="size-7 text-amber-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-200">No IOCs tracked</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-400">
            Add an IP, hash, domain, or other indicator to start tracking adversary infrastructure.
          </p>
        </div>
      ) : (
        <div className="holo-card-sharp hud-corners overflow-hidden">
          <div className="custom-scrollbar max-h-[28rem] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur">
                <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-500">
                  <th className="px-3 py-2.5 font-medium">Value</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Conf.</th>
                  <th className="px-3 py-2.5 font-medium">Source</th>
                  <th className="px-3 py-2.5 font-medium">First / Last Seen</th>
                  <th className="px-3 py-2.5 text-center font-medium">Hits</th>
                  <th className="px-3 py-2.5 text-center font-medium">Active</th>
                  <th className="px-3 py-2.5 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {iocs.map((ioc, i) => {
                  const Icon = IOC_TYPE_ICON[ioc.iocType] || Globe;
                  const conf = SEVERITY_STYLE[ioc.confidence] || SEVERITY_STYLE.info;
                  return (
                    <motion.tr
                      key={ioc.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(i * 0.02, 0.2) }}
                      className="hover:bg-zinc-900/40"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <Icon className="size-3 shrink-0 text-zinc-500" />
                          <span className="truncate font-mono text-[11px] text-zinc-200" title={ioc.value}>
                            {ioc.value.length > 36 ? `${ioc.value.slice(0, 36)}...` : ioc.value}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant="outline" className="border-zinc-700 text-[9px] text-zinc-400">
                          {ioc.iocType}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${conf.border} ${conf.bg} ${conf.text}`}>
                          {ioc.confidence}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-zinc-500">{ioc.source}</td>
                      <td className="px-3 py-2.5 text-zinc-500">
                        <div className="text-[10px]">First: {timeAgo(ioc.firstSeen)}</div>
                        <div className="text-[10px]">Last: {timeAgo(ioc.lastSeen)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-zinc-300">{ioc.hitCount}</td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => toggleActive(ioc)}
                          className={`inline-flex size-6 items-center justify-center rounded ${
                            ioc.isActive
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-zinc-800 text-zinc-600"
                          }`}
                          title={ioc.isActive ? "Active (click to disable)" : "Inactive (click to enable)"}
                        >
                          {ioc.isActive ? <CheckCircle2 className="size-3.5" /> : <Ban className="size-3.5" />}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => checkIoc(ioc)}
                          disabled={checkingId === ioc.id}
                          className="h-7 px-2 text-[10px] text-cyan-300 hover:bg-cyan-500/10 hover:text-cyan-200"
                        >
                          {checkingId === ioc.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Eye className="size-3" />
                          )}
                          Check
                        </Button>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {addOpen && (
        <AddIocModal
          onClose={() => setAddOpen(false)}
          onAdded={() => { setAddOpen(false); load(); }}
        />
      )}
    </div>
  );
}

// ── Add IOC Modal ──
function AddIocModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    iocType: "ip",
    value: "",
    confidence: "medium",
    source: "manual",
    tags: "",
  });

  const handleSubmit = async () => {
    if (!form.value.trim()) return;
    setLoading(true);
    try {
      const tags = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await fetch(`/api/iocs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, tags }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add IOC");
      toast({ title: data.created ? "IOC added" : "IOC re-confirmed", description: form.value });
      onAdded();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to add IOC",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="holo-card-sharp hud-corners w-full max-w-md rounded-lg p-6"
      >
        <div className="mb-4 flex items-center gap-2">
          <Fingerprint className="size-5 text-amber-400" />
          <h2 className="text-lg font-bold text-zinc-50">Add IOC</h2>
        </div>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-zinc-400">Type</Label>
              <select
                value={form.iocType}
                onChange={(e) => setForm({ ...form, iocType: e.target.value })}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500/50 focus:outline-none"
              >
                <option value="ip">IP Address</option>
                <option value="hash">File Hash</option>
                <option value="domain">Domain</option>
                <option value="url">URL</option>
                <option value="email">Email</option>
                <option value="user_agent">User Agent</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Confidence</Label>
              <select
                value={form.confidence}
                onChange={(e) => setForm({ ...form, confidence: e.target.value })}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500/50 focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Value *</Label>
            <Input
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              placeholder={form.iocType === "ip" ? "203.0.113.42" : form.iocType === "hash" ? "d41d8cd98f00b204e9800998ecf8427e" : "evil.example.com"}
              className="mt-1 border-zinc-700 bg-zinc-900/60 font-mono text-zinc-200 focus-visible:border-amber-500/50"
              autoFocus
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-zinc-400">Source</Label>
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-amber-500/50 focus:outline-none"
              >
                <option value="manual">Manual</option>
                <option value="honeypot">Honeypot</option>
                <option value="canary">Canary</option>
                <option value="api_log">API Log</option>
                <option value="threat_intel">Threat Intel</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Tags (comma-separated)</Label>
              <Input
                value={form.tags}
                onChange={(e) => setForm({ ...form, tags: e.target.value })}
                placeholder="ransomware, c2"
                className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-amber-500/50"
              />
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !form.value.trim()} className="bg-amber-600 text-white hover:bg-amber-500">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add IOC
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PLAYBOOKS TAB
// ════════════════════════════════════════════════════════════════════════════
function PlaybooksTab() {
  const { toast } = useToast();
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/playbooks?includeInactive=true`);
      const data = await res.json();
      setPlaybooks(unwrapList<Playbook>(data, "playbooks"));
    } catch {
      setPlaybooks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-100">
            <ClipboardList className="size-4 text-violet-400" />
            IR Playbooks
            <span className="font-mono text-[10px] text-zinc-500">({playbooks.length})</span>
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Pre-defined response procedures. Expand to view steps, execute from an incident case.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="bg-violet-600 text-white hover:bg-violet-500 neon-border-violet">
          <Plus className="size-4" /> Create Playbook
        </Button>
      </div>

      {/* Playbook list */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 bg-zinc-900/40" />
          ))}
        </div>
      ) : playbooks.length === 0 ? (
        <div className="holo-card-sharp hud-corners flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-violet-500/10 ring-1 ring-violet-500/30">
            <ClipboardList className="size-7 text-violet-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-200">No playbooks yet</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-400">
            Create your first IR playbook to standardize incident response procedures.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {playbooks.map((pb, i) => {
            const sev = SEVERITY_STYLE[pb.severity] || SEVERITY_STYLE.high;
            const isExpanded = expanded.has(pb.id);
            const steps = Array.isArray(pb.steps) ? pb.steps : [];
            return (
              <motion.div
                key={pb.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.3) }}
                className="holo-card-sharp hud-corners border border-zinc-800 p-4 hover:border-violet-500/30"
              >
                {/* Header */}
                <button
                  onClick={() => toggle(pb.id)}
                  className="flex w-full items-start justify-between gap-2 text-left"
                >
                  <div className="flex items-start gap-2">
                    {isExpanded ? (
                      <ChevronDown className="mt-0.5 size-4 text-zinc-500" />
                    ) : (
                      <ChevronRight className="mt-0.5 size-4 text-zinc-500" />
                    )}
                    <div>
                      <h4 className="text-sm font-bold text-zinc-100">{pb.name}</h4>
                      {pb.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{pb.description}</p>
                      )}
                    </div>
                  </div>
                </button>

                {/* Meta badges */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${sev.border} ${sev.bg} ${sev.text}`}>
                    {pb.severity}
                  </span>
                  <Badge variant="outline" className="border-zinc-700 text-[9px] text-zinc-400">
                    <Zap className="mr-0.5 size-2.5" />{pb.trigger}
                  </Badge>
                  <Badge variant="outline" className="border-zinc-700 text-[9px] text-zinc-400">
                    <Tag className="mr-0.5 size-2.5" />{pb.category}
                  </Badge>
                  <Badge variant="outline" className="border-zinc-700 text-[9px] text-zinc-400">
                    <ListChecks className="mr-0.5 size-2.5" />{steps.length} steps
                  </Badge>
                  {!pb.isActive && (
                    <Badge variant="outline" className="border-zinc-700 text-[9px] text-zinc-500">
                      Inactive
                    </Badge>
                  )}
                </div>

                {/* Expanded steps */}
                <AnimatePresence>
                  {isExpanded && steps.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-3 overflow-hidden pl-6"
                    >
                      <div className="space-y-1.5 border-l border-zinc-800 pl-3">
                        {steps.map((step, idx) => {
                          const stepNum = step.order ?? step.index ?? idx + 1;
                          const stepTitle = step.action ?? step.title ?? `Step ${idx + 1}`;
                          return (
                            <div key={idx} className="flex items-start gap-2 text-xs">
                              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border border-zinc-700 bg-zinc-900 font-mono text-[10px] text-zinc-400">
                                {stepNum}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-medium text-zinc-200">{stepTitle}</span>
                                  {step.automated ? (
                                    <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/5 text-[9px] text-cyan-300">
                                      <Zap className="mr-0.5 size-2.5" />AUTO
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/5 text-[9px] text-amber-300">
                                      <User className="mr-0.5 size-2.5" />MANUAL
                                    </Badge>
                                  )}
                                </div>
                                {step.description && (
                                  <p className="mt-0.5 text-[11px] text-zinc-500">{step.description}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {createOpen && (
        <CreatePlaybookModal
          onClose={() => setCreateOpen(false)}
          onCreated={() => { setCreateOpen(false); load(); toast({ title: "Playbook created" }); }}
        />
      )}
    </div>
  );
}

// ── Create Playbook Modal ──
function CreatePlaybookModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    trigger: "manual",
    severity: "high",
    category: "incident_response",
  });
  const [steps, setSteps] = useState<PlaybookStep[]>([
    { title: "", description: "", automated: false },
  ]);

  const addStep = () => {
    setSteps([...steps, { title: "", description: "", automated: false }]);
  };
  const removeStep = (idx: number) => {
    const next = steps.filter((_, i) => i !== idx);
    setSteps(next);
  };
  const updateStep = (idx: number, field: keyof PlaybookStep, value: string | boolean) => {
    setSteps(steps.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    const cleanSteps = steps
      .filter((s) => (s.title?.trim() || s.action?.trim()))
      .map((s, i) => ({
        index: i + 1,
        title: (s.title || s.action || `Step ${i + 1}`).trim(),
        description: (s.description || "").trim(),
        automated: s.automated,
      }));
    if (cleanSteps.length === 0) {
      toast({ variant: "destructive", title: "Add at least one step with a title" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/playbooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, steps: cleanSteps }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create playbook");
      onCreated();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to create playbook",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="holo-card-sharp hud-corners max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg p-6"
      >
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList className="size-5 text-violet-400" />
          <h2 className="text-lg font-bold text-zinc-50">Create IR Playbook</h2>
        </div>
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-zinc-400">Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Ransomware Containment"
              className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-violet-500/50"
              autoFocus
            />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="When should this playbook be triggered?"
              className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-violet-500/50"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs text-zinc-400">Trigger</Label>
              <select
                value={form.trigger}
                onChange={(e) => setForm({ ...form, trigger: e.target.value })}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500/50 focus:outline-none"
              >
                <option value="manual">Manual</option>
                <option value="automatic">Automatic</option>
                <option value="scheduled">Scheduled</option>
                <option value="anomaly">Anomaly</option>
                <option value="canary">Canary</option>
                <option value="honeypot">Honeypot</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Severity</Label>
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500/50 focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Category</Label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-violet-500/50 focus:outline-none"
              >
                <option value="incident_response">Incident Response</option>
                <option value="containment">Containment</option>
                <option value="eradication">Eradication</option>
                <option value="recovery">Recovery</option>
                <option value="post_incident">Post-Incident</option>
              </select>
            </div>
          </div>

          {/* Steps */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs text-zinc-400">Steps ({steps.length})</Label>
              <Button size="sm" variant="outline" onClick={addStep} className="h-7 border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
                <Plus className="size-3" /> Add Step
              </Button>
            </div>
            <div className="space-y-2">
              {steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-2 rounded-md border border-zinc-800 bg-zinc-900/40 p-2">
                  <span className="mt-1.5 flex size-6 shrink-0 items-center justify-center rounded border border-zinc-700 bg-zinc-900 font-mono text-[10px] text-zinc-400">
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Input
                      value={step.title || ""}
                      onChange={(e) => updateStep(idx, "title", e.target.value)}
                      placeholder="Step title (e.g. Isolate Asset)"
                      className="h-8 border-zinc-700 bg-zinc-900/60 text-xs text-zinc-200 focus-visible:border-violet-500/50"
                    />
                    <Input
                      value={step.description}
                      onChange={(e) => updateStep(idx, "description", e.target.value)}
                      placeholder="What does this step do?"
                      className="h-8 border-zinc-700 bg-zinc-900/60 text-xs text-zinc-200 focus-visible:border-violet-500/50"
                    />
                    <button
                      type="button"
                      onClick={() => updateStep(idx, "automated", !step.automated)}
                      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-medium transition-all ${
                        step.automated
                          ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      }`}
                    >
                      {step.automated ? <Zap className="size-2.5" /> : <User className="size-2.5" />}
                      {step.automated ? "Automated" : "Manual"}
                    </button>
                  </div>
                  <button
                    onClick={() => removeStep(idx)}
                    disabled={steps.length === 1}
                    className="mt-1.5 flex size-6 shrink-0 items-center justify-center rounded border border-zinc-700 bg-zinc-900 text-zinc-500 transition-colors hover:border-red-500/40 hover:text-red-400 disabled:opacity-30"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !form.name.trim()} className="bg-violet-600 text-white hover:bg-violet-500">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create Playbook
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
