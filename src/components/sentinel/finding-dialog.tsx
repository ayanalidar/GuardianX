"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { Finding } from "@/lib/sentinel/api";
import { severityStyles, formatRelativeTime } from "@/lib/sentinel/utils";
import {
  Bug,
  Crosshair,
  EyeOff,
  Lightbulb,
  ShieldAlert,
  Webhook,
} from "lucide-react";

function isExposureFinding(f: Finding): boolean {
  return (
    f.category === "Sensitive Data Exposure" || f.category === "PII Exposure"
  );
}

interface FindingDialogProps {
  finding: Finding | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FindingDialog({ finding, open, onOpenChange }: FindingDialogProps) {
  if (!finding) return null;
  const style = severityStyles[finding.severity as keyof typeof severityStyles] ?? {
    label: finding.severity,
    badge: "border-zinc-700 bg-zinc-800/50 text-zinc-300",
    dot: "bg-zinc-500",
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] w-full gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-100 sm:max-w-3xl">
        <DialogHeader className="gap-3 border-b border-zinc-800 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`gap-1 border ${style.badge}`}>
              <span className={`size-1.5 rounded-full ${style.dot}`} />
              {style.label}
            </Badge>
            <Badge
              variant="outline"
              className="gap-1 border-zinc-700 bg-zinc-800/50 text-zinc-300"
            >
              <Bug className="size-3" />
              {finding.category}
            </Badge>
            {finding.owasp && (
              <Badge
                variant="outline"
                className="border-zinc-700 bg-zinc-800/50 text-[10px] text-zinc-400"
              >
                {finding.owasp}
              </Badge>
            )}
            <span className="text-[11px] text-zinc-500">
              {formatRelativeTime(finding.created_at)}
            </span>
          </div>
          <DialogTitle className="pr-8 text-lg font-semibold text-zinc-50">
            {finding.title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            VAPT finding detail with proof of concept HTTP request and response.
          </DialogDescription>
        </DialogHeader>

        <div className="custom-scrollbar max-h-[calc(94vh-9rem)] space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {/* Meta */}
          <div className="grid gap-3 sm:grid-cols-3">
            <MetaCard icon={Webhook} label="Endpoint" value={`${finding.method} ${finding.endpoint}`} mono />
            <MetaCard
              icon={Crosshair}
              label="Confidence"
              value={`${Math.round(finding.confidence * 100)}%`}
              accent={
                finding.confidence >= 0.8
                  ? "text-emerald-300"
                  : finding.confidence >= 0.5
                    ? "text-amber-300"
                    : "text-red-300"
              }
            />
            <MetaCard icon={ShieldAlert} label="Severity" value={style.label} accent={style.badge.includes("red") ? "text-red-300" : style.badge.includes("emerald") ? "text-emerald-300" : "text-zinc-200"} />
          </div>

          {/* Description */}
          <section className="space-y-2">
            <SectionLabel icon={Bug} text="Description" />
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm leading-relaxed text-zinc-300">
              {finding.description}
            </div>
          </section>

          {/* Redacted secret banner for exposure findings */}
          {isExposureFinding(finding) && (
            <div className="flex items-start gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4">
              <EyeOff className="mt-0.5 size-5 shrink-0 text-red-400" />
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-wider text-red-300">
                  Sensitive Data Exposure — Sample Redacted
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-300">
                  The full secret value is intentionally NOT stored. Only a
                  redacted preview (first 4 + last 4 characters) is kept to
                  prove the exposure for remediation. The credential should be
                  considered compromised and rotated immediately.
                </p>
              </div>
            </div>
          )}

          {/* Payload */}
          {finding.payload && (
            <section className="space-y-2">
              <SectionLabel icon={Crosshair} text="Attack Payload" />
              <pre className="custom-scrollbar overflow-auto rounded-lg border border-red-500/30 bg-red-500/5 p-4 font-mono text-xs text-red-200">
                {finding.payload}
              </pre>
            </section>
          )}

          {/* Proof of concept — HTTP request */}
          <section className="space-y-2">
            <SectionLabel icon={Webhook} text="Proof of Concept — HTTP Request" />
            <pre className="custom-scrollbar overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-emerald-300">
              {finding.proof_request}
            </pre>
          </section>

          {/* Proof of concept — HTTP response */}
          <section className="space-y-2">
            <SectionLabel icon={Webhook} text="HTTP Response (Evidence)" />
            <pre className="custom-scrollbar max-h-64 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-400">
              {finding.proof_response}
            </pre>
          </section>

          {/* Remediation */}
          {finding.remediation && (
            <section className="space-y-2">
              <SectionLabel icon={Lightbulb} text="Remediation" />
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm leading-relaxed text-emerald-100">
                {finding.remediation}
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SectionLabel({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
      <Icon className="size-3.5 text-emerald-400" />
      {text}
    </div>
  );
}

function MetaCard({
  icon: Icon,
  label,
  value,
  mono,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
  accent?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        <Icon className="size-3" />
        {label}
      </div>
      <div
        className={`mt-1 truncate text-sm ${mono ? "font-mono" : ""} ${accent ?? "text-zinc-200"}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
