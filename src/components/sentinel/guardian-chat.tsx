"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, Loader2, Sparkles, X } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface GuardianChatProps {
  open: boolean;
  onClose: () => void;
}

const SUGGESTIONS = [
  "What should I prioritize today?",
  "Which client has the most critical findings?",
  "Summarize the current threat landscape",
  "Show me clients with pending patches",
];

export function GuardianChat({ open, onClose }: GuardianChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi! I'm Guardian, your AI security assistant. Ask me anything about your clients, patches, findings, or what to prioritize." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/guardian-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "I'm having trouble connecting right now. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-emerald-500/30 bg-zinc-950/95 backdrop-blur-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-emerald-500/20 p-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div className="flex size-9 items-center justify-center rounded-lg border border-violet-500/40 bg-violet-500/10 neon-border-violet">
              <Bot className="size-5 text-violet-400" />
            </div>
            <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-500 pulse-dot" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-50">
              <span className="neon-violet">Guardian</span> AI
            </h3>
            <p className="font-mono text-[9px] uppercase tracking-wider text-violet-400/60">SECURITY ASSISTANT</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="size-8 text-zinc-500 hover:text-zinc-200">
          <X className="size-4" />
        </Button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
        <AnimatePresence mode="popLayout">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg p-3 text-sm ${
                  msg.role === "user"
                    ? "bg-emerald-600/20 text-emerald-100 border border-emerald-500/30"
                    : "bg-zinc-900/80 text-zinc-200 border border-violet-500/20"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="mb-1 flex items-center gap-1">
                    <Sparkles className="size-3 text-violet-400" />
                    <span className="text-[9px] font-mono uppercase tracking-wider text-violet-400/60">Guardian</span>
                  </div>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg border border-violet-500/20 bg-zinc-900/80 p-3">
              <div className="flex items-center gap-2">
                <Loader2 className="size-3 animate-spin text-violet-400" />
                <span className="font-mono text-[10px] text-violet-400/60">Analyzing platform data…</span>
              </div>
            </div>
          </div>
        )}

        {/* Suggestions (only show when few messages) */}
        {messages.length <= 2 && !loading && (
          <div className="space-y-1.5 pt-2">
            <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Try asking:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-left text-xs text-zinc-400 transition-all hover:border-violet-500/30 hover:bg-violet-500/5 hover:text-violet-300"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-emerald-500/20 p-3">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send(input)}
            placeholder="Ask Guardian anything…"
            disabled={loading}
            className="border-violet-500/30 bg-zinc-900/60 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:border-violet-500/50"
          />
          <Button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            size="icon"
            className="bg-violet-600 text-white hover:bg-violet-500 neon-border-violet"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
