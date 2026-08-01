// @ts-nocheck
"use client";

import { useEffect, useState, useCallback } from "react";
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
import { useToast } from "@/hooks/use-toast";
import {
  sentinelApi,
  type ComplianceStatus,
  type DataPrivacyStatus,
  type BreachNotificationStatus,
} from "@/lib/sentinel/api";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
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
} from "lucide-react";
import { motion } from "framer-motion";

const SECTION_STATUS_STYLE: Record<string, string> = {
  compliant: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  violated: "border-red-500/40 bg-red-500/10 text-red-300",
  "at-risk": "border-amber-500/40 bg-amber-500/10 text-amber-300",
  "pending-review": "border-sky-500/40 bg-sky-500/10 text-sky-300",
  "not-assessed": "border-zinc-700 bg-zinc-800/40 text-zinc-500",
};

const FRAMEWORK_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  shield: ShieldCheck,
  globe: Globe,
  heart: Heart,
  "credit-card": Lock,
  award: Shield,
  "check-shield": ShieldCheck,
};

export function ComplianceDashboard() {
  const { toast } = useToast();
  const [compliance, setCompliance] = useState<ComplianceStatus | null>(null);
  const [privacy, setPrivacy] = useState<DataPrivacyStatus | null>(null);
  const [breach, setBreach] = useState<BreachNotificationStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [breachDialogOpen, setBreachDialogOpen] = useState(false);
  const [breachDraft, setBreachDraft] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const [c, p, b] = await Promise.all([
        sentinelApi.compliance(),
        sentinelApi.dataPrivacy(),
        sentinelApi.breachNotification(),
      ]);
      setCompliance(c);
      setPrivacy(p);
      setBreach(b);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 bg-emerald-500/10" />
        ))}
      </div>
    );
  }

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
            Multi-framework compliance monitoring, DPDPA 2023, GDPR, HIPAA, PCI-DSS, ISO 27001, SOC 2.
            Data privacy scanning + automated breach notification.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {compliance && (
            <div className="text-right">
              <div className="font-mono text-3xl font-bold" style={{ color: compliance.overall_score >= 80 ? "#10b981" : compliance.overall_score >= 50 ? "#f59e0b" : "#ef4444" }}>
                {compliance.overall_score}
              </div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Overall Compliance
              </div>
            </div>
          )}
        </div>
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

      {/* Framework scores grid */}
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
                {/* Score bar */}
                <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full transition-all" style={{ width: `${fw.score}%`, background: fw.color }} />
                </div>
                {/* Sections */}
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

      {/* Data Privacy Scanner */}
      {privacy && (
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

          {/* DPDPA sections assessed */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {privacy.dpdpa_sections_assessed.map((s) => (
              <span key={s} className="rounded border border-purple-500/20 bg-purple-500/5 px-1.5 py-0.5 font-mono text-[9px] text-purple-300/70">
                {s}
              </span>
            ))}
          </div>
        </Card>
      )}

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
