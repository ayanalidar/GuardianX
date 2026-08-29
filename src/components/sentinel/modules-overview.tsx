"use client";

/**
 * ModulesOverview
 * ===============
 * Searchable + filterable catalog of every GuardianX module — driven
 * from the canonical FEATURES list in `./landing/features-data.ts`.
 *
 * Used on the `/features` page (and re-usable anywhere a flat module
 * browser is needed). Clicking a card calls `onSelect` so the parent
 * can route to the relevant Command Center tab.
 *
 * Design tokens (defined in src/app/globals.css):
 *   - `holo-card-sharp`  sharp glowing card surface
 *   - `hud-corners`      L-shaped corner brackets
 *   - `neon-emerald`     text-shadow glow
 *   - `pulse-dot`        throb animation for the live status pip
 */

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Sparkles, X, LayoutGrid } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import { FEATURES, type Feature } from "./landing/features-data";

export interface ModulesOverviewProps {
  /** Optional callback fired when a card is clicked. */
  onSelect?: (feature: Feature) => void;
  /** Optional extra className on the root wrapper. */
  className?: string;
}

const ALL = "All";

export function ModulesOverview({ onSelect, className }: ModulesOverviewProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(ALL);

  // Derive category list (sorted: All first, then by descending count).
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of FEATURES) {
      counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
    }
    const list = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    return [{ name: ALL, count: FEATURES.length }, ...list.map(([name, count]) => ({ name, count }))];
  }, []);

  // Filtered feature list — search hits title, category, and desc.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FEATURES.filter((f) => {
      if (activeCategory !== ALL && f.category !== activeCategory) return false;
      if (!q) return true;
      return (
        f.title.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q) ||
        f.desc.toLowerCase().includes(q)
      );
    });
  }, [query, activeCategory]);

  const newCount = useMemo(() => FEATURES.filter((f) => f.isNew).length, []);

  return (
    <div className={cn("relative w-full", className)}>
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
            <span className="size-1.5 rounded-full bg-emerald-500 pulse-dot" />
            guardianx@catalog:~$
          </div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-zinc-50 neon-emerald sm:text-3xl">
            <LayoutGrid className="size-6 text-emerald-400" />
            All Modules
          </h2>
          <p className="mt-1.5 text-sm text-zinc-400">
            <span className="font-bold text-emerald-400">{FEATURES.length}</span> integrated modules across
            <span className="font-bold text-cyan-400"> {categories.length - 1}</span> categories
            {newCount > 0 && (
              <>
                {" — "}
                <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  <Sparkles className="size-2.5" /> {newCount} NEW
                </span>
              </>
            )}
          </p>
        </div>

        {/* ── Search ────────────────────────────────────────────────── */}
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search modules…"
            aria-label="Search modules"
            className="border-zinc-800 bg-zinc-900/60 pl-9 pr-9 text-zinc-200 placeholder:text-zinc-500 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Category pills ──────────────────────────────────────────── */}
      <div
        className="mb-6 flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-md border border-zinc-800/80 bg-zinc-950/60 p-3"
        role="tablist"
        aria-label="Filter by category"
      >
        {categories.map((c) => {
          const active = c.name === activeCategory;
          return (
            <button
              key={c.name}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveCategory(c.name)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
                active
                  ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200 neon-emerald"
                  : "border-zinc-700/60 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200",
              )}
            >
              {c.name}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums",
                  active ? "bg-emerald-500/30 text-emerald-100" : "bg-zinc-800 text-zinc-500",
                )}
              >
                {c.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Matching count line ──────────────────────────────────────── */}
      <div className="mb-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        <span>
          {"// "}
          {filtered.length === FEATURES.length
            ? `showing all ${filtered.length}`
            : `showing ${filtered.length} of ${FEATURES.length}`}
        </span>
        {activeCategory !== ALL || query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveCategory(ALL);
            }}
            className="text-emerald-400 transition-colors hover:text-emerald-300"
          >
            reset ✕
          </button>
        ) : null}
      </div>

      {/* ── Grid ─────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="holo-card-sharp hud-corners flex flex-col items-center justify-center gap-3 p-16 text-center">
          <Search className="size-8 text-zinc-600" />
          <p className="text-sm font-medium text-zinc-300">No modules match your search.</p>
          <p className="text-xs text-zinc-500">Try a different keyword or reset the filters.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setQuery("");
              setActiveCategory(ALL);
            }}
            className="mt-2 border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-emerald-500/50 hover:text-emerald-300"
          >
            Reset filters
          </Button>
        </div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((feature) => (
              <ModuleCard key={feature.title} feature={feature} onSelect={onSelect} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

// ── Single card ────────────────────────────────────────────────────────
function ModuleCard({
  feature,
  onSelect,
}: {
  feature: Feature;
  onSelect?: (f: Feature) => void;
}) {
  const Icon = feature.icon;
  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      onClick={() => onSelect?.(feature)}
      className={cn(
        "group relative block h-full cursor-pointer rounded-md border p-5 text-left transition-all duration-300",
        "holo-card-sharp hud-corners",
        feature.border,
        feature.bg,
        feature.glow,
        "hover:-translate-y-1 hover:border-opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50",
      )}
      aria-label={`${feature.title} — ${feature.category}. ${feature.desc}`}
    >
      {/* cursor-follow radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-md opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(220px circle at var(--mx,50%) var(--my,50%), rgba(16,185,129,0.10), transparent 65%)",
        }}
      />

      {/* NEW badge */}
      {feature.isNew && (
        <div className="absolute -right-1 -top-1 z-10 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-white shadow-[0_0_12px_rgba(16,185,129,0.5)]">
          NEW
        </div>
      )}

      <div className="relative">
        {/* icon + category badge */}
        <div className="mb-3 flex items-start justify-between">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-lg border bg-zinc-950/60",
              feature.border,
            )}
          >
            <Icon className={cn("size-5", feature.color)} />
          </div>
          <Badge
            variant="outline"
            className={cn(
              "border-zinc-700 bg-zinc-900/50 text-[9px] uppercase tracking-wider",
              feature.color,
            )}
          >
            {feature.category}
          </Badge>
        </div>

        {/* title */}
        <h3 className={cn("text-sm font-bold", feature.color)}>{feature.title}</h3>

        {/* description */}
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">{feature.desc}</p>

        {/* hover affordance */}
        <div className="mt-4 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-zinc-600 transition-colors group-hover:text-emerald-400">
          <span className="size-1 rounded-full bg-current" />
          {feature.isNew ? "explore new module" : "open module"}
        </div>
      </div>
    </motion.button>
  );
}
