"use client";

import { useMemo } from "react";
import {
  diffLineClass,
  parseDiff,
  type DiffLine,
} from "@/lib/sentinel/utils";
import { FileCode2, Plus, Minus } from "lucide-react";

interface DiffViewerProps {
  diff: string;
  filename?: string;
}

export function DiffViewer({ diff, filename }: DiffViewerProps) {
  const lines = useMemo<DiffLine[]>(() => parseDiff(diff), [diff]);

  const stats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const l of lines) {
      if (l.type === "add") additions++;
      else if (l.type === "del") deletions++;
    }
    return { additions, deletions };
  }, [lines]);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/60 px-4 py-2">
        <div className="flex items-center gap-2 text-xs text-zinc-400 min-w-0">
          <FileCode2 className="size-3.5 text-zinc-500 shrink-0" />
          <span className="font-mono truncate">
            {filename ?? "proposed-change.diff"}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono shrink-0">
          <span className="inline-flex items-center gap-1 text-emerald-400">
            <Plus className="size-3" />
            {stats.additions}
          </span>
          <span className="inline-flex items-center gap-1 text-red-400">
            <Minus className="size-3" />
            {stats.deletions}
          </span>
        </div>
      </div>

      <div className="max-h-80 overflow-auto custom-scrollbar font-mono text-xs">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr
                key={idx}
                className={diffLineClass(line)}
              >
                <td className="select-none px-3 py-0.5 text-right text-zinc-600 w-10 align-top border-r border-zinc-800/60">
                  {idx + 1}
                </td>
                <td className="px-3 py-0.5 whitespace-pre-wrap break-words align-top">
                  {line.text || "\u00A0"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
