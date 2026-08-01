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
import { CopilotPanel } from "./copilot-panel";
import { useToast } from "@/hooks/use-toast";
import {
  sentinelApi,
  type PatchDetail,
  type PatchSummary,
  type ChatMessage,
  type PatchHistory,
  type PrArtifacts,
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
  Copy,
  Crosshair,
  FileCode2,
  Gauge,
  GitBranch,
  History,
  Loader2,
  MessageSquare,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Swords,
  Undo2,
  Wand2,
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
  const [prLoading, setPrLoading] = useState(false);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [prOpen, setPrOpen] = useState(false);
  const [historyData, setHistoryData] = useState<PatchHistory | null>(null);
  const [prData, setPrData] = useState<PrArtifacts | null>(null);

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
        onResolved(patchId, kind as "approved" | "rejected");
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

  const loadHistory = useCallback(async () => {
    if (!patchId) return;
    try {
      const h = await sentinelApi.patchHistory(patchId);
      setHistoryData(h);
      setHistoryOpen(true);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load history", description: err instanceof Error ? err.message : "unknown" });
    }
  }, [patchId, toast]);

  const generatePrArtifact = useCallback(async () => {
    if (!patchId) return;
    setPrLoading(true);
    try {
      const pr = await sentinelApi.generatePr(patchId);
      setPrData(pr);
      setPrOpen(true);
      toast({ title: "PR artifacts generated", description: pr.message });
    } catch (err) {
      toast({ variant: "destructive", title: "PR generation failed", description: err instanceof Error ? err.message : "unknown" });
    } finally {
      setPrLoading(false);
    }
  }, [patchId, toast]);

  const handleRollback = useCallback(async () => {
    if (!patchId) return;
    setRollbackLoading(true);
    try {
      const r = await sentinelApi.rollbackPatch(patchId, "Manual rollback from review dialog");
      toast({ title: "Patch rolled back", description: r.message });
      onResolved(patchId, "rejected");
      onOpenChange(false);
    } catch (err) {
      toast({ variant: "destructive", title: "Rollback failed", description: err instanceof Error ? err.message : "unknown" });
    } finally {
      setRollbackLoading(false);
    }
  }, [patchId, toast, onResolved, onOpenChange]);

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
                <TabsList className="grid w-full grid-cols-4 bg-zinc-900/60 text-zinc-400 sm:grid-cols-7">
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
                  <TabsTrigger
                    value="copilot"
                    className="data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-100"
                  >
                    <Wand2 className="size-3.5" />
                    <span className="hidden sm:inline">Copilot</span>
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
                <TabsContent value="copilot" className="mt-3">
                  <CopilotPanel patchId={detail.patch_id} />
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
          <div className="flex items-center gap-2">
            {/* History button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { void loadHistory(); }}
              disabled={loading}
              className="text-zinc-400 hover:text-cyan-400"
            >
              <History className="size-3.5" />
              <span className="hidden sm:inline">History</span>
            </Button>
            {/* Generate PR button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { void generatePrArtifact(); }}
              disabled={loading || prLoading}
              className="text-zinc-400 hover:text-violet-400"
            >
              {prLoading ? <Loader2 className="size-3.5 animate-spin" /> : <GitBranch className="size-3.5" />}
              <span className="hidden sm:inline">PR</span>
            </Button>
            {/* Rollback button (only for approved patches) */}
            {detail?.status === "approved" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { void handleRollback(); }}
                disabled={loading || rollbackLoading}
                className="text-amber-400 hover:text-amber-300"
              >
                {rollbackLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
                <span className="hidden sm:inline">Rollback</span>
              </Button>
            )}
          </div>
          <p className="hidden text-xs text-zinc-500 lg:block">
            Approving applies the patch to the codebase source.
          </p>
          <div className="flex w-full gap-3 sm:w-auto">
            <Button
              variant="outline"
              onClick={() => handleAction("reject")}
              disabled={loading || action !== null}
              className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-white"
            >
              {action === "reject" ? <Loader2 className="size-4 animate-spin" /> : <XCircle className="size-4" />}
              Reject
            </Button>
            <Button
              onClick={() => handleAction("approve")}
              disabled={loading || action !== null}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {action === "approve" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {action === "approve" ? "Applying..." : "Approve & Apply Fix"}
            </Button>
          </div>
        </div>
      </DialogContent>

      {/* History dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-100 sm:max-w-2xl">
          <DialogHeader className="gap-2 border-b border-zinc-800 px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base text-cyan-400">
              <History className="size-4" /> Patch Version History
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              {historyData ? `${historyData.title}, ${historyData.total_versions} versions across ${historyData.adversarial_rounds} adversarial round(s)` : "Loading…"}
            </DialogDescription>
          </DialogHeader>
          <div className="custom-scrollbar max-h-[calc(90vh-8rem)] overflow-y-auto p-5">
            {historyData?.versions.map((v, i) => (
              <div key={i} className={`relative mb-4 border-l-2 pl-4 ${i === historyData.versions.length - 1 ? "border-emerald-500" : "border-zinc-700"}`}>
                <div className={`absolute -left-1.5 top-1 size-3 rounded-full ${i === 0 ? "bg-red-500" : i === historyData.versions.length - 1 ? "bg-emerald-500 pulse-dot" : "bg-cyan-500"}`} />
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-zinc-100">{v.label}</span>
                  <span className="font-mono text-[9px] text-zinc-600">{v.code_hash}</span>
                </div>
                {v.technique && <div className="mt-0.5 text-[10px] text-cyan-400">→ {v.technique}</div>}
                {v.reasoning && <p className="mt-1 text-[10px] leading-relaxed text-zinc-500">{v.reasoning.slice(0, 200)}</p>}
                <pre className="custom-scrollbar mt-1 max-h-24 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 font-mono text-[8px] text-zinc-500">{v.code_preview}</pre>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* PR dialog */}
      <Dialog open={prOpen} onOpenChange={setPrOpen}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-hidden border-zinc-800 bg-zinc-950 p-0 text-zinc-100 sm:max-w-2xl">
          <DialogHeader className="gap-2 border-b border-zinc-800 px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-base text-violet-400">
              <GitBranch className="size-4" /> Pull Request Artifacts
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-400">
              {prData?.message}
            </DialogDescription>
          </DialogHeader>
          <div className="custom-scrollbar max-h-[calc(90vh-8rem)] space-y-4 overflow-y-auto p-5">
            {prData && (
              <>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
                    <div className="font-mono text-lg font-bold text-emerald-400">+{prData.additions}</div>
                    <div className="text-[9px] uppercase text-zinc-500">Additions</div>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
                    <div className="font-mono text-lg font-bold text-red-400">-{prData.deletions}</div>
                    <div className="text-[9px] uppercase text-zinc-500">Deletions</div>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
                    <div className="font-mono text-lg font-bold text-zinc-300">{prData.files_changed}</div>
                    <div className="text-[9px] uppercase text-zinc-500">Files</div>
                  </div>
                </div>
                <div>
                  <div className="mb-1 font-mono text-[9px] uppercase text-zinc-500">Branch</div>
                  <code className="block rounded border border-violet-500/20 bg-violet-500/5 p-2 font-mono text-xs text-violet-300">{prData.branch_name}</code>
                </div>
                <div>
                  <div className="mb-1 font-mono text-[9px] uppercase text-zinc-500">Commit Message</div>
                  <pre className="custom-scrollbar max-h-32 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 font-mono text-[10px] text-zinc-300">{prData.commit_message}</pre>
                </div>
                <div>
                  <div className="mb-1 font-mono text-[9px] uppercase text-zinc-500">Instructions</div>
                  <pre className="custom-scrollbar max-h-40 overflow-auto rounded border border-emerald-500/20 bg-emerald-500/5 p-3 font-mono text-[10px] text-emerald-300">{prData.instructions}</pre>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { navigator.clipboard.writeText(prData.patched_code); toast({ title: "Patched code copied" }); }}
                  className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                >
                  <Copy className="size-3.5" /> Copy Patched Code
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
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
