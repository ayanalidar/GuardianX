"use client";

// APT Persona Engine — full-screen Command-Center tab.
//
// An AI role-plays as specific threat actor groups (Lazarus, APT29, FIN7,
// Anonymous Sudan, etc.) and simulates how THEY would attack the user's
// codebase — using their known TTPs, preferred vuln classes, and tooling.
//
// Layout:
//   Header        → "APT PERSONA ENGINE" with skull icon + tagline
//   Persona grid  → 10+ cards (name, alias, flag, sophistication, simulate btn)
//   Codebase sel. → dialog to pick a codebase to attack
//   Results       → kill chain viz (recon → initial_access → execution →
//                   persistence → exfiltration) + prose summary
//
// Dark theme, color per persona, hud-corners, NO indigo/blue. Mobile-first.

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertOctagon,
  ArrowRight,
  Boxes,
  Crosshair,
  Database,
  Eye,
  FileCode2,
  Flag,
  GitFork,
  Globe,
  Loader2,
  Lock,
  Play,
  Radio,
  Skull,
  Target,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  APT_PERSONAS,
  PERSONA_COLOR_MAP,
  SOPHISTICATION_COLOR,
  SOPHISTICATION_LABEL,
  type AptPersona,
  type Sophistication,
} from "@/lib/apt-personas";

// ── Types (mirror the API route) ──────────────────────────────────────────
interface AttackStep {
  step: number;
  phase: string; // recon | initial_access | execution | persistence | exfiltration | impact
  ttp: string;
  target: string;
  vulnClass: string;
  exploit: string;
  likelihood: number;
}

interface SimulateResponse {
  persona: {
    id: string;
    name: string;
    alias: string;
    origin: string;
    flag: string;
    sophistication: Sophistication;
    color: AptPersona["color"];
    knownFor: string;
  };
  attackPlan: AttackStep[];
  summary: string;
  codebaseName: string;
  generatedAt: string;
  provider: string;
  usedFallback: boolean;
}

interface Codebase {
  id: string;
  name: string;
  language?: string | null;
  description?: string | null;
}

// ── Phase icon mapping (recon → exfiltration) ──────────────────────────────
const PHASE_ICON: Record<string, React.ReactNode> = {
  recon: <Eye className="size-4" />,
  initial_access: <Lock className="size-4" />,
  initial: <Lock className="size-4" />,
  execution: <Play className="size-4" />,
  persistence: <Database className="size-4" />,
  exfiltration: <GitFork className="size-4" />,
  impact: <AlertOctagon className="size-4" />,
};
const DEFAULT_PHASE_ICON = <Crosshair className="size-4" />;

const PHASE_COLOR: Record<string, string> = {
  recon: "#06b6d4",         // cyan
  initial_access: "#f59e0b", // amber
  initial: "#f59e0b",
  execution: "#f43f5e",      // rose
  persistence: "#8b5cf6",    // violet
  exfiltration: "#ef4444",   // red
  impact: "#ef4444",
};

// ── API helpers ────────────────────────────────────────────────────────────
function authHeaders(): HeadersInit {
  const token = typeof window !== "undefined" ? localStorage.getItem("guardianx-token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchCodebases(signal: AbortSignal): Promise<Codebase[]> {
  const res = await fetch("/api/codebases", {
    credentials: "same-origin",
    headers: authHeaders(),
    signal,
  });
  const data = (await res.json().catch(() => [])) as Array<Codebase & { error?: string }>;
  if (!res.ok) return [];
  return data;
}

async function postSimulate(codebaseId: string, personaId: string, signal: AbortSignal): Promise<SimulateResponse> {
  const res = await fetch("/api/apt-simulate", {
    method: "POST",
    credentials: "same-origin",
    headers: authHeaders(),
    body: JSON.stringify({ codebaseId, personaId }),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as SimulateResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data?.error ?? `Simulation failed (${res.status})`);
  }
  return data;
}

// ── Component ──────────────────────────────────────────────────────────────
export function AptPersonaEngine() {
  const [codebases, setCodebases] = useState<Codebase[]>([]);
  const [codebasesLoading, setCodebasesLoading] = useState(true);

  // Which persona's "Simulate Attack" was clicked — opens the codebase dialog.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activePersona, setActivePersona] = useState<AptPersona | null>(null);
  const [selectedCodebaseId, setSelectedCodebaseId] = useState<string>("");

  // Running + result state.
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimulateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Load codebases (once) ────────────────────────────────────────────────
  useEffect(() => {
    const ac = new AbortController();
    setCodebasesLoading(true);
    fetchCodebases(ac.signal)
      .then((cbs) => {
        setCodebases(cbs);
        if (cbs.length > 0) setSelectedCodebaseId(cbs[0].id);
      })
      .catch(() => {})
      .finally(() => setCodebasesLoading(false));
    return () => ac.abort();
  }, []);

  // ── Persona → dialog → simulate ──────────────────────────────────────────
  const handleSimulateClick = useCallback((persona: AptPersona) => {
    setActivePersona(persona);
    setResult(null);
    setError(null);
    setDialogOpen(true);
  }, []);

  const handleRunSimulation = useCallback(async () => {
    if (!activePersona || !selectedCodebaseId || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    const ac = new AbortController();
    try {
      const res = await postSimulate(selectedCodebaseId, activePersona.id, ac.signal);
      setResult(res);
      setDialogOpen(false);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message ?? "Simulation failed.");
      }
    } finally {
      setRunning(false);
    }
  }, [activePersona, selectedCodebaseId, running]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto p-3 sm:gap-6 sm:p-6">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="holo-card-sharp hud-corners neon-border-violet relative flex flex-wrap items-center justify-between gap-3 overflow-hidden rounded-xl bg-zinc-950/80 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-md border border-violet-500/40 bg-violet-500/10">
            <Skull className="size-5 text-violet-400" />
          </div>
          <div>
            <h1 className="neon-violet font-mono text-base font-bold uppercase tracking-widest sm:text-xl">
              APT Persona Engine
            </h1>
            <p className="text-[11px] text-zinc-500 sm:text-xs">
              AI role-plays as real threat actor groups · simulate their attack on your codebase
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="border-violet-500/40 bg-violet-500/5 font-mono text-[10px] text-violet-400"
          >
            {APT_PERSONAS.length} PERSONAS
          </Badge>
        </div>
      </header>

      {/* ── Persona grid ──────────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Target className="size-4 text-rose-400" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-400">
            Threat Actor Groups
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {APT_PERSONAS.map((persona, idx) => {
            const colorMap = PERSONA_COLOR_MAP[persona.color] ?? PERSONA_COLOR_MAP.rose;
            return (
              <motion.div
                key={persona.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 180,
                  damping: 22,
                  delay: Math.min(idx * 0.04, 0.4),
                }}
                className={`holo-card-sharp hud-corners ${colorMap.borderClass} relative flex flex-col gap-3 overflow-hidden rounded-xl bg-zinc-950/80 p-4`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl leading-none">{persona.flag}</span>
                    <div className="flex flex-col">
                      <span
                        className={`font-mono text-sm font-bold leading-tight ${colorMap.neonClass}`}
                      >
                        {persona.name}
                      </span>
                      <span className="font-mono text-[10px] leading-tight text-zinc-500">
                        {persona.origin}
                      </span>
                    </div>
                  </div>
                  <span
                    className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
                    style={{
                      color: SOPHISTICATION_COLOR[persona.sophistication],
                      background: `${SOPHISTICATION_COLOR[persona.sophistication]}22`,
                      border: `1px solid ${SOPHISTICATION_COLOR[persona.sophistication]}55`,
                    }}
                  >
                    {SOPHISTICATION_LABEL[persona.sophistication]}
                  </span>
                </div>

                <p className="text-[11px] leading-relaxed text-zinc-400">
                  {persona.description}
                </p>

                <div className="flex flex-wrap gap-1">
                  {persona.preferredVulns.slice(0, 3).map((v) => (
                    <span
                      key={v}
                      className="rounded border border-zinc-700 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400"
                    >
                      {v}
                    </span>
                  ))}
                  {persona.preferredVulns.length > 3 && (
                    <span className="rounded px-1.5 py-0.5 font-mono text-[9px] text-zinc-600">
                      +{persona.preferredVulns.length - 3}
                    </span>
                  )}
                </div>

                <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                  <span className="font-mono text-[10px] text-zinc-600">
                    active since {persona.activeSince}
                  </span>
                  <Button
                    size="sm"
                    onClick={() => handleSimulateClick(persona)}
                    disabled={running}
                    className="border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest transition-all"
                    style={{
                      color: colorMap.hex,
                      background: `${colorMap.hex}10`,
                      borderColor: `${colorMap.hex}55`,
                    }}
                  >
                    <Crosshair className="size-3" />
                    Simulate Attack
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ── Codebase selector dialog ──────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !running && setDialogOpen(o)}>
        <DialogContent className="border-zinc-700 bg-zinc-950 p-0 sm:max-w-md">
          <DialogHeader className="border-b border-zinc-800 px-5 py-4">
            <DialogTitle className="flex items-center gap-2 font-mono text-sm uppercase tracking-widest">
              {activePersona && (
                <>
                  <span className="text-xl leading-none">{activePersona.flag}</span>
                  <span
                    className={PERSONA_COLOR_MAP[activePersona.color]?.neonClass}
                  >
                    {activePersona.name}
                  </span>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              Pick the codebase for {activePersona?.name} to attack.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 px-5 py-4">
            {codebasesLoading ? (
              <Skeleton className="h-10 w-full rounded-md bg-zinc-800/60" />
            ) : codebases.length === 0 ? (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
                No codebases available. Onboard a client + import a codebase first.
              </div>
            ) : (
              <Select
                value={selectedCodebaseId}
                onValueChange={setSelectedCodebaseId}
              >
                <SelectTrigger className="border-zinc-700 bg-zinc-900 font-mono text-xs text-zinc-200">
                  <SelectValue placeholder="Select a codebase..." />
                </SelectTrigger>
                <SelectContent className="border-zinc-700 bg-zinc-900 font-mono text-xs">
                  {codebases.map((cb) => (
                    <SelectItem
                      key={cb.id}
                      value={cb.id}
                      className="text-zinc-200 focus:bg-zinc-800"
                    >
                      <span className="flex items-center gap-2">
                        <FileCode2 className="size-3 text-cyan-400" />
                        {cb.name}
                        <span className="text-zinc-600">· {cb.language ?? "js"}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                Attack profile
              </p>
              {activePersona && (
                <ul className="flex flex-col gap-1.5 text-[11px] text-zinc-400">
                  <li className="flex items-start gap-2">
                    <Target className="mt-0.5 size-3 shrink-0 text-rose-400" />
                    <span>
                      <span className="text-zinc-500">Motivation:</span>{" "}
                      {activePersona.motivation}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="mt-0.5 size-3 shrink-0 text-amber-400" />
                    <span>
                      <span className="text-zinc-500">Preferred vulns:</span>{" "}
                      {activePersona.preferredVulns.join(", ")}
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Boxes className="mt-0.5 size-3 shrink-0 text-cyan-400" />
                    <span>
                      <span className="text-zinc-500">Known TTPs:</span>{" "}
                      {activePersona.ttps.length} techniques loaded
                    </span>
                  </li>
                </ul>
              )}
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => !running && setDialogOpen(false)}
              disabled={running}
              className="border-zinc-700 bg-zinc-900 font-mono text-[11px] text-zinc-300 hover:bg-zinc-800"
            >
              <X className="size-3.5" />
              CANCEL
            </Button>
            <Button
              size="sm"
              onClick={handleRunSimulation}
              disabled={!selectedCodebaseId || running || codebases.length === 0}
              className="border-rose-500/60 bg-gradient-to-r from-rose-500/20 to-red-500/20 font-mono text-[11px] font-bold uppercase tracking-widest text-rose-300 hover:from-rose-500/30 hover:to-red-500/30"
            >
              {running ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  SIMULATING
                </>
              ) : (
                <>
                  <Play className="size-3.5" />
                  Run Simulation
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Results: kill chain + summary ─────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="holo-card-sharp hud-corners neon-border-red relative overflow-hidden rounded-xl bg-zinc-950/80 p-4 sm:p-6"
          >
            <div className="flex items-start gap-2 text-rose-300">
              <AlertOctagon className="mt-0.5 size-4 shrink-0 text-rose-400" />
              <div>
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-rose-400">
                  Simulation Failed
                </span>
                <p className="mt-1 text-xs text-zinc-400">{error}</p>
              </div>
            </div>
          </motion.div>
        )}

        {result && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ type: "spring", stiffness: 160, damping: 20 }}
            className="flex flex-col gap-4"
          >
            {/* Persona header for the result */}
            <div
              className={`holo-card-sharp hud-corners ${PERSONA_COLOR_MAP[result.persona.color]?.borderClass ?? "neon-border-rose"} relative overflow-hidden rounded-xl bg-zinc-950/80 p-4 sm:p-6`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl leading-none">{result.persona.flag}</span>
                  <div>
                    <h2
                      className={`font-mono text-lg font-bold uppercase tracking-widest sm:text-xl ${PERSONA_COLOR_MAP[result.persona.color]?.neonClass ?? "neon-red"}`}
                    >
                      {result.persona.name}
                    </h2>
                    <p className="font-mono text-[11px] text-zinc-500">
                      {result.persona.alias} · {result.persona.origin}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {result.usedFallback && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 bg-amber-500/5 font-mono text-[10px] text-amber-400"
                    >
                      HEURISTIC
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className="border-zinc-700 bg-zinc-900/60 font-mono text-[10px] text-zinc-400"
                  >
                    via {result.provider}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setResult(null)}
                    className="border-zinc-700 bg-zinc-900 font-mono text-[11px] text-zinc-300 hover:bg-zinc-800"
                  >
                    <X className="size-3.5" />
                    CLEAR
                  </Button>
                </div>
              </div>
            </div>

            {/* Prose summary */}
            <div className="holo-card-sharp hud-corners relative overflow-hidden rounded-xl bg-zinc-950/80 p-4 sm:p-6">
              <div className="mb-3 flex items-center gap-2">
                <Activity className="size-4 text-emerald-400" />
                <span className="font-mono text-[11px] uppercase tracking-widest text-emerald-400">
                  Operator's Assessment
                </span>
              </div>
              <p className="text-sm leading-relaxed text-zinc-200">
                <span className="font-mono text-zinc-500">
                  If {result.persona.name} targeted{" "}
                  <span className="text-cyan-400">{result.codebaseName}</span>,
                  they would likely...
                </span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                {result.summary}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
                <Trophy className="size-3.5 text-amber-400" />
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  Track record:
                </span>
                <span className="text-[11px] text-zinc-400">{result.persona.knownFor}</span>
              </div>
            </div>

            {/* Kill chain visualization */}
            <div className="holo-card-sharp hud-corners relative overflow-hidden rounded-xl bg-zinc-950/80 p-4 sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <Radio className="size-4 text-cyan-400" />
                <span className="font-mono text-[11px] uppercase tracking-widest text-cyan-400">
                  Kill Chain — Attack Simulation
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {result.attackPlan.map((step, idx) => {
                  const phaseColor = PHASE_COLOR[step.phase.toLowerCase()] ?? "#a1a1aa";
                  const icon = PHASE_ICON[step.phase.toLowerCase()] ?? DEFAULT_PHASE_ICON;
                  return (
                    <motion.div
                      key={`${step.step}-${idx}`}
                      initial={{ opacity: 0, x: -16 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 180,
                        damping: 22,
                        delay: Math.min(idx * 0.1, 0.6),
                      }}
                      className="relative"
                    >
                      <div className="flex gap-3">
                        {/* Phase column */}
                        <div className="flex flex-col items-center">
                          <div
                            className="flex size-9 items-center justify-center rounded-md border"
                            style={{
                              color: phaseColor,
                              background: `${phaseColor}15`,
                              borderColor: `${phaseColor}55`,
                              boxShadow: `0 0 12px ${phaseColor}40`,
                            }}
                          >
                            {icon}
                          </div>
                          {idx < result.attackPlan.length - 1 && (
                            <div className="my-1 w-px flex-1 bg-gradient-to-b from-zinc-700 to-transparent" />
                          )}
                        </div>
                        {/* Step content */}
                        <div className="mb-2 flex-1 rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[10px] text-zinc-600">
                                #{String(step.step).padStart(2, "0")}
                              </span>
                              <span
                                className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider"
                                style={{
                                  color: phaseColor,
                                  background: `${phaseColor}22`,
                                  border: `1px solid ${phaseColor}55`,
                                }}
                              >
                                {step.phase.replace(/_/g, " ")}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] text-zinc-500">
                                likelihood
                              </span>
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-zinc-800">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${step.likelihood}%`,
                                    background: phaseColor,
                                    boxShadow: `0 0 6px ${phaseColor}80`,
                                  }}
                                />
                              </div>
                              <span
                                className="font-mono text-[10px] font-bold"
                                style={{ color: phaseColor }}
                              >
                                {step.likelihood}%
                              </span>
                            </div>
                          </div>
                          <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-2">
                            <div className="flex items-start gap-2">
                              <Globe className="mt-0.5 size-3 shrink-0 text-cyan-400" />
                              <div>
                                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                                  TTP
                                </span>
                                <p className="text-zinc-300">{step.ttp}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <Target className="mt-0.5 size-3 shrink-0 text-rose-400" />
                              <div>
                                <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                                  Target
                                </span>
                                <p className="text-zinc-300">{step.target}</p>
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 flex items-start gap-2 border-t border-zinc-800 pt-2">
                            <ArrowRight className="mt-0.5 size-3 shrink-0 text-amber-400" />
                            <div>
                              <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                                Exploit · {step.vulnClass}
                              </span>
                              <p className="text-zinc-400">{step.exploit}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
              {result.generatedAt && (
                <div className="mt-3 text-right font-mono text-[10px] text-zinc-600">
                  Generated {new Date(result.generatedAt).toLocaleString()}
                </div>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* ── Help / empty state ────────────────────────────────────────────── */}
      {!result && !error && (
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="holo-card-sharp hud-corners relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-xl bg-zinc-950/60 p-6 text-center sm:p-10"
        >
          <Flag className="size-7 text-zinc-700" />
          <div>
            <p className="font-mono text-sm text-zinc-300">
              Click{" "}
              <span className="text-rose-400">SIMULATE ATTACK</span> on any
              persona card above.
            </p>
            <p className="mt-1 max-w-md text-xs text-zinc-500">
              The AI will role-play as that threat actor group and walk you
              through how they would specifically attack your codebase using
              their known TTPs, preferred vulnerability classes, and tooling.
            </p>
          </div>
        </motion.section>
      )}

      <div className="flex-1" />
    </div>
  );
}

export default AptPersonaEngine;
