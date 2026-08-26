// @ts-nocheck
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  sentinelApi,
  type ComplianceStatus,
  type DataPrivacyStatus,
  type BreachNotificationStatus,
  type FrameworkId,
  type SectionStatus,
  type ControlStatus,
  type AutomatedCheckResult,
  type GapItem,
  type GapAnalysisResponse,
} from "@/lib/sentinel/api";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Gavel,
  Globe,
  Heart,
  Lock,
  Mail,
  Shield,
  ShieldCheck,
  ShieldX,
  XCircle,
  Copy,
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  ChevronRight,
} from "lucide-react";
import { motion } from "framer-motion";

const SECTION_STATUS_STYLE: Record<string, string> = {
  compliant: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  violated: "border-red-500/40 bg-red-500/10 text-red-300",
  "at-risk": "border-amber-500/40 bg-amber-500/10 text-amber-300",
  "pending-review": "border-sky-500/40 bg-sky-500/10 text-sky-300",
  "not-assessed": "border-zinc-700 bg-zinc-800/40 text-zinc-500",
};

const CHECK_STATUS_STYLE: Record<string, string> = {
  pass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  fail: "border-red-500/40 bg-red-500/10 text-red-300",
  manual: "border-amber-500/40 bg-amber-500/10 text-amber-300",
};

const CHECK_STATUS_DOT: Record<string, string> = {
  pass: "bg-emerald-400",
  fail: "bg-red-400",
  manual: "bg-amber-400",
};

const FRAMEWORK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  shield: ShieldCheck,
  globe: Globe,
  heart: Heart,
  "credit-card": Lock,
  award: Shield,
  "check-shield": ShieldCheck,
};

const IMPACT_STYLE: Record<string, string> = {
  high: "border-red-500/40 bg-red-500/10 text-red-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  low: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
};

const EFFORT_STYLE: Record<string, string> = {
  low: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300/80",
  medium: "border-amber-500/30 bg-amber-500/5 text-amber-300/80",
  high: "border-red-500/30 bg-red-500/5 text-red-300/80",
};

// ── Circular score gauge ───────────────────────────────────────────────────
function ScoreGauge({ score, level }: { score: number; level: string }) {
  const color = score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  return (
    <div className="relative flex size-24 items-center justify-center">
      <svg className="size-24 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="#27272a" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-mono text-xl font-bold" style={{ color }}>{score}</span>
        <span className="font-mono text-[8px] uppercase tracking-widest text-zinc-500">
          {level}
        </span>
      </div>
    </div>
  );
}

// ── Control evidence dialog ────────────────────────────────────────────────
function ControlDialog({
  control,
  open,
  onOpenChange,
}: {
  control: ControlStatus | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  if (!control) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-100 sm:max-w-3xl">
        <DialogHeader className="gap-2 border-b border-zinc-800 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base text-emerald-400">
            <Shield className="size-4" />
            {control.title}
            <Badge className={`border ${CHECK_STATUS_STYLE[control.status]}`}>
              {control.status.toUpperCase()}
            </Badge>
            <span className="ml-auto font-mono text-[10px] text-zinc-500">
              {control.ref} · Score {control.score}/100
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="custom-scrollbar max-h-[calc(92vh-8rem)] overflow-y-auto p-5 space-y-4">
          {/* Evidence list */}
          <div>
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
              Automated Evidence ({control.evidence.length})
            </div>
            <div className="space-y-2">
              {control.evidence.map((e: AutomatedCheckResult) => (
                <div
                  key={e.id}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3"
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className={`size-2 rounded-full ${CHECK_STATUS_DOT[e.status]}`} />
                    <Badge className={`border ${CHECK_STATUS_STYLE[e.status]} text-[9px]`}>
                      {e.status.toUpperCase()}
                    </Badge>
                    <span className="text-xs font-medium text-zinc-200">{e.description}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-zinc-400">{e.evidence}</p>
                  <div className="mt-1 flex items-center gap-3 font-mono text-[9px] text-zinc-600">
                    <span>type: {e.checkType}</span>
                    <span>·</span>
                    <span>checked: {new Date(e.collectedAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Manual evidence */}
          {control.requiredEvidence.length > 0 && (
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-amber-500/60">
                Manual Evidence Required
              </div>
              <ul className="space-y-1">
                {control.requiredEvidence.map((m: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-zinc-400">
                    <ChevronRight className="mt-0.5 size-3 shrink-0 text-amber-400/60" />
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          {control.recommendations.length > 0 && (
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
                Recommendations
              </div>
              <ul className="space-y-1">
                {control.recommendations.map((r: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-[11px] text-emerald-300/80">
                    <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Framework tree tab ─────────────────────────────────────────────────────
function FrameworkTree({
  sections,
  onSelectControl,
}: {
  sections: SectionStatus[];
  onSelectControl: (c: ControlStatus) => void;
}) {
  return (
    <div className="space-y-3">
      <Accordion type="multiple" defaultValue={[sections[0]?.id]}>
        {sections.map((s) => {
          const passCount = s.controls.filter((c) => c.status === "pass").length;
          const failCount = s.controls.filter((c) => c.status === "fail").length;
          const manualCount = s.controls.filter((c) => c.status === "manual").length;
          const totalChecks = s.controls.reduce((acc, c) => acc + c.evidence.length, 0);
          return (
            <AccordionItem
              key={s.id}
              value={s.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/30 px-4 last:border-b"
            >
              <AccordionTrigger className="hover:no-underline">
                <div className="flex w-full items-center gap-3 pr-3">
                  <Badge className={`border ${CHECK_STATUS_STYLE[s.status]} text-[9px]`}>
                    {s.status.toUpperCase()}
                  </Badge>
                  <span className="font-mono text-xs text-emerald-400">{s.section}</span>
                  <span className="text-sm font-medium text-zinc-100">{s.title}</span>
                  <div className="ml-auto flex items-center gap-2 text-[10px] text-zinc-500">
                    <span className="font-mono">{s.score}/100</span>
                    <span className="flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-emerald-400" />{passCount}
                    </span>
                    {failCount > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-red-400" />{failCount}
                      </span>
                    )}
                    {manualCount > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="size-1.5 rounded-full bg-amber-400" />{manualCount}
                      </span>
                    )}
                    <span className="font-mono text-zinc-600">· {totalChecks} checks</span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <p className="mb-3 text-[11px] leading-relaxed text-zinc-500">{s.description}</p>
                <div className="grid gap-2">
                  {s.controls.map((c) => {
                    const evidenceCount = c.evidence.length;
                    const lastChecked = new Date(c.lastChecked).toLocaleString();
                    return (
                      <button
                        key={c.id}
                        onClick={() => onSelectControl(c)}
                        className="group flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2 text-left transition-colors hover:border-emerald-500/30 hover:bg-emerald-500/5"
                      >
                        <span className={`size-2 shrink-0 rounded-full ${CHECK_STATUS_DOT[c.status]}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-xs font-medium text-zinc-200">
                              {c.title}
                            </span>
                            <span className="font-mono text-[9px] text-zinc-600">{c.ref}</span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 font-mono text-[9px] text-zinc-600">
                            <span>{evidenceCount} evidence</span>
                            <span>·</span>
                            <span>score {c.score}/100</span>
                            <span>·</span>
                            <span>checked {lastChecked}</span>
                          </div>
                        </div>
                        <ChevronRight className="size-3 shrink-0 text-zinc-700 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-400" />
                      </button>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}

// ── Gap analysis tab ───────────────────────────────────────────────────────
function GapAnalysisPanel({ gaps }: { gaps: GapItem[] }) {
  const quickWins = gaps.filter((g) => g.impact === "high" && g.effort === "low");
  if (gaps.length === 0) {
    return (
      <Card className="holo-card hud-corners gap-0 rounded-xl p-8 text-center">
        <CheckCircle2 className="mx-auto size-10 text-emerald-400" />
        <div className="mt-3 text-sm font-bold text-emerald-300">No gaps detected</div>
        <div className="mt-1 text-xs text-zinc-500">
          All automated checks pass. Continue collecting manual evidence.
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {/* Quick wins banner */}
      {quickWins.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3"
        >
          <Target className="size-5 text-emerald-400" />
          <div>
            <div className="text-sm font-bold text-emerald-300">
              {quickWins.length} quick win{quickWins.length > 1 ? "s" : ""} available
            </div>
            <div className="text-[11px] text-emerald-300/70">
              High-impact gaps that take low effort to fix — close these first.
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid gap-2">
        {gaps.map((g, i) => (
          <motion.div
            key={`${g.sectionId}-${g.controlId}-${i}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
            className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3"
          >
            <div className="mb-1.5 flex items-center gap-2">
              <Badge className={`border ${IMPACT_STYLE[g.impact]} text-[9px]`}>
                {g.impact.toUpperCase()} IMPACT
              </Badge>
              <Badge className={`border ${EFFORT_STYLE[g.effort]} text-[9px]`}>
                {g.effort.toUpperCase()} EFFORT
              </Badge>
              <span className="font-mono text-[10px] text-emerald-400">{g.section}</span>
              <span className="text-xs text-zinc-400">{g.sectionTitle}</span>
              <span className="ml-auto truncate font-mono text-[9px] text-zinc-600">{g.controlId}</span>
            </div>
            <div className="mb-1 text-xs font-medium text-zinc-200">{g.controlTitle}</div>
            <p className="text-[11px] leading-relaxed text-zinc-400">{g.gap}</p>
            <div className="mt-1.5 flex items-start gap-1.5 rounded border border-emerald-500/20 bg-emerald-500/5 p-1.5">
              <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-400" />
              <span className="text-[10px] text-emerald-300/80">{g.recommendation}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Score breakdown transparency card ──────────────────────────────────────
function ScoreBreakdownCard({
  score,
  automatedPassRate,
  manualScore,
  remediationScore,
}: {
  score: number;
  automatedPassRate: number;
  manualScore: number;
  remediationScore: number;
}) {
  const rows = [
    { label: "Automated checks pass rate", value: automatedPassRate, weight: 60 },
    { label: "Manual activity score", value: manualScore, weight: 20 },
    { label: "Remediation score", value: remediationScore, weight: 20 },
  ];
  return (
    <Card className="holo-card hud-corners gap-0 rounded-xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="size-4 text-emerald-400" />
        <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
          Score Breakdown (transparent)
        </span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-zinc-400">{r.label}</span>
              <span className="font-mono text-zinc-300">
                {r.value}% <span className="text-zinc-600">× {r.weight}%</span>
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${r.value}%`,
                  background: r.value >= 80 ? "#10b981" : r.value >= 50 ? "#f59e0b" : "#ef4444",
                }}
              />
            </div>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between border-t border-zinc-800 pt-2">
          <span className="text-xs font-bold text-zinc-300">Final weighted score</span>
          <span className="font-mono text-base font-bold" style={{ color: score >= 80 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444" }}>
            {score}/100
          </span>
        </div>
      </div>
    </Card>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export function ComplianceDashboard() {
  const { toast } = useToast();
  const [compliance, setCompliance] = useState<ComplianceStatus | null>(null);
  const [privacy, setPrivacy] = useState<DataPrivacyStatus | null>(null);
  const [breach, setBreach] = useState<BreachNotificationStatus | null>(null);
  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [breachDialogOpen, setBreachDialogOpen] = useState(false);
  const [breachDraft, setBreachDraft] = useState<string>("");
  const [selectedFramework, setSelectedFramework] = useState<FrameworkId>("DPDPA");
  const [activeTab, setActiveTab] = useState<string>("framework");
  const [selectedControl, setSelectedControl] = useState<ControlStatus | null>(null);
  const [controlDialogOpen, setControlDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previousScore, setPreviousScore] = useState<number | null>(null);

  const load = useCallback(async (framework: FrameworkId) => {
    try {
      const [c, p, b, g] = await Promise.all([
        sentinelApi.compliance(framework),
        sentinelApi.dataPrivacy(),
        sentinelApi.breachNotification(),
        sentinelApi.gapAnalysis(framework),
      ]);
      setCompliance(c);
      setPrivacy(p);
      setBreach(b);
      setGapAnalysis(g);
      // Persist previous score for trend display.
      try {
        const key = `guardianx-compliance-score-${framework}`;
        const prev = localStorage.getItem(key);
        if (prev) {
          const parsed = parseInt(prev, 10);
          if (!isNaN(parsed)) setPreviousScore(parsed);
        }
        if (c?.framework_detail) {
          localStorage.setItem(key, String(c.framework_detail.score));
        }
      } catch {
        /* localStorage unavailable */
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(selectedFramework);
    const id = setInterval(() => load(selectedFramework), 60_000);
    return () => clearInterval(id);
  }, [load, selectedFramework]);

  const handleSelectControl = useCallback((c: ControlStatus) => {
    setSelectedControl(c);
    setControlDialogOpen(true);
  }, []);

  const handleExport = useCallback(async (format: "html" | "json") => {
    setExporting(true);
    try {
      const url = sentinelApi.complianceExportUrl(selectedFramework, format);
      if (format === "html") {
        // Open in new tab — printable HTML report.
        window.open(url, "_blank");
      } else {
        // Download JSON.
        const res = await fetch(url, { credentials: "same-origin" });
        const blob = await res.blob();
        const dlUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = dlUrl;
        a.download = `guardianx-compliance-${selectedFramework.toLowerCase()}-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(dlUrl);
      }
      toast({ title: `Exported ${format.toUpperCase()} report` });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Export failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setExporting(false);
    }
  }, [selectedFramework, toast]);

  const frameworkDetail = compliance?.framework_detail;
  const scoreBreakdown = compliance?.score_breakdown;
  const gapItems = useMemo(() => gapAnalysis?.gaps ?? [], [gapAnalysis]);

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 bg-emerald-500/10" />
        ))}
      </div>
    );
  }

  const trendDelta =
    previousScore !== null && frameworkDetail
      ? frameworkDetail.score - previousScore
      : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
            <span className="size-1.5 rounded-full bg-emerald-500 pulse-dot" />
            guardianx@compliance:~$
          </div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50 neon-emerald">
            <Gavel className="size-5 text-emerald-400" />
            GRC & Compliance Center
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Multi-framework compliance with automated evidence collection, real-time scoring, gap analysis, and audit-ready export. DPDPA 2023 · ISO 27001 · SOC 2.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Framework selector */}
          <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1 text-xs">
            {(["DPDPA", "ISO27001", "SOC2"] as FrameworkId[]).map((fw) => (
              <button
                key={fw}
                onClick={() => setSelectedFramework(fw)}
                className={`rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors ${
                  selectedFramework === fw
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {fw}
              </button>
            ))}
          </div>
          {/* Export buttons */}
          <Button
            size="sm"
            variant="outline"
            disabled={exporting}
            onClick={() => handleExport("html")}
            className="border-emerald-500/30 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10"
          >
            <Download className="size-3.5" />
            Export HTML
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={exporting}
            onClick={() => handleExport("json")}
            className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
          >
            <FileText className="size-3.5" />
            JSON
          </Button>
        </div>
      </div>

      {/* Top row: Score gauge + breakdown + trend */}
      <div className="grid gap-3 lg:grid-cols-[auto_1fr_1fr]">
        <Card className="holo-card hud-corners gap-0 flex-row items-center justify-around rounded-xl p-4">
          <div className="flex flex-col items-center">
            {frameworkDetail ? (
              <ScoreGauge score={frameworkDetail.score} level={frameworkDetail.level} />
            ) : (
              <div className="size-24" />
            )}
            <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {selectedFramework} score
            </div>
          </div>
        </Card>

        <Card className="holo-card hud-corners gap-0 rounded-xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-400" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
                {frameworkDetail?.name ?? selectedFramework}
              </span>
            </div>
            {trendDelta !== null && trendDelta !== 0 && (
              <div
                className={`flex items-center gap-1 font-mono text-[10px] ${
                  trendDelta > 0 ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {trendDelta > 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {trendDelta > 0 ? "+" : ""}
                {trendDelta} since last check
              </div>
            )}
            {trendDelta !== null && trendDelta === 0 && (
              <div className="font-mono text-[10px] text-zinc-500">no change since last check</div>
            )}
          </div>
          <div className="text-[11px] leading-relaxed text-zinc-400">
            {frameworkDetail?.description}
          </div>
          <div className="mt-3 flex items-center gap-2 font-mono text-[9px] text-zinc-600">
            <Clock className="size-3" />
            last checked: {frameworkDetail ? new Date(frameworkDetail.lastChecked).toLocaleString() : "—"}
            {compliance?.cached && (
              <Badge className="border border-sky-500/30 bg-sky-500/5 text-[9px] text-sky-300">
                CACHED
              </Badge>
            )}
          </div>
        </Card>

        {scoreBreakdown ? (
          <ScoreBreakdownCard
            score={scoreBreakdown.score}
            automatedPassRate={scoreBreakdown.automatedPassRate}
            manualScore={scoreBreakdown.manualScore}
            remediationScore={scoreBreakdown.remediationScore}
          />
        ) : (
          <Card className="holo-card hud-corners rounded-xl p-4">
            <div className="text-xs text-zinc-500">Score breakdown unavailable.</div>
          </Card>
        )}
      </div>

      {/* Breach notification alert */}
      {breach?.breach_detected && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-3 rounded-lg border border-red-500/50 bg-red-500/10 p-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-500/20">
              <AlertTriangle className="size-5 text-red-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-red-300">
                ⚠ DPDPA §8(6) Breach Notification Required, {breach.notification_count} breach(es) detected
              </div>
              <div className="text-xs text-red-300/70">
                {breach.any_overdue
                  ? "OVERDUE, breach exceeds 72-hour notification window. Immediate filing required."
                  : "Personal data breach detected. DPDPA requires notification to the Data Protection Board within 72 hours."}
              </div>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => {
              const n = breach.notifications?.[0];
              if (n) {
                setBreachDraft(n.notification_draft.body);
                setBreachDialogOpen(true);
              }
            }}
            className="bg-red-600 text-white hover:bg-red-500"
          >
            <FileText className="size-4" />
            View Notification Draft
          </Button>
        </motion.div>
      )}

      {/* Tabs: Framework tree, Gap analysis, Legacy summary */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-zinc-900/60">
          <TabsTrigger value="framework" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300">
            <ShieldCheck className="size-3.5" /> Framework Tree
            {frameworkDetail?.sections && (
              <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 text-[10px] text-emerald-300">
                {frameworkDetail.sections.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="gaps" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300">
            <Target className="size-3.5" /> Gap Analysis
            {gapItems.length > 0 && (
              <span className="ml-1 rounded-full bg-red-500/20 px-1.5 text-[10px] text-red-300">
                {gapItems.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="summary" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300">
            <Globe className="size-3.5" /> All Frameworks
          </TabsTrigger>
          <TabsTrigger value="privacy" className="data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300">
            <Lock className="size-3.5" /> Privacy Scanner
          </TabsTrigger>
        </TabsList>

        {/* Framework tree */}
        <TabsContent value="framework">
          {frameworkDetail ? (
            <FrameworkTree
              sections={frameworkDetail.sections}
              onSelectControl={handleSelectControl}
            />
          ) : (
            <Card className="holo-card rounded-xl p-6 text-center text-sm text-zinc-500">
              No framework detail available.
            </Card>
          )}
        </TabsContent>

        {/* Gap analysis */}
        <TabsContent value="gaps">
          <GapAnalysisPanel gaps={gapItems} />
        </TabsContent>

        {/* Legacy multi-framework summary */}
        <TabsContent value="summary">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {compliance?.frameworks.map((fw, i) => {
              const Icon = FRAMEWORK_ICONS[fw.icon] ?? Shield;
              return (
                <motion.div
                  key={fw.name}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="holo-card hud-corners glow-hover gap-0 rounded-xl p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex size-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/5">
                          <Icon className="size-4" style={{ color: fw.color }} />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-zinc-100">{fw.name}</div>
                          <div className="text-[9px] text-zinc-500">{fw.full_name}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xl font-bold" style={{ color: fw.color }}>{fw.score}</div>
                      </div>
                    </div>
                    <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full rounded-full transition-all" style={{ width: `${fw.score}%`, background: fw.color }} />
                    </div>
                    <div className="space-y-1">
                      {fw.sections.map((s) => (
                        <div key={s.section} className="flex items-center gap-2 text-[10px]">
                          <span className={`inline-flex items-center gap-0.5 rounded border px-1 py-0 ${SECTION_STATUS_STYLE[s.status] || SECTION_STATUS_STYLE["not-assessed"]}`}>
                            {s.status === "compliant" ? <CheckCircle2 className="size-2" /> :
                             s.status === "violated" ? <XCircle className="size-2" /> :
                             s.status === "at-risk" ? <AlertTriangle className="size-2" /> :
                             s.status === "pending-review" ? <Clock className="size-2" /> :
                             <span className="size-2 rounded-full bg-current opacity-50" />}
                          </span>
                          <span className="font-mono text-zinc-500">{s.section}</span>
                          <span className="truncate text-zinc-400">{s.title}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </TabsContent>

        {/* Data privacy scanner */}
        <TabsContent value="privacy">
          {privacy ? (
            <Card className="holo-card hud-corners gap-0 rounded-xl p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lock className="size-4 text-purple-400" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-purple-400/70">
                    Data Privacy Scanner (DPDPA)
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-2xl font-bold" style={{ color: privacy.privacy_score >= 80 ? "#10b981" : privacy.privacy_score >= 50 ? "#f59e0b" : "#ef4444" }}>
                    {privacy.privacy_score}
                  </span>
                  <Badge className={`border ${privacy.privacy_status === "compliant" ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : privacy.privacy_status === "at-risk" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-red-500/40 bg-red-500/10 text-red-300"}`}>
                    {privacy.privacy_status.toUpperCase()}
                  </Badge>
                </div>
              </div>

              {privacy.total_risks === 0 ? (
                <div className="flex items-center justify-center py-6 text-sm text-zinc-500">
                  <CheckCircle2 className="mr-2 size-4 text-emerald-400" />
                  No data privacy risks detected. DPDPA compliance looks good.
                </div>
              ) : (
                <div className="custom-scrollbar max-h-72 space-y-2 overflow-y-auto">
                  {privacy.risks.map((r, i) => (
                    <div
                      key={i}
                      className={`rounded-lg border p-3 ${
                        r.severity === "critical"
                          ? "border-red-500/30 bg-red-500/5"
                          : r.severity === "high"
                            ? "border-orange-500/30 bg-orange-500/5"
                            : "border-amber-500/30 bg-amber-500/5"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Badge className={`border px-1.5 text-[9px] ${
                          r.severity === "critical" ? "border-red-500/40 bg-red-500/10 text-red-300" :
                          r.severity === "high" ? "border-orange-500/40 bg-orange-500/10 text-orange-300" :
                          "border-amber-500/40 bg-amber-500/10 text-amber-300"
                        }`}>
                          {r.severity.toUpperCase()}
                        </Badge>
                        <span className="text-xs font-medium text-zinc-200">{r.risk_type}</span>
                        <span className="ml-auto font-mono text-[9px] text-zinc-500">{r.dpdpa_section}</span>
                      </div>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">{r.description}</p>
                      <div className="mt-1.5 flex items-start gap-1.5 rounded border border-emerald-500/20 bg-emerald-500/5 p-1.5">
                        <CheckCircle2 className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                        <span className="text-[10px] text-emerald-300/80">{r.recommendation}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {privacy.dpdpa_sections_assessed.map((s) => (
                  <span key={s} className="rounded border border-purple-500/20 bg-purple-500/5 px-1.5 py-0.5 font-mono text-[9px] text-purple-300/70">
                    {s}
                  </span>
                ))}
              </div>
            </Card>
          ) : (
            <Card className="holo-card rounded-xl p-6 text-center text-sm text-zinc-500">
              Privacy scanner unavailable.
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Control evidence dialog */}
      <ControlDialog
        control={selectedControl}
        open={controlDialogOpen}
        onOpenChange={setControlDialogOpen}
      />

      {/* Breach notification dialog */}
      <Dialog open={breachDialogOpen} onOpenChange={setBreachDialogOpen}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-100 sm:max-w-3xl">
          <DialogHeader className="gap-2 border-b border-zinc-800 px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base text-red-400">
              <AlertTriangle className="size-4" />
              DPDPA §8(6) Breach Notification Draft
            </DialogTitle>
          </DialogHeader>
          <div className="custom-scrollbar max-h-[calc(92vh-8rem)] overflow-y-auto p-5">
            <div className="mb-3 flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(breachDraft);
                  toast({ title: "Notification draft copied" });
                }}
                className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
              >
                <Copy className="size-3.5" />
                Copy Draft
              </Button>
            </div>
            <pre className="custom-scrollbar overflow-auto rounded-lg border border-red-500/20 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-300">
              {breachDraft}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
