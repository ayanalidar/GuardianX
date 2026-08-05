"use client";

import { useEffect, useRef, useState } from "react";

type LineType = "cmd" | "out" | "err" | "ok" | "warn";

interface TermLine {
  text: string;
  type: LineType;
  /** If true, type characters out; otherwise reveal instantly. */
  typed?: boolean;
}

const COLOR: Record<LineType, string> = {
  cmd: "text-emerald-300",
  out: "text-zinc-400",
  err: "text-red-400",
  ok: "text-emerald-400",
  warn: "text-amber-400",
};

const PREFIX: Record<LineType, string> = {
  cmd: "$ ",
  out: "",
  err: "[!] ",
  ok: "[+] ",
  warn: "[*] ",
};

const SCENARIO: TermLine[] = [
  { text: "guardianx scan --target acme-app --mode aggressive", type: "cmd", typed: true },
  { text: "Crawling endpoints...", type: "out" },
  { text: "Found 42 endpoints across 3 paths", type: "ok" },
  { text: "Testing SQL injection on /api/login...", type: "out" },
  { text: "VULNERABLE: SQL injection confirmed", type: "err" },
  { text: "Payload ' OR 1=1-- bypassed auth", type: "warn" },
  { text: "Generating AI patch...", type: "out" },
  { text: "Patch SP-2026-ACM-001 | Sandbox: PASSED", type: "ok" },
  { text: "Safe to deploy, patch attested on-chain", type: "ok" },
];

/**
 * TerminalTyping
 * --------------
 * A live-scan terminal: lines reveal one at a time. Command lines are
 * character-typed; status lines appear instantly with a brief flash.
 * Loop continuously.
 */
export function TerminalTyping() {
  const [revealedLines, setRevealedLines] = useState<TermLine[]>([]);
  const [typedText, setTypedText] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const cancelledRef = useRef(false);

  // Build the scenario runner. The loop self-checks `cancelledRef.current`
  // each tick so it can be cleanly paused/resumed from outside.
  useEffect(() => {
    cancelledRef.current = false;
    let lineIdx = 0;

    const runScenario = async () => {
      while (!cancelledRef.current) {
        setRevealedLines([]);
        setTypedText("");
        for (lineIdx = 0; lineIdx < SCENARIO.length; lineIdx++) {
          if (cancelledRef.current) return;
          const line = SCENARIO[lineIdx];

          if (line.typed) {
            for (let i = 0; i <= line.text.length; i++) {
              if (cancelledRef.current) return;
              setTypedText(line.text.slice(0, i));
              await sleep(18 + Math.random() * 28);
            }
            await sleep(220);
            setRevealedLines((prev) => [...prev, line]);
            setTypedText("");
          } else {
            await sleep(280);
            setRevealedLines((prev) => [...prev, line]);
          }
          if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
          }
          await sleep(180);
        }
        await sleep(2400);
      }
    };

    // Drive start/stop based on visibility + document visibility.
    let running = false;
    let inViewport = true;
    let docVisible = !document.hidden;

    const start = () => {
      if (running || cancelledRef.current) return;
      running = true;
      cancelledRef.current = false;
      void runScenario();
    };
    const stop = () => {
      running = false;
      cancelledRef.current = true;
    };
    const updateRunning = () => {
      if (inViewport && docVisible) start();
      else stop();
    };

    const onVisibility = () => {
      docVisible = !document.hidden;
      updateRunning();
    };
    document.addEventListener("visibilitychange", onVisibility);

    let io: IntersectionObserver | null = null;
    if (containerRef.current && typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1];
          if (entry) {
            inViewport = entry.isIntersecting;
            updateRunning();
          }
        },
        { threshold: 0.05 },
      );
      io.observe(containerRef.current);
    } else {
      start();
    }

    return () => {
      cancelledRef.current = true;
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
    };
  }, []);

  // Now for current state — render revealed lines + the in-progress typed line
  const currentLine = SCENARIO[revealedLines.length];
  const isTyping = currentLine?.typed === true && typedText.length > 0;

  return (
    <div
      ref={containerRef}
      className="custom-scrollbar max-h-44 overflow-y-auto rounded-md border border-zinc-800/80 bg-black/85 p-3 font-mono text-[11px] leading-relaxed shadow-[inset_0_0_24px_rgba(0,0,0,0.6)]"
      style={{ willChange: "transform" }}
    >
      {revealedLines.map((line, i) => (
        <div key={i} className="flex gap-1.5">
          <span className="shrink-0 text-zinc-700">
            {timeForLine(i)}
          </span>
          <span className={`${COLOR[line.type]} break-all`}>
            {PREFIX[line.type]}
            {line.text}
          </span>
        </div>
      ))}
      {isTyping && currentLine && (
        <div className="flex gap-1.5">
          <span className="shrink-0 text-zinc-700">{timeForLine(revealedLines.length)}</span>
          <span className={`${COLOR[currentLine.type]} break-all`}>
            {PREFIX[currentLine.type]}
            {typedText}
            <span className="ml-0.5 inline-block w-2 animate-pulse text-emerald-400">▋</span>
          </span>
        </div>
      )}
      {!isTyping && revealedLines.length < SCENARIO.length && (
        <div className="flex gap-1.5">
          <span className="shrink-0 text-zinc-700">{timeForLine(revealedLines.length)}</span>
          <span className="animate-pulse text-emerald-400">▋</span>
        </div>
      )}
    </div>
  );
}

function timeForLine(i: number): string {
  const base = new Date();
  base.setSeconds(base.getSeconds() - (SCENARIO.length - i) * 3);
  return base.toLocaleTimeString("en-US", { hour12: false });
}

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}
