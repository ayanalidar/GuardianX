"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Send,
  X,
  MessageCircle,
  Loader2,
  BookOpen,
  Code2,
  ShieldCheck,
  Clock,
  ChevronDown,
} from "lucide-react";

interface SupportChatProps {
  /** Current user — admins get a priority badge + auto-high priority. */
  currentUser?: { id: string; email: string; name: string; role: string } | null;
  /** Stacked offset above any other floating UI (onboarding button, etc.). */
  bottomOffset?: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "system";
  content: string;
  ts: number;
}

interface Ticket {
  id: string;
  subject: string;
  status: string;
  reply: string | null;
  createdAt: string;
}

const STORAGE_KEY = "guardianx-support-chat";
const ADMIN_PRIORITY_LABEL = "Priority: Admin";

export function SupportChat({ currentUser, bottomOffset = 0 }: SupportChatProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [subject, setSubject] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [showTickets, setShowTickets] = useState(false);
  const isAdmin = currentUser?.role === "admin";
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Load prior conversation from localStorage (so it survives reloads) ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch { /* ignore */ }
  }, []);

  // ── Persist conversation to localStorage on change ──
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-50)));
    } catch { /* quota / privacy mode */ }
  }, [messages]);

  // ── Load prior tickets when opened ──
  const loadTickets = useCallback(async () => {
    try {
      const res = await fetch("/api/support/ticket");
      if (!res.ok) return;
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (open && currentUser) loadTickets();
  }, [open, currentUser, loadTickets]);

  // ── Auto-scroll to newest ──
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const pushSystem = (content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "system", content, ts: Date.now() },
    ]);
  };

  const handleSend = async () => {
    const msg = draft.trim();
    if (!msg || sending) return;
    if (!currentUser) {
      toast({
        variant: "destructive",
        title: "Sign in required",
        description: "Please sign in to file a support ticket.",
      });
      return;
    }

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: msg,
      ts: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setDraft("");
    setSending(true);

    try {
      const res = await fetch("/api/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim() || `Support: ${msg.slice(0, 60)}`,
          message: msg,
          priority: isAdmin ? "high" : "normal",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");

      pushSystem(
        `Ticket #${data.id?.slice(-6) ?? ""} filed. ${data.message ?? "We'll reply by email."}`
      );
      setSubject("");
      loadTickets();
    } catch (err) {
      pushSystem(
        `Could not file ticket: ${err instanceof Error ? err.message : "unknown error"}`
      );
      toast({
        variant: "destructive",
        title: "Send failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setSending(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <>
      {/* Floating launcher */}
      <motion.div
        className="fixed right-4 z-[80] sm:right-6"
        style={{ bottom: `calc(1rem + ${bottomOffset}px)` }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.6, type: "spring", stiffness: 200 }}
      >
        <Button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close support chat" : "Open support chat"}
          className="relative size-12 rounded-full bg-emerald-600 p-0 text-white shadow-[0_0_24px_rgba(16,185,129,0.4)] hover:bg-emerald-500"
        >
          <AnimatePresence mode="wait">
            {open ? (
              <motion.span key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}>
                <X className="size-5" />
              </motion.span>
            ) : (
              <motion.span key="m" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}>
                <MessageCircle className="size-5" />
              </motion.span>
            )}
          </AnimatePresence>
          {!open && tickets.filter((t) => t.status === "answered").length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-emerald-300 ring-2 ring-zinc-950" />
          )}
        </Button>
      </motion.div>

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed z-[81] flex flex-col overflow-hidden border border-emerald-500/30 bg-zinc-950/95 shadow-2xl backdrop-blur-md sm:rounded-2xl"
            style={{
              right: "1rem",
              bottom: `calc(5rem + ${bottomOffset}px)`,
              width: "min(380px, calc(100vw - 2rem))",
              maxHeight: "min(560px, calc(100vh - 7rem))",
            }}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
          >
            {/* Header */}
            <div className="flex items-start justify-between border-b border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="relative flex size-9 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
                  <ShieldCheck className="size-4 text-emerald-400" />
                  <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-zinc-950 pulse-dot" />
                </div>
                <div className="leading-tight">
                  <div className="flex items-center gap-1.5 text-sm font-bold text-zinc-50">
                    GuardianX Support
                    {isAdmin && (
                      <Badge className="border border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[9px] font-bold text-amber-300">
                        {ADMIN_PRIORITY_LABEL}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-emerald-400/70">
                    <Clock className="size-2.5" /> Typically replies within 24 hours
                  </div>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
              >
                <X className="size-4" />
              </Button>
            </div>

            {/* Conversation area */}
            <div
              ref={scrollRef}
              className="custom-scrollbar flex-1 space-y-3 overflow-y-auto bg-zinc-950/60 px-3 py-3"
            >
              {messages.length === 0 ? (
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-zinc-300">
                  <p className="font-semibold text-emerald-300">👋 Hi! How can we help?</p>
                  <p className="mt-1 text-zinc-400">
                    Tell us what you&apos;re stuck on and we&apos;ll get back to you by email.
                    For urgent production incidents, email{" "}
                    <a href="mailto:hello@guardianx.in" className="text-emerald-400 underline">
                      hello@guardianx.in
                    </a>{" "}
                    directly.
                  </p>
                </div>
              ) : (
                messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                        m.role === "user"
                          ? "bg-emerald-600 text-white"
                          : "border border-zinc-800 bg-zinc-900 text-zinc-200"
                      }`}
                    >
                      {m.content}
                    </div>
                  </motion.div>
                ))
              )}
            </div>

            {/* Prior tickets (collapsed) */}
            {tickets.length > 0 && (
              <div className="border-t border-zinc-800/60 px-3 py-2">
                <button
                  type="button"
                  onClick={() => setShowTickets((v) => !v)}
                  className="flex w-full items-center justify-between text-[10px] font-medium text-zinc-400 hover:text-zinc-200"
                >
                  <span>
                    Your tickets ({tickets.filter((t) => t.status === "open").length} open,{" "}
                    {tickets.filter((t) => t.status === "answered").length} answered)
                  </span>
                  <ChevronDown
                    className={`size-3 transition-transform ${showTickets ? "rotate-180" : ""}`}
                  />
                </button>
                <AnimatePresence>
                  {showTickets && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="custom-scrollbar mt-2 max-h-32 overflow-y-auto space-y-1.5"
                    >
                      {tickets.slice(0, 6).map((t) => (
                        <div
                          key={t.id}
                          className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-2 text-[10px]"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-zinc-300">
                              #{t.id.slice(-6)} · {t.subject}
                            </span>
                            <Badge
                              className={`px-1 py-0 text-[8px] ${
                                t.status === "answered"
                                  ? "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                                  : t.status === "closed"
                                    ? "border border-zinc-600 bg-zinc-700/20 text-zinc-400"
                                    : "border border-amber-500/40 bg-amber-500/10 text-amber-300"
                              }`}
                            >
                              {t.status}
                            </Badge>
                          </div>
                          {t.reply && (
                            <p className="mt-1 line-clamp-2 text-zinc-400">↳ {t.reply}</p>
                          )}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Quick links */}
            <div className="flex flex-wrap items-center gap-1 border-t border-zinc-800/60 px-3 py-2">
              <a
                href="/features"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[10px] text-zinc-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
              >
                <BookOpen className="size-3" /> Docs
              </a>
              <a
                href="/architecture"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-[10px] text-zinc-300 transition-colors hover:border-emerald-500/40 hover:text-emerald-300"
              >
                <Code2 className="size-3" /> API Docs
              </a>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearChat}
                  className="ml-auto text-[10px] text-zinc-500 hover:text-amber-400"
                >
                  Clear chat
                </button>
              )}
            </div>

            {/* Composer */}
            <div className="space-y-2 border-t border-emerald-500/20 bg-zinc-950 p-3">
              {messages.length === 0 && (
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject (optional)"
                  className="h-8 border-zinc-800 bg-zinc-900/60 text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                  maxLength={120}
                />
              )}
              <div className="flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder="Describe your issue…"
                  rows={2}
                  className="custom-scrollbar resize-none border-zinc-800 bg-zinc-900/60 text-sm text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                  maxLength={4000}
                />
                <Button
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                  size="icon"
                  className="size-9 shrink-0 bg-emerald-600 text-white hover:bg-emerald-500"
                  aria-label="Send message"
                >
                  {sending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Send className="size-4" />
                  )}
                </Button>
              </div>
              <div className="text-right text-[9px] text-zinc-600">
                {draft.length} / 4000
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
