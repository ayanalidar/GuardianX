"use client";

/**
 * WarRoomOverlay
 * --------------
 * The GuardianX War Room: a fullscreen tri-modal command surface that
 * combines the circuit-board visualizer, voice control (backtalk),
 * gesture control (barehands), a live scan terminal, a critical
 * findings feed, and a system status panel into one wall-projection-
 * ready view.
 *
 * Tri-modal input — every action is reachable by mouse, voice, OR
 * gesture. The voice controller parses spoken commands and dispatches
 * them through the same handlers the gesture swipe uses to switch
 * views. The gesture controller fires `onGesture` for swipe/fist and
 * synthesizes clicks directly on whatever element sits under the
 * on-screen cursor.
 *
 * Activation: mounted by the Command Center behind its "War Room"
 * button. Closes on ESC, on the Exit button, or on a fist gesture
 * (barehands' "close modal" idiom).
 *
 * The overlay inherits the SignalBus context from the Command Center's
 * <SignalBusProvider>, so the live terminal + state label react to
 * engine socket.io events in real time.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  X,
  Terminal,
  Skull,
  ShieldCheck,
  Activity,
  Server,
  Cpu,
  Database,
  Wifi,
  Bug,
  Crosshair,
  Lock,
  Radar,
  Gauge,
  Building2,
  AlertTriangle,
  Volume2,
  Hand,
  Mic,
  Radio,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { CircuitBoard } from "../ai-visualizer/circuit-board";
import { useSignalBus, type VisualizerEvent } from "../ai-visualizer/signal-bus";
import { VoiceControl, type VoiceControlHandle, type VoiceCommand } from "./voice-control";
import { GestureControl, type GestureControlHandle, type GestureEvent } from "./gesture-control";
import { SafeSection } from "../safe-boundary";

export interface WarRoomOverlayProps {
  open: boolean;
  onClose: () => void;
  /** Optional: a tab name to focus on open (e.g. "findings"). */
  initialView?: WarRoomView;
}

type WarRoomView = "overview" | "clients" | "patches" | "findings" | "system";

const VIEW_ORDER: WarRoomView[] = ["overview", "clients", "patches", "findings", "system"];
const VIEW_LABEL: Record<WarRoomView, string> = {
  overview: "Overview",
  clients: "Clients",
  patches: "Patches",
  findings: "Findings",
  system: "System",
};

// ── Inline data shapes (kept loose — we read these from existing JSON APIs) ──
interface ClientRow {
  id: string;
  name: string;
  status: string;
  stats: {
    codebases: number;
    patches: number;
    pending_patches: number;
    findings: number;
    critical_findings: number;
  };
}
interface FindingRow {
  id: string;
  title: string;
  severity: string;
  category: string;
  endpoint: string;
  created_at: string;
}
interface PatchRow {
  id: string;
  patchId?: string;
  title: string;
  severity: string;
  status: string;
  affectedFile?: string;
}

// Normalize the /api/patches/pending response (which uses snake_case:
// patch_id, internal_id, affected_file) into the PatchRow shape (camelCase)
// that the War Room's JSX expects. Without this, p.id is undefined and
// React crashes on the missing `key` prop.
function normalizePatch(p: Record<string, unknown>): PatchRow {
  return {
    id: (p.internal_id as string) || (p.id as string) || (p.patch_id as string) || crypto.randomUUID(),
    patchId: (p.patch_id as string) || (p.patchId as string) || undefined,
    title: (p.title as string) || "Untitled patch",
    severity: (p.severity as string) || "medium",
    status: (p.status as string) || "pending",
    affectedFile: (p.affected_file as string) || (p.affectedFile as string) || undefined,
  };
}
interface CodebaseRow {
  id: string;
  name: string;
  language: string;
}

const TABS: Array<{ key: WarRoomView; label: string; icon: typeof Radar }> = [
  { key: "overview", label: "Overview", icon: Gauge },
  { key: "clients", label: "Clients", icon: Building2 },
  { key: "patches", label: "Patches", icon: ShieldCheck },
  { key: "findings", label: "Findings", icon: Skull },
  { key: "system", label: "System", icon: Server },
];

// ── Overlay ────────────────────────────────────────────────────────────────
export function WarRoomOverlay({ open, onClose, initialView = "overview" }: WarRoomOverlayProps) {
  const { state, events, push } = useSignalBus();
  const [view, setView] = useState<WarRoomView>(initialView);
  const [clock, setClock] = useState(new Date());

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [patches, setPatches] = useState<PatchRow[]>([]);
  const [codebases, setCodebases] = useState<CodebaseRow[]>([]);
  const [posture, setPosture] = useState<{ overall: number; overall_grade: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [findingsQuery, setFindingsQuery] = useState("");

  const voiceRef = useRef<VoiceControlHandle>(null);
  const gestureRef = useRef<GestureControlHandle>(null);
  const [voiceOn, setVoiceOn] = useState(false);
  const [gestureOn, setGestureOn] = useState(false);
  // Voice capture mode: true = always-on (tap mic once, then just talk),
  // false = push-to-talk (hold SPACE per utterance). Persists in localStorage.
  // Defaults to true so the user doesn't have to tap the mic per command.
  const [continuousMode, setContinuousMode] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem("guardianx:voice-continuous");
      if (saved !== null) setContinuousMode(saved === "1");
    } catch { /* localStorage unavailable */ }
  }, []);
  const toggleContinuousMode = useCallback(() => {
    setContinuousMode((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem("guardianx:voice-continuous", next ? "1" : "0"); } catch { /* swallow */ }
      }
      return next;
    });
  }, []);

  // ── Live clock ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, [open]);

  // ── Lock body scroll while open ─────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ── ESC + 'W' (voice toggle) + 'G' (gesture toggle) hotkeys ─────────────
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Don't steal keys from form fields.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (e.key === "ArrowLeft") cycleView(-1);
      if (e.key === "ArrowRight") cycleView(1);
      if (e.key === "v" || e.key === "V") {
        if (e.shiftKey) { e.preventDefault(); toggleContinuousMode(); }
        else { setVoiceOn((v) => !v); }
      }
      if (e.key === "g" || e.key === "G") setGestureOn((g) => !g);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, toggleContinuousMode]);

  // ── Boot the gesture controller when toggled on ────────────────────────
  useEffect(() => {
    if (!open) return;
    if (gestureOn) {
      void gestureRef.current?.enable();
    } else {
      gestureRef.current?.disable();
    }
  }, [gestureOn, open]);

  // ── Initial data load + periodic refresh ───────────────────────────────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [c, f, p, ps] = await Promise.all([
          fetch("/api/clients").then((r) => r.json()).catch(() => []),
          fetch("/api/findings?limit=20").then((r) => r.json()).catch(() => []),
          fetch("/api/patches/pending").then((r) => r.json()).catch(() => []),
          fetch("/api/posture-score").then((r) => r.json()).catch(() => null),
        ]);
        if (cancelled) return;
        if (Array.isArray(c)) setClients(c as ClientRow[]);
        if (Array.isArray(f)) setFindings(f as FindingRow[]);
        if (Array.isArray(p)) setPatches(p.map((row) => normalizePatch(row as Record<string, unknown>)));
        if (ps && typeof ps.overall === "number") setPosture(ps);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open]);

  // ── View cycling (used by swipe + arrow keys) ──────────────────────────
  const cycleView = useCallback((dir: 1 | -1) => {
    setView((v) => {
      const i = VIEW_ORDER.indexOf(v);
      const next = VIEW_ORDER[(i + dir + VIEW_ORDER.length) % VIEW_ORDER.length];
      voiceRef.current?.speak(`Showing ${VIEW_LABEL[next]}.`, { interrupt: true });
      return next;
    });
  }, []);

  // ── Voice command handler ────────────────────────────────────────────────
  const handleVoiceCommand = useCallback(
    async (cmd: VoiceCommand) => {
      switch (cmd.action) {
        case "navigate": {
          const target = cmd.target.toLowerCase();
          const match = VIEW_ORDER.find((v) =>
            v === target || VIEW_LABEL[v].toLowerCase() === target || VIEW_LABEL[v].toLowerCase().startsWith(target),
          );
          if (match) {
            setView(match);
            voiceRef.current?.speak(`Showing ${VIEW_LABEL[match]}.`, { interrupt: true });
          } else {
            voiceRef.current?.speak(`No view named ${cmd.target}. Try overview, clients, patches, findings, or system.`, { interrupt: true });
          }
          break;
        }
        case "scan": {
          // Look up codebase by name (case-insensitive substring).
          if (codebases.length === 0) {
            try {
              const cbs = await fetch("/api/codebases").then((r) => r.json());
              if (Array.isArray(cbs)) {
                setCodebases(cbs as CodebaseRow[]);
                codebases.push(...(cbs as CodebaseRow[]));
              }
            } catch {
              /* swallow */
            }
          }
          const target = cmd.target.toLowerCase().trim();
          const match = codebases.find((c) => c.name.toLowerCase().includes(target));
          if (!match) {
            voiceRef.current?.speak(`No codebase named ${cmd.target} found.`, { interrupt: true });
            return;
          }
          try {
            const res = await fetch("/api/scans", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ codebaseId: match.id }),
            });
            const data = (await res.json()) as { scanId?: string; error?: string };
            if (!res.ok || data.error) {
              voiceRef.current?.speak(`Scan failed: ${data.error ?? "unknown error"}.`, { interrupt: true });
              return;
            }
            push({
              type: "scan_started",
              state: "scanning",
              message: `Scan started on ${match.name} (voice)`,
              severity: "info",
              meta: { scanId: data.scanId, codebaseId: match.id },
            });
            voiceRef.current?.speak(`Scan started on ${match.name}. I'll let you know when it completes.`, { interrupt: true });
          } catch {
            voiceRef.current?.speak("Scan failed: network error.", { interrupt: true });
          }
          break;
        }
        case "approve": {
          const id = cmd.target.trim();
          try {
            const res = await fetch(`/api/patches/${encodeURIComponent(id)}/approve`, { method: "POST" });
            const data = (await res.json()) as { patch_id?: string; error?: string; message?: string };
            if (!res.ok || data.error) {
              voiceRef.current?.speak(`Approval failed: ${data.error ?? "unknown error"}.`, { interrupt: true });
              return;
            }
            push({
              type: "patch_approved",
              state: "patching",
              message: `Patch ${id} approved (voice)`,
              severity: "success",
              meta: { patchId: data.patch_id },
            });
            voiceRef.current?.speak(`Patch ${id} approved and attested.`, { interrupt: true });
          } catch {
            voiceRef.current?.speak("Approval failed: network error.", { interrupt: true });
          }
          break;
        }
        case "search": {
          const q = cmd.target.toLowerCase().trim();
          setFindingsQuery(q);
          setView("findings");
          const matches = findings.filter(
            (f) =>
              f.title.toLowerCase().includes(q) ||
              f.category.toLowerCase().includes(q) ||
              f.endpoint.toLowerCase().includes(q),
          );
          voiceRef.current?.speak(`Found ${matches.length} ${matches.length === 1 ? "finding" : "findings"} matching ${cmd.target}.`, { interrupt: true });
          break;
        }
        case "status": {
          if (posture) {
            voiceRef.current?.speak(
              `Security posture: ${posture.overall} out of 100. Grade ${posture.overall_grade}. ${
                posture.overall >= 75 ? "Status is healthy." : posture.overall >= 50 ? "Status is fair." : "Status requires attention."
              }`,
              { interrupt: true },
            );
          } else {
            voiceRef.current?.speak("Posture score unavailable. Try again in a moment.", { interrupt: true });
          }
          break;
        }
        case "stop": {
          voiceRef.current?.stopSpeaking();
          break;
        }
        case "unknown": {
          // Echo back so the user gets feedback that the command was heard
          // but not understood — don't interrupt existing speech.
          voiceRef.current?.speak(`I heard "${cmd.raw}" but didn't recognize a command.`, { interrupt: false });
          break;
        }
      }
    },
    [codebases, findings, posture, push],
  );

  // ── Gesture handler ─────────────────────────────────────────────────────
  const handleGesture = useCallback(
    (g: GestureEvent) => {
      switch (g.kind) {
        case "swipe":
          cycleView(g.direction === "right" ? 1 : -1);
          break;
        case "fist":
          onClose();
          break;
        case "palm":
        case "click":
        case "zoom":
          // click is handled directly by GestureControl (synthetic click);
          // palm-scroll and zoom are handled locally too. Nothing to do here.
          break;
      }
    },
    [cycleView, onClose],
  );

  if (!open) return null;

  // ── Derived stats for the overview ──────────────────────────────────────
  const totalFindings = clients.reduce((s, c) => s + (c.stats.findings || 0), 0);
  const criticalFindings = clients.reduce((s, c) => s + (c.stats.critical_findings || 0), 0);
  const pendingPatches = clients.reduce((s, c) => s + (c.stats.pending_patches || 0), 0);

  const stateColor =
    state === "finding" ? "text-red-400" :
    state === "patching" ? "text-emerald-400" :
    state === "analyzing" ? "text-amber-400" :
    state === "scanning" ? "text-cyan-400" :
    "text-zinc-300";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="fixed inset-0 z-[150] overflow-hidden bg-zinc-950"
      >
        {/* ── Background: circuit board visualizer ──────────────────────── */}
        <div className="absolute inset-0">
          <CircuitBoard showHud opacity={0.55} />
        </div>
        <div className="scanlines cyber-vignette pointer-events-none absolute inset-0 opacity-40" />

        {/* ── Top header ─────────────────────────────────────────────────── */}
        <header className="absolute left-0 right-0 top-0 z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center gap-3 sm:gap-4">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              <span className="neon-emerald">WAR</span>{" "}
              <span className="neon-red">ROOM</span>
            </h1>
            <div className="hidden items-center gap-2 rounded-lg border border-emerald-500/40 bg-zinc-950/80 px-3 py-1.5 backdrop-blur sm:flex">
              <Radar className={`size-4 ${stateColor}`} />
              <span className={`font-mono text-sm font-bold ${stateColor}`}>{state.toUpperCase()}</span>
            </div>
            {posture && (
              <div className="hidden items-center gap-2 rounded-lg border border-emerald-500/40 bg-zinc-950/80 px-3 py-1.5 backdrop-blur sm:flex">
                <Gauge className="size-4 text-emerald-400" />
                <span className="font-mono text-sm font-bold text-emerald-300">
                  {posture.overall} <span className="text-zinc-500">/100</span> · {posture.overall_grade}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            {/* Clock */}
            <div className="rounded-lg border border-emerald-500/30 bg-zinc-950/80 px-3 py-1.5 font-mono backdrop-blur">
              <div className="text-[8px] uppercase tracking-wider text-emerald-500/60">SYS TIME</div>
              <div className="text-sm font-bold text-emerald-300">
                {clock.toLocaleTimeString("en-US", { hour12: false })}
              </div>
            </div>

            {/* Voice toggle */}
            <Button
              variant="outline"
              onClick={() => setVoiceOn((v) => !v)}
              className={`border-emerald-500/40 bg-zinc-950/80 backdrop-blur ${
                voiceOn ? "bg-emerald-500/20 text-emerald-300" : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="V — toggle voice"
            >
              <Volume2 className="size-4" /> <span className="hidden sm:inline">Voice</span>
            </Button>

            {/* Voice capture mode toggle — only when voice panel is on. */}
            {voiceOn && (
              <Button
                variant="outline"
                onClick={toggleContinuousMode}
                className={`backdrop-blur ${
                  continuousMode
                    ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-300"
                    : "border-amber-500/50 bg-zinc-950/80 text-amber-300 hover:bg-amber-500/10"
                }`}
                title={
                  continuousMode
                    ? "Always-on — tap mic once, then just talk. ESC stops. (Shift+V for push-to-talk)"
                    : "Push-to-talk — hold SPACE per command. (Shift+V for always-on)"
                }
              >
                {continuousMode ? (
                  <><Radio className="size-4" /><span className="hidden sm:inline">Always-on</span></>
                ) : (
                  <><Mic className="size-4" /><span className="hidden sm:inline">Push-to-talk</span></>
                )}
              </Button>
            )}

            {/* Gesture toggle */}
            <Button
              variant="outline"
              onClick={() => setGestureOn((g) => !g)}
              className={`border-cyan-500/40 bg-zinc-950/80 backdrop-blur ${
                gestureOn ? "bg-cyan-500/20 text-cyan-300" : "text-zinc-400 hover:text-zinc-200"
              }`}
              title="G — toggle gesture"
            >
              <Hand className="size-4" /> <span className="hidden sm:inline">Gesture</span>
            </Button>

            <Button
              variant="outline"
              onClick={onClose}
              className="border-red-500/40 bg-zinc-950/80 text-red-300 backdrop-blur hover:bg-red-500/10"
              title="ESC — exit"
            >
              <X className="size-4" /> <span className="hidden sm:inline">Exit</span>
            </Button>
          </div>
        </header>

        {/* ── Tab strip ──────────────────────────────────────────────────── */}
        <nav className="absolute left-1/2 top-[88px] z-20 -translate-x-1/2">
          <div className="flex items-center gap-1 rounded-full border border-zinc-700/60 bg-zinc-950/80 p-1 backdrop-blur">
            <button
              type="button"
              onClick={() => cycleView(-1)}
              aria-label="Previous view"
              className="flex size-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-emerald-300"
            >
              <ChevronLeft className="size-4" />
            </button>
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = view === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setView(t.key)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? "bg-emerald-500/20 text-emerald-300"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                  data-gx-clickable
                >
                  <Icon className="size-3.5" />
                  <span className="hidden sm:inline">{t.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => cycleView(1)}
              aria-label="Next view"
              className="flex size-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-emerald-300"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </nav>

        {/* ── Main content area ──────────────────────────────────────────── */}
        <main className="absolute inset-x-0 top-[140px] bottom-[260px] z-10 overflow-y-auto px-4 custom-scrollbar sm:bottom-[280px] sm:px-6">
          <div className="mx-auto max-w-7xl">
            <AnimatePresence mode="wait">
              {view === "overview" && (
                <SafeSection name="War Room — Overview">
                <motion.div
                  key="overview"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                  className="grid grid-cols-2 gap-4 lg:grid-cols-4"
                >
                  <KpiBig label="CLIENTS" value={clients.length} icon={Building2} color="emerald" />
                  <KpiBig label="PENDING PATCHES" value={pendingPatches} icon={ShieldCheck} color="amber" pulse={pendingPatches > 0} />
                  <KpiBig label="FINDINGS" value={totalFindings} icon={Bug} color="cyan" />
                  <KpiBig label="CRITICAL" value={criticalFindings} icon={AlertTriangle} color="red" pulse={criticalFindings > 0} />
                </motion.div>
                </SafeSection>
              )}

              {view === "clients" && (
                <SafeSection name="War Room — Clients">
                <motion.div
                  key="clients"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  <PanelCard title="CLIENT PIPELINE STATUS" icon={Building2} accent="emerald">
                    {loading && clients.length === 0 ? (
                      <SkeletonRows count={4} />
                    ) : clients.length === 0 ? (
                      <EmptyRow label="No clients found" />
                    ) : (
                      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                        {clients.map((c) => (
                          <div
                            key={c.id}
                            data-gx-clickable
                            className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5"
                          >
                            <div className="flex items-center justify-between">
                              <span className="truncate font-bold text-zinc-100">{c.name}</span>
                              <span className={`font-mono text-[10px] ${c.status === "compliant" ? "text-emerald-400" : "text-cyan-400"}`}>
                                [{(c.status || "?").toUpperCase()}]
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-3 font-mono text-[11px]">
                              <span className="text-sky-400">{c.stats.codebases} repos</span>
                              <span className="text-emerald-400">{c.stats.patches} patches</span>
                              <span className="text-amber-400">{c.stats.findings} findings</span>
                              {c.stats.critical_findings > 0 && (
                                <span className="font-bold text-red-400">⚠ {c.stats.critical_findings}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </PanelCard>
                </motion.div>
                </SafeSection>
              )}

              {view === "patches" && (
                <SafeSection name="War Room — Patches">
                <motion.div
                  key="patches"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  <PanelCard title="PENDING PATCHES" icon={ShieldCheck} accent="amber">
                    {loading && patches.length === 0 ? (
                      <SkeletonRows count={4} />
                    ) : patches.length === 0 ? (
                      <EmptyRow label="No pending patches — everything is approved" />
                    ) : (
                      <div className="space-y-1.5">
                        {patches.slice(0, 30).map((p) => {
                          const sev = p.severity === "critical" ? "red" : p.severity === "high" ? "amber" : "cyan";
                          const sevCfg = SEV_CFG[sev];
                          return (
                            <div
                              key={p.id}
                              data-gx-clickable
                              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2.5 transition-all hover:border-emerald-500/40"
                            >
                              <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${sevCfg.chip}`}>
                                {p.severity}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm text-zinc-200">{p.title}</div>
                                {p.affectedFile && (
                                  <div className="truncate font-mono text-[10px] text-zinc-500">{p.affectedFile}</div>
                                )}
                              </div>
                              <span className="shrink-0 font-mono text-[10px] text-zinc-600">
                                {p.patchId ?? p.id.slice(0, 8)}
                              </span>
                              <button
                                type="button"
                                data-gx-clickable
                                onClick={async () => {
                                  const id = p.patchId ?? p.id;
                                  try {
                                    const res = await fetch(`/api/patches/${encodeURIComponent(id)}/approve`, { method: "POST" });
                                    const data = (await res.json()) as { patch_id?: string; error?: string };
                                    if (res.ok && !data.error) {
                                      voiceRef.current?.speak(`Patch ${id} approved.`, { interrupt: true });
                                      setPatches((cur) => cur.filter((x) => x.id !== p.id));
                                    } else {
                                      voiceRef.current?.speak(`Approval failed: ${data.error ?? "unknown"}.`, { interrupt: true });
                                    }
                                  } catch {
                                    voiceRef.current?.speak("Approval failed: network error.", { interrupt: true });
                                  }
                                }}
                                className="shrink-0 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] font-bold uppercase text-emerald-300 transition-all hover:bg-emerald-500/20"
                              >
                                Approve
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </PanelCard>
                </motion.div>
                </SafeSection>
              )}

              {view === "findings" && (
                <SafeSection name="War Room — Findings">
                <motion.div
                  key="findings"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  <PanelCard title="CRITICAL FINDINGS FEED" icon={Skull} accent="red">
                    {findingsQuery && (
                      <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-emerald-400/80">
                        Filter: &ldquo;{findingsQuery}&rdquo; · {filteredFindings(findings, findingsQuery).length} match{filteredFindings(findings, findingsQuery).length === 1 ? "" : "es"}
                      </div>
                    )}
                    {loading && findings.length === 0 ? (
                      <SkeletonRows count={5} />
                    ) : findings.length === 0 ? (
                      <EmptyRow label="No findings recorded" />
                    ) : (
                      <div className="max-h-[50vh] space-y-1 overflow-y-auto custom-scrollbar">
                        {filteredFindings(findings, findingsQuery).slice(0, 50).map((f) => {
                          const sev = f.severity === "critical" ? "red" : f.severity === "high" ? "amber" : "cyan";
                          const sevCfg = SEV_CFG[sev];
                          return (
                            <div
                              key={f.id}
                              data-gx-clickable
                              className="flex items-start gap-2 rounded border border-zinc-800 bg-zinc-950/60 p-2 transition-all hover:border-red-500/30"
                            >
                              <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${sevCfg.chip}`}>
                                {f.severity}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-zinc-200">{f.title}</div>
                                <div className="truncate font-mono text-[10px] text-zinc-500">
                                  {f.category} · {f.endpoint}
                                </div>
                              </div>
                              <span className="shrink-0 font-mono text-[9px] text-zinc-600">
                                {new Date(f.created_at).toLocaleTimeString("en-US", { hour12: false })}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </PanelCard>
                </motion.div>
                </SafeSection>
              )}

              {view === "system" && (
                <SafeSection name="War Room — System">
                <motion.div
                  key="system"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  <PanelCard title="SYSTEM STATUS" icon={Server} accent="emerald">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <SystemRow icon={Server} label="Vercel API" status="ONLINE" detail="100ms" />
                      <SystemRow icon={Cpu} label="Railway Engine" status="ONLINE" detail="bun + python3" />
                      <SystemRow icon={Database} label="Supabase DB" status={clients.length > 0 ? "ONLINE" : "DEGRADED"} detail="HTTPS/443" />
                      <SystemRow icon={Wifi} label="Socket.io Relay" status={events.length > 0 ? "ACTIVE" : "ONLINE"} detail={`${events.length} events buffered`} />
                      <SystemRow icon={Activity} label="Visualizer" status={state.toUpperCase()} detail="rAF + canvas" />
                      <SystemRow icon={Lock} label="Auth" status="ONLINE" detail="JWT + 2FA" />
                    </div>
                  </PanelCard>
                </motion.div>
                </SafeSection>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* ── Bottom-left: live scan terminal ───────────────────────────── */}
        <div className="absolute bottom-4 left-4 z-20 w-[420px] max-w-[calc(100vw-2rem)]">
          <LiveTerminal events={events} />
        </div>

        {/* ── Bottom-center-right: voice control (toggle) ────────────────── */}
        {/* On mobile (below sm), stack above the live terminal to avoid overlap. */}
        <AnimatePresence>
          {voiceOn && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-4 right-4 z-20 w-[420px] max-w-[calc(100vw-2rem)] max-sm:bottom-[16rem]"
            >
              <VoiceControl
                ref={voiceRef}
                continuous={continuousMode}
                onCommand={handleVoiceCommand}
                speakResponses={false}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Gesture control (always mounted when toggle on; can be hidden) ── */}
        <AnimatePresence>
          {gestureOn && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute right-4 top-[140px] z-20 w-[320px] max-w-[calc(100vw-2rem)]"
            >
              <GestureControl ref={gestureRef} onGesture={handleGesture} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Bottom hint ───────────────────────────────────────────────── */}
        {/* Full hint on desktop, abbreviated on mobile so it doesn't overflow. */}
        <div className="pointer-events-none absolute bottom-1 left-1/2 z-10 hidden -translate-x-1/2 sm:block">
          <div className="rounded-full border border-zinc-700/50 bg-zinc-950/60 px-4 py-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500 backdrop-blur">
            ESC — exit · ← → — view · V — voice · Shift+V — always-on / push-to-talk · G — gesture · fist — close
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-1 left-1/2 z-10 -translate-x-1/2 sm:hidden">
          <div className="rounded-full border border-zinc-700/50 bg-zinc-950/60 px-3 py-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500 backdrop-blur">
            ESC exit · ← → view · V voice · G gesture
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Helper components ─────────────────────────────────────────────────────
const SEV_CFG: Record<string, { chip: string; text: string }> = {
  red: { chip: "bg-red-500/20 text-red-300", text: "text-red-400" },
  amber: { chip: "bg-amber-500/20 text-amber-300", text: "text-amber-400" },
  cyan: { chip: "bg-cyan-500/20 text-cyan-300", text: "text-cyan-400" },
  emerald: { chip: "bg-emerald-500/20 text-emerald-300", text: "text-emerald-400" },
};

function filteredFindings(rows: FindingRow[], q: string): FindingRow[] {
  if (!q) return rows;
  const lq = q.toLowerCase();
  return rows.filter(
    (f) =>
      f.title.toLowerCase().includes(lq) ||
      f.category.toLowerCase().includes(lq) ||
      f.endpoint.toLowerCase().includes(lq),
  );
}

function KpiBig({ label, value, icon: Icon, color, pulse }: {
  label: string;
  value: number;
  icon: typeof Activity;
  color: "emerald" | "cyan" | "amber" | "red";
  pulse?: boolean;
}) {
  const cfg = SEV_CFG[color] ?? SEV_CFG.emerald;
  return (
    <div className="holo-card-sharp hud-corners rounded-xl border border-zinc-700/60 bg-zinc-950/80 p-4 text-center backdrop-blur">
      <Icon className={`mx-auto size-5 ${cfg.text} ${pulse ? "animate-pulse" : ""}`} />
      <div className={`mt-2 text-3xl font-bold font-mono ${cfg.text}`}>{value}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">{label}</div>
    </div>
  );
}

function PanelCard({ title, icon: Icon, accent, children }: {
  title: string;
  icon: typeof Activity;
  accent: "emerald" | "cyan" | "amber" | "red";
  children: React.ReactNode;
}) {
  const cfg = SEV_CFG[accent] ?? SEV_CFG.emerald;
  return (
    <section className="holo-card-sharp hud-corners rounded-xl border border-zinc-700/60 bg-zinc-950/80 p-4 backdrop-blur">
      <div className="mb-3 flex items-center gap-2">
        <Icon className={`size-4 ${cfg.text}`} />
        <h2 className={`font-mono text-xs font-bold uppercase tracking-widest ${cfg.text}`}>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg border border-zinc-800 bg-zinc-900/60" />
      ))}
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div className="py-8 text-center text-zinc-600">
      <Activity className="mx-auto size-5" />
      <p className="mt-1 font-mono text-xs">{label}</p>
    </div>
  );
}

function SystemRow({ icon: Icon, label, status, detail }: {
  icon: typeof Server;
  label: string;
  status: string;
  detail?: string;
}) {
  const isOk = /ONLINE|ACTIVE/i.test(status);
  const color = isOk ? "emerald" : "amber";
  const cfg = SEV_CFG[color] ?? SEV_CFG.emerald;
  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-black/40 p-2">
      <div className="flex items-center gap-2">
        <Icon className="size-3 text-zinc-500" />
        <span className="text-xs text-zinc-400">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {detail && <span className="font-mono text-[9px] text-zinc-600">{detail}</span>}
        <span className={`size-1.5 rounded-full ${isOk ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
        <span className={`font-mono text-[10px] font-bold ${cfg.text}`}>{status}</span>
      </div>
    </div>
  );
}

function LiveTerminal({ events }: { events: VisualizerEvent[] }) {
  const findingCount = events.filter((e) => e.type === "finding_found").length;
  const patchCount = events.filter((e) => e.type === "patch_generated" || e.type === "patch_approved").length;
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-zinc-950/85 p-3 backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="size-4 text-emerald-400" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-emerald-400/80">LIVE SCAN TERMINAL</span>
        </div>
        <div className="flex items-center gap-3 font-mono text-[10px]">
          <span className="flex items-center gap-1 text-red-400"><Skull className="size-3" /> {findingCount}</span>
          <span className="flex items-center gap-1 text-emerald-400"><ShieldCheck className="size-3" /> {patchCount}</span>
          <span className="flex items-center gap-1 text-cyan-400"><Crosshair className="size-3" /> {events.length}</span>
        </div>
      </div>
      <div className="custom-scrollbar max-h-40 space-y-0.5 overflow-y-auto font-mono text-[10px]">
        {events.length === 0 ? (
          <div className="py-4 text-center text-zinc-600">Waiting for engine events…</div>
        ) : (
          events.slice(0, 40).map((e) => {
            const sev =
              e.severity === "error" ? "text-red-400" :
              e.severity === "warning" ? "text-amber-400" :
              e.severity === "success" ? "text-emerald-400" :
              "text-cyan-400";
            const tag =
              e.severity === "error" ? "ERR" :
              e.severity === "warning" ? "WRN" :
              e.severity === "success" ? "OK " :
              "INF";
            const time = new Date(e.ts).toLocaleTimeString("en-US", { hour12: false });
            return (
              <div key={e.id} className="flex items-start gap-1.5">
                <span className="shrink-0 text-zinc-600">{time}</span>
                <span className={`shrink-0 font-bold ${sev}`}>{tag}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-300">{e.message}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
