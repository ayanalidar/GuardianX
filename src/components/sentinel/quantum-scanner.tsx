"use client";

// Quantum-Readiness Scanner — scans a codebase's source for cryptographic
// algorithms vulnerable to quantum attacks (Shor's algorithm breaks RSA/ECC,
// Grover's weakens AES-128 / SHA-256). Renders a codebase selector + scan
// button + results panel with overall Quantum Readiness Score, 4 category
// cards, and a per-finding list.
//
// Dark theme, dark cards. NO indigo/blue. Uses existing holo-card-sharp,
// hud-corners, neon-* tokens. Framer-motion entrance animations. Loading
// state shows a matrix-style falling binary background.

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Atom,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  FileCode2,
  Loader2,
  Radar,
  ShieldAlert,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types (mirror the API route) ────────────────────────────────────────────
type Severity = "Critical" | "High" | "Medium";

interface CategoryResult {
  algorithms: string[];
  count: number;
  risk: Severity | "Low";
  replacement: string;
}

interface QuantumFinding {
  file: string;
  line: number;
  algorithm: string;
  severity: Severity;
  replacement: string;
  snippet: string;
}

interface QuantumScanResponse {
  score: number;
  categories: {
    publicKey: CategoryResult;
    symmetric: CategoryResult;
    hashing: CategoryResult;
    keyExchange: CategoryResult;
  };
  findings: QuantumFinding[];
  scannedAt: string;
}

interface Codebase {
  id: string;
  name: string;
  language?: string | null;
  description?: string | null;
}

const RISK_COLORS: Record<Severity | "Low", string> = {
  Critical: "#f43f5e", // rose
  High: "#f59e0b", // amber
  Medium: "#06b6d4", // cyan
  Low: "#10b981", // emerald
};

// ── Count-up hook ───────────────────────────────────────────────────────────
function useCountUp(target: number, durationMs = 1100): number {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const tick = (ts: number) => {
      if (startRef.current === null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return value;
}

// ── API helpers ───────────────────────────────────────────────────────────
async function fetchCodebases(signal: AbortSignal): Promise<Codebase[]> {
  const token = typeof window !== "undefined" ? localStorage.getItem("guardianx-token") : null;
  const res = await fetch("/api/codebases", {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
  });
  const data = (await res.json().catch(() => [])) as Array<Codebase & { error?: string }>;
  if (!res.ok) return [];
  return data;
}

async function runQuantumScan(codebaseId: string, signal: AbortSignal): Promise<QuantumScanResponse> {
  const token = typeof window !== "undefined" ? localStorage.getItem("guardianx-token") : null;
  const res = await fetch("/api/quantum-scan", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ codebaseId }),
    signal,
  });
  const data = (await res.json().catch(() => ({}))) as QuantumScanResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data?.error ?? `Scan failed (${res.status})`);
  }
  return data;
}

// ── Component ─────────────────────────────────────────────────────────────
export function QuantumScanner() {
  const [codebases, setCodebases] = useState<Codebase[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [scan, setScan] = useState<QuantumScanResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Load codebases
  useEffect(() => {
    const ac = new AbortController();
    fetchCodebases(ac.signal)
      .then((cbs) => {
        setCodebases(cbs);
        if (cbs.length > 0 && !selectedId) setSelectedId(cbs[0].id);
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  // Simulated scan progress (the API itself is fast regex; the bar is theatre
  // but feels right for a "quantum scanner" UI).
  useEffect(() => {
    if (!scanning) return;
    // Defer the initial progress reset to avoid a synchronous setState in the
    // effect body (react-hooks/set-state-in-effect rule).
    const raf = requestAnimationFrame(() => setProgress(0));
    let p = 0;
    const id = setInterval(() => {
      p = Math.min(95, p + Math.random() * 12 + 4);
      setProgress(p);
    }, 120);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(id);
    };
  }, [scanning]);

  const handleScan = useCallback(async () => {
    if (!selectedId || scanning) return;
    setScanning(true);
    setError(null);
    setScan(null);
    const ac = new AbortController();
    try {
      const result = await runQuantumScan(selectedId, ac.signal);
      setProgress(100);
      // small delay to let the bar complete
      setTimeout(() => {
        setScan(result);
        setScanning(false);
        setProgress(0);
      }, 250);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message ?? "Quantum scan failed.");
      }
      setScanning(false);
      setProgress(0);
    }
  }, [selectedId, scanning]);

  const selectedCodebase = codebases.find((c) => c.id === selectedId);
  const score = scan?.score ?? 0;
  const scoreAnimated = useCountUp(scan ? scan.score : 0);
  const scoreColor =
    score >= 85 ? "#10b981" : score >= 60 ? "#06b6d4" : score >= 35 ? "#f59e0b" : "#f43f5e";

  return (
    <div className="holo-card-sharp hud-corners relative w-full overflow-hidden rounded-xl bg-zinc-950/80 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 sm:mb-6">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md border border-cyan-500/40 bg-cyan-500/10">
            <Atom className="size-4 text-cyan-400" />
          </div>
          <div>
            <h2 className="font-mono text-sm font-bold uppercase tracking-widest text-cyan-400">
              Quantum-Readiness Scanner
            </h2>
            <p className="text-[11px] text-zinc-500">
              Shor + Grover vulnerability analysis · RSA/ECC/AES-128/SHA-256/DH/ECDH
            </p>
          </div>
        </div>
        <Badge
          variant="outline"
          className="border-cyan-500/40 bg-cyan-500/5 font-mono text-[10px] text-cyan-300"
        >
          POST-QUANTUM
        </Badge>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Target Codebase
          </label>
          <Select value={selectedId} onValueChange={setSelectedId} disabled={scanning}>
            <SelectTrigger className="border-zinc-700 bg-zinc-900/70 font-mono text-xs text-zinc-200 hover:border-cyan-500/50">
              <SelectValue
                placeholder={
                  codebases.length === 0 ? "No codebases available" : "Select a codebase…"
                }
              />
            </SelectTrigger>
            <SelectContent className="border-zinc-700 bg-zinc-950">
              {codebases.map((cb) => (
                <SelectItem key={cb.id} value={cb.id} className="font-mono text-xs text-zinc-200">
                  {cb.name} {cb.language ? `· ${cb.language}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={handleScan}
          disabled={!selectedId || scanning || codebases.length === 0}
          className="border border-cyan-500/40 bg-gradient-to-b from-cyan-500/20 to-cyan-500/5 font-mono text-xs font-bold uppercase tracking-widest text-cyan-300 hover:from-cyan-500/30 hover:to-cyan-500/10 hover:text-cyan-200 disabled:opacity-50"
        >
          {scanning ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              SCANNING…
            </>
          ) : (
            <>
              <Zap className="size-4" />
              Scan for Quantum Readiness
            </>
          )}
        </Button>
      </div>

      {/* Progress bar (during scan) */}
      {scanning && (
        <div className="relative mb-5">
          <MatrixRainBackdrop />
          <Progress
            value={progress}
            className="h-2 bg-zinc-800 [&>div]:bg-gradient-to-r [&>div]:from-cyan-500 [&>div]:to-emerald-400"
          />
          <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-cyan-400/80">
            <span className="flicker">QUANTUM TUNNELING SOURCE…</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-5 flex items-center gap-3 rounded-md border border-rose-500/40 bg-rose-500/5 px-4 py-3">
          <AlertTriangle className="size-4 text-rose-400" />
          <span className="text-xs text-rose-300">{error}</span>
        </div>
      )}

      {/* Results */}
      {scan && !scanning ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 180, damping: 20 }}
          className="space-y-5"
        >
          {/* Score */}
          <div className="flex flex-col items-center gap-4 rounded-md border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-zinc-900/40 to-transparent p-5 sm:flex-row sm:gap-6">
            <div className="relative flex size-28 shrink-0 items-center justify-center">
              <svg viewBox="0 0 100 100" className="size-full -rotate-90">
                <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
                <circle
                  cx="50" cy="50" r="42" fill="none" stroke={scoreColor} strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 42}
                  strokeDashoffset={2 * Math.PI * 42 * (1 - score / 100)}
                  style={{
                    transition: "stroke-dashoffset 1.2s ease",
                    filter: `drop-shadow(0 0 6px ${scoreColor})`,
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                  className="font-mono text-3xl font-bold tabular-nums"
                  style={{ color: scoreColor, textShadow: `0 0 12px ${scoreColor}80` }}
                >
                  {scoreAnimated}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                  / 100
                </span>
              </div>
            </div>
            <div className="flex-1 text-center sm:text-left">
              <div className="mb-1 flex items-center justify-center gap-2 sm:justify-start">
                <Sparkles className="size-3.5 text-cyan-400" />
                <span className="font-mono text-[11px] uppercase tracking-widest text-cyan-400">
                  Quantum Readiness Score
                </span>
              </div>
              <p className="text-xs leading-relaxed text-zinc-400">
                {score >= 85 ? (
                  <>This codebase is <span className="font-bold text-emerald-400">largely quantum-resistant</span>. No critical Shor-vulnerable primitives detected.</>
                ) : score >= 60 ? (
                  <>Moderate quantum exposure — several primitives need migration to post-quantum alternatives.</>
                ) : score >= 35 ? (
                  <>High quantum exposure — multiple Shor/Grover-vulnerable algorithms detected. Prioritize migration.</>
                ) : (
                  <>Critical quantum exposure — pervasive use of broken primitives. Begin NIST PQC migration immediately.</>
                )}
              </p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <Badge variant="outline" className="border-zinc-700 font-mono text-[10px] text-zinc-400">
                  <FileCode2 className="mr-1 size-3" />
                  {scan.findings.length} finding(s)
                </Badge>
                <span className="font-mono text-[10px] text-zinc-600">
                  Scanned {new Date(scan.scannedAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>

          {/* Category cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CategoryCard
              icon={<Cpu className="size-3.5" />}
              title="Public Key Crypto"
              subtitle="RSA / ECC / ECDSA"
              category={scan.categories.publicKey}
            />
            <CategoryCard
              icon={<ShieldAlert className="size-3.5" />}
              title="Symmetric Crypto"
              subtitle="AES-128"
              category={scan.categories.symmetric}
            />
            <CategoryCard
              icon={<Atom className="size-3.5" />}
              title="Hashing"
              subtitle="SHA-1 / SHA-256 / MD5"
              category={scan.categories.hashing}
            />
            <CategoryCard
              icon={<Zap className="size-3.5" />}
              title="Key Exchange"
              subtitle="DH / ECDH"
              category={scan.categories.keyExchange}
            />
          </div>

          {/* Findings list */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Radar className="size-3.5 text-emerald-400" />
              <span className="font-mono text-[11px] uppercase tracking-widest text-emerald-400">
                Specific Findings
              </span>
            </div>
            {scan.findings.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
                <CheckCircle2 className="size-4 text-emerald-400" />
                <span className="text-xs text-emerald-300">
                  No quantum-vulnerable crypto primitives detected. Excellent posture.
                </span>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto pr-1 [scrollbar-width:thin]">
                <div className="flex flex-col gap-2">
                  {scan.findings.slice(0, 50).map((f, i) => {
                    const c = RISK_COLORS[f.severity];
                    return (
                      <motion.div
                        key={`${f.file}-${f.line}-${i}`}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ type: "spring", stiffness: 200, damping: 24, delay: Math.min(i * 0.04, 0.6) }}
                        className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3"
                      >
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="font-mono text-[10px]"
                              style={{ color: c, borderColor: `${c}55`, background: `${c}10` }}
                            >
                              {f.severity}
                            </Badge>
                            <span className="font-mono text-xs font-bold text-zinc-200">{f.algorithm}</span>
                          </div>
                          <span className="font-mono text-[10px] text-zinc-500">
                            {f.file}:{f.line}
                          </span>
                        </div>
                        <pre className="overflow-x-auto rounded bg-zinc-950/80 p-2 font-mono text-[11px] leading-relaxed text-emerald-300/80">
                          {f.snippet}
                        </pre>
                        <div className="mt-2 flex items-start gap-1.5 text-[11px] text-zinc-400">
                          <span className="font-mono text-cyan-400">PQC →</span>
                          <span>{f.replacement}</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      ) : !scanning && !error ? (
        <EmptyState selected={!!selectedCodebase} />
      ) : null}
    </div>
  );
}

function CategoryCard({
  icon,
  title,
  subtitle,
  category,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  category: CategoryResult;
}) {
  const c = RISK_COLORS[category.risk];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
      className="relative overflow-hidden rounded-md border border-zinc-800 bg-zinc-900/60 p-4"
    >
      <div
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ background: c, boxShadow: `0 0 8px ${c}` }}
      />
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span style={{ color: c }}>{icon}</span>
          <span className="font-mono text-[11px] uppercase tracking-widest text-zinc-300">
            {title}
          </span>
        </div>
        <Badge
          variant="outline"
          className="font-mono text-[10px]"
          style={{ color: c, borderColor: `${c}55`, background: `${c}10` }}
        >
          {category.risk}
        </Badge>
      </div>
      <p className="mb-2 font-mono text-[10px] text-zinc-500">{subtitle}</p>
      {category.count === 0 ? (
        <div className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className="size-3.5" />
          <span>No vulnerable primitives found</span>
        </div>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {category.algorithms.map((a) => (
              <span
                key={a}
                className="rounded-sm border border-zinc-700 bg-zinc-800/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300"
              >
                {a}
              </span>
            ))}
            <span className="rounded-sm border border-zinc-700 bg-zinc-800/70 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              ×{category.count}
            </span>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-400">
            <span className="font-mono text-cyan-400">PQC replacement: </span>
            {category.replacement}
          </p>
        </>
      )}
    </motion.div>
  );
}

function EmptyState({ selected }: { selected: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-zinc-800 bg-zinc-900/40 px-6 py-12 text-center">
      <Atom className="size-8 text-cyan-400/60" />
      <div>
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-zinc-400">
          {selected ? "Ready to scan" : "Select a codebase"}
        </p>
        <p className="mt-1 max-w-md text-xs text-zinc-600">
          {selected
            ? "Click \"Scan for Quantum Readiness\" to detect RSA, ECC, AES-128, SHA-1/256, MD5, DH, and ECDH usage vulnerable to quantum attack."
            : "Pick a codebase from the dropdown to begin quantum-readiness analysis."}
        </p>
      </div>
    </div>
  );
}

// Matrix-style falling binary background for the scanning state.
function MatrixRainBackdrop() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-25" aria-hidden>
      {Array.from({ length: 18 }).map((_, i) => (
        <div
          key={i}
          className="data-stream absolute top-0 font-mono text-[10px] leading-tight text-cyan-400/50"
          style={{
            left: `${(i * 100) / 18}%`,
            animationDuration: `${2 + (i % 4)}s`,
            animationDelay: `${(i % 5) * 0.3}s`,
          }}
        >
          {Array.from({ length: 16 })
            .map(() => (Math.random() > 0.5 ? "1" : "0"))
            .join("\n")}
        </div>
      ))}
    </div>
  );
}

export default QuantumScanner;
