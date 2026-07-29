"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatsBar } from "@/components/sentinel/stats-bar";
import { PatchCard } from "@/components/sentinel/patch-card";
import { PatchReviewDialog } from "@/components/sentinel/patch-review-dialog";
import {
  sentinelApi,
  type PatchStats,
  type PatchSummary,
} from "@/lib/sentinel/api";
import { severityRank } from "@/lib/sentinel/utils";
import {
  Activity,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldHalf,
  Sparkles,
  Inbox,
} from "lucide-react";

type SortKey = "severity" | "recent";

export default function Home() {
  const { toast } = useToast();
  const [patches, setPatches] = useState<PatchSummary[]>([]);
  const [stats, setStats] = useState<PatchStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [selected, setSelected] = useState<PatchSummary | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const loadPatches = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (opts?.silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const [list, s] = await Promise.all([
          sentinelApi.listPending(),
          sentinelApi.stats(),
        ]);
        setPatches(list);
        setStats(s);
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Failed to load patches",
          description:
            err instanceof Error ? err.message : "Backend unreachable.",
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
    loadPatches();
    // Auto-refresh every 30s so newly generated patches show up.
    const id = setInterval(() => loadPatches({ silent: true }), 30_000);
    return () => clearInterval(id);
  }, [loadPatches]);

  const visiblePatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? patches.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.patch_id.toLowerCase().includes(q) ||
            (p.cve?.toLowerCase().includes(q) ?? false) ||
            p.affected_file.toLowerCase().includes(q) ||
            p.ai_explanation.toLowerCase().includes(q)
        )
      : patches;

    const sorted = [...filtered].sort((a, b) => {
      if (sortKey === "severity") {
        const r = severityRank(a.severity) - severityRank(b.severity);
        if (r !== 0) return r;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }
      return (
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    return sorted;
  }, [patches, query, sortKey]);

  const handleSelect = useCallback((patch: PatchSummary) => {
    setSelected(patch);
    setDialogOpen(true);
  }, []);

  const handleResolved = useCallback(
    (patchId: string, action: "approved" | "rejected") => {
      setPatches((prev) => prev.filter((p) => p.patch_id !== patchId));
      setStats(null);
      setStatsLoading(true);
      // Re-fetch stats quietly.
      sentinelApi
        .stats()
        .then(setStats)
        .finally(() => setStatsLoading(false));
      void action;
    },
    []
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Ambient gradient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-80 w-80 rounded-full bg-emerald-700/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Top navigation */}
        <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
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
                    AI-assisted
                  </Badge>
                </div>
                <span className="hidden text-[11px] text-zinc-500 sm:block">
                  Autonomous security patch review
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-3 py-1 text-xs text-emerald-300 md:flex">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                Sandbox online
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadPatches({ silent: true })}
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
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
          {/* Hero / intro */}
          <section className="mb-6 sm:mb-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
                  Patch Review Queue
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-zinc-400">
                  AI-generated patches verified in an isolated sandbox. Review
                  the diff and logs, then approve to apply or reject to dismiss.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Activity className="size-3.5 text-emerald-400" />
                Auto-refreshes every 30s
              </div>
            </div>
          </section>

          {/* Stats */}
          <section className="mb-6 sm:mb-8">
            <StatsBar stats={stats} loading={statsLoading} />
          </section>

          {/* Controls */}
          <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, CVE, file…"
                className="border-zinc-800 bg-zinc-900/60 pl-9 text-zinc-200 placeholder:text-zinc-500 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
              />
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1 text-xs">
              <SortToggle
                active={sortKey === "severity"}
                onClick={() => setSortKey("severity")}
              >
                By Severity
              </SortToggle>
              <SortToggle
                active={sortKey === "recent"}
                onClick={() => setSortKey("recent")}
              >
                Most Recent
              </SortToggle>
            </div>
          </section>

          {/* Patch list */}
          <section className="pb-12">
            {loading ? (
              <PatchListSkeleton />
            ) : visiblePatches.length === 0 ? (
              <EmptyState query={query} totalCount={patches.length} />
            ) : (
              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {visiblePatches.map((patch) => (
                    <motion.div
                      key={patch.patch_id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      transition={{ duration: 0.18 }}
                    >
                      <PatchCard patch={patch} onSelect={handleSelect} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </section>
        </main>

        {/* Footer */}
        <footer className="mt-auto border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-zinc-500 sm:flex-row sm:px-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-emerald-500" />
              <span>
                SentinelPatch · Human-in-the-loop security automation
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="inline-flex items-center gap-1.5">
                <ShieldAlert className="size-3.5 text-zinc-600" />
                {stats?.total ?? 0} total patches tracked
              </span>
              <span className="hidden sm:inline">
                v1.0 · Sandbox runtime: node:20-alpine
              </span>
            </div>
          </div>
        </footer>
      </div>

      <PatchReviewDialog
        patch={selected}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onResolved={handleResolved}
      />
    </div>
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
        active
          ? "bg-zinc-800 text-zinc-100"
          : "text-zinc-400 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function PatchListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex gap-2">
                <Skeleton className="h-5 w-20 bg-zinc-800" />
                <Skeleton className="h-5 w-24 bg-zinc-800" />
                <Skeleton className="h-5 w-16 bg-zinc-800" />
              </div>
              <Skeleton className="h-5 w-3/4 bg-zinc-800" />
              <Skeleton className="h-4 w-full bg-zinc-800" />
              <Skeleton className="h-4 w-2/3 bg-zinc-800" />
            </div>
            <Skeleton className="h-6 w-28 bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  query,
  totalCount,
}: {
  query: string;
  totalCount: number;
}) {
  const isFiltered = query.trim().length > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-16 text-center"
    >
      <div className="flex size-14 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
        <Inbox className="size-7 text-emerald-400" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-zinc-200">
        {isFiltered
          ? "No patches match your search"
          : totalCount === 0
            ? "All caught up"
            : "No pending patches"}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">
        {isFiltered
          ? `No results for "${query}". Try a different keyword.`
          : "There are no patches waiting for review. SentinelPatch will surface new patches here as they are generated and sandbox-verified."}
      </p>
    </motion.div>
  );
}
