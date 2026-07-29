import type { Severity } from "./api";

export const severityStyles: Record<
  Severity,
  { label: string; badge: string; dot: string; ring: string }
> = {
  critical: {
    label: "Critical",
    badge:
      "bg-red-500/15 text-red-300 border-red-500/40 hover:bg-red-500/20",
    dot: "bg-red-500",
    ring: "hover:border-red-500/40",
  },
  high: {
    label: "High",
    badge:
      "bg-orange-500/15 text-orange-300 border-orange-500/40 hover:bg-orange-500/20",
    dot: "bg-orange-500",
    ring: "hover:border-orange-500/40",
  },
  medium: {
    label: "Medium",
    badge:
      "bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/20",
    dot: "bg-amber-500",
    ring: "hover:border-amber-500/40",
  },
  low: {
    label: "Low",
    badge:
      "bg-sky-500/15 text-sky-300 border-sky-500/40 hover:bg-sky-500/20",
    dot: "bg-sky-500",
    ring: "hover:border-sky-500/40",
  },
};

export function severityRank(s: Severity): number {
  return { critical: 0, high: 1, medium: 2, low: 3 }[s];
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

// Render a unified diff with line-level coloring (additions / removals / context).
export interface DiffLine {
  type: "add" | "del" | "context" | "hunk" | "meta";
  text: string;
}

export function parseDiff(diff: string): DiffLine[] {
  return diff.split("\n").map((line) => {
    if (line.startsWith("+++") || line.startsWith("---")) {
      return { type: "meta", text: line };
    }
    if (line.startsWith("@@")) {
      return { type: "hunk", text: line };
    }
    if (line.startsWith("+")) {
      return { type: "add", text: line };
    }
    if (line.startsWith("-")) {
      return { type: "del", text: line };
    }
    return { type: "context", text: line };
  });
}

export function diffLineClass(line: DiffLine): string {
  switch (line.type) {
    case "add":
      return "bg-emerald-500/10 text-emerald-300";
    case "del":
      return "bg-red-500/10 text-red-300";
    case "hunk":
      return "text-sky-400 bg-sky-500/5";
    case "meta":
      return "text-zinc-500";
    default:
      return "text-zinc-400";
  }
}
