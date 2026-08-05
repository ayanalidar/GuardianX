"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Play,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import { GlowCTA } from "./glow-cta";

/**
 * LiveDemo
 * --------
 * Homepage section with a "Try Live Demo" button that opens a full-screen
 * modal running a guided tour through the GuardianX pipeline:
 *
 *   Step 0 · Vulnerable codebase  — shows a real SQLi source file
 *   Step 1 · AI scan in progress  — terminal typing animation
 *   Step 2 · Findings appear       — list reveals one-by-one w/ severity badges
 *   Step 3 · Generated patch       — diff view (red -, green +)
 *   Step 4 · Attestation + CTA     — SHA-256 badge + "Sign up" CTA
 *
 * All data is hardcoded. Steps auto-advance every 5s; user can also
 * prev/next manually. ESC closes. The demo is non-destructive (no API calls).
 */

const STEP_MS = 5000;
const STEP_LABELS = [
  "Source code",
  "AI scan",
  "Findings",
  "Auto-patch",
  "Attestation",
] as const;

// ── Hardcoded demo data ──────────────────────────────────────────────────

const VULNERABLE_CODE = [
  { ln: 1, text: "// app/api/users/route.ts", muted: true },
  { ln: 2, text: "import { NextResponse } from \"next/server\";" },
  { ln: 3, text: "import { db } from \"@/lib/db\";" },
  { ln: 4, text: "" },
  { ln: 5, text: "export async function GET(req: Request) {" },
  { ln: 6, text: "  const { searchParams } = new URL(req.url);" },
  { ln: 7, text: "  const id = searchParams.get(\"id\") || \"\";" },
  { ln: 8, text: "" },
  { ln: 9, text: "  // ⚠️ User input concatenated into SQL — UNSAFE", danger: true },
  { ln: 10, text: "  const query = `SELECT * FROM users WHERE id = ${id}`;", danger: true },
  { ln: 11, text: "  const rows = await db.rawQuery(query);", danger: true },
  { ln: 12, text: "" },
  { ln: 13, text: "  return NextResponse.json(rows);" },
  { ln: 14, text: "}" },
];

const SCAN_LINES: { text: string; type: "cmd" | "out" | "err" | "ok" | "warn" }[] = [
  { text: "$ guardianx scan ./app --mode aggressive", type: "cmd" },
  { text: "Indexing 1,284 files across 3 paths…", type: "out" },
  { text: "AI: reading app/api/users/route.ts", type: "out" },
  { text: "AI: pattern match — string interpolation in SQL", type: "warn" },
  { text: "AI: taint trace — `id` ← searchParams → SQL", type: "warn" },
  { text: "AI: confirming exploit… firing payload ' OR 1=1--", type: "out" },
  { text: "VULNERABLE: SQL injection confirmed (auth bypass)", type: "err" },
  { text: "AI: synthesizing patch (parameterized query)…", type: "out" },
  { text: "Patch generated: SP-2026-DEMO-001", type: "ok" },
  { text: "Sandbox: passed · Adversarial rounds: 3/3 won", type: "ok" },
];

const FINDINGS = [
  {
    id: "F-001",
    title: "SQL Injection — /api/users",
    severity: "critical",
    cwe: "CWE-89",
    confidence: 0.97,
    desc: "The `id` query parameter is concatenated into a SQL statement, allowing an attacker to bypass authentication and exfiltrate the entire `users` table via a payload like `' OR 1=1--`.",
  },
  {
    id: "F-002",
    title: "Missing input validation — /api/users",
    severity: "high",
    cwe: "CWE-20",
    confidence: 0.92,
    desc: "No type or length validation on the `id` parameter — arbitrary strings are forwarded to the database driver.",
  },
  {
    id: "F-003",
    title: "Verbose error leak — /api/users",
    severity: "low",
    cwe: "CWE-209",
    confidence: 0.81,
    desc: "On SQL syntax errors the raw driver exception is returned to the client, leaking schema details.",
  },
];

const PATCH_DIFF = [
  { kind: "ctx", text: "  const id = searchParams.get(\"id\") || \"\";" },
  { kind: "ctx", text: "" },
  { kind: "del", text: "  // ⚠️ User input concatenated into SQL — UNSAFE" },
  { kind: "del", text: "  const query = `SELECT * FROM users WHERE id = ${id}`;" },
  { kind: "del", text: "  const rows = await db.rawQuery(query);" },
  { kind: "add", text: "  // ✅ Parameterized query — input is treated as data, not code" },
  { kind: "add", text: "  const rows = await db.query(" },
  { kind: "add", text: "    \"SELECT * FROM users WHERE id = $1\"," },
  { kind: "add", text: "    [id]" },
  { kind: "add", text: "  );" },
];

const ATTESTATION = {
  patchId: "SP-2026-DEMO-001",
  hash: "sha256:9f4a2c7e8b1d…d3a6",
  prevHash: "sha256:1c0f4a…b29e",
  timestamp: "2026-08-14T14:32:18Z",
  chainLength: 39,
  verified: true,
};

// ── Sub-components ───────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function TerminalScan() {
  const [revealed, setRevealed] = useState<typeof SCAN_LINES>([]);
  const [typed, setTyped] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setRevealed([]);
      setTyped("");
      for (let i = 0; i < SCAN_LINES.length; i++) {
        if (cancelled) return;
        const line = SCAN_LINES[i];
        if (line.type === "cmd") {
          for (let c = 0; c <= line.text.length; c++) {
            if (cancelled) return;
            setTyped(line.text.slice(0, c));
            await sleep(16 + Math.random() * 22);
          }
          await sleep(180);
          setRevealed((prev) => [...prev, line]);
          setTyped("");
        } else {
          await sleep(240);
          setRevealed((prev) => [...prev, line]);
        }
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
        await sleep(120);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  const COLOR: Record<string, string> = {
    cmd: "text-emerald-300",
    out: "text-zinc-400",
    err: "text-red-400",
    ok: "text-emerald-400",
    warn: "text-amber-400",
  };
  const PREFIX: Record<string, string> = {
    cmd: "$ ",
    out: "",
    err: "[!] ",
    ok: "[+] ",
    warn: "[*] ",
  };

  const currentLine = SCAN_LINES[revealed.length];
  const isTyping = currentLine?.type === "cmd" && typed.length > 0;

  return (
    <div
      ref={scrollRef}
      className="custom-scrollbar max-h-[42vh] min-h-[260px] overflow-y-auto rounded-md border border-zinc-800/80 bg-black/85 p-3 font-mono text-[11px] leading-relaxed shadow-[inset_0_0_24px_rgba(0,0,0,0.6)]"
    >
      {revealed.map((line, i) => (
        <div key={i} className="flex gap-2">
          <span className="shrink-0 select-none text-zinc-700 tabular-nums">{String(i + 1).padStart(2, "0")}</span>
          <span className={`${COLOR[line.type]} break-all`}>
            {PREFIX[line.type]}{line.text}
          </span>
        </div>
      ))}
      {isTyping && currentLine ? (
        <div className="flex gap-2">
          <span className="shrink-0 select-none text-zinc-700 tabular-nums">{String(revealed.length + 1).padStart(2, "0")}</span>
          <span className={`${COLOR[currentLine.type]} break-all`}>
            {PREFIX[currentLine.type]}{typed}
            <span className="ml-0.5 inline-block w-2 animate-pulse text-emerald-400">▋</span>
          </span>
        </div>
      ) : null}
    </div>
  );
}

function FindingsList() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < FINDINGS.length; i++) {
        if (cancelled) return;
        await sleep(900);
        setVisibleCount(i + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const meta: Record<string, { color: string; bg: string; border: string; label: string }> = {
    critical: { color: "text-red-300", bg: "bg-red-500/15", border: "border-red-500/40", label: "CRITICAL" },
    high: { color: "text-amber-300", bg: "bg-amber-500/15", border: "border-amber-500/40", label: "HIGH" },
    medium: { color: "text-yellow-300", bg: "bg-yellow-500/15", border: "border-yellow-500/40", label: "MEDIUM" },
    low: { color: "text-cyan-300", bg: "bg-cyan-500/15", border: "border-cyan-500/40", label: "LOW" },
  };

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {FINDINGS.slice(0, visibleCount).map((f, i) => {
          const m = meta[f.severity] ?? meta.medium;
          return (
            <motion.div
              key={f.id}
              layout
              initial={{ opacity: 0, x: -16, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.35, delay: i * 0.05 }}
              className={`rounded-md border ${m.border} ${m.bg} p-3`}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${m.color} ${m.bg}`}>
                    {m.label}
                  </span>
                  <h4 className={`text-sm font-semibold ${m.color}`}>{f.title}</h4>
                </div>
                <span className="font-mono text-[10px] text-zinc-500">{f.cwe}</span>
              </div>
              <p className="text-xs leading-relaxed text-zinc-400">{f.desc}</p>
              <div className="mt-2 flex items-center gap-3 font-mono text-[10px] text-zinc-500">
                <span>Finding {f.id}</span>
                <span className="text-emerald-400/70">conf {(f.confidence * 100).toFixed(0)}%</span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {visibleCount < FINDINGS.length ? (
        <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-600">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          Scanning…
        </div>
      ) : null}
    </div>
  );
}

function PatchDiff() {
  return (
    <div className="overflow-hidden rounded-md border border-zinc-800 bg-black/70">
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/70 px-3 py-2">
        <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
          <Terminal className="size-3" />
          <span>patch SP-2026-DEMO-001 · app/api/users/route.ts</span>
        </div>
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300">
          sandbox passed
        </span>
      </div>
      <pre className="custom-scrollbar overflow-x-auto p-3 font-mono text-[11px] leading-relaxed">
        {PATCH_DIFF.map((line, i) => {
          const cls =
            line.kind === "add"
              ? "bg-emerald-500/10 text-emerald-300"
              : line.kind === "del"
              ? "bg-red-500/10 text-red-300"
              : "text-zinc-500";
          const marker = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, delay: i * 0.06 }}
              className={`flex gap-3 px-2 ${cls}`}
            >
              <span className="select-none text-zinc-600">{marker}</span>
              <span className="whitespace-pre">{line.text || " "}</span>
            </motion.div>
          );
        })}
      </pre>
    </div>
  );
}

function AttestationCard() {
  const a = ATTESTATION;
  return (
    <div className="relative overflow-hidden rounded-lg border border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 p-5">
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            "conic-gradient(from 0deg at 50% 50%, transparent 0deg, rgba(16,185,129,0.18) 60deg, transparent 120deg, transparent 240deg, rgba(6,182,212,0.18) 300deg, transparent 360deg)",
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
      />
      <div className="relative flex flex-col items-center gap-3 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, type: "spring", stiffness: 220 }}
          className="flex size-14 items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-500/15"
        >
          <ShieldCheck className="size-7 text-emerald-400" />
        </motion.div>
        <div>
          <h4 className="text-base font-bold text-emerald-300">Patch attested on-chain</h4>
          <p className="mt-1 text-xs text-zinc-400">
            SHA-256 cryptographic ledger entry recorded. Tamper-evident lineage verified.
          </p>
        </div>
        <div className="mt-1 w-full max-w-md grid grid-cols-2 gap-2 text-left font-mono text-[10px]">
          <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2">
            <div className="text-zinc-600">Patch ID</div>
            <div className="text-emerald-300">{a.patchId}</div>
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2">
            <div className="text-zinc-600">Chain length</div>
            <div className="text-emerald-300">#{a.chainLength}</div>
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2 col-span-2">
            <div className="text-zinc-600">Hash</div>
            <div className="truncate text-cyan-300">{a.hash}</div>
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2 col-span-2">
            <div className="text-zinc-600">Prev hash</div>
            <div className="truncate text-cyan-300">{a.prevHash}</div>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
          <CheckCircle2 className="size-3.5" />
          Verified · immutable · tamper-evident
        </div>
        <div className="font-mono text-[10px] text-zinc-600">
          Attested {new Date(a.timestamp).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

// ── Step content router ─────────────────────────────────────────────────

function StepContent({ step }: { step: number }) {
  switch (step) {
    case 0:
      return (
        <div className="overflow-hidden rounded-md border border-zinc-800 bg-black/70">
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/70 px-3 py-2">
            <div className="flex items-center gap-2 font-mono text-[10px] text-zinc-500">
              <Terminal className="size-3" />
              <span>app/api/users/route.ts</span>
            </div>
            <span className="rounded bg-red-500/15 px-1.5 py-0.5 font-mono text-[9px] text-red-300">
              1 vulnerability detected
            </span>
          </div>
          <pre className="custom-scrollbar overflow-x-auto p-3 font-mono text-[11px] leading-relaxed">
            {VULNERABLE_CODE.map((line, i) => (
              <div
                key={i}
                className={`flex gap-3 px-2 ${
                  line.danger
                    ? "bg-red-500/10 text-red-300"
                    : line.muted
                    ? "text-zinc-600"
                    : "text-zinc-300"
                }`}
              >
                <span className="w-6 shrink-0 select-none text-right text-zinc-700 tabular-nums">{line.ln}</span>
                <span className="whitespace-pre">{line.text || " "}</span>
              </div>
            ))}
          </pre>
          <div className="border-t border-zinc-800 bg-zinc-900/40 px-3 py-2 font-mono text-[10px] text-amber-300/80">
            ⚠ GuardianX AI flagged line 10 — taint flows from <code>searchParams</code> to <code>db.rawQuery</code>
          </div>
        </div>
      );
    case 1:
      return <TerminalScan />;
    case 2:
      return <FindingsList />;
    case 3:
      return <PatchDiff />;
    case 4:
      return <AttestationCard />;
    default:
      return null;
  }
}

// ── Modal ───────────────────────────────────────────────────────────────

function DemoModal({
  onClose,
  onEnter,
}: {
  onClose: () => void;
  onEnter: () => void;
}) {
  const [step, setStep] = useState(0);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const lastManualNav = useRef<number>(0);

  // Manual navigation handlers — declared early so the keyboard effect below
  // can reference them without "used before declaration" issues. Both are
  // stable (useCallback with []) because they only use functional setState
  // + a ref.
  const next = useCallback(() => {
    setStep((s) => Math.min(STEP_LABELS.length - 1, s + 1));
    lastManualNav.current = Date.now();
  }, []);
  const prev = useCallback(() => {
    setStep((s) => Math.max(0, s - 1));
    lastManualNav.current = Date.now();
  }, []);

  // ESC closes; ←/→ navigate steps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, next, prev]);

  // Auto-advance timer — 5s per step. Stop at last step.
  useEffect(() => {
    if (!autoAdvance || step >= STEP_LABELS.length - 1) return;
    const elapsed = Date.now() - lastManualNav.current;
    const remaining = Math.max(800, STEP_MS - elapsed);
    const t = setTimeout(() => {
      setStep((s) => Math.min(STEP_LABELS.length - 1, s + 1));
      lastManualNav.current = Date.now();
    }, remaining);
    return () => clearTimeout(t);
  }, [step, autoAdvance]);

  // Lock body scroll while modal open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="GuardianX live demo"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-zinc-950/85 backdrop-blur-md"
        onClick={onClose}
      />

      {/* Modal card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-emerald-500/30 bg-zinc-950/95 shadow-[0_0_60px_rgba(16,185,129,0.15)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10">
              <Sparkles className="size-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-zinc-100">GuardianX Live Demo</div>
              <div className="font-mono text-[10px] text-zinc-500">
                Pre-loaded sample codebase · no signup required
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoAdvance((v) => !v)}
              className={`rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                autoAdvance
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400"
              }`}
              title="Toggle auto-advance"
            >
              {autoAdvance ? "Auto ▶" : "Manual ⏸"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="Close demo"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Step progress bar */}
        <div className="border-b border-zinc-800 bg-zinc-950/50 px-4 py-2.5">
          <div className="flex items-center gap-2">
            {STEP_LABELS.map((label, i) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setStep(i);
                  lastManualNav.current = Date.now();
                }}
                className="group flex flex-1 flex-col items-start gap-1"
              >
                <div className="relative h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-emerald-500"
                    initial={false}
                    animate={{
                      width: i < step ? "100%" : i === step ? "100%" : "0%",
                    }}
                    transition={{ duration: 0.3 }}
                  />
                  {i === step && autoAdvance && i < STEP_LABELS.length - 1 ? (
                    <motion.div
                      key={`${step}-${autoAdvance}`}
                      className="absolute inset-y-0 left-0 bg-emerald-300"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ duration: STEP_MS / 1000, ease: "linear" }}
                    />
                  ) : null}
                </div>
                <span
                  className={`font-mono text-[9px] uppercase tracking-wider transition-colors ${
                    i === step
                      ? "text-emerald-300"
                      : i < step
                      ? "text-zinc-500"
                      : "text-zinc-600"
                  }`}
                >
                  {i + 1}. {label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Body — animated step content */}
        <div className="custom-scrollbar flex-1 overflow-y-auto p-4 sm:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
            >
              <div className="mb-3 flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/70">
                  Step {step + 1} / {STEP_LABELS.length}
                </span>
                <span className="text-zinc-700">·</span>
                <span className="text-sm font-semibold text-zinc-200">
                  {STEP_LABELS[step]}
                </span>
              </div>
              <StepContent step={step} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer — prev/next + CTA on last step */}
        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <button
            type="button"
            onClick={prev}
            disabled={step === 0}
            className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="size-3.5" /> Prev
          </button>

          <div className="hidden font-mono text-[10px] text-zinc-600 sm:block">
            Use ← → keys · ESC to close
          </div>

          {step < STEP_LABELS.length - 1 ? (
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/25"
            >
              Next <ChevronRight className="size-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep(0);
                  lastManualNav.current = Date.now();
                }}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
              >
                <ArrowLeft className="size-3.5" /> Replay
              </button>
              <GlowCTA onClick={onEnter} variant="solid" className="!px-4 !py-1.5 !text-xs">
                Sign up to scan your own code
                <ArrowRight className="size-3.5" />
              </GlowCTA>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Section wrapper (homepage entry point) ───────────────────────────────

export function LiveDemo({ onEnter }: { onEnter: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="grid items-center gap-8 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-violet-500/70">
            <Play className="size-3" /> {"// Interactive demo"}
          </div>
          <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">
            See GuardianX in action — no signup
          </h2>
          <p className="mt-3 text-sm text-zinc-400">
            Walk through a real vulnerability lifecycle: a vulnerable code sample,
            the AI scan terminal typing live, findings appearing one-by-one,
            an auto-generated patch diff, and a cryptographically attested patch
            badge — all in 30 seconds.
          </p>
          <ul className="mt-4 space-y-1.5 text-sm text-zinc-300">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-400" /> Pre-loaded sample codebase
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-400" /> Real exploit → patch flow
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-400" /> Auto-advances, or drive it yourself
            </li>
          </ul>
          <div className="mt-6">
            <GlowCTA onClick={() => setOpen(true)} variant="solid" className="!px-6 !py-3 !text-sm">
              <Play className="size-4" />
              Try Live Demo
            </GlowCTA>
          </div>
        </motion.div>

        {/* Right side: preview card */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative"
        >
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="group relative block w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/80 p-4 text-left transition-colors hover:border-emerald-500/40"
          >
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-red-500/70" />
                <span className="size-2.5 rounded-full bg-amber-500/70" />
                <span className="size-2.5 rounded-full bg-emerald-500/70" />
              </div>
              <span className="font-mono text-[10px] text-zinc-600">guardianx://demo</span>
            </div>
            <pre className="overflow-hidden rounded-md border border-zinc-800 bg-black/60 p-3 font-mono text-[10px] leading-relaxed">
              <div className="text-emerald-300">$ guardianx scan ./app --mode aggressive</div>
              <div className="text-zinc-500">Indexing 1,284 files…</div>
              <div className="text-amber-400">[*] AI: pattern match — string interpolation in SQL</div>
              <div className="text-red-400">[!] VULNERABLE: SQL injection confirmed</div>
              <div className="text-emerald-400">[+] Patch SP-2026-DEMO-001 · sandbox passed</div>
              <div className="text-zinc-500">[+] Attested on-chain ✓</div>
            </pre>
            <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-zinc-500">
              <span>5-step guided tour</span>
              <span className="inline-flex items-center gap-1 text-emerald-400 group-hover:translate-x-0.5">
                Play <ArrowRight className="size-3" />
              </span>
            </div>
          </button>
        </motion.div>
      </div>

      <AnimatePresence>
        {open ? (
          <DemoModal onClose={() => setOpen(false)} onEnter={onEnter} />
        ) : null}
      </AnimatePresence>
    </section>
  );
}
