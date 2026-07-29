"use client";

import { Badge } from "@/components/ui/badge";
import {
  severityStyles,
  formatRelativeTime,
} from "@/lib/sentinel/utils";
import type { PatchSummary } from "@/lib/sentinel/api";
import {
  Bug,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileCode2,
  ShieldCheck,
} from "lucide-react";
import { motion } from "framer-motion";

interface PatchCardProps {
  patch: PatchSummary;
  onSelect: (patch: PatchSummary) => void;
}

export function PatchCard({ patch, onSelect }: PatchCardProps) {
  const style = severityStyles[patch.severity];

  return (
    <motion.button
      type="button"
      onClick={() => onSelect(patch)}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
      className={`group relative w-full text-left rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 sm:p-5 backdrop-blur-sm transition-colors hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${style.ring}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={`gap-1 border ${style.badge}`}
            >
              <span className={`size-1.5 rounded-full ${style.dot}`} />
              {style.label}
            </Badge>
            {patch.cve ? (
              <Badge
                variant="outline"
                className="gap-1 border-zinc-700 bg-zinc-800/50 text-zinc-300"
              >
                <Bug className="size-3" />
                {patch.cve}
              </Badge>
            ) : null}
            <span className="font-mono text-[11px] text-zinc-500">
              {patch.patch_id}
            </span>
          </div>

          <h3 className="truncate text-base font-semibold text-zinc-100">
            {patch.title}
          </h3>

          <p className="line-clamp-2 text-sm text-zinc-400">
            {patch.ai_explanation}
          </p>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-zinc-500">
            <span className="inline-flex items-center gap-1 font-mono">
              <FileCode2 className="size-3" />
              {patch.affected_file}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {formatRelativeTime(patch.created_at)}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {patch.sandbox_passed ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
              <CheckCircle2 className="size-3" />
              Sandbox Passed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-300">
              <ShieldCheck className="size-3" />
              Sandbox Failed
            </span>
          )}
          <ChevronRight className="size-4 text-zinc-600 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-400" />
        </div>
      </div>
    </motion.button>
  );
}
