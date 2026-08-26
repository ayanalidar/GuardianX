"use client";

// Admin-only "User Activity" monitor (task rbac-activity-monitor).
//
// Fetches a per-user activity summary from /api/admin/user-activity on
// mount and every 60s (pausing while the tab is hidden, courtesy of
// useVisiblePolling). Renders:
//
//   • A 3-tile summary at the top: total users, users active today,
//     and total clients across all users.
//   • A table of users with columns Name, Email, Role, Clients,
//     Last Login, Last Activity. Clicking a row expands a panel showing
//     that user's last 5 audit-log entries (action · entity · timestamp).
//
// The endpoint is admin-gated, so this component is only ever mounted
// inside the admin-only "Administration" sidebar group.

import { useCallback, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Clock,
  Crown,
  Eye,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Shield,
  Users,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
// Mirrors the shape returned by GET /api/admin/user-activity. Kept loose
// (no zod) — the route is admin-only and we surface failures via toast.

interface AuditEntry {
  action: string | null;
  entity: string | null;
  timestamp: string;
}

interface UserSummary {
  id: string;
  email: string;
  name: string | null;
  role: string;
  approved: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  stats: {
    clients: number;
    scans: number;
    patches: number;
    findings: number;
    auditEntries: number;
  };
  recentActivity: AuditEntry[];
}

interface ActivityResponse {
  users?: UserSummary[];
  totals?: { users: number; activeToday: number; clients: number };
  error?: string;
}

// ── Role badge styling (matches UserManagementPanel) ───────────────────────
const ROLE_STYLES: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; color: string; label: string }
> = {
  admin: { icon: Crown, color: "border-amber-500/40 bg-amber-500/10 text-amber-300", label: "Admin" },
  analyst: { icon: Shield, color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", label: "Analyst" },
  viewer: { icon: Eye, color: "border-sky-500/40 bg-sky-500/10 text-sky-300", label: "Viewer" },
};

const REFRESH_INTERVAL_MS = 60_000;

// ── Helpers ────────────────────────────────────────────────────────────────

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  // For older timestamps fall back to a short local date.
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Component ──────────────────────────────────────────────────────────────

export function UserActivityMonitor() {
  const { toast } = useToast();
  const [data, setData] = useState<ActivityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/user-activity", { cache: "no-store" });
      const json = (await res.json()) as ActivityResponse;
      if (!res.ok) {
        throw new Error(json.error || `HTTP ${res.status}`);
      }
      setData(json);
    } catch (err) {
      // Only toast on the first load failure — repeated background poll
      // failures would be noisy.
      if (loading) {
        toast({
          variant: "destructive",
          title: "Failed to load user activity",
          description: err instanceof Error ? err.message : "Unknown error",
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loading, toast]);

  // Mount + 60s background poll, paused while the tab is hidden.
  useVisiblePolling(load, REFRESH_INTERVAL_MS);

  const users = data?.users ?? [];
  const totals = data?.totals ?? { users: 0, activeToday: 0, clients: 0 };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
            <Activity className="size-5 text-emerald-400" />
            User Activity Monitor
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Per-analyst activity summary: clients owned, scans run, audit trail, and last login. Auto-refreshes every 60s.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-50"
          title="Refresh now"
        >
          {refreshing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryTile
          label="Total Users"
          value={totals.users}
          icon={Users}
          accent="emerald"
        />
        <SummaryTile
          label="Active Today"
          value={totals.activeToday}
          icon={Activity}
          accent="cyan"
        />
        <SummaryTile
          label="Clients Across Users"
          value={totals.clients}
          icon={Shield}
          accent="emerald"
        />
      </div>

      {/* Body: table / skeleton / empty */}
      {loading ? (
        <Card className="holo-card-sharp rounded-xl p-4">
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 bg-emerald-500/10" />
            ))}
          </div>
        </Card>
      ) : users.length === 0 ? (
        <Card className="holo-card-sharp rounded-xl p-8 text-center text-sm text-zinc-500">
          <Inbox className="mx-auto size-8 text-zinc-700" />
          <p className="mt-2">No users found.</p>
          <p className="mt-1 text-xs text-zinc-600">
            Create users from the User Management panel to see their activity here.
          </p>
        </Card>
      ) : (
        <Card className="holo-card-sharp rounded-xl p-0">
          {/* Table header (hidden on mobile — rows reflow to a card) */}
          <div className="hidden grid-cols-[1.5fr_2fr_1fr_0.6fr_1.2fr_1.2fr_0.5fr] gap-3 border-b border-zinc-800/80 px-4 py-2.5 font-mono text-[9px] uppercase tracking-widest text-zinc-500 md:grid">
            <span>Name</span>
            <span>Email</span>
            <span>Role</span>
            <span className="text-right">Clients</span>
            <span>Last Login</span>
            <span>Last Activity</span>
            <span />
          </div>
          <div className="divide-y divide-zinc-800/60">
            {users.map((u, i) => {
              const roleStyle = ROLE_STYLES[u.role] ?? ROLE_STYLES.viewer;
              const isExpanded = expandedId === u.id;
              const lastActivity = u.recentActivity[0]?.timestamp ?? null;
              return (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.4) }}
                  className="group"
                >
                  {/* Row (button for a11y) */}
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : u.id)}
                    className="grid w-full grid-cols-2 gap-2 px-4 py-3 text-left transition-colors hover:bg-emerald-500/5 md:grid-cols-[1.5fr_2fr_1fr_0.6fr_1.2fr_1.2fr_0.5fr] md:items-center md:gap-3"
                    aria-expanded={isExpanded}
                  >
                    {/* Name */}
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-500 transition-transform group-hover:translate-x-0.5">
                        {isExpanded ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                      </span>
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900/60 text-[10px] font-bold text-zinc-300">
                        {(u.name || u.email || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-100">
                          {u.name || "—"}
                        </div>
                        {!u.approved && (
                          <span className="font-mono text-[9px] uppercase tracking-wider text-amber-400">
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Email */}
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                      <Mail className="size-3 shrink-0 text-zinc-600" />
                      <span className="truncate">{u.email}</span>
                    </div>
                    {/* Role */}
                    <div>
                      <Badge
                        className={`border text-[9px] ${roleStyle.color}`}
                      >
                        <roleStyle.icon className="mr-1 size-2.5" />
                        {roleStyle.label}
                      </Badge>
                    </div>
                    {/* Clients */}
                    <div className="text-right font-mono text-sm text-zinc-200 md:text-left">
                      <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                        {u.stats.clients}
                      </span>
                    </div>
                    {/* Last login */}
                    <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                      <Clock className="size-3 shrink-0 text-zinc-600" />
                      <span title={formatDateTime(u.lastLoginAt)}>
                        {formatRelative(u.lastLoginAt)}
                      </span>
                    </div>
                    {/* Last activity */}
                    <div className="text-[11px] text-zinc-400">
                      <span title={formatDateTime(lastActivity)}>
                        {formatRelative(lastActivity)}
                      </span>
                    </div>
                    {/* Expand indicator (md+) */}
                    <div className="hidden justify-end md:flex">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                        {u.recentActivity.length > 0 ? `${u.recentActivity.length}` : "—"}
                      </span>
                    </div>
                  </button>

                  {/* Expanded panel: last 5 audit entries + mini stat row */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        key="expanded"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden border-t border-zinc-800/60 bg-zinc-950/60"
                      >
                        <div className="px-4 py-3">
                          {/* Mini stat row */}
                          <div className="mb-3 flex flex-wrap gap-2">
                            <MiniStat label="Scans" value={u.stats.scans} color="text-cyan-300" />
                            <MiniStat label="Patches" value={u.stats.patches} color="text-emerald-300" />
                            <MiniStat label="Findings" value={u.stats.findings} color="text-amber-300" />
                            <MiniStat label="Audit Entries" value={u.stats.auditEntries} color="text-sky-300" />
                            {u.lastLoginIp && (
                              <MiniStat
                                label="Last IP"
                                value={u.lastLoginIp}
                                color="text-zinc-300"
                                mono
                              />
                            )}
                          </div>

                          {/* Recent activity list */}
                          <div className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-emerald-400/70">
                            Recent Activity (last 5)
                          </div>
                          {u.recentActivity.length === 0 ? (
                            <div className="rounded-md border border-dashed border-zinc-800 px-3 py-4 text-center text-xs text-zinc-600">
                              No audit-log entries for this user yet.
                            </div>
                          ) : (
                            <ul className="space-y-1">
                              {u.recentActivity.map((a, idx) => (
                                <li
                                  key={`${u.id}-${idx}-${a.timestamp}`}
                                  className="flex items-center gap-2 rounded-md border border-zinc-800/60 bg-zinc-900/40 px-3 py-1.5 text-xs"
                                >
                                  <span className="size-1.5 shrink-0 rounded-full bg-emerald-500/60" />
                                  <span className="font-mono text-emerald-300">
                                    {a.action || "—"}
                                  </span>
                                  {a.entity && (
                                    <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 text-[9px] text-zinc-400">
                                      {a.entity}
                                    </span>
                                  )}
                                  <span className="ml-auto text-[10px] text-zinc-500">
                                    {formatRelative(a.timestamp)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Small subcomponents (kept inline for a single-file panel) ──────────────

function SummaryTile({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  accent: "emerald" | "cyan";
}) {
  const color =
    accent === "cyan"
      ? { text: "text-cyan-300", bg: "bg-cyan-500/10", ring: "ring-cyan-500/20" }
      : { text: "text-emerald-300", bg: "bg-emerald-500/10", ring: "ring-emerald-500/20" };
  return (
    <Card className="holo-card-sharp rounded-xl p-4">
      <div className="flex items-center gap-3">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${color.bg} ring-1 ${color.ring}`}
        >
          <Icon className={`size-4 ${color.text}`} />
        </div>
        <div className="min-w-0">
          <div className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
            {label}
          </div>
          <div className="font-mono text-2xl font-bold text-zinc-50">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function MiniStat({
  label,
  value,
  color,
  mono,
}: {
  label: string;
  value: number | string;
  color: string;
  mono?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1">
      <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className={`text-xs font-semibold ${color} ${mono ? "font-mono" : ""}`}>
        {value}
      </span>
    </div>
  );
}
