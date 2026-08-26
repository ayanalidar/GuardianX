"use client";

// /feature-requests — public feature-request board (Task #10-customer-success).
//
// Users can:
//   - Submit a new feature request (title + description).
//   - Upvote existing requests (one vote per IP per request — deduped via
//     the `voterIPs` JSON column on the FeatureRequest row).
//   - Sort by newest or top (most upvoted).
//
// Auth: viewing the board is open to all visitors, but submitting + voting
// require a logged-in account. The API endpoints (`/api/feature-requests`
// for GET, POST and `/api/feature-requests/[id]/vote` for POST) are
// middleware-gated — unauthenticated visitors see the board but their
// submit/vote calls return 401, which surfaces as a "Sign in to vote" CTA.
//
// Status badges (open / planned / in_progress / completed / declined) are
// set by admins directly in the DB for now — there's no admin UI yet. When
// the board grows, add a small admin panel at /feature-requests/admin.

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SiteHeader } from "@/components/sentinel/site-header";
import { SiteFooter } from "@/components/sentinel/site-footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Lightbulb,
  ArrowBigUp,
  Loader2,
  Send,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Sparkles,
  Lock,
} from "lucide-react";

interface FeatureRequestItem {
  id: string;
  title: string;
  description: string;
  status: string;
  upvotes: number;
  author: string;
  created_at: string;
}

const STATUS_META: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  open: { label: "Open", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", icon: Clock },
  planned: { label: "Planned", cls: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300", icon: Sparkles },
  in_progress: { label: "In Progress", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300", icon: Loader2 },
  completed: { label: "Completed", cls: "border-violet-500/30 bg-violet-500/10 text-violet-300", icon: CheckCircle2 },
  declined: { label: "Declined", cls: "border-red-500/30 bg-red-500/10 text-red-300", icon: XCircle },
};

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("guardianx-token");
}

function isLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem("guardianx-user");
}

async function apiFetch<T>(
  url: string,
  init?: RequestInit
): Promise<{ data?: T; error?: string; status: number }> {
  const token = getAuthToken();
  try {
    const res = await fetch(url, {
      ...init,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    return { data: body, error: body.error, status: res.status };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "fetch failed",
      status: 0,
    };
  }
}

export default function FeatureRequestsPage() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<FeatureRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"new" | "top">("top");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [votingIds, setVotingIds] = useState<Set<string>>(new Set());
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [authed, setAuthed] = useState(false);

  // Track auth state so the UI can swap submit/vote buttons for a "sign in"
  // CTA when the visitor isn't logged in.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAuthed(isLoggedIn());
    const sync = () => setAuthed(isLoggedIn());
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await apiFetch<FeatureRequestItem[]>(
      `/api/feature-requests?sort=${sort}`
    );
    if (res.data && Array.isArray(res.data)) {
      setRequests(res.data);
    } else if (res.status === 401) {
      // Not logged in — show an empty state with a sign-in CTA.
      setRequests([]);
    } else {
      toast({
        title: "Failed to load",
        description: res.error || "Could not load feature requests.",
        variant: "destructive",
      });
    }
    setLoading(false);
  }, [sort, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const submit = async () => {
    if (!authed) {
      toast({
        title: "Sign in required",
        description: "Please log in to submit a feature request.",
        variant: "destructive",
      });
      return;
    }
    if (!form.title.trim() || !form.description.trim()) return;
    setSubmitting(true);
    const res = await apiFetch<FeatureRequestItem>("/api/feature-requests", {
      method: "POST",
      body: JSON.stringify({ title: form.title, description: form.description }),
    });
    setSubmitting(false);
    if (res.data) {
      toast({
        title: "Submitted!",
        description: "Your feature request is live. Your upvote was auto-applied.",
      });
      setForm({ title: "", description: "" });
      setShowForm(false);
      setVotedIds((s) => new Set(s).add(res.data!.id));
      await load();
    } else if (res.status === 429) {
      toast({
        title: "Rate limit",
        description: res.error || "Too many submissions. Please wait.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Failed",
        description: res.error || "Could not submit.",
        variant: "destructive",
      });
    }
  };

  const vote = async (id: string) => {
    if (!authed) {
      toast({
        title: "Sign in to vote",
        description: "Create a free account to upvote feature requests.",
        variant: "destructive",
      });
      return;
    }
    if (votedIds.has(id) || votingIds.has(id)) return;
    setVotingIds((s) => new Set(s).add(id));
    const res = await apiFetch<{ upvotes: number; already_voted?: boolean }>(
      `/api/feature-requests/${id}/vote`,
      { method: "POST" }
    );
    setVotingIds((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
    if (res.data) {
      setVotedIds((s) => new Set(s).add(id));
      setRequests((rs) =>
        rs.map((r) =>
          r.id === id ? { ...r, upvotes: res.data!.upvotes ?? r.upvotes } : r
        )
      );
    } else if (res.status === 429) {
      toast({
        title: "Slow down",
        description: res.error || "Too many votes. Please wait.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Vote failed",
        description: res.error || "Could not register your vote.",
        variant: "destructive",
      });
    }
  };

  return (
    <>
      <SiteHeader />
      <div className="scanlines cyber-vignette relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-20" />
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
        </div>

        <div className="relative z-10 mx-auto max-w-4xl px-4 pt-24 py-16 sm:px-6">
          {/* Hero */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center">
            <Lightbulb className="mx-auto size-10 text-amber-400" />
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-zinc-50">
              Feature Requests
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
              Help shape the GuardianX roadmap. Submit ideas, upvote the ones
              you want most, and track their status from open to shipped.
            </p>
          </motion.div>

          {/* Auth banner */}
          {!authed && (
            <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-300">
              <div className="flex items-center gap-2">
                <Lock className="size-3.5" />
                <span>Sign in to submit + upvote.</span>
              </div>
              <a
                href="/"
                className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-200 hover:bg-amber-500/20"
              >
                Sign in →
              </a>
            </div>
          )}

          {/* Sort + submit */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSort("top")}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs transition-colors ${
                  sort === "top"
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                    : "text-zinc-400 hover:bg-zinc-800/50"
                }`}
              >
                <TrendingUp className="size-3.5" /> Top
              </button>
              <button
                type="button"
                onClick={() => setSort("new")}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs transition-colors ${
                  sort === "new"
                    ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
                    : "text-zinc-400 hover:bg-zinc-800/50"
                }`}
              >
                <Clock className="size-3.5" /> Newest
              </button>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => setShowForm((v) => !v)}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              <Lightbulb className="size-3.5" /> {showForm ? "Cancel" : "New request"}
            </Button>
          </div>

          {/* Submit form */}
          <AnimatePresence>
            {showForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6 overflow-hidden"
              >
                <div className="holo-card-sharp hud-corners p-5">
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs text-zinc-400">Title *</Label>
                      <Input
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        placeholder="e.g. Add Slack integration for patch approvals"
                        maxLength={200}
                        className="mt-1 border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-emerald-500/50"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-zinc-400">Description *</Label>
                      <Textarea
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        placeholder="Describe the problem this would solve, the proposed approach, and any alternatives you've considered."
                        maxLength={4000}
                        className="mt-1 min-h-[6rem] resize-none border-zinc-700 bg-zinc-900/60 text-zinc-200 focus-visible:border-emerald-500/50"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-600">
                        {form.description.length}/4000 chars · 5 submissions/hour per IP
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void submit()}
                        disabled={
                          submitting ||
                          !form.title.trim() ||
                          !form.description.trim()
                        }
                        className="bg-emerald-600 text-white hover:bg-emerald-500"
                      >
                        {submitting ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Send className="size-3.5" />
                        )}
                        Submit
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* List */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900/40"
                />
              ))}
            </div>
          ) : requests.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 p-10 text-center">
              <Lightbulb className="mx-auto size-8 text-zinc-600" />
              <h3 className="mt-3 text-sm font-semibold text-zinc-300">
                {authed ? "No feature requests yet" : "Sign in to view + submit"}
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                {authed
                  ? "Be the first to suggest a feature!"
                  : "The board is gated to logged-in users to prevent spam."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((r, i) => {
                const statusMeta =
                  STATUS_META[r.status] || STATUS_META.open;
                const hasVoted = votedIds.has(r.id);
                const isVoting = votingIds.has(r.id);
                return (
                  <motion.div
                    key={r.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    className="holo-card-sharp hud-corners flex gap-4 p-4"
                  >
                    {/* Upvote button */}
                    <button
                      type="button"
                      onClick={() => void vote(r.id)}
                      disabled={!authed || hasVoted || isVoting}
                      className={`flex w-14 shrink-0 flex-col items-center justify-center rounded-lg border transition-colors ${
                        hasVoted
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                          : authed
                          ? "border-zinc-700 bg-zinc-900/40 text-zinc-300 hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300"
                          : "cursor-not-allowed border-zinc-800 bg-zinc-900/20 text-zinc-600"
                      }`}
                      title={
                        !authed
                          ? "Sign in to vote"
                          : hasVoted
                          ? "You've upvoted this"
                          : "Upvote"
                      }
                    >
                      {isVoting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ArrowBigUp
                          className={`size-5 ${hasVoted ? "fill-emerald-400" : ""}`}
                        />
                      )}
                      <span className="mt-0.5 text-sm font-bold">{r.upvotes}</span>
                    </button>

                    {/* Body */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-semibold text-zinc-100">
                          {r.title}
                        </h3>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${statusMeta.cls}`}
                        >
                          <statusMeta.icon className="mr-1 size-2.5" />
                          {statusMeta.label}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-zinc-400 line-clamp-2">
                        {r.description}
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-600">
                        <span>by {r.author || "anonymous"}</span>
                        <span>·</span>
                        <span>{new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
        <SiteFooter />
      </div>
    </>
  );
}
