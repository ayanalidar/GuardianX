"use client";

import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PipelineEvent } from "@/lib/sentinel/api";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  Terminal,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PipelineViewProps {
  events: PipelineEvent[];
  connected: boolean;
  active: boolean;
  scanStatus?: string;
  stageLabel?: string | null;
}

const STAGE_ORDER = [
  "queued",
  "analyzing",
  "patching",
  "sandboxing",
  "reviewing",
  "completed",
  "failed",
];

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  analyzing: "Analyzing",
  patching: "Generating Patches",
  sandboxing: "Sandbox Testing",
  reviewing: "Queued for Review",
  completed: "Completed",
  failed: "Failed",
};

export function PipelineView({
  events,
  connected,
  active,
  scanStatus,
  stageLabel,
}: PipelineViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [events]);

  const currentStage = scanStatus ?? "queued";

  return (
    <div className="flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 backdrop-blur-sm">
      {/* Header: stage tracker */}
      <div className="border-b border-zinc-800 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-emerald-500/15 ring-1 ring-emerald-500/40">
              <Zap className="size-3.5 text-emerald-400" />
            </div>
            <span className="text-sm font-semibold text-zinc-100">
              Live Pipeline
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                connected
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-zinc-700 bg-zinc-800/50 text-zinc-400"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  connected ? "bg-emerald-400" : "bg-zinc-500"
                }`}
              />
              {connected ? "socket connected" : "disconnected"}
            </span>
            {active && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
                <Loader2 className="size-3 animate-spin" />
                running
              </span>
            )}
          </div>
        </div>

        {/* Stage progress */}
        <div className="flex flex-wrap items-center gap-1.5">
          {STAGE_ORDER.slice(0, 5).map((stage, i) => {
            const currIdx = STAGE_ORDER.indexOf(currentStage);
            const done = i < currIdx || currentStage === "completed";
            const current = i === currIdx && active;
            const failed = currentStage === "failed" && i === currIdx;
            return (
              <div key={stage} className="flex items-center gap-1.5">
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${
                    failed
                      ? "border-red-500/50 bg-red-500/10 text-red-300"
                      : done
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : current
                          ? "border-amber-500/50 bg-amber-500/10 text-amber-300"
                          : "border-zinc-700 bg-zinc-800/30 text-zinc-500"
                  }`}
                >
                  {failed ? (
                    <AlertCircle className="size-2.5" />
                  ) : done ? (
                    <CheckCircle2 className="size-2.5" />
                  ) : current ? (
                    <Loader2 className="size-2.5 animate-spin" />
                  ) : (
                    <span className="size-1.5 rounded-full bg-current opacity-50" />
                  )}
                  {STAGE_LABELS[stage]}
                </div>
                {i < 4 && (
                  <div
                    className={`h-px w-3 ${done ? "bg-emerald-500/40" : "bg-zinc-700"}`}
                  />
                )}
              </div>
            );
          })}
        </div>
        {stageLabel && (
          <p className="mt-2 text-xs text-zinc-400">{stageLabel}</p>
        )}
      </div>

      {/* Event log */}
      <div className="p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          <Terminal className="size-3" />
          Event Stream
        </div>
        <ScrollArea className="h-72 w-full rounded-lg border border-zinc-800 bg-zinc-950">
          <div ref={scrollRef} className="p-3 font-mono text-xs">
            {events.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-zinc-600">
                <Terminal className="size-6" />
                <p className="text-center text-[11px]">
                  {active
                    ? "Waiting for first event…"
                    : "Trigger a scan to see live pipeline events."}
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {events.map((e, i) => (
                  <motion.div
                    key={`${e.ts}-${i}`}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-2 py-0.5"
                  >
                    <span className="shrink-0 text-zinc-600">
                      [{e.ts.slice(11, 19)}]
                    </span>
                    <span className="shrink-0">
                      {e.level === "success" ? (
                        <CheckCircle2 className="size-3 text-emerald-400" />
                      ) : e.level === "error" ? (
                        <AlertCircle className="size-3 text-red-400" />
                      ) : e.level === "warning" ? (
                        <AlertCircle className="size-3 text-amber-400" />
                      ) : (
                        <Info className="size-3 text-sky-400" />
                      )}
                    </span>
                    <span
                      className={`shrink-0 text-[10px] uppercase ${
                        e.level === "success"
                          ? "text-emerald-400"
                          : e.level === "error"
                            ? "text-red-400"
                            : e.level === "warning"
                              ? "text-amber-400"
                              : "text-zinc-500"
                      }`}
                    >
                      {e.stage}
                    </span>
                    <span className="min-w-0 flex-1 break-words text-zinc-300">
                      {e.message}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
