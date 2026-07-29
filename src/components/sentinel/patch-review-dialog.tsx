"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DiffViewer } from "./diff-viewer";
import { SandboxLogs } from "./sandbox-logs";
import { useToast } from "@/hooks/use-toast";
import {
  sentinelApi,
  type PatchDetail,
  type PatchSummary,
} from "@/lib/sentinel/api";
import {
  severityStyles,
  formatRelativeTime,
} from "@/lib/sentinel/utils";
import {
  Bug,
  CheckCircle2,
  Clock,
  FileCode2,
  Loader2,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";

interface PatchReviewDialogProps {
  patch: PatchSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: (patchId: string, action: "approved" | "rejected") => void;
}

export function PatchReviewDialog({
  patch,
  open,
  onOpenChange,
  onResolved,
}: PatchReviewDialogProps) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<PatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);

  const patchId = patch?.patch_id ?? null;

  useEffect(() => {
    if (!open || !patchId) {
      setDetail(null);
      setLoading(false);
      setAction(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setDetail(null);

    sentinelApi
      .getPatch(patchId)
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch((err: Error) => {
        if (!cancelled) {
          toast({
            variant: "destructive",
            title: "Failed to load patch",
            description: err.message,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, patchId, toast]);

  const handleAction = useCallback(
    async (kind: "approve" | "reject") => {
      if (!patchId) return;
      setAction(kind);
      try {
        if (kind === "approve") {
          await sentinelApi.approve(patchId);
          toast({
            title: "Patch approved & applied",
            description: `${patch?.title} has been deployed to the codebase.`,
          });
        } else {
          await sentinelApi.reject(patchId);
          toast({
            title: "Patch rejected",
            description: `${patch?.title} will not be applied.`,
          });
        }
        onResolved(patchId, kind);
        onOpenChange(false);
      } catch (err) {
        toast({
          variant: "destructive",
          title: `Failed to ${kind} patch`,
          description: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        setAction(null);
      }
    },
    [patchId, patch, onResolved, onOpenChange, toast]
  );

  const severity = detail?.severity ?? patch?.severity ?? "high";
  const style = severityStyles[severity];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-full gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-100 sm:max-w-3xl">
        {/* Header */}
        <DialogHeader className="gap-3 border-b border-zinc-800 px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={`gap-1 border ${style.badge}`}>
              <span className={`size-1.5 rounded-full ${style.dot}`} />
              {style.label}
            </Badge>
            {detail?.cve || patch?.cve ? (
              <Badge
                variant="outline"
                className="gap-1 border-zinc-700 bg-zinc-800/50 text-zinc-300"
              >
                <Bug className="size-3" />
                {detail?.cve ?? patch?.cve}
              </Badge>
            ) : null}
            <span className="font-mono text-[11px] text-zinc-500">
              {patchId}
            </span>
          </div>
          <DialogTitle className="text-lg font-semibold text-zinc-50">
            {patch?.title ?? "Review AI Patch"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Review the proposed AI-generated security patch, inspect the diff
            and sandbox logs, then approve or reject it.
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="custom-scrollbar max-h-[calc(92vh-9rem)] overflow-y-auto px-5 py-5 sm:px-6">
          {loading ? (
            <ReviewSkeleton />
          ) : detail ? (
            <div className="space-y-6">
              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1.5 font-mono">
                  <FileCode2 className="size-3.5" />
                  {detail.affected_file}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {formatRelativeTime(detail.created_at)}
                </span>
                {detail.sandbox_passed ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-300">
                    <CheckCircle2 className="size-3.5" />
                    Sandbox Passed
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-red-300">
                    <ShieldCheck className="size-3.5" />
                    Sandbox Failed
                  </span>
                )}
              </div>

              {/* AI explanation */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  <Sparkles className="size-3.5 text-emerald-400" />
                  AI Analysis
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm leading-relaxed text-zinc-300">
                  {detail.ai_explanation}
                </div>
              </section>

              {/* Diff */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  <FileCode2 className="size-3.5 text-emerald-400" />
                  Proposed Changes
                </div>
                <DiffViewer
                  diff={detail.diff_payload}
                  filename={detail.affected_file}
                />
              </section>

              {/* Sandbox logs */}
              <section className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  <ShieldCheck className="size-3.5 text-emerald-400" />
                  Sandbox Verification Logs
                </div>
                <SandboxLogs logs={detail.sandbox_logs} />
              </section>
            </div>
          ) : (
            <div className="py-16 text-center text-sm text-zinc-500">
              Unable to load patch detail.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-950/80 px-5 py-4 sm:px-6">
          <p className="hidden text-xs text-zinc-500 sm:block">
            Approving will apply the patch to the target codebase.
          </p>
          <div className="flex w-full gap-3 sm:w-auto">
            <Button
              variant="outline"
              size="default"
              onClick={() => handleAction("reject")}
              disabled={loading || action !== null}
              className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-white"
            >
              {action === "reject" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <XCircle className="size-4" />
              )}
              Reject
            </Button>
            <Button
              size="default"
              onClick={() => handleAction("approve")}
              disabled={loading || action !== null}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {action === "approve" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              {action === "approve" ? "Applying..." : "Approve & Apply Fix"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <Skeleton className="h-4 w-24 bg-zinc-800" />
        <Skeleton className="h-4 w-32 bg-zinc-800" />
        <Skeleton className="h-4 w-20 bg-zinc-800" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32 bg-zinc-800" />
        <Skeleton className="h-20 w-full bg-zinc-800" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32 bg-zinc-800" />
        <Skeleton className="h-48 w-full bg-zinc-800" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32 bg-zinc-800" />
        <Skeleton className="h-40 w-full bg-zinc-800" />
      </div>
    </div>
  );
}
