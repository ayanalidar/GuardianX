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
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let lineIdx = 0;

    const runScenario = async () => {
      while (!cancelled) {
        setRevealedLines([]);
        setTypedText("");
        for (lineIdx = 0; lineIdx < SCENARIO.length; lineIdx++) {
          if (cancelled) return;
          const line = SCENARIO[lineIdx];

          if (line.typed) {
            // Type character by character
            for (let i = 0; i <= line.text.length; i++) {
              if (cancelled) return;
              setTypedText(line.text.slice(0, i));
              // Slightly variable delay for realism
              await sleep(18 + Math.random() * 28);
            }
            await sleep(220);
            // Lock in the typed line, reset buffer
            setRevealedLines((prev) => [...prev, line]);
            setTypedText("");
          } else {
            // Reveal instantly with brief delay
            await sleep(280);
            setRevealedLines((prev) => [...prev, line]);
          }
          // Scroll container to bottom
          if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          }
          await sleep(180);
        }
        // Pause at end of scenario, then restart
        await sleep(2400);
      }
    };

    runScenario();
    return () => {
      cancelled = true;
    };
  }, []);

  // Now for current state — render revealed lines + the in-progress typed line
  const currentLine = SCENARIO[revealedLines.length];
  const isTyping = currentLine?.typed === true && typedText.length > 0;

  return (
    <div
      ref={scrollRef}
      className="custom-scrollbar max-h-44 overflow-y-auto rounded-md border border-zinc-800/80 bg-black/85 p-3 font-mono text-[11px] leading-relaxed shadow-[inset_0_0_24px_rgba(0,0,0,0.6)]"
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
