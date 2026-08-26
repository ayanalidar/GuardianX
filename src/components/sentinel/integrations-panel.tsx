"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import {
  Plug, Database, Server, Bell, MessageSquare, Ticket, Cloud,
  ShieldCheck, GitBranch, Boxes, Activity, Clock, CheckCircle2,
  XCircle, Loader2, RefreshCw, Search, Plus, Play, Send, Trash2,
  Settings, Eye, AlertTriangle, Zap, Network, Globe, Fingerprint,
  Bug, FileText, Code, Package, Github, Atom, Cpu, Hash, Tag,
  ShieldAlert, Crosshair, ScanLine, Filter, ChevronRight, ChevronDown,
  ExternalLink, Copy, Sparkles, Brain, Biohazard, Radar, Eye as EyeIcon,
  ArrowRight, Ban, FileCode, Layers, Gauge, Download, Webhook,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────
type ConfigFieldType = "string" | "password" | "url" | "select" | "boolean" | "json";
type ConnectorCategory =
  | "SIEM & Monitoring"
  | "Alerting & Notification"
  | "Collaboration"
  | "ITSM & Ticketing"
  | "Cloud & Infrastructure"
  | "Compliance & Reporting"
  | "DevOps & CI/CD"
  | "Generic";

interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  defaultValue?: string | boolean;
}

interface ConnectorSchema {
  id: string;
  name: string;
  category: ConnectorCategory;
  direction: "outbound" | "import" | "enrichment";
  description: string;
  icon?: string;
  configFields: ConfigField[];
  builtin: boolean;
}

interface ForwardLogEntry {
  id: string;
  at: string;
  integrationId?: string;
  connectorId: string;
  eventType: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  result: {
    ok: boolean;
    status?: number;
    detail?: string;
    externalId?: string;
  };
}

interface ImportedFinding {
  title: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  category: string;
  owasp?: string;
  endpoint: string;
  method?: string;
  description: string;
  proofRequest?: string;
  proofResponse?: string;
  payload?: string;
  confidence?: number;
  remediation?: string;
}

interface ImportResult {
  tool: string;
  engagementId?: string;
  imported: number;
  skipped: number;
  errors: string[];
  findings: ImportedFinding[];
}

interface EnrichmentResult {
  provider: string;
  ok: boolean;
  status?: number;
  detail?: string;
  reputation?: "clean" | "suspicious" | "malicious" | "unknown";
  score?: number;
  classifications?: string[];
  tags?: string[];
  relatedIOCs?: Array<{ type: string; value: string }>;
  latencyMs?: number;
}

interface EnrichIOCResult {
  value: string;
  type: string;
  results: EnrichmentResult[];
  merged: {
    reputation: "clean" | "suspicious" | "malicious" | "unknown";
    maxScore: number;
    classifications: string[];
    tags: string[];
    relatedIOCs: Array<{ type: string; value: string }>;
  };
  durationMs: number;
}

// ── Style maps ───────────────────────────────────────────────────────────────
const CATEGORY_META: Record<ConnectorCategory, { icon: typeof Plug; color: string; bg: string; border: string }> = {
  "SIEM & Monitoring":       { icon: Database,      color: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/30" },
  "Alerting & Notification": { icon: Bell,          color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30" },
  "Collaboration":           { icon: MessageSquare, color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/30" },
  "ITSM & Ticketing":        { icon: Ticket,        color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/30" },
  "Cloud & Infrastructure":  { icon: Cloud,         color: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/30" },
  "Compliance & Reporting":  { icon: ShieldCheck,   color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  "DevOps & CI/CD":          { icon: GitBranch,     color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30" },
  "Generic":                 { icon: Boxes,         color: "text-zinc-400",    bg: "bg-zinc-500/10",    border: "border-zinc-500/30" },
};

const CATEGORY_ORDER: ConnectorCategory[] = [
  "SIEM & Monitoring",
  "Alerting & Notification",
  "Collaboration",
  "ITSM & Ticketing",
  "Cloud & Infrastructure",
  "Compliance & Reporting",
  "DevOps & CI/CD",
  "Generic",
];

const SEVERITY_STYLE: Record<string, { text: string; bg: string; border: string; dot: string }> = {
  critical: { text: "text-red-400",    bg: "bg-red-500/10",    border: "border-red-500/40",    dot: "bg-red-500" },
  high:     { text: "text-amber-400",  bg: "bg-amber-500/10",  border: "border-amber-500/40",  dot: "bg-amber-500" },
  medium:   { text: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/40", dot: "bg-yellow-500" },
  low:      { text: "text-sky-400",    bg: "bg-sky-500/10",    border: "border-sky-500/40",    dot: "bg-sky-500" },
  info:     { text: "text-zinc-400",   bg: "bg-zinc-500/10",   border: "border-zinc-500/40",   dot: "bg-zinc-500" },
};

const REPUTATION_STYLE: Record<string, { text: string; bg: string; border: string }> = {
  clean:       { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/40" },
  unknown:     { text: "text-zinc-400",    bg: "bg-zinc-500/10",    border: "border-zinc-500/40" },
  suspicious:  { text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/40" },
  malicious:   { text: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/40" },
};

// Lucide icon name -> component map for connectors that specify an icon string
const ICON_MAP: Record<string, typeof Plug> = {
  Radar, Database, Server, Bell, MessageSquare, Ticket, Cloud, ShieldCheck,
  GitBranch, Boxes, Activity, Bug, FileText, Code, Package, Github, Atom, Cpu,
  Plug, Settings, Network, Globe, Fingerprint, Hash, Tag, ShieldAlert,
  Crosshair, Brain, Biohazard, Eye: EyeIcon,
};

function getConnectorIcon(schema: ConnectorSchema): typeof Plug {
  if (schema.icon && ICON_MAP[schema.icon]) return ICON_MAP[schema.icon];
  const meta = CATEGORY_META[schema.category];
  return meta?.icon || Plug;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso: string): string {
  if (!iso) return "-";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(iso).toLocaleDateString();
}

function formatTimestamp(iso: string): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  } catch {
    return iso;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════════════════════════════
export function IntegrationsPanel() {
  const [tab, setTab] = useState<"hub" | "log" | "import" | "threat" | "webhooks">("hub");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
          <span className="size-1.5 rounded-full bg-emerald-500 pulse-dot" />
          integrations@guardianx:~$ fan-out --all
        </div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
          <Plug className="size-5 text-emerald-400" />
          Integration Hub
          <span className="font-mono text-sm text-zinc-500">{"// Outbound + import + enrichment"}</span>
        </h2>
        <p className="mt-1 text-sm text-zinc-400">
          29 outbound connectors, 8 import parsers, 5 threat-intel providers. Fan out security events to every active destination.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="holo-card-sharp hud-corners flex flex-wrap gap-1 p-1.5">
        {([
          { id: "hub",      label: "Integrations Hub",  icon: Plug,         color: "emerald" },
          { id: "log",      label: "Forwarding Log",    icon: Activity,     color: "cyan" },
          { id: "import",   label: "Import Findings",   icon: Download,     color: "amber" },
          { id: "threat",   label: "Threat Intel",      icon: Brain,        color: "rose" },
          { id: "webhooks", label: "Webhooks",          icon: Webhook,      color: "violet" },
        ] as const).map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          const colorClasses: Record<string, string> = {
            emerald: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40 neon-border-emerald",
            cyan:    "bg-cyan-500/15 text-cyan-300 border-cyan-500/40 neon-border-cyan",
            amber:   "bg-amber-500/15 text-amber-300 border-amber-500/40 neon-border-amber",
            rose:    "bg-rose-500/15 text-rose-300 border-rose-500/40 neon-border-rose",
            violet:  "bg-violet-500/15 text-violet-300 border-violet-500/40",
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
          {tab === "hub" && <IntegrationsHub />}
          {tab === "log" && <ForwardingLog />}
          {tab === "import" && <ImportFindings />}
          {tab === "threat" && <ThreatIntel />}
          {tab === "webhooks" && <WebhooksManager />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// INTEGRATIONS HUB TAB
// ════════════════════════════════════════════════════════════════════════════
function IntegrationsHub() {
  const { toast } = useToast();
  const [schemas, setSchemas] = useState<ConnectorSchema[]>([]);
  const [configured, setConfigured] = useState<Array<{ id: string; type: string; isActive: boolean; config: Record<string, unknown> }>>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [configSchema, setConfigSchema] = useState<ConnectorSchema | null>(null);
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [sRes, cRes] = await Promise.all([
        fetch(`/api/integrations?schemas=true`),
        fetch(`/api/integrations`),
      ]);
      const sData = await sRes.json();
      const cData = await cRes.json();
      if (!sRes.ok) throw new Error(sData.error || "Failed to load schemas");
      setSchemas(sData.schemas || []);
      // Configured integrations may be a bare array OR { integrations: [...] }
      const list = Array.isArray(cData) ? cData : (cData.integrations || []);
      setConfigured(list);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load integrations",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleCat = (cat: string) => {
    const next = new Set(collapsedCats);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    setCollapsedCats(next);
  };

  const isConfigured = (id: string) => configured.find((c) => c.type === id);

  // Group by category
  const grouped: Record<string, ConnectorSchema[]> = {};
  for (const s of schemas) {
    if (!grouped[s.category]) grouped[s.category] = [];
    grouped[s.category].push(s);
  }

  const filteredSchemas = schemas.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
  });

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 bg-zinc-900/40" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-32 bg-zinc-900/40" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-zinc-500">
          <span className="flex items-center gap-1"><Plug className="size-3 text-emerald-400" /> {schemas.length} connectors</span>
          <span className="text-zinc-700">|</span>
          <span className="flex items-center gap-1"><CheckCircle2 className="size-3 text-emerald-400" /> {configured.length} configured</span>
          <span className="text-zinc-700">|</span>
          <span className="flex items-center gap-1"><Layers className="size-3 text-cyan-400" /> {CATEGORY_ORDER.filter((c) => grouped[c]?.length).length} categories</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search connectors..."
              className="border-zinc-800 bg-zinc-900/60 pl-9 text-xs text-zinc-200 placeholder:text-zinc-500 focus-visible:border-emerald-500/50"
            />
          </div>
          <Button onClick={load} variant="outline" size="sm" className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            <RefreshCw className="size-3.5" />
          </Button>
        </div>
      </div>

      {filteredSchemas.length === 0 ? (
        <div className="holo-card-sharp hud-corners flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
            <Plug className="size-7 text-emerald-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-200">No connectors found</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-400">Try a different search or refresh the catalog.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {CATEGORY_ORDER.map((cat) => {
            const catSchemas = (grouped[cat] || []).filter((s) => filteredSchemas.includes(s));
            if (catSchemas.length === 0) return null;
            const meta = CATEGORY_META[cat];
            const collapsed = collapsedCats.has(cat);
            const configuredInCat = catSchemas.filter((s) => isConfigured(s.id)).length;
            return (
              <div key={cat} className="holo-card-sharp hud-corners p-4">
                <button
                  onClick={() => toggleCat(cat)}
                  className="mb-3 flex w-full items-center gap-2 text-left"
                >
                  {collapsed ? <ChevronRight className="size-4 text-zinc-500" /> : <ChevronDown className="size-4 text-zinc-500" />}
                  <meta.icon className={`size-4 ${meta.color}`} />
                  <span className={`text-sm font-bold ${meta.color}`}>{cat}</span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    ({configuredInCat}/{catSchemas.length} configured)
                  </span>
                </button>
                {!collapsed && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {catSchemas.map((schema, i) => {
                      const Icon = getConnectorIcon(schema);
                      const cfg = isConfigured(schema.id);
                      return (
                        <motion.div
                          key={schema.id}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: Math.min(i * 0.03, 0.2) }}
                          className={`holo-card-sharp hud-corners group border p-3 transition-all hover:border-emerald-500/40 ${
                            cfg ? "border-emerald-500/30" : "border-zinc-800"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className={`flex size-8 items-center justify-center rounded-md border ${meta.border} ${meta.bg}`}>
                                <Icon className={`size-4 ${meta.color}`} />
                              </div>
                              <div className="min-w-0">
                                <div className="truncate text-xs font-bold text-zinc-100">{schema.name}</div>
                                <div className="font-mono text-[9px] text-zinc-500">{schema.id}</div>
                              </div>
                            </div>
                            {cfg ? (
                              <Badge variant="outline" className={`shrink-0 text-[9px] ${
                                cfg.isActive
                                  ? "border-emerald-500/40 text-emerald-300"
                                  : "border-zinc-600 text-zinc-500"
                              }`}>
                                {cfg.isActive ? "ACTIVE" : "PAUSED"}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="shrink-0 border-zinc-700 text-[9px] text-zinc-500">
                                {schema.builtin ? "BUILTIN" : "OUTBOUND"}
                              </Badge>
                            )}
                          </div>
                          <p className="mt-2 line-clamp-2 text-[11px] text-zinc-400">{schema.description}</p>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="font-mono text-[9px] text-zinc-600">
                              {schema.configFields.length} config field(s)
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfigSchema(schema)}
                              className="h-7 px-2 text-[10px] text-emerald-300 hover:bg-emerald-500/10 hover:text-emerald-200"
                            >
                              <Settings className="size-3" />
                              {cfg ? "Edit" : "Configure"}
                            </Button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {configSchema && (
        <ConfigureConnectorModal
          schema={configSchema}
          existing={isConfigured(configSchema.id)}
          onClose={() => setConfigSchema(null)}
          onSaved={() => { setConfigSchema(null); load(); }}
        />
      )}
    </div>
  );
}

// ── Configure Connector Modal ──
function ConfigureConnectorModal({
  schema, existing, onClose, onSaved,
}: {
  schema: ConnectorSchema;
  existing?: { id: string; type: string; isActive: boolean; config: Record<string, unknown> };
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, string | boolean>>(() => {
    const init: Record<string, string | boolean> = {};
    for (const f of schema.configFields) {
      if (existing?.config?.[f.key] !== undefined) {
        init[f.key] = existing.config[f.key] as string | boolean;
      } else if (f.defaultValue !== undefined) {
        init[f.key] = f.defaultValue;
      } else if (f.type === "boolean") {
        init[f.key] = false;
      } else {
        init[f.key] = "";
      }
    }
    return init;
  });
  const [isActive, setIsActive] = useState(existing?.isActive !== false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const meta = CATEGORY_META[schema.category];
  const Icon = getConnectorIcon(schema);

  const buildConfig = (): Record<string, unknown> => {
    const cfg: Record<string, unknown> = {};
    for (const f of schema.configFields) {
      const v = form[f.key];
      if (f.type === "json") {
        try { cfg[f.key] = v ? JSON.parse(v as string) : {}; } catch { cfg[f.key] = {}; }
      } else if (f.type === "boolean") {
        cfg[f.key] = Boolean(v);
      } else {
        cfg[f.key] = v;
      }
    }
    return cfg;
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch(`/api/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: schema.id, config: buildConfig(), test: true }),
      });
      const data = await res.json();
      if (!res.ok && !data.ok) {
        throw new Error(data.error || data.result?.detail || "Test failed");
      }
      toast({
        title: data.ok ? "Test passed" : "Test completed",
        description: data.result?.detail || data.message || "Connector reached the upstream service.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Test failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // If existing, PATCH; else POST to create
      if (existing?.id) {
        const res = await fetch(`/api/integrations`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: existing.id, isActive, config: buildConfig() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Update failed");
        toast({ title: "Integration updated", description: schema.name });
      } else {
        const res = await fetch(`/api/integrations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: schema.id, config: buildConfig(), isActive }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Create failed");
        toast({ title: "Integration configured", description: schema.name });
      }
      onSaved();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Save failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setSaving(false);
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
          <div className={`flex size-9 items-center justify-center rounded-md border ${meta.border} ${meta.bg}`}>
            <Icon className={`size-4 ${meta.color}`} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-50">{schema.name}</h2>
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
              <span>{schema.id}</span>
              <span className="text-zinc-700">|</span>
              <span>{schema.category}</span>
            </div>
          </div>
        </div>

        <p className="mb-3 text-xs text-zinc-400">{schema.description}</p>

        <div className="max-h-80 space-y-3 overflow-y-auto custom-scrollbar pr-1">
          {schema.configFields.length === 0 ? (
            <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3 text-center text-xs text-zinc-500">
              No configuration required for this connector.
            </div>
          ) : (
            schema.configFields.map((field) => (
              <div key={field.key}>
                <Label className="mb-1 flex items-center gap-1.5 text-xs text-zinc-300">
                  {field.label}
                  {field.required && <span className="text-red-400">*</span>}
                  <span className="ml-auto font-mono text-[9px] uppercase text-zinc-600">{field.type}</span>
                </Label>
                {field.type === "boolean" ? (
                  <button
                    onClick={() => setForm({ ...form, [field.key]: !form[field.key] })}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-xs transition-colors ${
                      form[field.key]
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-zinc-700 bg-zinc-900/60 text-zinc-400"
                    }`}
                  >
                    <span>{form[field.key] ? "Enabled" : "Disabled"}</span>
                    <div className={`flex h-4 w-7 items-center rounded-full px-0.5 transition-colors ${form[field.key] ? "bg-emerald-500" : "bg-zinc-700"}`}>
                      <div className={`size-3 rounded-full bg-white transition-transform ${form[field.key] ? "translate-x-3" : ""}`} />
                    </div>
                  </button>
                ) : field.type === "select" ? (
                  <select
                    value={form[field.key] as string}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 focus:border-emerald-500/50 focus:outline-none"
                  >
                    <option value="">Select...</option>
                    {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : field.type === "json" ? (
                  <textarea
                    value={form[field.key] as string}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    placeholder={field.placeholder || "{}"}
                    rows={3}
                    className="w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500/50 focus:outline-none"
                  />
                ) : (
                  <Input
                    type={field.type === "password" ? "password" : "text"}
                    value={form[field.key] as string}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    placeholder={field.placeholder || ""}
                    className="border-zinc-700 bg-zinc-900/60 text-sm text-zinc-200 placeholder:text-zinc-500 focus-visible:border-emerald-500/50"
                  />
                )}
                {field.helpText && (
                  <p className="mt-1 text-[10px] text-zinc-500">{field.helpText}</p>
                )}
              </div>
            ))
          )}
          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
            <div>
              <div className="text-xs font-semibold text-zinc-200">Active</div>
              <div className="text-[10px] text-zinc-500">Forward events to this connector when active</div>
            </div>
            <button
              onClick={() => setIsActive(!isActive)}
              className={`flex h-5 w-9 items-center rounded-full px-0.5 transition-colors ${isActive ? "bg-emerald-500" : "bg-zinc-700"}`}
            >
              <div className={`size-4 rounded-full bg-white transition-transform ${isActive ? "translate-x-4" : ""}`} />
            </button>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            Cancel
          </Button>
          <Button
            onClick={handleTest}
            disabled={testing}
            variant="outline"
            className="border-cyan-500/40 bg-cyan-500/5 text-cyan-300 hover:bg-cyan-500/15"
          >
            {testing ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
            Test
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 text-white hover:bg-emerald-500">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            {existing ? "Update" : "Configure"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// FORWARDING LOG TAB
// ════════════════════════════════════════════════════════════════════════════
function ForwardingLog() {
  const { toast } = useToast();
  const [log, setLog] = useState<ForwardLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "ok" | "fail">("all");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/integrations?log=true`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load log");
      setLog(data.log || []);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load forwarding log",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh forwarding log every 30s (was 10s), paused while tab is hidden.
  useVisiblePolling(load, 30_000, { immediate: false });

  const filtered = log.filter((e) => {
    if (filter === "all") return true;
    if (filter === "ok") return e.result.ok;
    return !e.result.ok;
  });

  const stats = {
    total: log.length,
    ok: log.filter((e) => e.result.ok).length,
    fail: log.filter((e) => !e.result.ok).length,
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {([
            { id: "all", label: "All", count: stats.total, color: "text-zinc-300" },
            { id: "ok", label: "Success", count: stats.ok, color: "text-emerald-400" },
            { id: "fail", label: "Failed", count: stats.fail, color: "text-red-400" },
          ] as const).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                filter === f.id
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`}
            >
              {f.label}
              <span className={`font-mono ${f.color}`}>{f.count}</span>
            </button>
          ))}
        </div>
        <Button onClick={load} variant="outline" size="sm" className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
          <RefreshCw className="size-3.5" /> Refresh
        </Button>
      </div>

      {/* Log */}
      {loading ? (
        <Skeleton className="h-64 bg-zinc-900/40" />
      ) : filtered.length === 0 ? (
        <div className="holo-card-sharp hud-corners flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-cyan-500/10 ring-1 ring-cyan-500/30">
            <Activity className="size-7 text-cyan-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-200">No forwarding events yet</h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-400">
            The log captures the last 100 fan-out attempts. Trigger an event from the Integrations Hub or wait for the next incident/canary.
          </p>
        </div>
      ) : (
        <div className="holo-card-sharp hud-corners p-4">
          <div className="max-h-[600px] overflow-y-auto custom-scrollbar space-y-1.5">
            {filtered.map((entry) => {
              const sev = SEVERITY_STYLE[entry.severity] || SEVERITY_STYLE.info;
              const ok = entry.result.ok;
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  className={`rounded-md border px-3 py-2 ${
                    ok ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {ok
                      ? <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
                      : <XCircle className="size-3.5 shrink-0 text-red-400" />}
                    <span className={`size-2 shrink-0 rounded-full ${sev.dot}`} />
                    <span className="shrink-0 font-mono text-[10px] text-zinc-500">{formatTimestamp(entry.at)}</span>
                    <span className="line-clamp-1 flex-1 text-xs font-medium text-zinc-100">{entry.title}</span>
                    <Badge variant="outline" className={`shrink-0 text-[9px] uppercase ${sev.text} border-current`}>
                      {entry.severity}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Plug className="size-2.5" /> {entry.connectorId}
                    </span>
                    <span className="flex items-center gap-1">
                      <Tag className="size-2.5" /> {entry.eventType}
                    </span>
                    {entry.result.status && (
                      <span className={ok ? "text-emerald-400" : "text-red-400"}>
                        HTTP {entry.result.status}
                      </span>
                    )}
                    {entry.result.externalId && (
                      <span className="text-cyan-400">ext: {entry.result.externalId.slice(0, 24)}</span>
                    )}
                    {!ok && entry.result.detail && (
                      <span className="line-clamp-1 text-red-400/80">{entry.result.detail}</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// IMPORT FINDINGS TAB
// ════════════════════════════════════════════════════════════════════════════
function ImportFindings() {
  const { toast } = useToast();
  const [connectors, setConnectors] = useState<Array<{ id: string; name: string; description: string; icon?: string; category: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTool, setSelectedTool] = useState<string>("");
  const [rawData, setRawData] = useState("");
  const [engagementId, setEngagementId] = useState("");
  const [previewMode, setPreviewMode] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/imports`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load import tools");
      setConnectors(data.connectors || []);
      if (data.connectors?.length && !selectedTool) {
        setSelectedTool(data.connectors[0].id);
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load import tools",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, selectedTool]);

  useEffect(() => {
    load();
  }, [load]);

  const handleImport = async () => {
    if (!selectedTool) {
      toast({ variant: "destructive", title: "Select a tool first" });
      return;
    }
    if (!rawData.trim()) {
      toast({ variant: "destructive", title: "Paste some raw data first" });
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      let parsedData: unknown = rawData;
      // Try to parse as JSON first; if it fails, send as raw string (XML, JSONL, etc.)
      try {
        parsedData = JSON.parse(rawData);
      } catch {
        // Not JSON - send as raw text
      }
      const res = await fetch(`/api/imports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: selectedTool,
          rawData: parsedData,
          engagementId: engagementId.trim() || undefined,
          preview: previewMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult(data as ImportResult);
      toast({
        title: previewMode ? "Preview ready" : "Import complete",
        description: `${data.findings?.length || 0} findings ${previewMode ? "parsed" : "imported"}.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Import failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setImporting(false);
    }
  };

  const ICON_LOOKUP: Record<string, typeof Bug> = {
    Bug, Server, Atom, Code, Package, Github, FileText,
  };

  return (
    <div className="space-y-4">
      {/* Tool selector */}
      <div className="holo-card-sharp hud-corners p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Download className="size-4 text-amber-400" /> Scanner Tool
          <span className="font-mono text-[10px] text-zinc-500">{connectors.length} parsers</span>
        </h3>
        {loading ? (
          <Skeleton className="h-20 bg-zinc-900/40" />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
            {connectors.map((c) => {
              const Icon = (c.icon && ICON_LOOKUP[c.icon]) || FileText;
              const active = selectedTool === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedTool(c.id)}
                  className={`rounded-md border p-2.5 text-left transition-all ${
                    active
                      ? "border-amber-500/40 bg-amber-500/10 neon-border-amber"
                      : "border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/50 hover:border-zinc-700"
                  }`}
                >
                  <Icon className={`size-4 ${active ? "text-amber-300" : "text-zinc-400"}`} />
                  <div className="mt-1.5 text-[11px] font-bold text-zinc-200">{c.name}</div>
                  <div className="font-mono text-[9px] text-zinc-500">{c.id}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Raw data input */}
      <div className="holo-card-sharp hud-corners p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <FileCode className="size-4 text-amber-400" /> Raw Scanner Output
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPreviewMode(!previewMode)}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-medium transition-colors ${
                previewMode
                  ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                  : "border-zinc-700 bg-zinc-900/40 text-zinc-400"
              }`}
            >
              <Eye className="size-3" />
              {previewMode ? "Preview mode" : "Persist mode"}
            </button>
            <Button onClick={handleImport} disabled={importing} className="bg-amber-600 text-white hover:bg-amber-500 neon-border-amber">
              {importing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {previewMode ? "Parse Preview" : "Import Findings"}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_18rem]">
          <div>
            <Label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">Raw data (JSON / XML / JSONL)</Label>
            <textarea
              value={rawData}
              onChange={(e) => setRawData(e.target.value)}
              placeholder={`Paste ${connectors.find((c) => c.id === selectedTool)?.name || "scanner"} output here...\n\nJSON, XML, or JSONL accepted. The parser will normalize findings into the Finding schema.`}
              rows={12}
              className="w-full rounded-md border border-zinc-800 bg-zinc-950/60 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-amber-500/50 focus:outline-none"
            />
            <div className="mt-1 flex items-center justify-between font-mono text-[9px] text-zinc-600">
              <span>{rawData.length.toLocaleString()} chars</span>
              <span>{rawData.split("\n").length} lines</span>
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">Engagement ID (optional)</Label>
            <Input
              value={engagementId}
              onChange={(e) => setEngagementId(e.target.value)}
              placeholder="eng_..."
              className="border-zinc-800 bg-zinc-900/60 font-mono text-xs text-zinc-200 placeholder:text-zinc-500 focus-visible:border-amber-500/50"
            />
            <div className="mt-4 rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                <Sparkles className="size-3 text-amber-400" /> How it works
              </div>
              <ol className="space-y-1 text-[11px] text-zinc-500">
                <li>1. Pick the scanner that produced the data.</li>
                <li>2. Paste the raw XML/JSON/JSONL output.</li>
                <li>3. Preview parses without persisting.</li>
                <li>4. Disable preview to persist as Finding rows.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="holo-card-sharp hud-corners p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <CheckCircle2 className="size-4 text-emerald-400" /> {previewMode ? "Preview Results" : "Import Results"}
            </h3>
            <div className="flex items-center gap-3 font-mono text-[10px] text-zinc-500">
              <span className="text-emerald-400">{result.findings.length} parsed</span>
              <span className="text-amber-400">{result.skipped} skipped</span>
              {result.errors.length > 0 && <span className="text-red-400">{result.errors.length} errors</span>}
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/5 p-3">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-red-400">Errors</div>
              <ul className="space-y-0.5 text-[11px] text-red-300">
                {result.errors.slice(0, 5).map((e, i) => <li key={i} className="font-mono">{e}</li>)}
                {result.errors.length > 5 && <li className="text-zinc-500">...and {result.errors.length - 5} more</li>}
              </ul>
            </div>
          )}

          {result.findings.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500">
              No findings parsed. Verify the tool matches your data format.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-1.5">
              {result.findings.map((f, i) => {
                const sev = SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.info;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    className={`rounded-md border ${sev.border} ${sev.bg} px-3 py-2`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`size-2 rounded-full ${sev.dot}`} />
                      <span className="line-clamp-1 flex-1 text-xs font-semibold text-zinc-100">{f.title}</span>
                      <Badge variant="outline" className={`shrink-0 text-[9px] uppercase ${sev.text} border-current`}>{f.severity}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px] text-zinc-500">
                      <span className="flex items-center gap-1"><Tag className="size-2.5" /> {f.category}</span>
                      {f.owasp && <span className="text-cyan-400">OWASP {f.owasp}</span>}
                      {f.endpoint && <span className="flex items-center gap-1"><Network className="size-2.5" /> {f.endpoint}</span>}
                      {f.method && <span className="text-amber-400">{f.method}</span>}
                      {typeof f.confidence === "number" && <span className="text-violet-400">{f.confidence}%</span>}
                    </div>
                    {f.description && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-zinc-400">{f.description}</p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// THREAT INTEL TAB
// ════════════════════════════════════════════════════════════════════════════
function ThreatIntel() {
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [iocType, setIocType] = useState<"ip" | "hash" | "domain" | "url" | "email" | "user_agent">("ip");
  const [enriching, setEnriching] = useState(false);
  const [result, setResult] = useState<EnrichIOCResult | null>(null);

  const IOC_TYPES: Array<{ id: typeof iocType; label: string; icon: typeof Network; placeholder: string }> = [
    { id: "ip",         label: "IP Address",    icon: Network,     placeholder: "192.168.1.10 or 8.8.8.8" },
    { id: "hash",       label: "File Hash",     icon: Fingerprint, placeholder: "SHA-256, SHA-1, or MD5" },
    { id: "domain",     label: "Domain",        icon: Globe,       placeholder: "example.com" },
    { id: "url",        label: "URL",           icon: ExternalLink,placeholder: "https://example.com/path" },
    { id: "email",      label: "Email",         icon: Tag,         placeholder: "user@example.com" },
    { id: "user_agent", label: "User Agent",    icon: Cpu,         placeholder: "Mozilla/5.0..." },
  ];

  const handleEnrich = async () => {
    if (!value.trim()) {
      toast({ variant: "destructive", title: "Enter an IOC value first" });
      return;
    }
    setEnriching(true);
    setResult(null);
    try {
      const res = await fetch(`/api/iocs/enrich`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: value.trim(), type: iocType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Enrichment failed");
      setResult(data as EnrichIOCResult);
      toast({
        title: "Enrichment complete",
        description: `${data.results?.length || 0} providers queried, reputation: ${data.merged?.reputation || "unknown"}.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Enrichment failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setEnriching(false);
    }
  };

  const detectType = (v: string) => {
    const s = v.trim();
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) return "ip";
    if (/^[a-f0-9]{32}$|^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(s)) return "hash";
    if (/^https?:\/\//i.test(s)) return "url";
    if (/^[^@]+@[^@]+\.[^@]+$/.test(s)) return "email";
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(s)) return "domain";
    return null;
  };

  const onValueChange = (v: string) => {
    setValue(v);
    const detected = detectType(v);
    if (detected) setIocType(detected as typeof iocType);
  };

  const currentTypeMeta = IOC_TYPES.find((t) => t.id === iocType) || IOC_TYPES[0];

  return (
    <div className="space-y-4">
      {/* IOC input */}
      <div className="holo-card-sharp hud-corners p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
          <Brain className="size-4 text-rose-400" /> IOC Enrichment
          <span className="font-mono text-[10px] text-zinc-500">5 providers (VirusTotal, AbuseIPDB, Shodan, AlienVault OTX, MISP)</span>
        </h3>

        {/* Type selector */}
        <div className="mb-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {IOC_TYPES.map((t) => {
            const Icon = t.icon;
            const active = iocType === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setIocType(t.id)}
                className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-[10px] font-medium transition-all ${
                  active
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-300 neon-border-rose"
                    : "border-zinc-800 bg-zinc-900/40 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
                }`}
              >
                <Icon className="size-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <ScanLine className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleEnrich()}
              placeholder={currentTypeMeta.placeholder}
              className="border-zinc-800 bg-zinc-900/60 pl-9 font-mono text-sm text-zinc-200 placeholder:text-zinc-500 focus-visible:border-rose-500/50"
            />
          </div>
          <Button
            onClick={handleEnrich}
            disabled={enriching || !value.trim()}
            className="bg-rose-600 text-white hover:bg-rose-500 neon-border-rose"
          >
            {enriching ? <Loader2 className="size-4 animate-spin" /> : <Biohazard className="size-4" />}
            Enrich
          </Button>
        </div>
        <div className="mt-1.5 font-mono text-[9px] text-zinc-600">
          Type auto-detected from value format. The IOC is persisted to the IOC tracker with the merged reputation as confidence.
        </div>
      </div>

      {/* Results */}
      {enriching ? (
        <div className="holo-card-sharp hud-corners flex flex-col items-center justify-center py-16">
          <Loader2 className="size-8 animate-spin text-rose-400" />
          <p className="mt-3 text-sm text-zinc-400">Querying threat intel providers...</p>
        </div>
      ) : result ? (
        <div className="space-y-4">
          {/* Merged verdict */}
          <div className={`holo-card-sharp hud-corners border p-5 ${
            REPUTATION_STYLE[result.merged.reputation].border
          } ${REPUTATION_STYLE[result.merged.reputation].bg}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Merged Verdict</div>
                <div className={`mt-1 text-2xl font-bold ${REPUTATION_STYLE[result.merged.reputation].text}`}>
                  {result.merged.reputation.toUpperCase()}
                </div>
                <div className="mt-0.5 font-mono text-xs text-zinc-400">{result.value}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Max Score</div>
                <div className={`mt-1 font-mono text-3xl font-bold ${
                  result.merged.maxScore > 70 ? "text-red-400"
                  : result.merged.maxScore > 30 ? "text-amber-400"
                  : "text-emerald-400"
                }`}>
                  {result.merged.maxScore}
                </div>
                <div className="font-mono text-[9px] text-zinc-500">/100</div>
              </div>
            </div>

            {/* Tags + classifications */}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {result.merged.classifications.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Classifications</div>
                  <div className="flex flex-wrap gap-1">
                    {result.merged.classifications.slice(0, 8).map((c, i) => (
                      <span key={i} className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-300">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {result.merged.tags.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Tags</div>
                  <div className="flex flex-wrap gap-1">
                    {result.merged.tags.slice(0, 8).map((t, i) => (
                      <span key={i} className="rounded-full border border-zinc-700 bg-zinc-800/50 px-2 py-0.5 text-[10px] text-zinc-300">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {result.merged.relatedIOCs.length > 0 && (
              <div className="mt-3 border-t border-zinc-700/50 pt-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Related IOCs ({result.merged.relatedIOCs.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {result.merged.relatedIOCs.slice(0, 12).map((r, i) => (
                    <code key={i} className="rounded bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
                      {r.type}: {r.value}
                    </code>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between font-mono text-[9px] text-zinc-500">
              <span>{result.results.length} provider(s) queried</span>
              <span>{result.durationMs}ms total</span>
            </div>
          </div>

          {/* Per-provider results */}
          <div className="holo-card-sharp hud-corners p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Gauge className="size-4 text-rose-400" /> Per-Provider Results
            </h3>
            <div className="space-y-2">
              {result.results.map((r, i) => {
                const rep = r.reputation ? REPUTATION_STYLE[r.reputation] : null;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.05, 0.3) }}
                    className={`rounded-md border p-3 ${
                      r.ok
                        ? rep ? `${rep.border} ${rep.bg}` : "border-zinc-800 bg-zinc-900/40"
                        : "border-red-500/30 bg-red-500/5"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {r.ok ? <CheckCircle2 className="size-3.5 text-emerald-400" /> : <XCircle className="size-3.5 text-red-400" />}
                      <span className="font-mono text-xs font-bold text-zinc-200">{r.provider}</span>
                      {r.reputation && (
                        <Badge variant="outline" className={`text-[9px] uppercase ${rep?.text} border-current`}>
                          {r.reputation}
                        </Badge>
                      )}
                      {typeof r.score === "number" && (
                        <Badge variant="outline" className="text-[9px] text-amber-300 border-current">
                          score {r.score}
                        </Badge>
                      )}
                      {r.status && (
                        <span className="font-mono text-[9px] text-zinc-500">HTTP {r.status}</span>
                      )}
                      {r.latencyMs !== undefined && (
                        <span className="ml-auto font-mono text-[9px] text-zinc-500">{r.latencyMs}ms</span>
                      )}
                    </div>
                    {r.detail && (
                      <div className={`mt-1 font-mono text-[10px] ${r.ok ? "text-zinc-400" : "text-red-300"}`}>
                        {r.detail}
                      </div>
                    )}
                    {(r.classifications?.length || r.tags?.length) ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {(r.classifications || []).slice(0, 4).map((c, j) => (
                          <span key={`c${j}`} className="rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[9px] text-rose-300">{c}</span>
                        ))}
                        {(r.tags || []).slice(0, 4).map((t, j) => (
                          <span key={`t${j}`} className="rounded-full bg-zinc-800/60 px-1.5 py-0.5 text-[9px] text-zinc-400">{t}</span>
                        ))}
                      </div>
                    ) : null}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="holo-card-sharp hud-corners flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-rose-500/10 ring-1 ring-rose-500/30">
            <Brain className="size-7 text-rose-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-200">Enrich an IOC</h3>
          <p className="mt-1 max-w-md text-sm text-zinc-400">
            Enter an IP, hash, domain, URL, email, or user-agent string. The system queries up to 5 threat-intel providers in parallel and merges the verdicts.
          </p>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// WEBHOOKS TAB — manage WebhookConfig rows + fire test events
// ════════════════════════════════════════════════════════════════════════════

interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  isActive: boolean;
  hasSecret: boolean;
  createdAt: string;
}

const SECURITY_EVENT_OPTIONS: Array<{ id: string; label: string; description: string }> = [
  { id: "critical_finding", label: "Critical Finding",   description: "A critical-severity finding was created during an engagement." },
  { id: "incident_created", label: "Incident Created",   description: "A new incident case was opened in the DFIR module." },
  { id: "canary_triggered", label: "Canary Triggered",   description: "A canary value was detected on an external site (data exfil)." },
  { id: "patch_ready",      label: "Patch Ready",        description: "A high/critical severity patch is ready for review." },
  { id: "test",             label: "Test Events",        description: "Synthetic test events fired from this UI." },
  { id: "*",                label: "All Events (*)",     description: "Wildcard — receive every security event." },
];

function WebhooksManager() {
  const { toast } = useToast();
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  // New-webhook form state
  const [fName, setFName] = useState("");
  const [fUrl, setFUrl] = useState("");
  const [fEvents, setFEvents] = useState<string[]>(["*"]);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  // Track newly-created secret so it can be shown once to the user.
  const [newSecret, setNewSecret] = useState<{ id: string; secret: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/webhooks`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load webhooks");
      setWebhooks(Array.isArray(data) ? data : []);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load webhooks",
        description: err instanceof Error ? err.message : "unknown error",
      });
      setWebhooks([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleEvent = (eventId: string) => {
    // If user picks "All Events", clear the others (mutual exclusion).
    if (eventId === "*") {
      setFEvents((prev) => (prev.includes("*") ? [] : ["*"]));
      return;
    }
    setFEvents((prev) => {
      const without = prev.filter((e) => e !== "*");
      if (without.includes(eventId)) return without.filter((e) => e !== eventId);
      return [...without, eventId];
    });
  };

  const handleAdd = async () => {
    if (!fName.trim() || !fUrl.trim()) {
      toast({
        variant: "destructive",
        title: "Name and URL required",
      });
      return;
    }
    if (!fUrl.startsWith("http://") && !fUrl.startsWith("https://")) {
      toast({
        variant: "destructive",
        title: "Invalid URL",
        description: "Webhook URL must start with http:// or https://",
      });
      return;
    }
    if (fEvents.length === 0) {
      toast({
        variant: "destructive",
        title: "Select at least one event type",
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fName.trim(),
          url: fUrl.trim(),
          events: fEvents,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create webhook");
      setNewSecret({ id: data.id, secret: data.secret });
      toast({
        title: "Webhook configured",
        description: "Save the secret — it will not be shown again.",
      });
      setFName("");
      setFUrl("");
      setFEvents(["*"]);
      setShowAddForm(false);
      load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Create failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (wh: WebhookRow) => {
    try {
      const res = await fetch(`/api/webhooks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: wh.id, isActive: !wh.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setWebhooks((prev) =>
        prev.map((w) => (w.id === wh.id ? { ...w, isActive: !wh.isActive } : w))
      );
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Toggle failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    }
  };

  const handleDelete = async (wh: WebhookRow) => {
    if (!confirm(`Delete webhook "${wh.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/webhooks?id=${encodeURIComponent(wh.id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setWebhooks((prev) => prev.filter((w) => w.id !== wh.id));
      toast({ title: "Webhook deleted", description: wh.name });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    }
  };

  const handleTest = async (wh: WebhookRow) => {
    setTestingId(wh.id);
    try {
      const res = await fetch(`/api/webhooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true, id: wh.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test failed");
      toast({
        title: data.ok ? "Test event delivered" : "Test event failed",
        description: data.message || (data.ok ? "HTTP 2xx" : "see AuditLog"),
        variant: data.ok ? "default" : "destructive",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Test failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setTestingId(null);
    }
  };

  const stats = {
    total: webhooks.length,
    active: webhooks.filter((w) => w.isActive).length,
    inactive: webhooks.filter((w) => !w.isActive).length,
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-zinc-500">
          <span className="flex items-center gap-1">
            <Webhook className="size-3 text-violet-400" /> {stats.total} webhook(s)
          </span>
          <span className="text-zinc-700">|</span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="size-3 text-emerald-400" /> {stats.active} active
          </span>
          <span className="text-zinc-700">|</span>
          <span className="flex items-center gap-1">
            <Ban className="size-3 text-zinc-500" /> {stats.inactive} paused
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={load} variant="outline" size="sm" className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            <RefreshCw className="size-3.5" />
          </Button>
          <Button
            onClick={() => setShowAddForm((v) => !v)}
            size="sm"
            className="bg-violet-600 text-white hover:bg-violet-500"
          >
            {showAddForm ? <XCircle className="size-3.5" /> : <Plus className="size-3.5" />}
            {showAddForm ? "Cancel" : "Add Webhook"}
          </Button>
        </div>
      </div>

      {/* Newly-created secret reveal */}
      <AnimatePresence>
        {newSecret && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="holo-card-sharp hud-corners border border-violet-500/40 bg-violet-500/5 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-md border border-violet-500/40 bg-violet-500/10">
                <Sparkles className="size-4 text-violet-300" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-violet-200">
                  Webhook secret — copy it now
                </div>
                <p className="mt-0.5 text-[11px] text-zinc-400">
                  The secret is stored encrypted in the database but is never readable again via the API.
                  Store it alongside your receiver configuration.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md border border-violet-500/30 bg-zinc-950/60 px-3 py-2 font-mono text-[11px] text-violet-200">
                    {newSecret.secret}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-violet-500/40 bg-violet-500/5 text-violet-300 hover:bg-violet-500/15"
                    onClick={() => {
                      void navigator.clipboard.writeText(newSecret.secret);
                      toast({ title: "Copied", description: "Secret copied to clipboard." });
                    }}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-zinc-400 hover:text-zinc-200"
                    onClick={() => setNewSecret(null)}
                  >
                    <XCircle className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add-webhook form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="holo-card-sharp hud-corners space-y-4 p-5">
              <div className="flex items-center gap-2">
                <Plus className="size-4 text-violet-400" />
                <h3 className="text-sm font-semibold text-zinc-100">New Webhook</h3>
                <span className="font-mono text-[10px] text-zinc-500">
                  {"// secret auto-generated"}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-1 block text-xs text-zinc-300">Name *</Label>
                  <Input
                    value={fName}
                    onChange={(e) => setFName(e.target.value)}
                    placeholder="e.g. Slack #security-alerts"
                    className="border-zinc-700 bg-zinc-900/60 text-sm text-zinc-200 placeholder:text-zinc-500 focus-visible:border-violet-500/50"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-zinc-300">Webhook URL *</Label>
                  <Input
                    value={fUrl}
                    onChange={(e) => setFUrl(e.target.value)}
                    placeholder="https://hooks.example.com/services/..."
                    className="border-zinc-700 bg-zinc-900/60 text-sm text-zinc-200 placeholder:text-zinc-500 focus-visible:border-violet-500/50"
                  />
                </div>
              </div>

              <div>
                <Label className="mb-1.5 block text-xs text-zinc-300">
                  Events to subscribe *
                </Label>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {SECURITY_EVENT_OPTIONS.map((opt) => {
                    const active = fEvents.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleEvent(opt.id)}
                        className={`rounded-md border p-2.5 text-left transition-all ${
                          active
                            ? "border-violet-500/40 bg-violet-500/10"
                            : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-800/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold ${active ? "text-violet-200" : "text-zinc-200"}`}>
                            {opt.label}
                          </span>
                          {active && <CheckCircle2 className="size-3.5 text-violet-400" />}
                        </div>
                        <div className="mt-0.5 line-clamp-2 text-[10px] text-zinc-500">
                          {opt.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowAddForm(false)}
                  className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAdd}
                  disabled={saving}
                  className="bg-violet-600 text-white hover:bg-violet-500"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  Create Webhook
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Webhooks list */}
      {loading ? (
        <Skeleton className="h-48 bg-zinc-900/40" />
      ) : webhooks.length === 0 ? (
        <div className="holo-card-sharp hud-corners flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-violet-500/10 ring-1 ring-violet-500/30">
            <Webhook className="size-7 text-violet-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-200">No webhooks configured</h3>
          <p className="mt-1 max-w-md text-sm text-zinc-400">
            Add a webhook to receive HMAC-signed notifications when critical findings, incidents,
            canary triggers, or high-severity patches occur.
          </p>
          <Button
            onClick={() => setShowAddForm(true)}
            className="mt-4 bg-violet-600 text-white hover:bg-violet-500"
          >
            <Plus className="size-4" /> Add your first webhook
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {webhooks.map((wh) => (
            <motion.div
              key={wh.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`holo-card-sharp hud-corners border p-4 transition-colors ${
                wh.isActive ? "border-violet-500/30" : "border-zinc-800"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-zinc-100">{wh.name}</span>
                    {wh.isActive ? (
                      <Badge variant="outline" className="border-emerald-500/40 text-[9px] text-emerald-300">
                        ACTIVE
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-zinc-600 text-[9px] text-zinc-500">
                        PAUSED
                      </Badge>
                    )}
                    {wh.hasSecret ? (
                      <Badge variant="outline" className="border-cyan-500/30 text-[9px] text-cyan-300">
                        <ShieldCheck className="mr-1 size-2.5" /> SIGNED
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-amber-500/30 text-[9px] text-amber-300">
                        <AlertTriangle className="mr-1 size-2.5" /> UNSIGNED
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
                    <ExternalLink className="size-2.5" />
                    <span className="line-clamp-1 break-all">{wh.url}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {wh.events.length === 0 ? (
                      <span className="font-mono text-[10px] text-zinc-600">(no events)</span>
                    ) : (
                      wh.events.map((e) => (
                        <span
                          key={e}
                          className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[9px] text-violet-200"
                        >
                          {e}
                        </span>
                      ))
                    )}
                  </div>
                  <div className="mt-1.5 font-mono text-[9px] text-zinc-600">
                    added {timeAgo(wh.createdAt)}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {/* Active toggle */}
                  <button
                    onClick={() => handleToggle(wh)}
                    title={wh.isActive ? "Pause webhook" : "Activate webhook"}
                    className={`flex h-5 w-9 items-center rounded-full px-0.5 transition-colors ${
                      wh.isActive ? "bg-emerald-500" : "bg-zinc-700"
                    }`}
                  >
                    <div
                      className={`size-4 rounded-full bg-white transition-transform ${
                        wh.isActive ? "translate-x-4" : ""
                      }`}
                    />
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTest(wh)}
                    disabled={testingId === wh.id}
                    className="border-cyan-500/40 bg-cyan-500/5 text-cyan-300 hover:bg-cyan-500/15"
                  >
                    {testingId === wh.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Zap className="size-3.5" />
                    )}
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(wh)}
                    className="text-red-300 hover:bg-red-500/10 hover:text-red-200"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Help / wire-format docs */}
      <div className="holo-card-sharp hud-corners p-4">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-violet-400" />
          <h3 className="text-sm font-semibold text-zinc-100">Wire format</h3>
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-400">
          Each webhook receives a POST with HMAC-signed JSON. Verify the signature by re-computing
          HMAC-SHA256 of <code className="text-zinc-200">JSON.stringify(event)</code> with your
          secret, hex-encoded, and comparing to the <code className="text-zinc-200">X-GuardianX-Signature</code> header
          (without the <code className="text-zinc-200">sha256=</code> prefix).
        </p>
        <pre className="mt-2 overflow-x-auto rounded-md border border-zinc-800 bg-zinc-950/60 p-3 font-mono text-[10px] leading-relaxed text-zinc-300">
{`POST <webhook.url>
Content-Type: application/json
X-GuardianX-Event: <event.type>
X-GuardianX-Signature: sha256=<hex>

{
  "event": {
    "type": "critical_finding",
    "severity": "critical",
    "title": "...",
    "description": "...",
    "metadata": { ... }
  },
  "timestamp": "2025-01-01T00:00:00.000Z",
  "signature": "<hex hmac-sha256 of JSON.stringify(event)>"
}`}
        </pre>
      </div>
    </div>
  );
}
