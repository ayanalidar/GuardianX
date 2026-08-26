"use client";

// GuardianX — SECURITY COMMONS PANEL
// ==================================
// Innovation #2: open-source detection-rule repository. Security
// researchers contribute regex/AST patterns; GuardianX runs them during
// scans; the leaderboard pays researchers a cut every time their rule
// produces a finding. Like npm + HackerOne rolled into one.
//
// This component is a self-contained tab view:
//   • Header with users icon + "SECURITY COMMONS" + "COMMUNITY-POWERED" badge
//   • Leaderboard: top 10 contributors by earnings + findings + rule count
//   • Rule browser: searchable / sortable / filterable grid of community rules
//   • Submit-rule dialog: name, description, pattern, severity, language, CWE
//   • Upvote + Install buttons per rule
//   • "Your rules" section (when authenticated) showing earnings + status
//
// Visual idiom: holo-card-sharp + hud-corners, bg-zinc-950, violet + emerald
// accents (NO indigo/blue). Mobile-first, responsive.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Users,
  Search,
  Trophy,
  ArrowUp,
  Download,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  Award,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Code2,
  IndianRupee,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

// ── Types (mirror server response shape) ─────────────────────────────────
interface CommunityRule {
  id: string;
  name: string;
  description: string;
  pattern: string;
  severity: string;
  cwe: string | null;
  language: string;
  authorId: string;
  authorName: string;
  authorEmail: string;
  upvotes: number;
  downloads: number;
  findingsCount: number;
  earnings: number;       // paise
  version: number;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

interface LeaderboardEntry {
  authorId: string;
  authorName: string;
  authorEmail: string;
  ruleCount: number;
  totalFindings: number;
  totalEarnings: number; // paise
  totalUpvotes: number;
}

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  totalRules: number;
  totalFindings: number;
  totalEarnings: number;
  error?: string;
}

interface RulesResponse {
  rules: CommunityRule[];
  error?: string;
}

interface SubmitResponse {
  ok?: boolean;
  rule?: CommunityRule;
  error?: string;
}

interface UpvoteResponse {
  ok?: boolean;
  upvotes?: number;
  upvoted?: boolean;
  error?: string;
}

// ── Severity styling ─────────────────────────────────────────────────────
function severityColor(sev: string): string {
  switch (sev.toLowerCase()) {
    case "critical": return "#f43f5e";
    case "high":     return "#f97316";
    case "medium":   return "#f59e0b";
    case "low":      return "#06b6d4";
    case "info":     return "#71717a";
    default:         return "#a1a1aa";
  }
}

function rupee(paise: number): string {
  if (paise === 0) return "₹0";
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("guardianx-token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchRules(signal: AbortSignal, params: URLSearchParams): Promise<RulesResponse> {
  const res = await fetch(`/api/commons/rules?${params.toString()}`, {
    credentials: "same-origin",
    headers: authHeaders(),
    signal,
  });
  return (await res.json().catch(() => ({ error: "Invalid response" }))) as RulesResponse;
}

async function fetchLeaderboard(signal: AbortSignal): Promise<LeaderboardResponse> {
  const res = await fetch("/api/commons/leaderboard", {
    credentials: "same-origin",
    headers: authHeaders(),
    signal,
  });
  return (await res.json().catch(() => ({ error: "Invalid response" }))) as LeaderboardResponse;
}

async function submitRule(body: Record<string, unknown>): Promise<SubmitResponse> {
  const res = await fetch("/api/commons/rules", {
    method: "POST",
    credentials: "same-origin",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => ({ error: "Invalid response" }))) as SubmitResponse;
}

async function upvoteRule(ruleId: string, action: "add" | "remove"): Promise<UpvoteResponse> {
  const res = await fetch("/api/commons/upvote", {
    method: "POST",
    credentials: "same-origin",
    headers: authHeaders(),
    body: JSON.stringify({ ruleId, action }),
  });
  return (await res.json().catch(() => ({ error: "Invalid response" }))) as UpvoteResponse;
}

async function deleteRule(ruleId: string): Promise<{ ok?: boolean; error?: string }> {
  const res = await fetch(`/api/commons/rules/${ruleId}`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: authHeaders(),
  });
  return (await res.json().catch(() => ({ error: "Invalid response" }))) as { ok?: boolean; error?: string };
}

const LANGUAGES = ["javascript", "typescript", "python", "go", "java", "php", "ruby", "csharp", "cpp", "rust"];
const SEVERITIES = ["critical", "high", "medium", "low", "info"];

export function SecurityCommons() {
  const { toast } = useToast();

  const [rules, setRules] = useState<CommunityRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [lbLoading, setLbLoading] = useState(true);
  const [lbMeta, setLbMeta] = useState<{ totalRules: number; totalFindings: number; totalEarnings: number }>({
    totalRules: 0, totalFindings: 0, totalEarnings: 0,
  });

  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState<string>("");
  const [severity, setSeverity] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("upvotes");

  // Debounced search value — the live `search` input is what the user types;
  // `debouncedSearch` lags by 300ms and is what triggers the actual fetch.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", pattern: "", severity: "high", language: "javascript", cwe: "",
  });

  // Track which rules the current user has upvoted (local cache; cleared on reload).
  const [upvoted, setUpvoted] = useState<Set<string>>(new Set());
  const [upvoteBusy, setUpvoteBusy] = useState<Set<string>>(new Set());

  // Current user id (so we can show "Your rules"). Read from localStorage.
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("guardianx-user");
      if (raw) {
        const u = JSON.parse(raw) as { id?: string };
        if (u?.id) setCurrentUserId(u.id);
      }
    } catch { /* ignore */ }
  }, []);

  const rulesAbortRef = useRef<AbortController | null>(null);
  const lbAbortRef = useRef<AbortController | null>(null);

  const loadRules = useCallback(async () => {
    setRulesError(null);
    setRulesLoading(true);
    if (rulesAbortRef.current) rulesAbortRef.current.abort();
    const ctrl = new AbortController();
    rulesAbortRef.current = ctrl;
    const params = new URLSearchParams();
    if (debouncedSearch.trim()) params.set("q", debouncedSearch.trim());
    if (language) params.set("language", language);
    if (severity) params.set("severity", severity);
    if (sortBy) params.set("sort", sortBy);
    params.set("take", "100");
    try {
      const r = await fetchRules(ctrl.signal, params);
      if (r.error) throw new Error(r.error);
      setRules(r.rules || []);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setRulesError((e as Error).message || "Failed to load rules.");
      }
    } finally {
      setRulesLoading(false);
    }
  }, [debouncedSearch, language, severity, sortBy]);

  const loadLeaderboard = useCallback(async () => {
    setLbLoading(true);
    if (lbAbortRef.current) lbAbortRef.current.abort();
    const ctrl = new AbortController();
    lbAbortRef.current = ctrl;
    try {
      const r = await fetchLeaderboard(ctrl.signal);
      if (r.error) throw new Error(r.error);
      setLeaderboard(r.leaderboard || []);
      setLbMeta({
        totalRules: r.totalRules,
        totalFindings: r.totalFindings,
        totalEarnings: r.totalEarnings,
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        // soft-fail — leaderboard is decorative
        console.warn("[commons] leaderboard load failed", e);
      }
    } finally {
      setLbLoading(false);
    }
  }, []);

  useEffect(() => { void loadRules(); }, [loadRules]);
  useEffect(() => { void loadLeaderboard(); }, [loadLeaderboard]);
  useEffect(() => {
    return () => {
      rulesAbortRef.current?.abort();
      lbAbortRef.current?.abort();
    };
  }, []);

  const yourRules = useMemo(
    () => rules.filter((r) => r.authorId === currentUserId),
    [rules, currentUserId]
  );

  const handleUpvote = async (rule: CommunityRule) => {
    const isUpvoted = upvoted.has(rule.id);
    setUpvoteBusy((s) => new Set(s).add(rule.id));
    try {
      const r = await upvoteRule(rule.id, isUpvoted ? "remove" : "add");
      if (r.error) {
        toast({ title: "Upvote failed", description: r.error, variant: "destructive" });
        return;
      }
      if (typeof r.upvotes === "number") {
        setRules((prev) =>
          prev.map((x) => (x.id === rule.id ? { ...x, upvotes: r.upvotes as number } : x))
        );
      }
      setUpvoted((s) => {
        const next = new Set(s);
        if (r.upvoted) next.add(rule.id); else next.delete(rule.id);
        return next;
      });
    } catch (e) {
      toast({ title: "Upvote failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setUpvoteBusy((s) => {
        const next = new Set(s);
        next.delete(rule.id);
        return next;
      });
    }
  };

  const handleInstall = (rule: CommunityRule) => {
    // Copy the rule's pattern to clipboard so the user can paste it into
    // their custom rules config (or a DetectionRule row via /api/detection-rules).
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(rule.pattern).then(
        () => toast({
          title: "Rule copied",
          description: `"${rule.name}" pattern is on your clipboard. Paste it into your scanner config.`,
        }),
        () => toast({ title: "Copy failed", variant: "destructive" })
      );
    } else {
      toast({ title: "Clipboard unavailable", variant: "destructive" });
    }
  };

  const handleDelete = async (rule: CommunityRule) => {
    if (!confirm(`Deactivate your rule "${rule.name}"? It will stop appearing in the commons, but past findings keep their attribution.`)) {
      return;
    }
    try {
      const r = await deleteRule(rule.id);
      if (r.error) {
        toast({ title: "Delete failed", description: r.error, variant: "destructive" });
        return;
      }
      toast({ title: "Rule deactivated" });
      setRules((prev) => prev.filter((x) => x.id !== rule.id));
    } catch (e) {
      toast({ title: "Delete failed", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.description.trim() || !form.pattern.trim()) {
      toast({ title: "Missing fields", description: "Name, description, and pattern are required.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const r = await submitRule({
        name: form.name.trim(),
        description: form.description.trim(),
        pattern: form.pattern.trim(),
        severity: form.severity,
        language: form.language,
        cwe: form.cwe.trim() || undefined,
      });
      if (r.error) {
        toast({ title: "Submission failed", description: r.error, variant: "destructive" });
        return;
      }
      if (r.rule) {
        setRules((prev) => [r.rule as CommunityRule, ...prev]);
        toast({ title: "Rule published", description: `"${r.rule.name}" is now live in the commons.` });
      }
      setSubmitOpen(false);
      setForm({ name: "", description: "", pattern: "", severity: "high", language: "javascript", cwe: "" });
    } catch (e) {
      toast({ title: "Submission failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 p-1">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="holo-card-sharp hud-corners flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10">
            <Users className="size-6 text-violet-300" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-zinc-50 sm:text-xl">
                SECURITY COMMONS
              </h2>
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[9px] uppercase tracking-widest text-emerald-300">
                Community-Powered
              </Badge>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-violet-300/70">
              Consume · Contribute · Earn
            </p>
          </div>
        </div>
        <Button
          onClick={() => setSubmitOpen(true)}
          size="sm"
          className="bg-violet-500 text-zinc-50 hover:bg-violet-400"
        >
          <Plus className="size-4" />
          Submit a rule
        </Button>
      </motion.div>

      {/* ── Leaderboard ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="holo-card-sharp hud-corners p-5"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Trophy className="size-4 text-amber-400" />
            Top Contributors
            <span className="font-mono text-[10px] text-zinc-500">
              · {lbMeta.totalRules} rules · {lbMeta.totalFindings} findings · {rupee(lbMeta.totalEarnings)} earned
            </span>
          </h3>
          <Button
            onClick={loadLeaderboard}
            disabled={lbLoading}
            variant="outline"
            size="sm"
            className="border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-violet-500/40 hover:text-violet-300"
          >
            <RefreshCw className={`size-4 ${lbLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        {lbLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full bg-violet-500/5" />
            ))}
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-zinc-500">
            <Award className="size-6 text-zinc-700" />
            <p className="text-xs">No contributors yet. Be the first — submit a rule!</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {leaderboard.slice(0, 12).map((entry, i) => (
              <motion.div
                key={entry.authorId}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: Math.min(i * 0.04, 0.4) }}
                className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
              >
                <div
                  className={`flex size-8 shrink-0 items-center justify-center rounded-md font-mono text-sm font-bold ${
                    i === 0
                      ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
                      : i === 1
                      ? "bg-zinc-400/15 text-zinc-300 ring-1 ring-zinc-400/30"
                      : i === 2
                      ? "bg-orange-700/15 text-orange-400 ring-1 ring-orange-700/30"
                      : "bg-zinc-800/60 text-zinc-500"
                  }`}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-zinc-100">
                    {entry.authorName}
                  </div>
                  <div className="flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                    <span>{entry.ruleCount} rules</span>
                    <span>·</span>
                    <span>{entry.totalFindings} findings</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-bold text-emerald-300">
                    {rupee(entry.totalEarnings)}
                  </div>
                  <div className="font-mono text-[9px] text-zinc-500">
                    {entry.totalUpvotes} ↑
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ── Your rules ─────────────────────────────────────────────────────── */}
      {currentUserId && yourRules.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="holo-card-sharp hud-corners p-5"
        >
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Code2 className="size-4 text-violet-400" />
            Your Rules
            <Badge variant="outline" className="border-zinc-700 text-zinc-400">
              {yourRules.length}
            </Badge>
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {yourRules.map((r) => (
              <div key={r.id} className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-zinc-100">{r.name}</span>
                  <button
                    onClick={() => handleDelete(r)}
                    className="text-zinc-500 transition-colors hover:text-rose-400"
                    aria-label="Deactivate"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider">
                  <span style={{ color: severityColor(r.severity) }}>{r.severity}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-500">{r.language}</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-zinc-500">v{r.version}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                  <div>
                    <div className="font-mono text-xs font-bold text-zinc-100">{r.upvotes}</div>
                    <div className="text-[9px] text-zinc-500">upvotes</div>
                  </div>
                  <div>
                    <div className="font-mono text-xs font-bold text-zinc-100">{r.findingsCount}</div>
                    <div className="text-[9px] text-zinc-500">findings</div>
                  </div>
                  <div>
                    <div className="font-mono text-xs font-bold text-emerald-300">{rupee(r.earnings)}</div>
                    <div className="text-[9px] text-zinc-500">earned</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Rule browser ────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="holo-card-sharp hud-corners flex flex-col p-0"
      >
        <div className="flex flex-col gap-3 border-b border-zinc-800/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Search className="size-4 text-cyan-400" />
              Rule Browser
              {rules.length > 0 && (
                <Badge variant="outline" className="border-zinc-700 text-zinc-400">
                  {rules.length}
                </Badge>
              )}
            </h3>
            <Button
              onClick={loadRules}
              disabled={rulesLoading}
              variant="outline"
              size="sm"
              className="border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-cyan-500/40 hover:text-cyan-300"
            >
              <RefreshCw className={`size-4 ${rulesLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name or description…"
              className="border-zinc-700 bg-zinc-900/60 text-zinc-200 placeholder:text-zinc-600"
            />
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="border-zinc-700 bg-zinc-900/60 text-zinc-200">
                <SelectValue placeholder="All languages" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All languages</SelectItem>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="border-zinc-700 bg-zinc-900/60 text-zinc-200">
                <SelectValue placeholder="All severities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All severities</SelectItem>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="border-zinc-700 bg-zinc-900/60 text-zinc-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="upvotes">Most upvoted</SelectItem>
                <SelectItem value="downloads">Most installed</SelectItem>
                <SelectItem value="findings">Most findings</SelectItem>
                <SelectItem value="recent">Most recent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {rulesError ? (
          <div className="flex items-center gap-2 p-6 text-sm text-rose-300">
            <AlertCircle className="size-5" />
            {rulesError}
          </div>
        ) : rulesLoading ? (
          <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full bg-cyan-500/5" />
            ))}
          </div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-violet-500/10 ring-1 ring-violet-500/30">
              <Sparkles className="size-7 text-violet-300" />
            </div>
            <p className="text-sm font-medium text-zinc-200">No rules match your filters</p>
            <p className="max-w-sm text-xs text-zinc-500">
              Try clearing the search or selecting "All languages". Or be the first to submit a rule for this category.
            </p>
          </div>
        ) : (
          <div className="max-h-[36rem] overflow-y-auto custom-scrollbar p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rules.map((r, i) => {
                const isUpvoted = upvoted.has(r.id);
                const isBusy = upvoteBusy.has(r.id);
                const sevColor = severityColor(r.severity);
                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.4) }}
                    className="flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 transition-colors hover:border-zinc-700"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-sm font-semibold text-zinc-100">{r.name}</h4>
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                        style={{
                          color: sevColor,
                          background: `${sevColor}1a`,
                        }}
                      >
                        {r.severity}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{r.description}</p>
                    <div className="mt-2 flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                      <span className="rounded bg-zinc-800/60 px-1.5 py-0.5">{r.language}</span>
                      {r.cwe && <span className="rounded bg-zinc-800/60 px-1.5 py-0.5">CWE-{r.cwe}</span>}
                      <span className="rounded bg-zinc-800/60 px-1.5 py-0.5">v{r.version}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1 border-t border-zinc-800/60 pt-2 text-center">
                      <div>
                        <div className="font-mono text-xs font-bold text-zinc-100">{r.upvotes}</div>
                        <div className="text-[9px] text-zinc-500">upvotes</div>
                      </div>
                      <div>
                        <div className="font-mono text-xs font-bold text-zinc-100">{r.findingsCount}</div>
                        <div className="text-[9px] text-zinc-500">findings</div>
                      </div>
                      <div>
                        <div className="font-mono text-xs font-bold text-emerald-300">{rupee(r.earnings)}</div>
                        <div className="text-[9px] text-zinc-500">earned</div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Button
                        onClick={() => handleUpvote(r)}
                        disabled={isBusy}
                        size="sm"
                        variant="outline"
                        className={`flex-1 border-zinc-700 text-xs ${
                          isUpvoted
                            ? "bg-violet-500/15 text-violet-300 hover:bg-violet-500/20"
                            : "bg-zinc-900/60 text-zinc-300 hover:border-violet-500/40 hover:text-violet-300"
                        }`}
                      >
                        {isBusy ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <ArrowUp className="size-3" />
                        )}
                        {isUpvoted ? "Upvoted" : "Upvote"}
                      </Button>
                      <Button
                        onClick={() => handleInstall(r)}
                        size="sm"
                        className="bg-emerald-500 text-xs text-zinc-950 hover:bg-emerald-400"
                      >
                        <Download className="size-3" />
                        Install
                      </Button>
                    </div>
                    <div className="mt-2 truncate font-mono text-[9px] text-zinc-600">
                      by {r.authorName}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Submit-rule dialog ──────────────────────────────────────────────── */}
      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent className="holo-card-sharp hud-corners max-w-lg border-violet-500/30 bg-zinc-950/95 p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-zinc-100">
              <Plus className="size-4 text-violet-300" />
              Submit a community rule
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Contribute a regex or AST pattern. You earn a cut every time it produces a finding in a GuardianX scan.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="rule-name" className="text-zinc-300">Name</Label>
              <Input
                id="rule-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Hardcoded AWS Access Key"
                maxLength={120}
                className="border-zinc-700 bg-zinc-900/60 text-zinc-100"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-desc" className="text-zinc-300">Description</Label>
              <Textarea
                id="rule-desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What does this rule detect? Why is it dangerous?"
                maxLength={1000}
                className="min-h-[60px] border-zinc-700 bg-zinc-900/60 text-zinc-100"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-pattern" className="text-zinc-300">Pattern (regex or AST matcher)</Label>
              <Textarea
                id="rule-pattern"
                value={form.pattern}
                onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                placeholder={'e.g. AKIA[0-9A-Z]{16}'}
                maxLength={5000}
                className="min-h-[80px] font-mono text-xs border-zinc-700 bg-zinc-900/60 text-emerald-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-zinc-300">Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger className="border-zinc-700 bg-zinc-900/60 text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-zinc-300">Language</Label>
                <Select value={form.language} onValueChange={(v) => setForm({ ...form, language: v })}>
                  <SelectTrigger className="border-zinc-700 bg-zinc-900/60 text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l} value={l}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rule-cwe" className="text-zinc-300">CWE ID (optional)</Label>
              <Input
                id="rule-cwe"
                value={form.cwe}
                onChange={(e) => setForm({ ...form, cwe: e.target.value })}
                placeholder="e.g. 798"
                className="border-zinc-700 bg-zinc-900/60 text-zinc-100"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSubmitOpen(false)}
              className="border-zinc-700 bg-zinc-900/60 text-zinc-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-violet-500 text-zinc-50 hover:bg-violet-400"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Publish rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Footer explainer ────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="holo-card-sharp hud-corners p-4"
      >
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400">
          <IndianRupee className="size-4 text-emerald-400" />
          <span>
            <span className="font-semibold text-zinc-200">Earn as you contribute.</span>{" "}
            Every time your rule produces a finding in a paying customer's scan, you receive a share of the FindingsLedger amount. Top contributors are ranked by total earnings.
          </span>
        </div>
      </motion.div>
    </div>
  );
}

export default SecurityCommons;
