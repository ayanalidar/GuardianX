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
import { MatrixRain } from "@/components/sentinel/matrix-rain";
import { LandingPage } from "@/components/sentinel/landing-page";
import { ComplianceDashboard } from "@/components/sentinel/compliance-dashboard";
import { SocPanel } from "@/components/sentinel/soc-panel";
import { DataExfilPanel } from "@/components/sentinel/data-exfil-panel";
import { AuditScraperPanel } from "@/components/sentinel/audit-scraper-panel";
import { AdvancedPanel } from "@/components/sentinel/advanced-panel";
import { AuthPage } from "@/components/sentinel/auth-page";
import { UserManagementPanel } from "@/components/sentinel/user-management-panel";
import { ContentEditor } from "@/components/sentinel/content-editor";
import { ContributorsPanel } from "@/components/sentinel/contributors-panel";
import { DfirPanel } from "@/components/sentinel/dfir-panel";
import { ClientsDashboard } from "@/components/sentinel/clients-dashboard";
import { ClientDetail } from "@/components/sentinel/client-detail";
import { CommandCenter } from "@/components/sentinel/command-center";
import { ActivePipelines } from "@/components/sentinel/active-pipelines";
import { RnDLab } from "@/components/sentinel/rnd-lab";
import { PostureScoreCard } from "@/components/sentinel/posture-score-card";
import { ThreatIntelPanel } from "@/components/sentinel/threat-intel-panel";
import { RuntimeMonitor } from "@/components/sentinel/runtime-monitor";
import { PipelineView } from "@/components/sentinel/pipeline-view";
import { GuardianXLogo } from "@/components/sentinel/guardianx-logo";
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
  Building2,
  Crosshair,
  FlaskConical,
  Gavel,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Plus,
  Radar,
  RefreshCw,
  Search,
  ScanSearch,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldHalf,
  Sparkles,
  Users,
  Zap,
  FileText,
} from "lucide-react";

type Tab = "dashboard" | "clients" | "pipelines" | "rnd" | "patches" | "codebases" | "redagent" | "compliance" | "soc" | "exfil" | "scraper" | "advanced" | "users" | "dfir" | "content" | "contributors";
type SortKey = "severity" | "recent";

export default function Home() {
  const [view, setView] = useState<"landing" | "console" | "auth">("landing");
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string; name: string; role: string } | null>(null);

  useEffect(() => {
    // Check for existing session
    const savedUser = typeof window !== "undefined" ? localStorage.getItem("guardianx-user") : null;
    const savedView = typeof window !== "undefined" ? localStorage.getItem("guardianx-view") : null;
    if (savedUser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      try { setCurrentUser(JSON.parse(savedUser)); } catch { /* ignore */ }
    }
    if (savedView === "console" && savedUser) {
      setView("console");
    }
  }, []);
  const enterConsole = () => {
    setView("console");
    localStorage.setItem("guardianx-view", "console");
  };
  const backToLanding = () => {
    setView("landing");
    localStorage.setItem("guardianx-view", "landing");
  };
  const goAuth = () => setView("auth");
  const handleAuth = (user: { id: string; email: string; name: string; role: string }, _token: string) => {
    setCurrentUser(user);
    setView("console");
  };
  const handleLogout = () => {
    localStorage.removeItem("guardianx-user");
    localStorage.removeItem("guardianx-token");
    localStorage.setItem("guardianx-view", "landing");
    setCurrentUser(null);
    setView("landing");
  };

  if (view === "auth") {
    return <AuthPage onAuth={handleAuth} />;
  }
  if (view === "landing") {
    return <LandingPage onEnter={goAuth} />;
  }
  return <ConsoleView onBackToLanding={backToLanding} currentUser={currentUser} onLogout={handleLogout} />;
}

function ConsoleView({ onBackToLanding, currentUser, onLogout }: {
  onBackToLanding: () => void;
  currentUser: { id: string; email: string; name: string; role: string } | null;
  onLogout: () => void;
}) {
  // live clock for the HUD
  const [clock, setClock] = useState("--:--:--");
  useEffect(() => {
    const id = setInterval(() => {
      setClock(new Date().toLocaleTimeString("en-US", { hour12: false }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const backToLanding = onBackToLanding;
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    // Visibility-aware: don't poll the patch list while the tab is hidden.
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
      interval = setInterval(() => {
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
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
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
    <div className="scanlines cyber-vignette min-h-screen bg-zinc-950 text-zinc-100">
      {/* matrix rain + cyber grid background */}
      <MatrixRain />
      <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-60" />

      {/* ambient backdrop */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-80 w-80 rounded-full bg-cyan-700/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex min-h-screen">
        {/* SIDEBAR */}
        <aside className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col border-r border-emerald-500/15 bg-zinc-950/95 backdrop-blur-md transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
          <button type="button" onClick={backToLanding} className="flex items-center gap-2.5 border-b border-emerald-500/15 px-4 py-4 transition-opacity hover:opacity-80" title="Back to landing page">
            <GuardianXLogo size={44} />
            <div className="leading-tight text-left">
              <span className="text-sm font-bold tracking-tight text-zinc-50 neon-emerald">Guardian<span className="text-emerald-400">X</span></span>
              <div className="font-mono text-[9px] uppercase tracking-widest text-emerald-500/50">SOC Lab</div>
            </div>
          </button>
          <nav className="custom-scrollbar flex-1 overflow-y-auto p-2">
            <NavGroup label="Dashboard" color="emerald">
              <NavItem active={tab === "dashboard"} onClick={() => { setTab("dashboard"); setSelectedClientId(null); setSidebarOpen(false); }} icon={LayoutDashboard} label="Overview" accentColor="emerald" iconColor="text-emerald-400" />
              <NavItem active={tab === "clients"} onClick={() => { setTab("clients"); setSelectedClientId(null); setSidebarOpen(false); }} icon={Building2} label="All Clients" accentColor="emerald" iconColor="text-emerald-400" />
              <NavItem active={tab === "pipelines"} onClick={() => { setTab("pipelines"); setSelectedClientId(null); setSidebarOpen(false); }} icon={Activity} label="Pipelines" accentColor="emerald" iconColor="text-emerald-400" />
            </NavGroup>
            <NavGroup label="Tools" color="cyan">
              <NavItem active={tab === "patches"} onClick={() => { setTab("patches"); setSidebarOpen(false); }} icon={ShieldAlert} label="Patch Queue" badge={patches.length || undefined} badgeColor="emerald" accentColor="emerald" />
              <NavItem active={tab === "codebases"} onClick={() => { setTab("codebases"); setSidebarOpen(false); }} icon={Boxes} label="Codebases" badge={codebases.length || undefined} badgeColor="sky" accentColor="sky" iconColor="text-sky-400" />
              <NavItem active={tab === "redagent"} onClick={() => { setTab("redagent"); setSidebarOpen(false); }} icon={Crosshair} label="RedAgent VAPT" iconColor="text-red-400" accentColor="red" />
              <NavItem active={tab === "compliance"} onClick={() => { setTab("compliance"); setSidebarOpen(false); }} icon={Gavel} label="Compliance" iconColor="text-purple-400" accentColor="purple" />
              <NavItem active={tab === "soc"} onClick={() => { setTab("soc"); setSidebarOpen(false); }} icon={Radar} label="SOC & DevSecOps" iconColor="text-cyan-400" accentColor="cyan" />
              <NavItem active={tab === "exfil"} onClick={() => { setTab("exfil"); setSidebarOpen(false); }} icon={Shield} label="Exfil Defense" iconColor="text-rose-400" accentColor="rose" />
              <NavItem active={tab === "scraper"} onClick={() => { setTab("scraper"); setSidebarOpen(false); }} icon={ScanSearch} label="Audit Scraper" iconColor="text-violet-400" accentColor="violet" />
              <NavItem active={tab === "dfir"} onClick={() => { setTab("dfir"); setSidebarOpen(false); }} icon={ShieldAlert} label="DFIR Command" iconColor="text-red-400" accentColor="red" />
            </NavGroup>
            <NavGroup label="Advanced" color="amber">
              <NavItem active={tab === "rnd"} onClick={() => { setTab("rnd"); setSidebarOpen(false); }} icon={FlaskConical} label="R&D Lab" iconColor="text-violet-400" accentColor="violet" />
              <NavItem active={tab === "advanced"} onClick={() => { setTab("advanced"); setSidebarOpen(false); }} icon={Sparkles} label="Advanced Platform" iconColor="text-amber-400" accentColor="amber" />
            </NavGroup>
            {currentUser?.role === "admin" && (
              <NavGroup label="Administration" color="emerald">
                <NavItem active={tab === "users"} onClick={() => { setTab("users"); setSidebarOpen(false); }} icon={Users} label="User Management" iconColor="text-emerald-400" accentColor="emerald" />
                <NavItem active={tab === "content"} onClick={() => { setTab("content"); setSidebarOpen(false); }} icon={FileText} label="Content Editor" iconColor="text-emerald-400" accentColor="emerald" />
                <NavItem active={tab === "contributors"} onClick={() => { setTab("contributors"); setSidebarOpen(false); }} icon={Users} label="Contributions" iconColor="text-emerald-400" accentColor="emerald" />
              </NavGroup>
            )}
          </nav>
          <div className="border-t border-emerald-500/15 p-3">
            <div className="mb-2 flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-xs">
              <span className="size-1.5 rounded-full bg-emerald-500 pulse-dot" />
              <span className="font-mono text-emerald-300">SYS ONLINE</span>
              <span className="ml-auto font-mono text-emerald-400/60">{clock}</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => loadAll({ silent: true })} disabled={refreshing} className="flex-1 border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800">
                {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                <span className="ml-1 hidden sm:inline">Refresh</span>
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCredsOpen(true)} className="flex-1 border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800">
                <KeyRound className="size-3.5" />
                <span className="ml-1 hidden sm:inline">Creds</span>
              </Button>
            </div>
            {currentUser && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-400">
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[10px] font-medium text-zinc-300">{currentUser.name}</div>
                  <div className="truncate text-[8px] text-zinc-500">{currentUser.role.toUpperCase()}</div>
                </div>
                <Button size="icon" variant="ghost" onClick={onLogout} className="size-7 shrink-0 text-zinc-500 hover:bg-red-500/10 hover:text-red-400" title="Logout">
                  <LogOut className="size-3.5" />
                </Button>
              </div>
            )}
          </div>
        </aside>
        {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={() => setSidebarOpen(false)} />}
        {/* MAIN CONTENT */}
        <div className="flex flex-1 flex-col md:ml-64">
          <header className="sticky top-0 z-30 border-b border-emerald-500/20 bg-zinc-950/90 backdrop-blur-md">
            <div className="flex h-14 items-center justify-between px-4 sm:px-6">
              <div className="flex items-center gap-3">
                <button onClick={() => setSidebarOpen(true)} className="text-zinc-400 hover:text-emerald-400 md:hidden">
                  <Menu className="size-5" />
                </button>
                <h1 className={`text-sm font-bold sm:text-base ${
                  tab === "dashboard" ? "neon-emerald text-emerald-300" :
                  tab === "clients" ? "neon-emerald text-emerald-300" :
                  tab === "patches" ? "neon-emerald text-emerald-300" :
                  tab === "codebases" ? "neon-sky text-sky-300" :
                  tab === "redagent" ? "neon-red text-red-300" :
                  tab === "compliance" ? "neon-purple text-purple-300" :
                  tab === "soc" ? "neon-cyan text-cyan-300" :
                  tab === "exfil" ? "neon-rose text-rose-300" :
                  tab === "scraper" ? "neon-violet text-violet-300" :
                  tab === "dfir" ? "neon-red text-red-300" :
                  tab === "rnd" ? "neon-violet text-violet-300" :
                  tab === "users" ? "neon-emerald text-emerald-300" :
                  tab === "content" ? "neon-emerald text-emerald-300" :
                  tab === "contributors" ? "neon-emerald text-emerald-300" :
                  "neon-amber text-amber-300"
                }`}>
                  {tab === "dashboard" ? "Command Overview" :
                   tab === "clients" ? (selectedClientId ? "Client Pipeline" : "Client Engagements") :
                   tab === "pipelines" ? "Active Pipelines" :
                   tab === "rnd" ? "R&D Lab" :
                   tab === "patches" ? "Patch Review Queue" :
                   tab === "codebases" ? "Codebase Library" :
                   tab === "redagent" ? "RedAgent VAPT Engine" :
                   tab === "compliance" ? "GRC & Compliance Center" :
                   tab === "soc" ? "SOC & DevSecOps Center" :
                   tab === "exfil" ? "Data Exfiltration Defense" :
                   tab === "scraper" ? "Web Scraping Audit Engine" :
                   tab === "dfir" ? "DFIR Command Center" :
                   tab === "users" ? "User Management" :
                   tab === "content" ? "Content Editor" :
                   tab === "contributors" ? "Contributions" :
                   "Advanced Security Platform"}
                </h1>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-1 font-mono text-xs">
                <span className={`size-1.5 rounded-full ${connected ? "bg-emerald-500 pulse-dot" : "bg-amber-500 animate-pulse"}`} />
                <span className={connected ? "text-emerald-300" : "text-amber-300"}>{connected ? "LIVE" : "…"}</span>
              </div>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6">
            {tab === "dashboard" ? (
              <CommandCenter
                onSelectClient={(id) => { setSelectedClientId(id); setTab("clients"); }}
                onAddClient={() => setTab("clients")}
              />
            ) : tab === "clients" && selectedClientId ? (
              <ClientDetail clientId={selectedClientId} onBack={() => setSelectedClientId(null)} onNavigate={(t) => setTab(t as Tab)} />
            ) : tab === "clients" ? (
              <ClientsDashboard onSelectClient={(id) => setSelectedClientId(id)} />
            ) : tab === "pipelines" ? (
              <ActivePipelines onSelectClient={(id) => { setSelectedClientId(id); setTab("clients"); }} onAddClient={() => setTab("clients")} />
            ) : tab === "rnd" ? (
              <RnDLab />
            ) : (
              <>
                <section className="mb-5 fade-in-up" style={{ animationDelay: "0.1s" }}>
                  <StatsBar stats={stats} loading={statsLoading} />
                </section>
                <section className="mb-5 grid gap-4 fade-in-up lg:grid-cols-3" style={{ animationDelay: "0.15s" }}>
                  <PostureScoreCard />
                  <ThreatIntelPanel />
                  <RuntimeMonitor />
                </section>
                {tab === "redagent" ? (
                  <RedAgentPanel />
                ) : tab === "compliance" ? (
                  <ComplianceDashboard />
                ) : tab === "soc" ? (
                  <SocPanel />
                ) : tab === "exfil" ? (
                  <DataExfilPanel />
                ) : tab === "scraper" ? (
                  <AuditScraperPanel />
                ) : tab === "dfir" ? (
                  <DfirPanel />
                ) : tab === "advanced" ? (
                  <AdvancedPanel />
                ) : tab === "users" ? (
                  <UserManagementPanel />
                ) : tab === "content" ? (
                  <ContentEditor />
                ) : tab === "contributors" ? (
                  <ContributorsPanel currentUser={currentUser} />
                ) : (
              <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
                <section>
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1 text-xs">
                      <TabButton active={tab === "patches"} onClick={() => setTab("patches")}>
                        <ShieldAlert className="size-3.5" /> Patches
                        {patches.length > 0 && <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 text-[10px] text-emerald-300">{patches.length}</span>}
                      </TabButton>
                      <TabButton active={tab === "codebases"} onClick={() => setTab("codebases")}>
                        <Boxes className="size-3.5" /> Codebases
                        {codebases.length > 0 && <span className="ml-1 rounded-full bg-sky-500/20 px-1.5 text-[10px] text-sky-300">{codebases.length}</span>}
                      </TabButton>
                    </div>
                    {tab === "patches" ? (
                      <div className="flex items-center gap-2">
                        <div className="relative w-full sm:w-56">
                          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search patches…" className="border-zinc-800 bg-zinc-900/60 pl-9 text-zinc-200 placeholder:text-zinc-500 focus-visible:border-emerald-500/50" />
                        </div>
                        <div className="hidden items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1 text-xs sm:flex">
                          <SortToggle active={sortKey === "severity"} onClick={() => setSortKey("severity")}>Severity</SortToggle>
                          <SortToggle active={sortKey === "recent"} onClick={() => setSortKey("recent")}>Recent</SortToggle>
                        </div>
                      </div>
                    ) : (
                      <Button size="sm" onClick={() => setAddOpen(true)} className="bg-emerald-600 text-white hover:bg-emerald-500"><Plus className="size-4" /> Add Codebase</Button>
                    )}
                  </div>
                  {tab === "patches" ? (
                    loading ? <PatchListSkeleton /> :
                    visiblePatches.length === 0 ? (
                      <EmptyState title={query ? "No patches match your search" : "No patches pending"} body={query ? `No results for "${query}".` : "Run a scan on a codebase to generate patches."} icon={Inbox}
                        action={!query ? <Button size="sm" variant="outline" onClick={() => setTab("codebases")} className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"><Boxes className="size-4" /> Browse Codebases</Button> : null} />
                    ) : (
                      <div className="space-y-3">
                        <AnimatePresence mode="popLayout">
                          {visiblePatches.map((p) => (
                            <motion.div key={p.patch_id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.18 }}>
                              <PatchCard patch={p} onSelect={handleSelectPatch} />
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    )
                  ) : loading ? <CodebaseGridSkeleton /> :
                  codebases.length === 0 ? (
                    <EmptyState title="No codebases yet" body="Add a codebase with vulnerable code." icon={Boxes}
                      action={<Button size="sm" onClick={() => setAddOpen(true)} className="bg-emerald-600 text-white hover:bg-emerald-500"><Plus className="size-4" /> Add Codebase</Button>} />
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <AnimatePresence mode="popLayout">
                        {codebases.map((cb) => (
                          <CodebaseCard key={cb.id} codebase={cb} onScan={handleScan} onView={(c) => { setViewCodebase(c); setViewerOpen(true); }} onDelete={handleDeleteCodebase} busy={scanning} />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </section>
                <aside className="lg:sticky lg:top-20 lg:self-start">
                  <PipelineView events={events} connected={connected} active={scanning} scanStatus={activeScan?.status} stageLabel={activeScan?.stage_label} />
                </aside>
              </div>
                )}
              </>
            )}
          </main>
          <footer className="mt-auto border-t border-zinc-800/80 bg-zinc-950/80 backdrop-blur-md">
            <div className="flex flex-col items-center justify-between gap-3 px-4 py-4 text-xs text-zinc-400 sm:flex-row sm:px-6">
              <div className="flex items-center gap-2">
                <GuardianXLogo size={24} />
                <span>GuardianX · Autonomous Security Operations Platform</span>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                <a href="https://www.guardianx.in" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-emerald-400">www.guardianx.in</a>
                <a href="mailto:hello@guardianx.in" className="transition-colors hover:text-emerald-400">hello@guardianx.in</a>
                <a href="tel:+917006712347" className="transition-colors hover:text-emerald-400">+91 70067 12347</a>
              </div>
            </div>
          </footer>
        </div>
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
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200 ${
        active
          ? "bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)] ring-1 ring-emerald-500/30"
          : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
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
      <p className="mt-1 max-w-sm text-sm text-zinc-400">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </motion.div>
  );
}

function NavGroup({ label, children, color = "emerald" }: { label: string; children: React.ReactNode; color?: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-500/60",
    sky: "text-sky-500/60",
    red: "text-red-500/60",
    cyan: "text-cyan-500/60",
    purple: "text-purple-500/60",
    rose: "text-rose-500/60",
    violet: "text-violet-500/60",
    amber: "text-amber-500/60",
  };
  return (
    <div className="mb-3">
      <div className={`section-header px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest ${colorMap[color] || colorMap.emerald}`}>{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function NavItem({
  active,
  onClick,
  icon: Icon,
  label,
  badge,
  badgeColor = "emerald",
  iconColor,
  accentColor = "emerald",
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: number;
  badgeColor?: "emerald" | "sky" | "red" | "cyan" | "purple" | "rose" | "violet" | "amber";
  iconColor?: string;
  accentColor?: "emerald" | "sky" | "red" | "cyan" | "purple" | "rose" | "violet" | "amber";
}) {
  const accentMap: Record<string, { bg: string; text: string; ring: string; dot: string; badgeBg: string; badgeText: string }> = {
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-300", ring: "shadow-[inset_0_0_0_1px_rgba(16,185,129,0.4),0_0_12px_rgba(16,185,129,0.15)]", dot: "bg-emerald-500", badgeBg: "bg-emerald-500/20", badgeText: "text-emerald-300" },
    sky:     { bg: "bg-sky-500/10",     text: "text-sky-300",     ring: "shadow-[inset_0_0_0_1px_rgba(14,165,233,0.4),0_0_12px_rgba(14,165,233,0.15)]",     dot: "bg-sky-500",     badgeBg: "bg-sky-500/20",     badgeText: "text-sky-300" },
    red:     { bg: "bg-red-500/10",     text: "text-red-300",     ring: "shadow-[inset_0_0_0_1px_rgba(239,68,68,0.4),0_0_12px_rgba(239,68,68,0.15)]",     dot: "bg-red-500",     badgeBg: "bg-red-500/20",     badgeText: "text-red-300" },
    cyan:    { bg: "bg-cyan-500/10",    text: "text-cyan-300",    ring: "shadow-[inset_0_0_0_1px_rgba(6,182,212,0.4),0_0_12px_rgba(6,182,212,0.15)]",    dot: "bg-cyan-500",    badgeBg: "bg-cyan-500/20",    badgeText: "text-cyan-300" },
    purple:  { bg: "bg-purple-500/10",  text: "text-purple-300",  ring: "shadow-[inset_0_0_0_1px_rgba(168,85,247,0.4),0_0_12px_rgba(168,85,247,0.15)]",  dot: "bg-purple-500",  badgeBg: "bg-purple-500/20",  badgeText: "text-purple-300" },
    rose:    { bg: "bg-rose-500/10",    text: "text-rose-300",    ring: "shadow-[inset_0_0_0_1px_rgba(244,63,94,0.4),0_0_12px_rgba(244,63,94,0.15)]",    dot: "bg-rose-500",    badgeBg: "bg-rose-500/20",    badgeText: "text-rose-300" },
    violet:  { bg: "bg-violet-500/10",  text: "text-violet-300",  ring: "shadow-[inset_0_0_0_1px_rgba(139,92,246,0.4),0_0_12px_rgba(139,92,246,0.15)]",  dot: "bg-violet-500",  badgeBg: "bg-violet-500/20",  badgeText: "text-violet-300" },
    amber:   { bg: "bg-amber-500/10",   text: "text-amber-300",   ring: "shadow-[inset_0_0_0_1px_rgba(245,158,11,0.4),0_0_12px_rgba(245,158,11,0.15)]",   dot: "bg-amber-500",   badgeBg: "bg-amber-500/20",   badgeText: "text-amber-300" },
  };
  const a = accentMap[accentColor] || accentMap.emerald;
  const badgeA = accentMap[badgeColor] || accentMap.emerald;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
        active
          ? `${a.bg} ${a.text} ${a.ring}`
          : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200"
      }`}
    >
      <Icon className={`size-4 shrink-0 ${active ? iconColor ?? a.text : iconColor ?? "text-zinc-500"}`} />
      <span className="flex-1 text-left font-medium">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className={`rounded-full px-1.5 text-[10px] font-bold ${badgeA.badgeBg} ${badgeA.badgeText}`}>{badge}</span>
      )}
      {active && <span className={`ml-auto size-1.5 rounded-full ${a.dot} pulse-dot`} />}
    </button>
  );
}
