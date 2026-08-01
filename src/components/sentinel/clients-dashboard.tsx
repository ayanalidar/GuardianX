"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Building2, Globe, GitBranch, Shield, Loader2, Search,
  CheckCircle2, Circle, AlertCircle, ArrowRight, Phone, Mail, Trash2,
} from "lucide-react";

interface ClientSummary {
  id: string;
  name: string;
  description: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  target_url: string | null;
  repo_url: string | null;
  scope: string | null;
  authorized: boolean;
  frameworks: string[];
  status: string;
  created_at: string;
  stats: {
    codebases: number;
    targets: number;
    patches: number;
    pending_patches: number;
    approved_patches: number;
    critical_patches: number;
    findings: number;
    critical_findings: number;
  };
}

interface ClientsDashboardProps {
  onSelectClient: (id: string) => void;
  refreshKey?: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; neon: string; icon: typeof Circle }> = {
  onboarding: { label: "Onboarding", color: "text-zinc-400", neon: "", icon: Circle },
  scanning: { label: "Scanning", color: "text-cyan-400", neon: "neon-cyan", icon: AlertCircle },
  testing: { label: "Testing", color: "text-amber-400", neon: "neon-amber", icon: AlertCircle },
  patching: { label: "Patching", color: "text-violet-400", neon: "neon-violet", icon: AlertCircle },
  verifying: { label: "Verifying", color: "text-sky-400", neon: "neon-sky", icon: AlertCircle },
  defending: { label: "Defending", color: "text-rose-400", neon: "neon-rose", icon: Shield },
  compliant: { label: "Compliant", color: "text-emerald-400", neon: "neon-emerald", icon: CheckCircle2 },
};

const PIPELINE_STAGES = ["Onboard", "Scan", "Test", "Patch", "Verify", "Defend", "Comply"];
const STAGE_COLORS = ["emerald", "cyan", "amber", "violet", "sky", "rose", "emerald"];

export function ClientsDashboard({ onSelectClient, refreshKey }: ClientsDashboardProps) {
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/clients");
      const data = await res.json();
      if (Array.isArray(data)) setClients(data);
    } catch {
      // table may not exist yet — show empty state
      setClients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const filtered = clients.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.target_url?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-zinc-50">Client Engagements</h2>
          <p className="text-sm text-zinc-400">
            Each client flows through a 7-stage pipeline: Onboard → Scan → Test → Patch → Verify → Defend → Comply
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search clients…"
              className="border-zinc-800 bg-zinc-900/60 pl-9 text-zinc-200 placeholder:text-zinc-500 focus-visible:border-emerald-500/50"
            />
          </div>
          <Button onClick={() => setAddOpen(true)} className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border">
            <Plus className="size-4" /> Add Client
          </Button>
        </div>
      </div>

      {/* Pipeline legend */}
      <div className="holo-card-sharp hud-corners flex flex-wrap items-center gap-2 p-3">
        <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">Pipeline:</span>
        {PIPELINE_STAGES.map((stage, i) => (
          <div key={stage} className="flex items-center gap-2">
            <span className={`text-xs font-medium text-${STAGE_COLORS[i]}-400`}>
              {i + 1}. {stage}
            </span>
            {i < PIPELINE_STAGES.length - 1 && (
              <ArrowRight className="size-3 text-zinc-600" />
            )}
          </div>
        ))}
      </div>

      {/* Clients grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="holo-card-sharp h-48 animate-pulse bg-zinc-900/40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
            <Building2 className="size-7 text-emerald-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-zinc-200">
            {query ? "No clients match your search" : "No clients yet"}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-400">
            {query
              ? `No results for "${query}".`
              : "Add your first client to start the security pipeline. Each client gets scanned, tested, patched, and defended through all 7 stages."}
          </p>
          {!query && (
            <Button onClick={() => setAddOpen(true)} className="mt-4 bg-emerald-600 text-white hover:bg-emerald-500">
              <Plus className="size-4" /> Add First Client
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c, i) => {
            const statusCfg = STATUS_CONFIG[c.status] || STATUS_CONFIG.onboarding;
            const completedStages = Math.round(
              ([
                c.stats.codebases > 0 || c.authorized,
                c.stats.patches > 0 || c.stats.findings > 0,
                c.stats.findings > 0,
                c.stats.patches > 0,
                c.stats.approved_patches > 0,
                c.authorized,
                c.status === "compliant",
              ].filter(Boolean).length / 7) * 100
            );

            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => onSelectClient(c.id)}
                className="holo-card-sharp hud-corners glow-hover group cursor-pointer border border-emerald-500/20 p-5"
              >
                {/* Header */}
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex size-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                      <Building2 className="size-4 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-zinc-100 group-hover:text-emerald-300">{c.name}</h3>
                      <div className="flex items-center gap-1.5">
                        <statusCfg.icon className={`size-3 ${statusCfg.color}`} />
                        <span className={`text-[10px] font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
                      </div>
                    </div>
                  </div>
                  {c.authorized ? (
                    <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-300">AUTHORIZED</Badge>
                  ) : (
                    <Badge className="border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-300">PENDING AUTH</Badge>
                  )}
                </div>

                {/* Description */}
                {c.description && (
                  <p className="mb-3 line-clamp-2 text-xs text-zinc-400">{c.description}</p>
                )}

                {/* Assets */}
                <div className="mb-3 space-y-1">
                  {c.target_url && (
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                      <Globe className="size-3 text-cyan-400" />
                      <span className="truncate">{c.target_url}</span>
                    </div>
                  )}
                  {c.repo_url && (
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                      <GitBranch className="size-3 text-violet-400" />
                      <span className="truncate">{c.repo_url}</span>
                    </div>
                  )}
                </div>

                {/* Pipeline progress bar */}
                <div className="mb-3">
                  <div className="mb-1 flex items-center justify-between text-[10px]">
                    <span className="font-mono uppercase tracking-widest text-zinc-600">Pipeline</span>
                    <span className={`font-bold ${statusCfg.color}`}>{completedStages}%</span>
                  </div>
                  <div className="flex gap-0.5">
                    {PIPELINE_STAGES.map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-1 flex-1 rounded-full ${
                          idx < Math.floor(completedStages / 14.3)
                            ? `bg-${STAGE_COLORS[idx]}-500`
                            : "bg-zinc-800"
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-4 gap-1.5 border-t border-zinc-800/60 pt-3">
                  <Stat label="Code" value={c.stats.codebases} color="text-sky-400" />
                  <Stat label="Targets" value={c.stats.targets} color="text-red-400" />
                  <Stat label="Patches" value={c.stats.patches} color="text-emerald-400" />
                  <Stat label="Findings" value={c.stats.findings} color="text-amber-400" />
                </div>

                {(c.stats.critical_patches > 0 || c.stats.critical_findings > 0) && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] text-red-300">
                    <AlertCircle className="size-3" />
                    {c.stats.critical_patches + c.stats.critical_findings} critical issue(s)
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add Client Dialog */}
      {addOpen && (
        <AddClientDialog
          onClose={() => setAddOpen(false)}
          onCreated={() => {
            setAddOpen(false);
            load();
            toast({ title: "Client created!", description: "Start by adding codebases or targets." });
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`text-sm font-bold ${color}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</div>
    </div>
  );
}

// ── Add Client Dialog ──────────────────────────────────────────────────────
function AddClientDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    targetUrl: "",
    repoUrl: "",
    scope: "",
    frameworks: [] as string[],
  });

  const ALL_FRAMEWORKS = ["DPDPA", "GDPR", "HIPAA", "PCI-DSS", "ISO 27001", "SOC 2", "NIST"];

  const handleSubmit = async () => {
    if (!form.name) return;
    setLoading(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create client");
      onCreated();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to create client",
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
          <Building2 className="size-5 text-emerald-400" />
          <h2 className="text-lg font-bold text-zinc-50">New Client Engagement</h2>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-zinc-400">Client Name *</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Acme Corp"
              className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-emerald-500/50"
            />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="E-commerce platform with payment processing"
              className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-emerald-500/50"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-zinc-400">Contact Name</Label>
              <Input
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                placeholder="John Doe"
                className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-emerald-500/50"
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Contact Email</Label>
              <Input
                value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                placeholder="john@acme.com"
                className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-emerald-500/50"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs text-zinc-400">Target URL (live app)</Label>
              <Input
                value={form.targetUrl}
                onChange={(e) => setForm({ ...form, targetUrl: e.target.value })}
                placeholder="https://app.acme.com"
                className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-emerald-500/50"
              />
            </div>
            <div>
              <Label className="text-xs text-zinc-400">Repo URL (source code)</Label>
              <Input
                value={form.repoUrl}
                onChange={(e) => setForm({ ...form, repoUrl: e.target.value })}
                placeholder="https://github.com/acme/app"
                className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-emerald-500/50"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Scope (what's in/out of bounds)</Label>
            <textarea
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value })}
              placeholder="All endpoints under app.acme.com. Exclude /admin and payment gateway."
              rows={2}
              className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-emerald-500/50 focus:outline-none"
            />
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Compliance Frameworks</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {ALL_FRAMEWORKS.map((fw) => (
                <button
                  key={fw}
                  type="button"
                  onClick={() => {
                    setForm({
                      ...form,
                      frameworks: form.frameworks.includes(fw)
                        ? form.frameworks.filter((f) => f !== fw)
                        : [...form.frameworks, fw],
                    });
                  }}
                  className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all ${
                    form.frameworks.includes(fw)
                      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 neon-border"
                      : "border-zinc-700 bg-zinc-900/50 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {fw}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !form.name} className="bg-emerald-600 text-white hover:bg-emerald-500">
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Create Client
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
