"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  sentinelApi,
  type Target,
  type Engagement,
  type Finding,
} from "@/lib/sentinel/api";
import { useEngagementSocket } from "@/lib/sentinel/use-engagement-socket";
import { AttackStream } from "./attack-stream";
import { ThreatRadar } from "./threat-radar";
import { FindingDialog } from "./finding-dialog";
import {
  AlertTriangle,
  Crosshair,
  FileDown,
  Loader2,
  Plus,
  ShieldCheck,
  ShieldX,
  Skull,
  Target as TargetIcon,
  Trash2,
  Zap,
  Globe,
  Activity,
} from "lucide-react";

export function RedAgentPanel() {
  const { toast } = useToast();
  const [targets, setTargets] = useState<Target[]>([]);
  const [engagements, setEngagements] = useState<Engagement[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [activeEngagement, setActiveEngagement] = useState<Engagement | null>(null);
  const [running, setRunning] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [findingOpen, setFindingOpen] = useState(false);

  const { connected, events } = useEngagementSocket({
    engagementId: activeEngagement?.id ?? null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, e] = await Promise.all([
        sentinelApi.listTargets(),
        sentinelApi.listEngagements(),
      ]);
      setTargets(t);
      setEngagements(e);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load",
        description: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll active engagement status + load findings when it completes
  useEffect(() => {
    if (!running || !activeEngagement) return;
    const id = setInterval(async () => {
      try {
        const list = await sentinelApi.listEngagements();
        const found = list.find((x) => x.id === activeEngagement.id);
        if (found) {
          setActiveEngagement(found);
          if (found.status === "completed" || found.status === "failed") {
            setRunning(false);
            const f = await sentinelApi.getFindings(found.id);
            setFindings(f);
            load();
            toast({
              title: found.status === "completed" ? "Engagement complete" : "Engagement failed",
              description:
                found.status === "completed"
                  ? `${found.finding_count} finding(s) confirmed.`
                  : found.stage_label ?? "error",
            });
          }
        }
      } catch {
        /* ignore */
      }
    }, 2500);
    return () => clearInterval(id);
  }, [running, activeEngagement, load, toast]);

  const handleStart = useCallback(
    async (target: Target) => {
      if (!target.authorized) {
        toast({
          variant: "destructive",
          title: "Not authorized",
          description: "Authorize this target before testing.",
        });
        return;
      }
      setRunning(true);
      setFindings([]);
      try {
        const { engagementId } = await sentinelApi.startEngagement(target.id);
        const list = await sentinelApi.listEngagements();
        const found = list.find((x) => x.id === engagementId);
        setActiveEngagement(
          found ?? {
            id: engagementId,
            status: "queued",
            stage_label: "Queued",
            started_at: new Date().toISOString(),
            completed_at: null,
            target: { name: target.name, baseUrl: target.base_url },
            finding_count: 0,
          }
        );
        toast({
          title: "Engagement started",
          description: `RedAgent is attacking ${target.name}.`,
        });
      } catch (err) {
        setRunning(false);
        toast({
          variant: "destructive",
          title: "Failed to start",
          description: err instanceof Error ? err.message : "unknown",
        });
      }
    },
    [toast]
  );

  const handleAuthorize = async (target: Target) => {
    try {
      await sentinelApi.authorizeTarget(target.id);
      toast({
        title: "Target authorized",
        description: `${target.name} can now be tested.`,
      });
      load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: err instanceof Error ? err.message : "unknown",
      });
    }
  };

  const handleDelete = async (target: Target) => {
    try {
      await sentinelApi.deleteTarget(target.id);
      load();
      toast({ title: "Target deleted" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: err instanceof Error ? err.message : "unknown",
      });
    }
  };

  const handleViewFindings = async (eng: Engagement) => {
    try {
      const f = await sentinelApi.getFindings(eng.id);
      setFindings(f);
      setActiveEngagement(eng);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: err instanceof Error ? err.message : "unknown",
      });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
            <Crosshair className="size-5 text-red-400 neon-red" />
            RedAgent VAPT
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Autonomous penetration testing against live targets. The AI crawls,
            plans attacks, fires real HTTP payloads, and confirms exploitation.
          </p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="bg-red-600 text-white hover:bg-red-500 neon-border-red"
        >
          <Plus className="size-4" />
          Add Target
        </Button>
      </div>

      {/* Status bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatusCard label="Targets" value={targets.length} icon={TargetIcon} color="red" />
        <StatusCard label="Engagements" value={engagements.length} icon={Activity} color="cyan" />
        <StatusCard label="Findings" value={findings.length} icon={Skull} color="amber" />
        <StatusCard label="Live" value={running ? "ACTIVE" : "IDLE"} icon={Zap} color={running ? "emerald" : "zinc"} pulse={running} />
      </div>

      {/* Demo target hint */}
      <div className="holo-card-sharp hud-corners flex items-start gap-2 border-sky-500/30 p-3 text-xs text-zinc-300">
        <Zap className="mt-0.5 size-3.5 shrink-0 text-sky-400" />
        <div>
          Built-in vulnerable target at{" "}
          <code className="rounded bg-zinc-800 px-1 font-mono text-sky-300">
            http://localhost:3004
          </code>{" "}
          (VulnShop — SQLi, XSS, IDOR, path traversal, open redirect, .env leak).
        </div>
      </div>

      {/* Main grid: responsive — no overflow */}
      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        {/* LEFT: targets + findings + past engagements */}
        <section className="space-y-4 min-w-0">
          {/* Targets */}
          <div className="holo-card-sharp hud-corners p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="section-header text-sm font-bold text-red-300">
                <TargetIcon className="inline size-4 mr-1" />
                Targets ({targets.length})
              </h3>
            </div>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full bg-zinc-800/60" />
                ))}
              </div>
            ) : targets.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/50 p-8 text-center text-sm text-zinc-500">
                No targets yet. Add one to start a VAPT engagement.
              </div>
            ) : (
              <div className="space-y-2">
                {targets.map((t) => (
                  <TargetCard
                    key={t.id}
                    target={t}
                    onAttack={() => handleStart(t)}
                    onAuthorize={() => handleAuthorize(t)}
                    onDelete={() => handleDelete(t)}
                    busy={running}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Findings */}
          {findings.length > 0 && (
            <div className="holo-card-sharp hud-corners p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="section-header text-sm font-bold text-amber-300">
                  <Skull className="inline size-4 mr-1" />
                  Findings ({findings.length})
                </h3>
                {activeEngagement && findings.length > 0 && (
                  <a
                    href={sentinelApi.reportUrl(activeEngagement.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 bg-emerald-600/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-600/20"
                  >
                    <FileDown className="size-3" />
                    VAPT Report (PDF)
                  </a>
                )}
              </div>
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {findings.map((f) => (
                    <motion.button
                      key={f.id}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      onClick={() => {
                        setSelectedFinding(f);
                        setFindingOpen(true);
                      }}
                      className="group w-full overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/80 p-3 text-left transition-colors hover:border-red-500/50 hover:bg-zinc-800/80"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <FindingSeverityBadge severity={f.severity} />
                            <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                              {f.category}
                            </span>
                          </div>
                          <h4 className="mt-1 text-sm font-medium text-zinc-100">
                            {f.title}
                          </h4>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">
                            {f.method} {f.endpoint}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <span
                            className={`text-xs font-semibold ${
                              f.confidence >= 0.8
                                ? "text-emerald-300"
                                : f.confidence >= 0.5
                                  ? "text-amber-300"
                                  : "text-red-300"
                            }`}
                          >
                            {Math.round(f.confidence * 100)}%
                          </span>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Past engagements */}
          {!running && engagements.length > 0 && (
            <div className="holo-card-sharp hud-corners p-4">
              <h3 className="mb-2 section-header text-sm font-bold text-zinc-300">
                Past Engagements
              </h3>
              <div className="space-y-1.5">
                {engagements.slice(0, 5).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => handleViewFindings(e)}
                    className="flex w-full items-center justify-between overflow-hidden rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-left text-xs transition-colors hover:bg-zinc-800/80"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <EngagementDot status={e.status} />
                      <span className="truncate text-zinc-300">{e.target.name}</span>
                      <span className="text-zinc-600">·</span>
                      <span className="text-zinc-500 shrink-0">
                        {e.finding_count} finding{e.finding_count === 1 ? "" : "s"}
                      </span>
                    </div>
                    <span className="shrink-0 text-[10px] text-zinc-600">
                      {new Date(e.started_at).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT: threat radar + live attack stream */}
        <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start min-w-0">
          {findings.length > 0 && (
            <div className="holo-card-sharp hud-corners p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-red-400/70">
                  Threat Scope
                </span>
                <span className="font-mono text-[9px] text-red-500/50">
                  {findings.length} blips
                </span>
              </div>
              <ThreatRadar findings={findings} active={running} />
            </div>
          )}
          <AttackStream
            events={events}
            connected={connected}
            active={running}
            status={activeEngagement?.status}
            stageLabel={activeEngagement?.stage_label}
          />
        </aside>
      </div>

      <AddTargetDialog open={addOpen} onOpenChange={setAddOpen} onAdded={load} />
      <FindingDialog finding={selectedFinding} open={findingOpen} onOpenChange={setFindingOpen} />
    </div>
  );
}

// ── Status Card ────────────────────────────────────────────────────────────
function StatusCard({ label, value, icon: Icon, color, pulse }: {
  label: string;
  value: number | string;
  icon: typeof Activity;
  color: "red" | "cyan" | "amber" | "emerald" | "zinc";
  pulse?: boolean;
}) {
  const colorMap = {
    red: { text: "text-red-400", border: "border-red-500/40", bg: "bg-red-500/10" },
    cyan: { text: "text-cyan-400", border: "border-cyan-500/40", bg: "bg-cyan-500/10" },
    amber: { text: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-500/10" },
    emerald: { text: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10" },
    zinc: { text: "text-zinc-400", border: "border-zinc-600/40", bg: "bg-zinc-700/10" },
  };
  const c = colorMap[color];
  return (
    <div className={`holo-card-sharp hud-corners flex items-center gap-3 border ${c.border} p-3`}>
      <div className={`flex size-8 items-center justify-center rounded-lg border ${c.border} ${c.bg} ${pulse ? "animate-pulse" : ""}`}>
        <Icon className={`size-4 ${c.text}`} />
      </div>
      <div className="min-w-0">
        <div className={`text-lg font-bold ${c.text}`}>{value}</div>
        <div className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
      </div>
    </div>
  );
}

function TargetCard({
  target,
  onAttack,
  onAuthorize,
  onDelete,
  busy,
}: {
  target: Target;
  onAttack: () => void;
  onAuthorize: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-red-500/30 bg-zinc-900/80 backdrop-blur-sm">
      <div className="flex items-start gap-3 p-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 text-red-400">
          <Globe className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-zinc-100">
              {target.name}
            </h3>
            {target.authorized ? (
              <Badge className="border border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-300">
                <ShieldCheck className="size-2.5" />
                Authorized
              </Badge>
            ) : (
              <Badge className="border border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300">
                <ShieldX className="size-2.5" />
                Not authorized
              </Badge>
            )}
            {target.auth_header_set && (
              <Badge className="border border-zinc-600 bg-zinc-700/40 text-[10px] text-zinc-400">
                auth header
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate font-mono text-xs text-zinc-400">
            {target.base_url}
          </p>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {target.engagement_count} engagement{target.engagement_count === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <div className="flex gap-2 border-t border-zinc-700/60 px-3 py-2">
        {target.authorized ? (
          <Button
            size="sm"
            onClick={onAttack}
            disabled={busy}
            className="h-7 flex-1 bg-red-600 text-white hover:bg-red-500"
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <Crosshair className="size-3" />}
            {busy ? "Running…" : "Start VAPT"}
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={onAuthorize}
            className="h-7 flex-1 border-emerald-600 bg-emerald-600/10 text-emerald-300 hover:bg-emerald-600/20"
            variant="outline"
          >
            <ShieldCheck className="size-3" />
            Authorize
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          onClick={onDelete}
          className="size-7 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function AddTargetDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [authHeader, setAuthHeader] = useState("");
  const [notes, setNotes] = useState("");
  const [authorized, setAuthorized] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setBaseUrl("");
    setAuthHeader("");
    setNotes("");
    setAuthorized(false);
  };

  const handleAdd = async () => {
    if (!name.trim() || !baseUrl.trim()) return;
    setSaving(true);
    try {
      const r = await sentinelApi.addTarget({
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        authHeader: authHeader.trim() || undefined,
        notes: notes.trim() || undefined,
        authorized,
      });
      toast({ title: "Target added", description: r.message });
      reset();
      onOpenChange(false);
      onAdded();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed",
        description: err instanceof Error ? err.message : "unknown",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden border-zinc-700 bg-zinc-950/95 p-0 text-zinc-100 backdrop-blur-xl sm:max-w-lg">
        <DialogHeader className="gap-2 border-b border-zinc-800 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base text-zinc-50">
            <TargetIcon className="size-4 text-red-400" />
            Add VAPT Target
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            Add a live target for RedAgent to attack. You must confirm
            authorization.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-2">
            <Label className="text-xs text-zinc-400">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VulnShop (local)"
              className="border-zinc-700 bg-zinc-900/80 text-sm text-zinc-200 placeholder:text-zinc-600"
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-xs text-zinc-400">Base URL</Label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:3004"
              className="border-zinc-700 bg-zinc-900/80 font-mono text-sm text-zinc-200 placeholder:text-zinc-600"
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-xs text-zinc-400">
              Authorization Header (optional)
            </Label>
            <Input
              value={authHeader}
              onChange={(e) => setAuthHeader(e.target.value)}
              placeholder="Bearer eyJhbGci…"
              className="border-zinc-700 bg-zinc-900/80 font-mono text-xs text-zinc-200 placeholder:text-zinc-600"
            />
            <p className="text-[11px] text-zinc-500">
              For authenticated scanning. Sent as the Authorization header.
            </p>
          </div>
          <div className="grid gap-2">
            <Label className="text-xs text-zinc-400">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Staging environment, owned by Acme Corp…"
              className="min-h-[3rem] resize-none border-zinc-700 bg-zinc-900/80 text-sm text-zinc-200 placeholder:text-zinc-600"
            />
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <Switch checked={authorized} onCheckedChange={setAuthorized} />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-300">
                <AlertTriangle className="size-3" />
                I am authorized to test this target
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                You confirm you own or have written permission to pentest this
                target. Unauthorized testing is illegal.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-zinc-800 bg-zinc-950/80 px-5 py-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleAdd}
            disabled={saving || !name.trim() || !baseUrl.trim()}
            className="bg-red-600 text-white hover:bg-red-500"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Add Target
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FindingSeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: "border-red-500/40 bg-red-500/15 text-red-300",
    high: "border-orange-500/40 bg-orange-500/15 text-orange-300",
    medium: "border-amber-500/40 bg-amber-500/15 text-amber-300",
    low: "border-sky-500/40 bg-sky-500/15 text-sky-300",
    info: "border-zinc-600 bg-zinc-700/40 text-zinc-300",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
        map[severity] ?? map.info
      }`}
    >
      {severity}
    </span>
  );
}

function EngagementDot({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "bg-emerald-400"
      : status === "failed"
        ? "bg-red-400"
        : "bg-amber-400 animate-pulse";
  return <span className={`size-1.5 shrink-0 rounded-full ${color}`} />;
}
