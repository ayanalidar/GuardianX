"use client";

import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Codebase } from "@/lib/sentinel/api";
import { formatRelativeTime } from "@/lib/sentinel/utils";
import {
  Database,
  FileCode2,
  ScanLine,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";

interface CodebaseCardProps {
  codebase: Codebase;
  onScan: (cb: Codebase) => void;
  onView: (cb: Codebase) => void;
  onDelete: (cb: Codebase) => void;
  busy?: boolean;
}

// Memoize so the parent re-rendering on unrelated state (search query typing,
// sidebar toggle, periodic patch-list refresh) doesn't re-render every
// codebase card. The callbacks are stable (useCallback in ConsoleView) and
// `codebase` is per-item; only `busy` toggles globally during scans.
export const CodebaseCard = memo(function CodebaseCard({
  codebase,
  onScan,
  onView,
  onDelete,
  busy,
}: CodebaseCardProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
    >
      <Card className="gap-0 border-zinc-800 bg-zinc-900/60 py-0 backdrop-blur-sm">
        <div className="flex items-start gap-3 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-400">
            <Database className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-mono text-sm font-semibold text-zinc-100">
                {codebase.name}
              </h3>
              <Badge
                variant="outline"
                className="border-zinc-700 bg-zinc-800/50 text-[10px] text-zinc-400"
              >
                {codebase.language}
              </Badge>
            </div>
            {codebase.description ? (
              <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
                {codebase.description}
              </p>
            ) : null}
            <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-500">
              <span className="inline-flex items-center gap-1">
                <FileCode2 className="size-3" />
                {codebase.patch_count} patch
                {codebase.patch_count === 1 ? "" : "es"}
              </span>
              <span>{formatRelativeTime(codebase.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2 border-t border-zinc-800 px-4 py-2.5">
          <Button
            size="sm"
            onClick={() => onScan(codebase)}
            disabled={busy}
            className="h-8 flex-1 bg-emerald-600 text-white hover:bg-emerald-500"
          >
            <ScanLine className="size-3.5" />
            Run AI Scan
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onView(codebase)}
            className="h-8 border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
          >
            View
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(codebase)}
            className="size-8 text-zinc-500 hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </Card>
    </motion.div>
  );
});
