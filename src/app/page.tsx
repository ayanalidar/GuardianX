"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsBar } from "@/components/sentinel/stats-bar";
import { PatchCard } from "@/components/sentinel/patch-card";
import { PatchReviewDialog } from "@/components/sentinel/patch-review-dialog";
import { CodebaseCard } from "@/components/sentinel/codebase-card";
import {
  CodebaseViewer,
  AddCodebaseDialog,
} from "@/components/sentinel/codebase-viewer";
import { CredentialsDialog } from "@/components/sentinel/credentials-dialog";
import { RedAgentPanel } from "@/components/sentinel/redagent-panel";
import { PipelineView } from "@/components/sentinel/pipeline-view";
import { usePipelineSocket } from "@/lib/sentinel/use-pipeline-socket";
import {
  sentinelApi,
  type Codebase,
  type PatchStats,
  type PatchSummary,
  type Scan,
} from "@/lib/sentinel/api";
import { severityRank } from "@/lib/sentinel/utils";
import {
  Activity,
  Boxes,
  Crosshair,
  Inbox,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldHalf,
  Sparkles,
  Zap,
} from "lucide-react";

type Tab = "patches" | "codebases" | "redagent";
type SortKey = "severity" | "recent";

export default function Home() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("patches");
  const [patches, setPatches] = useState<PatchSummary[]>([]);
  const [codebases, setCodebases] = useState<Codebase[]>([]);
  const [stats, setStats] = useState<PatchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [selectedPatch, setSelectedPatch] = useState<PatchSummary | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewCodebase, setViewCodebase] = useState<Codebase | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [credsOpen, setCredsOpen] = useState(false);

  // live scan state
  const [activeScan, setActiveScan] = useState<Scan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scansTick, setScansTick] = useState(0);

  const { connected, events } = usePipelineSocket({
    scanId: activeScan?.id ?? null,
  });

  // ── data loaders ──────────────────────────────────────────────────────
  const loadAll = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (opts?.silent) setRefreshing(true);
      try {
        const [p, c, s] = await Promise.all([
          sentinelApi.listPending(),
          sentinelApi.listCodebases(),
          sentinelApi.stats(),
        ]);
        setPatches(p);
        setCodebases(c);
        setStats(s);
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Failed to load data",
          description: err instanceof Error ? err.message : "Backend unreachable.",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
        setStatsLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // poll the active scan's status while it's running
  useEffect(() => {
    if (!scanning || !activeScan) return;
    const id = setInterval(async () => {
      try {
        const scans = await sentinelApi.listScans();
        const found = scans.find((s) => s.id === activeScan.id);
        if (found) {
          setActiveScan(found);
          if (found.status === "completed" || found.status === "failed") {
            setScanning(false);
            loadAll({ silent: true });
            toast({
              title:
                found.status === "completed"
                  ? "Scan complete"
                  : "Scan failed",
              description:
                found.status === "completed"
                  ? `${found.patch_count} patch(es) ready for review.`
                  : found.stage_label ?? "Pipeline error.",
            });
          }
        }
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => clearInterval(id);
  }, [scanning, activeScan, loadAll, toast]);

  // refresh patch list periodically so newly generated patches show up
  const lastPatchRefresh = useRef(0);
  useEffect(() => {
    const id = setInterval(() => {
      // Only auto-refresh patches if there's no active scan (the scan poll
      // handles refreshes during scanning).
      if (!scanning && Date.now() - lastPatchRefresh.current > 15_000) {
        lastPatchRefresh.current = Date.now();
        sentinelApi
          .listPending()
          .then(setPatches)
          .catch(() => null);
      }
    }, 10_000);
    return () => clearInterval(id);
  }, [scanning]);

  // ── actions ───────────────────────────────────────────────────────────
  const handleScan = useCallback(
    async (cb: Codebase) => {
      setScanning(true);
      setTab("patches");
      try {
        const { scanId } = await sentinelApi.startScan(cb.id);
        const scans = await sentinelApi.listScans();
        const found = scans.find((s) => s.id === scanId);
        setActiveScan(found ?? { id: scanId, status: "queued", stage_label: "Queued", started_at: new Date().toISOString(), completed_at: null, codebase: { id: cb.id, name: cb.name }, patch_count: 0 });
        setScansTick((t) => t + 1);
        toast({
          title: "Scan started",
          description: `Autonomous pipeline is analyzing ${cb.name}.`,
        });
      } catch (err) {
        setScanning(false);
        toast({
          variant: "destructive",
          title: "Failed to start scan",
          description: err instanceof Error ? err.message : "unknown error",
        });
      }
    },
    [toast]
  );

  const handleSelectPatch = useCallback((p: PatchSummary) => {
    setSelectedPatch(p);
    setDialogOpen(true);
  }, []);

  const handleResolved = useCallback(
    (patchId: string, action: "approved" | "rejected") => {
      setPatches((prev) => prev.filter((p) => p.patch_id !== patchId));
      setStats(null);
      setStatsLoading(true);
      sentinelApi
        .stats()
        .then(setStats)
        .finally(() => setStatsLoading(false));
      void action;
    },
    []
  );

  const handleDeleteCodebase = useCallback(
    async (cb: Codebase) => {
      try {
        await sentinelApi.deleteCodebase(cb.id);
        setCodebases((prev) => prev.filter((c) => c.id !== cb.id));
        toast({ title: "Codebase deleted", description: cb.name });
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Delete failed",
          description: err instanceof Error ? err.message : "unknown",
        });
      }
    },
    [toast]
  );

  // ── derived ───────────────────────────────────────────────────────────
  const visiblePatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? patches.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.patch_id.toLowerCase().includes(q) ||
            (p.cve?.toLowerCase().includes(q) ?? false) ||
            p.affected_file.toLowerCase().includes(q) ||
            p.codebase_name.toLowerCase().includes(q) ||
            p.ai_explanation.toLowerCase().includes(q)
        )
      : patches;
    return [...filtered].sort((a, b) => {
      if (sortKey === "severity") {
        const r = severityRank(a.severity) - severityRank(b.severity);
        if (r !== 0) return r;
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [patches, query, sortKey]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* ambient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-80 w-80 rounded-full bg-emerald-700/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* header */}
        <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/40">
                <ShieldHalf className="size-5 text-emerald-400" />
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-zinc-50">
                    SentinelPatch
                  </span>
                  <Badge
                    variant="outline"
                    className="hidden border-emerald-500/30 bg-emerald-500/10 text-[10px] font-medium uppercase tracking-wider text-emerald-300 sm:inline-flex"
                  >
                    <Sparkles className="size-2.5" />
                    Autonomous
                  </Badge>
                </div>
                <span className="hidden text-[11px] text-zinc-500 sm:block">
                  AI security patch pipeline
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3 py-1 text-xs text-emerald-300 md:flex">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                Engine online
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadAll({ silent: true })}
                disabled={refreshing}
                className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-white"
              >
                {refreshing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCredsOpen(true)}
                className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 hover:text-white"
              >
                <KeyRound className="size-4" />
                <span className="hidden sm:inline">Credentials</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {/* hero */}
          <section className="mb-6 sm:mb-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
                  Autonomous Patch Operations
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-zinc-400">
                  AI scans code for real vulnerabilities, generates patches,
                  sandbox-tests them, and queues them here for your approval.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Activity className="size-3.5 text-emerald-400" />
                {connected ? "Live pipeline connected" : "Connecting…"}
              </div>
            </div>
          </section>

          {/* stats */}
          <section className="mb-6 sm:mb-8">
            <StatsBar stats={stats} loading={statsLoading} />
          </section>

          {/* two-column: main list + live pipeline (patches/codebases) OR full-width RedAgent */}
          {tab === "redagent" ? (
            <RedAgentPanel />
          ) : (
          <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
            {/* left: tabs (patches / codebases) */}
            <section>
              {/* tab header + controls */}
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1 text-xs">
                  <TabButton active={tab === "patches"} onClick={() => setTab("patches")}>
                    <ShieldAlert className="size-3.5" />
                    Patches
                    {patches.length > 0 && (
                      <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 text-[10px] text-emerald-300">
                        {patches.length}
                      </span>
                    )}
                  </TabButton>
                  <TabButton active={tab === "codebases"} onClick={() => setTab("codebases")}>
                    <Boxes className="size-3.5" />
                    Codebases
                    {codebases.length > 0 && (
                      <span className="ml-1 rounded-full bg-sky-500/20 px-1.5 text-[10px] text-sky-300">
                        {codebases.length}
                      </span>
                    )}
                  </TabButton>
                  <TabButton active={tab === "redagent"} onClick={() => setTab("redagent")}>
                    <Crosshair className="size-3.5 text-red-400" />
                    RedAgent
                  </TabButton>
                </div>

                {tab === "patches" ? (
                  <div className="flex items-center gap-2">
                    <div className="relative w-full sm:w-56">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                      <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search patches…"
                        className="border-zinc-800 bg-zinc-900/60 pl-9 text-zinc-200 placeholder:text-zinc-500 focus-visible:border-emerald-500/50"
                      />
                    </div>
                    <div className="hidden items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1 text-xs sm:flex">
                      <SortToggle active={sortKey === "severity"} onClick={() => setSortKey("severity")}>
                        Severity
                      </SortToggle>
                      <SortToggle active={sortKey === "recent"} onClick={() => setSortKey("recent")}>
                        Recent
                      </SortToggle>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setAddOpen(true)}
                    className="bg-emerald-600 text-white hover:bg-emerald-500"
                  >
                    <Plus className="size-4" />
                    Add Codebase
                  </Button>
                )}
              </div>

              {/* content */}
              {tab === "patches" ? (
                loading ? (
                  <PatchListSkeleton />
                ) : visiblePatches.length === 0 ? (
                  <EmptyState
                    title={query ? "No patches match your search" : "No patches pending"}
                    body={
                      query
                        ? `No results for "${query}".`
                        : "Run a scan on a codebase to generate patches. The AI will detect vulnerabilities, write fixes, and sandbox-test them autonomously."
                    }
                    icon={Inbox}
                    action={
                      !query ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTab("codebases")}
                          className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
                        >
                          <Boxes className="size-4" />
                          Browse Codebases
                        </Button>
                      ) : null
                    }
                  />
                ) : (
                  <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                      {visiblePatches.map((p) => (
                        <motion.div
                          key={p.patch_id}
                          layout
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.98 }}
                          transition={{ duration: 0.18 }}
                        >
                          <PatchCard patch={p} onSelect={handleSelectPatch} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )
              ) : loading ? (
                <CodebaseGridSkeleton />
              ) : codebases.length === 0 ? (
                <EmptyState
                  title="No codebases yet"
                  body="Add a codebase with vulnerable code, or seed the sample library."
                  icon={Boxes}
                  action={
                    <Button
                      size="sm"
                      onClick={() => setAddOpen(true)}
                      className="bg-emerald-600 text-white hover:bg-emerald-500"
                    >
                      <Plus className="size-4" />
                      Add Codebase
                    </Button>
                  }
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <AnimatePresence mode="popLayout">
                    {codebases.map((cb) => (
                      <CodebaseCard
                        key={cb.id}
                        codebase={cb}
                        onScan={handleScan}
                        onView={(c) => {
                          setViewCodebase(c);
                          setViewerOpen(true);
                        }}
                        onDelete={handleDeleteCodebase}
                        busy={scanning}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </section>

            {/* right: live pipeline */}
            <aside className="lg:sticky lg:top-20 lg:self-start">
              <PipelineView
                events={events}
                connected={connected}
                active={scanning}
                scanStatus={activeScan?.status}
                stageLabel={activeScan?.stage_label}
              />
              {!activeScan && (
                <p className="mt-3 px-1 text-[11px] leading-relaxed text-zinc-600">
                  Tip: open the <span className="text-zinc-400">Codebases</span>{" "}
                  tab and hit <span className="text-emerald-400">Run AI Scan</span>{" "}
                  to watch the autonomous pipeline work in real time.
                </p>
              )}
            </aside>
          </div>
          )}
        </main>

        {/* footer */}
        <footer className="mt-auto border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-zinc-500 sm:flex-row sm:px-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-emerald-500" />
              <span>SentinelPatch · Human-in-the-loop autonomous security</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <Zap className="size-3.5 text-zinc-600" />
                AI pipeline · real sandbox execution
              </span>
            </div>
          </div>
        </footer>
      </div>

      {/* dialogs */}
      <PatchReviewDialog
        patch={selectedPatch}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onResolved={handleResolved}
      />
      <CodebaseViewer
        codebase={viewCodebase}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        onScan={(cb) => {
          setViewerOpen(false);
          void handleScan(cb);
        }}
      />
      <AddCodebaseDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreated={() => loadAll({ silent: true })}
        onOpenCredentials={() => {
          setAddOpen(false);
          setCredsOpen(true);
        }}
      />
      <CredentialsDialog
        open={credsOpen}
        onOpenChange={setCredsOpen}
        onChanged={() => loadAll({ silent: true })}
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
        active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function SortToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
        active ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function PatchListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex gap-2">
                <Skeleton className="h-5 w-20 bg-zinc-800" />
                <Skeleton className="h-5 w-24 bg-zinc-800" />
                <Skeleton className="h-5 w-16 bg-zinc-800" />
              </div>
              <Skeleton className="h-5 w-3/4 bg-zinc-800" />
              <Skeleton className="h-4 w-full bg-zinc-800" />
            </div>
            <Skeleton className="h-6 w-28 bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

function CodebaseGridSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32 bg-zinc-800/60" />
      ))}
    </div>
  );
}

function EmptyState({
  title,
  body,
  icon: Icon,
  action,
}: {
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-16 text-center"
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
        <Icon className="size-7 text-emerald-400" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-zinc-200">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}
