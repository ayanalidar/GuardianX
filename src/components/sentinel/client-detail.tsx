"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Building2, Globe, GitBranch, Shield, Loader2, CheckCircle2,
  Circle, AlertCircle, Phone, Mail, FileText, Crosshair, Bug, ShieldCheck,
  Swords, Heart, Gavel, Plus, Boxes, Target, ExternalLink,
} from "lucide-react";

interface Stage {
  id: number;
  key: string;
  label: string;
  desc: string;
  status: "pending" | "in-progress" | "completed";
  metrics: Record<string, unknown>;
}

interface ClientDetailData {
  client: { id: string; name: string; status: string; authorized: boolean };
  stages: Stage[];
  progress: number;
  current_stage: string;
  summary: Record<string, number>;
}

interface ClientFullDetail {
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
  codebases: { id: string; name: string; language: string; description: string | null }[];
  targets: { id: string; name: string; base_url: string; authorized: boolean }[];
}

const STAGE_ICONS: Record<string, typeof Circle> = {
  onboarding: Building2,
  scanning: Bug,
  testing: Crosshair,
  patching: ShieldCheck,
  verifying: Swords,
  defending: Shield,
  compliant: Gavel,
};

const STAGE_COLORS: Record<string, { text: string; bg: string; border: string; neon: string }> = {
  onboarding: { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/40", neon: "neon-emerald" },
  scanning:   { text: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/40",    neon: "neon-cyan" },
  testing:    { text: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/40",   neon: "neon-amber" },
  patching:   { text: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/40",  neon: "neon-violet" },
  verifying:  { text: "text-sky-400",     bg: "bg-sky-500/10",     border: "border-sky-500/40",     neon: "neon-sky" },
  defending:  { text: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/40",    neon: "neon-rose" },
  compliant:  { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/40", neon: "neon-emerald" },
};

interface ClientDetailProps {
  clientId: string;
  onBack: () => void;
  onNavigate: (tab: string) => void;
}

export function ClientDetail({ clientId, onBack }: ClientDetailProps) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<ClientFullDetail | null>(null);
  const [pipeline, setPipeline] = useState<ClientDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authorizing, setAuthorizing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, pRes] = await Promise.all([
        fetch(`/api/clients/${clientId}`),
        fetch(`/api/clients/${clientId}/pipeline`),
      ]);
      const d = await dRes.json();
      const p = await pRes.json();
      if (!d.error) setDetail(d);
      if (!p.error) setPipeline(p);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAuthorize = async () => {
    setAuthorizing(true);
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorized: !detail?.authorized }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({
        title: detail?.authorized ? "Authorization revoked" : "Client authorized",
        description: detail?.authorized
          ? "Testing is now blocked until re-authorized."
          : "You can now run SAST + DAST scans on this client.",
      });
      load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      setAuthorizing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-8 animate-spin text-emerald-400" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="size-12 text-red-400" />
        <h3 className="mt-4 text-lg font-semibold text-zinc-200">Client not found</h3>
        <Button onClick={onBack} className="mt-4 bg-emerald-600 text-white hover:bg-emerald-500">
          <ArrowLeft className="size-4" /> Back to Clients
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-zinc-400 hover:text-emerald-400">
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-zinc-50 neon-emerald">{detail.name}</h2>
              {detail.authorized ? (
                <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-300">AUTHORIZED</Badge>
              ) : (
                <Badge className="border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-300">PENDING AUTH</Badge>
              )}
            </div>
            {detail.description && (
              <p className="mt-1 text-sm text-zinc-400">{detail.description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
              {detail.target_url && (
                <a href={detail.target_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-cyan-400">
                  <Globe className="size-3" /> {detail.target_url}
                </a>
              )}
              {detail.repo_url && (
                <a href={detail.repo_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-violet-400">
                  <GitBranch className="size-3" /> {detail.repo_url}
                </a>
              )}
              {detail.contact_email && (
                <a href={`mailto:${detail.contact_email}`} className="flex items-center gap-1 hover:text-emerald-400">
                  <Mail className="size-3" /> {detail.contact_email}
                </a>
              )}
              {detail.contact_phone && (
                <a href={`tel:${detail.contact_phone}`} className="flex items-center gap-1 hover:text-emerald-400">
                  <Phone className="size-3" /> {detail.contact_phone}
                </a>
              )}
            </div>
          </div>
        </div>
        <Button
          onClick={handleAuthorize}
          disabled={authorizing}
          variant={detail.authorized ? "outline" : "default"}
          className={
            detail.authorized
              ? "border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
              : "bg-emerald-600 text-white hover:bg-emerald-500 neon-border"
          }
        >
          {authorizing ? <Loader2 className="size-4 animate-spin" /> : <Shield className="size-4" />}
          {detail.authorized ? "Revoke Auth" : "Authorize Testing"}
        </Button>
      </div>

      {/* Frameworks */}
      {detail.frameworks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-600">Compliance:</span>
          {detail.frameworks.map((fw) => (
            <Badge key={fw} className="border-purple-500/30 bg-purple-500/10 text-[10px] text-purple-300">{fw}</Badge>
          ))}
        </div>
      )}

      {/* Pipeline visualization */}
      {pipeline && (
        <div className="holo-card-sharp hud-corners p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 section-header">Security Pipeline</h3>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-zinc-500">Progress:</span>
              <span className="font-bold text-emerald-400 neon-emerald">{pipeline.progress}%</span>
            </div>
          </div>

          {/* Horizontal pipeline stepper — clickable to launch service */}
          <div className="flex items-center gap-1 overflow-x-auto pb-2">
            {pipeline.stages.map((stage, i) => {
              const cfg = STAGE_COLORS[stage.key] || STAGE_COLORS.onboarding;
              const Icon = STAGE_ICONS[stage.key] || Circle;
              const serviceMap: Record<string, string> = {
                scanning: "scan", testing: "test", patching: "patch",
                verifying: "verify", defending: "defend", compliant: "comply",
              };
              const canLaunch = serviceMap[stage.key] && stage.status !== "completed" && detail.authorized;
              return (
                <div key={stage.id} className="flex items-center">
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.08 }}
                    onClick={async () => {
                      if (!canLaunch) return;
                      const service = serviceMap[stage.key];
                      try {
                        const res = await fetch("/api/launch-service", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ service, clientIds: [clientId] }),
                        });
                        const data = await res.json();
                        toast({ title: `${stage.label} launched`, description: data.message });
                        load();
                      } catch {
                        toast({ variant: "destructive", title: "Launch failed" });
                      }
                    }}
                    disabled={!canLaunch}
                    className={`flex min-w-[120px] flex-col items-center rounded-lg border ${cfg.border} ${cfg.bg} p-3 text-center transition-all ${canLaunch ? "cursor-pointer hover:scale-105 hover:border-emerald-500/60" : ""} disabled:cursor-not-allowed`}
                    title={canLaunch ? `Click to launch ${stage.label}` : stage.status === "completed" ? "Completed" : "Not ready"}
                  >
                    <div className={`mb-1 flex size-8 items-center justify-center rounded-full border ${cfg.border} bg-zinc-950/60`}>
                      {stage.status === "completed" ? (
                        <CheckCircle2 className={`size-5 ${cfg.text}`} />
                      ) : stage.status === "in-progress" ? (
                        <Icon className={`size-4 ${cfg.text} animate-pulse`} />
                      ) : (
                        <Icon className="size-4 text-zinc-600" />
                      )}
                    </div>
                    <div className={`text-[11px] font-bold ${stage.status !== "pending" ? cfg.text : "text-zinc-500"}`}>
                      {i + 1}. {stage.label}
                    </div>
                    <div className="mt-0.5 text-[9px] text-zinc-600">{stage.desc}</div>
                    {/* Metrics */}
                    {stage.status !== "pending" && Object.keys(stage.metrics).length > 0 && (
                      <div className="mt-1.5 flex flex-wrap justify-center gap-1">
                        {Object.entries(stage.metrics).map(([k, v]) => (
                          <span key={k} className="rounded bg-zinc-900/60 px-1 text-[8px] text-zinc-500">
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.button>
                  {i < pipeline.stages.length - 1 && (
                    <div className={`mx-0.5 h-0.5 w-4 ${stage.status === "completed" ? "bg-emerald-500" : "bg-zinc-800"}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Summary bar */}
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-800/60 pt-3 sm:grid-cols-4 lg:grid-cols-7">
            <PipelineStat label="Codebases" value={pipeline.summary.codebases} color="text-sky-400" icon={Boxes} />
            <PipelineStat label="Targets" value={pipeline.summary.targets} color="text-red-400" icon={Target} />
            <PipelineStat label="Scans" value={pipeline.summary.scans} color="text-cyan-400" icon={Bug} />
            <PipelineStat label="Patches" value={pipeline.summary.patches} color="text-emerald-400" icon={ShieldCheck} />
            <PipelineStat label="Findings" value={pipeline.summary.findings} color="text-amber-400" icon={AlertCircle} />
            <PipelineStat label="Critical" value={pipeline.summary.critical_findings} color="text-red-400" icon={AlertCircle} />
            <PipelineStat label="Canaries" value={pipeline.summary.canaries} color="text-rose-400" icon={Shield} />
          </div>
        </div>
      )}

      {/* Assets */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Codebases */}
        <div className="holo-card-sharp hud-corners p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 section-header">Codebases (SAST)</h3>
            <Button size="sm" variant="outline" className="border-sky-500/30 bg-sky-500/5 text-sky-300 hover:bg-sky-500/10">
              <Plus className="size-3" /> Add
            </Button>
          </div>
          {detail.codebases.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-500">No codebases yet. Add source code to run SAST scans.</p>
          ) : (
            <div className="space-y-2">
              {detail.codebases.map((cb) => (
                <div key={cb.id} className="flex items-center gap-2 rounded-md border border-sky-500/20 bg-sky-500/5 p-2">
                  <FileText className="size-4 text-sky-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-zinc-200">{cb.name}</div>
                    {cb.description && <div className="truncate text-[10px] text-zinc-500">{cb.description}</div>}
                  </div>
                  <Badge className="border-sky-500/30 bg-sky-500/10 text-[9px] text-sky-300">{cb.language}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Targets */}
        <div className="holo-card-sharp hud-corners p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-zinc-100 section-header">Live Targets (DAST)</h3>
            <Button size="sm" variant="outline" className="border-red-500/30 bg-red-500/5 text-red-300 hover:bg-red-500/10">
              <Plus className="size-3" /> Add
            </Button>
          </div>
          {detail.targets.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-500">No targets yet. Add a live URL to run DAST VAPT.</p>
          ) : (
            <div className="space-y-2">
              {detail.targets.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/5 p-2">
                  <Globe className="size-4 text-red-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-zinc-200">{t.name}</div>
                    <div className="truncate text-[10px] text-zinc-500">{t.base_url}</div>
                  </div>
                  {t.authorized ? (
                    <Badge className="border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-300">AUTH</Badge>
                  ) : (
                    <Badge className="border-amber-500/30 bg-amber-500/10 text-[9px] text-amber-300">PENDING</Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions per stage */}
      <div className="holo-card-sharp hud-corners p-5">
        <h3 className="mb-3 text-sm font-bold text-zinc-100 section-header">Pipeline Actions</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <ActionButton label="Run SAST Scan" desc="Scan all codebases" icon={Bug} color="cyan" onClick={() => {}} disabled={!detail.authorized || detail.codebases.length === 0} />
          <ActionButton label="Run DAST VAPT" desc="Attack all targets" icon={Crosshair} color="red" onClick={() => {}} disabled={!detail.authorized || detail.targets.length === 0} />
          <ActionButton label="Generate VAPT Report" desc="15-page PDF" icon={FileText} color="emerald" onClick={() => {}} disabled={pipeline?.summary.findings === 0} />
          <ActionButton label="Deploy Canaries" desc="Exfil defense" icon={Shield} color="rose" onClick={() => {}} disabled={!detail.authorized || detail.targets.length === 0} />
        </div>
      </div>

      {/* Scope */}
      {detail.scope && (
        <div className="holo-card-sharp hud-corners p-5">
          <h3 className="mb-2 text-sm font-bold text-zinc-100 section-header">Engagement Scope</h3>
          <p className="text-xs text-zinc-400">{detail.scope}</p>
        </div>
      )}
    </div>
  );
}

function PipelineStat({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: typeof Circle }) {
  return (
    <div className="flex flex-col items-center rounded-md border border-zinc-800 bg-zinc-900/40 p-2">
      <Icon className={`size-3 ${color}`} />
      <div className={`mt-1 text-sm font-bold ${color}`}>{value}</div>
      <div className="text-[8px] uppercase tracking-wider text-zinc-600">{label}</div>
    </div>
  );
}

function ActionButton({
  label, desc, icon: Icon, color, onClick, disabled,
}: {
  label: string;
  desc: string;
  icon: typeof Circle;
  color: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const colorMap: Record<string, { text: string; border: string; bg: string; hover: string }> = {
    cyan: { text: "text-cyan-400", border: "border-cyan-500/30", bg: "bg-cyan-500/5", hover: "hover:bg-cyan-500/10" },
    red: { text: "text-red-400", border: "border-red-500/30", bg: "bg-red-500/5", hover: "hover:bg-red-500/10" },
    emerald: { text: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/5", hover: "hover:bg-emerald-500/10" },
    rose: { text: "text-rose-400", border: "border-rose-500/30", bg: "bg-rose-500/5", hover: "hover:bg-rose-500/10" },
  };
  const c = colorMap[color] || colorMap.cyan;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 rounded-lg border ${c.border} ${c.bg} ${c.hover} p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40`}
    >
      <Icon className={`size-4 ${c.text}`} />
      <div>
        <div className="text-xs font-bold text-zinc-200">{label}</div>
        <div className="text-[10px] text-zinc-500">{desc}</div>
      </div>
    </button>
  );
}
