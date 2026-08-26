"use client";

import { useMemo } from "react";
import { Terminal } from "lucide-react";

interface SandboxLogsProps {
  logs: string;
}

export function SandboxLogs({ logs }: SandboxLogsProps) {
  const lines = useMemo(() => logs.split("\n"), [logs]);
  const verdictPassed = useMemo(
    () => /VERDICT:\s*SAFE/i.test(logs),
    [logs]
  );

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/60 px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <Terminal className="size-3.5 text-zinc-500" />
          <span className="font-mono">sandbox-output.log</span>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            verdictPassed
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/40 bg-red-500/10 text-red-300"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              verdictPassed ? "bg-emerald-400" : "bg-red-400"
            }`}
          />
          {verdictPassed ? "Passed" : "Failed"}
        </span>
      </div>

      <div className="max-h-64 overflow-auto custom-scrollbar font-mono text-xs">
        <pre className="px-4 py-3 whitespace-pre-wrap break-words text-zinc-400">
          {lines.map((line, i) => {
            const isPass = /✓|passed|VERDICT:\s*SAFE/i.test(line);
            const isFail = /✗|failed|error/i.test(line);
            const isHeader = /\[\d{2}:\d{2}:\d{2}\]/.test(line);
            return (
              <div
                key={i}
                className={
                  isPass
                    ? "text-emerald-300"
                    : isFail
                      ? "text-red-300"
                      : isHeader
                        ? "text-zinc-300"
                        : "text-zinc-400"
                }
              >
                {line || "\u00A0"}
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}
