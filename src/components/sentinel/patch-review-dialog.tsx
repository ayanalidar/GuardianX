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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DiffViewer } from "./diff-viewer";
import { SandboxLogs } from "./sandbox-logs";
import { ChatPanel } from "./chat-panel";
import { ExploitPlayground } from "./exploit-playground";
import { AdversarialArena } from "./adversarial-arena";
import { useToast } from "@/hooks/use-toast";
import {
  sentinelApi,
  type PatchDetail,
  type PatchSummary,
  type ChatMessage,
} from "@/lib/sentinel/api";
import {
  severityStyles,
  formatRelativeTime,
} from "@/lib/sentinel/utils";
import {
  Bug,
  Brain,
  CheckCircle2,
  Clock,
  Crosshair,
  FileCode2,
  Gauge,
  Loader2,
  MessageSquare,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Swords,
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
  const [chat, setChat] = useState<ChatMessage[]>([]);

  const patchId = patch?.patch_id ?? null;

  useEffect(() => {
    if (!open || !patchId) {
      setDetail(null);
      setLoading(false);
      setAction(null);
      setChat([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setDetail(null);
    sentinelApi
      .getPatch(patchId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        setChat(d.chat ?? []);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        toast({
          variant: "destructive",
          title: "Failed to load patch",
          description: err.message,
        });
      })
      .finally(() => !cancelled && setLoading(false));
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
  const confidence = detail?.confidence ?? patch?.confidence ?? 0;
  const sandboxPassed = detail?.sandbox_passed ?? patch?.sandbox_passed ?? false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94vh] w-full gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-100 sm:max-w-4xl">
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
            <span className="rounded-full border border-zinc-700 bg-zinc-800/40 px-2 py-0.5 text-[10px] text-zinc-400">
              {patch?.codebase_name}
            </span>
          </div>
          <DialogTitle className="pr-8 text-lg font-semibold text-zinc-50">
            {patch?.title ?? "Review AI Patch"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Review the AI-generated security patch with diff, sandbox logs, AI
            reasoning, and a live chat with the model.
          </DialogDescription>
        </DialogHeader>

        {/* Body */}
        <div className="custom-scrollbar max-h-[calc(94vh-10rem)] overflow-y-auto px-5 py-5 sm:px-6">
          {loading ? (
            <ReviewSkeleton />
          ) : detail ? (
            <div className="space-y-5">
              {/* Meta + confidence + sandbox verdict */}
              <div className="grid gap-3 sm:grid-cols-3">
                <MetaCard icon={FileCode2} label="Affected File" value={detail.affected_file} mono />
                <MetaCard
                  icon={Clock}
                  label="Generated"
                  value={formatRelativeTime(detail.created_at)}
                />
                <MetaCard
                  icon={sandboxPassed ? CheckCircle2 : ShieldX}
                  label="Sandbox"
                  value={sandboxPassed ? "PASSED" : "FAILED"}
                  accent={sandboxPassed ? "text-emerald-300" : "text-red-300"}
                />
              </div>

              {/* Confidence meter */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    <Gauge className="size-3.5 text-emerald-400" />
                    AI Confidence
                  </div>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      confidence >= 0.8
                        ? "text-emerald-300"
                        : confidence >= 0.6
                          ? "text-amber-300"
                          : "text-red-300"
                    }`}
                  >
                    {(confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={`h-full rounded-full transition-all ${
                      confidence >= 0.8
                        ? "bg-emerald-500"
                        : confidence >= 0.6
                          ? "bg-amber-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${Math.round(confidence * 100)}%` }}
                  />
                </div>
              </div>

              {/* AI explanation */}
              <section className="space-y-2">
                <SectionLabel icon={Sparkles} text="AI Explanation" />
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm leading-relaxed text-zinc-300">
                  {detail.ai_explanation}
                </div>
              </section>

              {/* AI reasoning */}
              {detail.ai_reasoning && (
                <section className="space-y-2">
                  <SectionLabel icon={Brain} text="AI Reasoning Trace" />
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm leading-relaxed text-zinc-400">
                    {detail.ai_reasoning}
                  </div>
                </section>
              )}

              {/* Tabbed: Diff / Sandbox / Exploit / Arena / Test / Chat */}
              <Tabs defaultValue={detail.exploit_code ? "exploit" : "diff"} className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-zinc-900/60 text-zinc-400 sm:grid-cols-6">
                  <TabsTrigger
                    value="diff"
                    className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
                  >
                    <FileCode2 className="size-3.5" />
                    <span className="hidden sm:inline">Diff</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="sandbox"
                    className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
                  >
                    <ShieldCheck className="size-3.5" />
                    <span className="hidden sm:inline">Sandbox</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="exploit"
                    className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
                  >
                    <Crosshair className="size-3.5" />
                    <span className="hidden sm:inline">Exploit</span>
                    {detail.exploit_original_result?.success && (
                      <span className="ml-0.5 size-1.5 rounded-full bg-red-500" />
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="arena"
                    className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
                  >
                    <Swords className="size-3.5" />
                    <span className="hidden sm:inline">Arena</span>
                    {detail.adversarial_rounds > 0 && (
                      <span
                        className={`ml-0.5 size-1.5 rounded-full ${detail.adversarial_won ? "bg-emerald-500" : "bg-amber-500"}`}
                      />
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="test"
                    className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
                  >
                    <FileCode2 className="size-3.5" />
                    <span className="hidden sm:inline">Test</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="chat"
                    className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
                  >
                    <MessageSquare className="size-3.5" />
                    <span className="hidden sm:inline">Chat</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="diff" className="mt-3">
                  <DiffViewer
                    diff={detail.diff_payload}
                    filename={detail.affected_file}
                  />
                </TabsContent>
                <TabsContent value="sandbox" className="mt-3">
                  <SandboxLogs logs={detail.sandbox_logs} />
                </TabsContent>
                <TabsContent value="exploit" className="mt-3">
                  <ExploitPlayground
                    patchId={detail.patch_id}
                    exploitCode={detail.exploit_code}
                    originalResult={detail.exploit_original_result}
                    patchedResult={detail.exploit_patched_result}
                    description={detail.exploit_code ? "AI-generated proof of concept" : undefined}
                  />
                </TabsContent>
                <TabsContent value="arena" className="mt-3">
                  <AdversarialArena
                    rounds={detail.adversarial_transcript}
                    won={detail.adversarial_won}
                    totalRounds={detail.adversarial_rounds}
                  />
                </TabsContent>
                <TabsContent value="test" className="mt-3">
                  <DiffViewer
                    diff={detail.test_code}
                    filename="generated-test.js"
                  />
                </TabsContent>
                <TabsContent value="chat" className="mt-3">
                  <ChatPanel
                    patchId={detail.patch_id}
                    initialMessages={chat}
                    onMessagesChange={setChat}
                  />
                </TabsContent>
              </Tabs>
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
            Approving applies the patch to the codebase source.
          </p>
          <div className="flex w-full gap-3 sm:w-auto">
            <Button
              variant="outline"
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

function ReviewSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 bg-zinc-800" />
        ))}
      </div>
      <Skeleton className="h-4 w-32 bg-zinc-800" />
      <Skeleton className="h-20 w-full bg-zinc-800" />
      <Skeleton className="h-4 w-32 bg-zinc-800" />
      <Skeleton className="h-40 w-full bg-zinc-800" />
    </div>
  );
}
