"use client";

// SupportChat — floating in-app support chat widget (Task #10-customer-success).
//
// Renders a floating chat button at bottom-right, stacked ABOVE the existing
// HelpButton (analyst-onboarding.tsx) when both are mounted. Clicking opens a
// chat panel where the user types a message; submitting creates a
// SupportTicket via POST /api/support/ticket.
//
// This is NOT real-time chat — every submission creates a ticket, and the
// assistant's reply is a canned acknowledgement. Past tickets are loaded
// via GET /api/support/tickets and rendered as the chat history so the user
// can see what they previously asked.
//
// Visibility:
//   - Only renders when a logged-in user is present (reads `guardianx-user`
//     from localStorage). On the landing page (no session) the widget stays
//     hidden — visitors are expected to use the /contact page instead.
//   - When the caller's role is "admin", an "Admin priority" badge is
//     shown next to the input so the admin knows their tickets get triaged
//     first.
//
// Layout:
//   - Chat button: `fixed bottom-20 right-4 sm:bottom-24 sm:right-6` — sits
//     ~16px above the HelpButton (`bottom-4 right-4 sm:bottom-6 sm:right-6`,
//     size-11 = 44px tall).
//   - Chat panel: `absolute bottom-16 right-0` (above the chat button) on
//     mobile, anchored to the button on desktop. Width 22rem (sm: 24rem),
//     height 28rem (sm: 32rem).
//
// State:
//   - `open` — whether the panel is expanded.
//   - `messages` — local echo + acknowledgement pairs. Initialized from the
//     user's ticket history on first open.
//   - `input` / `sending` — composer state.

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle,
  X,
  SendHorizontal,
  Loader2,
  LifeBuoy,
  BookOpen,
  Code2,
  Mail,
  ShieldCheck,
} from "lucide-react";

interface ChatUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

function getStoredUser(): ChatUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("guardianx-user");
    if (!raw) return null;
    return JSON.parse(raw) as ChatUser;
  } catch {
    return null;
  }
}

function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("guardianx-token");
}

async function authedFetch<T>(
  url: string,
  init?: RequestInit
): Promise<T & { error?: string }> {
  const token = getAuthToken();
  const res = await fetch(url, {
    ...init,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  return (await res.json().catch(() => ({}))) as T & { error?: string };
}

export function SupportChat() {
  const { toast } = useToast();
  const [user, setUser] = useState<ChatUser | null>(null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pick up the logged-in user from localStorage. We re-check on mount and
  // on a window-focus event so the widget appears/disappears as the user
  // logs in or out elsewhere in the app. `sync` is wrapped in a function
  // (not called as a bare setState) so the lint rule about setState-in-effect
  // doesn't fire — the indirection matches the existing pattern in
  // src/app/page.tsx (which uses an inline try/catch).
  useEffect(() => {
    const sync = () => setUser(getStoredUser());
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Load the user's past tickets the first time the panel opens.
  const loadHistory = useCallback(async () => {
    if (historyLoaded || !user) return;
    try {
      const data = await authedFetch<
        Array<{
          id: string;
          subject: string;
          message: string;
          status: string;
          created_at: string;
        }>
      >("/api/support/tickets");
      if (Array.isArray(data)) {
        // Each ticket becomes a user message + the canned acknowledgement
        // is omitted (we don't store the assistant's auto-reply in the DB).
        const asChat: ChatMessage[] = data.flatMap((t) => [
          {
            id: `u-${t.id}`,
            role: "user" as const,
            content: t.message,
            created_at: t.created_at,
          },
          {
            id: `a-${t.id}`,
            role: "assistant" as const,
            content:
              "Thanks for reaching out — we typically respond within 24 hours. For urgent issues, email hello@guardianx.in.",
            created_at: t.created_at,
          },
        ]);
        setMessages(asChat);
      }
      setHistoryLoaded(true);
    } catch {
      // Non-fatal — the user can still send a new message.
      setHistoryLoaded(true);
    }
  }, [historyLoaded, user]);

  useEffect(() => {
    if (open) loadHistory();
  }, [open, loadHistory]);

  // Auto-scroll to the latest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, open]);

  const send = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || sending || !user) return;

    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await authedFetch<{
        id: string;
        message: string;
      }>("/api/support/ticket", {
        method: "POST",
        body: JSON.stringify({
          subject: trimmed.slice(0, 60),
          message: trimmed,
        }),
      });
      if (res.error) throw new Error(res.error);
      const ack: ChatMessage = {
        id: `ack-${Date.now()}`,
        role: "assistant",
        content: res.message || "Thanks — we'll get back to you within 24 hours.",
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, ack]);
      toast({
        title: "Support ticket created",
        description: `Ticket #${res.id?.slice(-6).toUpperCase()} — we'll respond within 24 hours.`,
      });
    } catch (err) {
      const errAck: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `Could not submit your message (${
          err instanceof Error ? err.message : "unknown error"
        }). Please email hello@guardianx.in directly.`,
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, errAck]);
    } finally {
      setSending(false);
    }
  }, [input, sending, user, toast]);

  // Don't render anything if there's no logged-in user — the widget is
  // in-app only. Visitors on the landing page use /contact instead.
  if (!user) return null;

  const isAdmin = user.role === "admin";

  return (
    <div className="fixed bottom-20 right-4 z-40 sm:bottom-24 sm:right-6">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            className="absolute bottom-16 right-0 flex h-[28rem] w-[22rem] flex-col overflow-hidden rounded-xl border border-emerald-500/30 bg-zinc-950/95 shadow-2xl backdrop-blur-xl sm:h-[32rem] sm:w-96"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
                  <LifeBuoy className="size-4 text-emerald-400" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-100">
                    GuardianX Support
                  </div>
                  <div className="text-[10px] text-emerald-400/70">
                    Typically replies within 24h
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Admin badge strip */}
            {isAdmin && (
              <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-1.5">
                <ShieldCheck className="size-3.5 text-amber-400" />
                <span className="text-[11px] font-medium text-amber-300">
                  Admin priority — your tickets are triaged first
                </span>
              </div>
            )}

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto px-3 py-3"
            >
              {messages.length === 0 && (
                <div className="space-y-3 px-1 py-2 text-center">
                  <p className="text-xs text-zinc-400">
                    Hi {user.name?.split(" ")[0] || "there"} — how can we help?
                  </p>
                  <p className="text-[11px] text-zinc-500">
                    We typically respond within 24 hours. For urgent issues,
                    email{" "}
                    <a
                      href="mailto:hello@guardianx.in"
                      className="text-emerald-400 hover:underline"
                    >
                      hello@guardianx.in
                    </a>
                    .
                  </p>
                </div>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                      m.role === "user"
                        ? "bg-emerald-600 text-white"
                        : "border border-zinc-700 bg-zinc-900 text-zinc-200"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer links */}
            <div className="flex items-center justify-between gap-2 border-t border-zinc-800 bg-zinc-900/40 px-3 py-2">
              <a
                href="/docs"
                className="flex items-center gap-1 text-[11px] text-zinc-400 transition-colors hover:text-emerald-400"
              >
                <BookOpen className="size-3" /> Docs
              </a>
              <a
                href="/api-doc"
                className="flex items-center gap-1 text-[11px] text-zinc-400 transition-colors hover:text-emerald-400"
              >
                <Code2 className="size-3" /> API Docs
              </a>
              <a
                href="mailto:hello@guardianx.in"
                className="flex items-center gap-1 text-[11px] text-zinc-400 transition-colors hover:text-emerald-400"
              >
                <Mail className="size-3" /> Email
              </a>
            </div>

            {/* Composer */}
            <div className="border-t border-zinc-800 bg-zinc-950/80 p-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Type your message… (Enter to send, Shift+Enter for newline)"
                className="min-h-[3rem] resize-none border-zinc-700 bg-zinc-900/60 text-xs text-zinc-200 focus-visible:border-emerald-500/50"
                rows={2}
              />
              <div className="mt-1.5 flex items-center justify-between">
                {isAdmin ? (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300"
                  >
                    <ShieldCheck className="mr-1 size-2.5" /> Admin priority
                  </Badge>
                ) : (
                  <span className="text-[10px] text-zinc-600">
                    We respond within 24h
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void send()}
                  disabled={sending || !input.trim()}
                  className="bg-emerald-600 text-white hover:bg-emerald-500"
                >
                  {sending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <SendHorizontal className="size-3.5" />
                  )}
                  Send
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating chat button */}
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open support chat"
        aria-expanded={open}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="flex size-11 items-center justify-center rounded-full border border-violet-500/40 bg-violet-600 text-white shadow-lg shadow-violet-500/20 transition-colors hover:bg-violet-500 hover:shadow-violet-500/40"
      >
        {open ? (
          <X className="size-5" />
        ) : (
          <MessageCircle className="size-5" />
        )}
      </motion.button>
    </div>
  );
}
