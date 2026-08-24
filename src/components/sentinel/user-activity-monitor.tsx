"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  Clock,
  Crown,
  Eye,
  Loader2,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldOff,
  Users,
} from "lucide-react";

interface AuditEntry {
  id: string;
  action: string;
  entity: string | null;
  details: unknown;
  timestamp: string;
}

interface UserActivity {
  id: string;
  email: string;
  name: string;
  role: string;
  approved: boolean;
  twofaEnabled: boolean;
  clients: number;
  lastLogin: string | null;
  lastActivity: string | null;
  audit: AuditEntry[];
}

interface Summary {
  totalUsers: number;
  activeToday: number;
  totalClients: number;
  totalScans: number;
  admins: number;
  twoFactorEnabled: number;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

const ROLE_STYLES: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; color: string; label: string }
> = {
  admin: { icon: Crown, color: "border-amber-500/40 bg-amber-500/10 text-amber-300", label: "Admin" },
  analyst: { icon: Shield, color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300", label: "Analyst" },
  viewer: { icon: Eye, color: "border-sky-500/40 bg-sky-500/10 text-sky-300", label: "Viewer" },
};

export function UserActivityMonitor() {
  const { toast } = useToast();
  const [users, setUsers] = useState<UserActivity[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(
    async (silent?: boolean) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      try {
        const res = await fetch("/api/admin/user-activity");
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const data = await res.json();
        setUsers(data.users || []);
        setSummary(data.summary || null);
      } catch (err) {
        toast({
          variant: "destructive",
          title: "Failed to load activity",
          description: err instanceof Error ? err.message : "unknown error",
        });
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 30_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-zinc-50">
            <Users className="size-5 text-emerald-400" />
            User Activity Monitor
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            Live view of every user&apos;s last login, last activity, and recent audit trail. Auto-refreshes every 30s.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => load(true)}
          disabled={refreshing}
          className="border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800"
        >
          {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          <span className="ml-1 hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Summary tiles */}
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 bg-zinc-800/60" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryTile
            icon={Users}
            label="Total users"
            value={summary.totalUsers}
            accent="emerald"
          />
          <SummaryTile
            icon={Activity}
            label="Active today"
            value={summary.activeToday}
            accent="sky"
          />
          <SummaryTile
            icon={ShieldCheck}
            label="2FA enabled"
            value={`${summary.twoFactorEnabled} / ${summary.totalUsers}`}
            accent={summary.twoFactorEnabled === summary.totalUsers ? "emerald" : "amber"}
          />
          <SummaryTile
            icon={Crown}
            label="Clients across users"
            value={summary.totalClients}
            sub={`${summary.totalScans} scans total`}
            accent="purple"
          />
        </div>
      ) : null}

      {/* Users table */}
      {loading ? (
        <Skeleton className="h-96 w-full bg-zinc-800/60" />
      ) : users.length === 0 ? (
        <Card className="rounded-xl border-zinc-800 bg-zinc-900/40 p-12 text-center text-sm text-zinc-500">
          <Users className="mx-auto size-8 text-zinc-700" />
          <p className="mt-2">No users found.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-xl border-zinc-800 bg-zinc-900/40">
          <Table>
            <TableHeader>
              <TableRow className="border-zinc-800 hover:bg-transparent">
                <TableHead className="w-8 pl-3" />
                <TableHead className="text-xs text-zinc-400">User</TableHead>
                <TableHead className="text-xs text-zinc-400">Role</TableHead>
                <TableHead className="text-xs text-zinc-400">Clients</TableHead>
                <TableHead className="text-xs text-zinc-400">Last login</TableHead>
                <TableHead className="text-xs text-zinc-400">Last activity</TableHead>
                <TableHead className="text-xs text-zinc-400">2FA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const roleStyle = ROLE_STYLES[u.role] ?? ROLE_STYLES.viewer;
                const RoleIcon = roleStyle.icon;
                const isOpen = expanded === u.id;
                return (
                  <Fragment key={u.id}>
                    <TableRow
                      onClick={() => setExpanded((prev) => (prev === u.id ? null : u.id))}
                      className="cursor-pointer border-zinc-800 hover:bg-emerald-500/5"
                    >
                      <TableCell className="pl-3 text-zinc-500">
                        {isOpen ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] font-bold text-emerald-400">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-xs font-medium text-zinc-100">
                              {u.name}
                            </div>
                            <div className="truncate text-[10px] text-zinc-500">{u.email}</div>
                          </div>
                          {!u.approved && (
                            <Badge className="border border-amber-500/40 bg-amber-500/10 text-[8px] text-amber-300">
                              Pending
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`border text-[9px] ${roleStyle.color}`}>
                          <RoleIcon className="size-2.5" /> {roleStyle.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-300">{u.clients}</TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        {relativeTime(u.lastLogin)}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        {relativeTime(u.lastActivity)}
                      </TableCell>
                      <TableCell>
                        {u.twofaEnabled ? (
                          <ShieldCheck className="size-4 text-emerald-400" />
                        ) : (
                          <ShieldOff className="size-4 text-zinc-600" />
                        )}
                      </TableCell>
                    </TableRow>
                    <AnimatePresence>
                      {isOpen && (
                        <TableRow key={`${u.id}-detail`} className="border-zinc-800 bg-zinc-950/60">
                          <TableCell colSpan={7} className="p-4">
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-500/70">
                                <Clock className="size-3" /> Last 5 audit entries for {u.email}
                              </div>
                              {u.audit.length === 0 ? (
                                <p className="text-xs text-zinc-500">
                                  No recent activity recorded. This user may have signed in before
                                  audit logging was enabled.
                                </p>
                              ) : (
                                <div className="space-y-1.5">
                                  {u.audit.map((e) => (
                                    <div
                                      key={e.id}
                                      className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-[11px]"
                                    >
                                      <Badge className="border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[9px] text-emerald-300">
                                        {e.action}
                                      </Badge>
                                      {e.entity && (
                                        <span className="font-mono text-[10px] text-zinc-500">
                                          {e.entity}
                                        </span>
                                      )}
                                      <span className="ml-auto text-[10px] text-zinc-500">
                                        {relativeTime(e.timestamp)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </motion.div>
                          </TableCell>
                        </TableRow>
                      )}
                    </AnimatePresence>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  accent: "emerald" | "sky" | "amber" | "purple";
}) {
  const accentMap = {
    emerald: { text: "text-emerald-400", bg: "bg-emerald-500/10", ring: "ring-emerald-500/30" },
    sky: { text: "text-sky-400", bg: "bg-sky-500/10", ring: "ring-sky-500/30" },
    amber: { text: "text-amber-400", bg: "bg-amber-500/10", ring: "ring-amber-500/30" },
    purple: { text: "text-purple-400", bg: "bg-purple-500/10", ring: "ring-purple-500/30" },
  } as const;
  const a = accentMap[accent];
  return (
    <Card className="rounded-xl border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-2">
        <div className={`flex size-8 items-center justify-center rounded-lg ${a.bg} ring-1 ${a.ring}`}>
          <Icon className={`size-4 ${a.text}`} />
        </div>
        <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">
          {label}
        </span>
      </div>
      <div className="mt-2 text-2xl font-bold text-zinc-50">{value}</div>
      {sub && <div className="text-[10px] text-zinc-500">{sub}</div>}
    </Card>
  );
}
