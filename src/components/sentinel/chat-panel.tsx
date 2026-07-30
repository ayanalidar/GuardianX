"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { sentinelApi, type ChatMessage } from "@/lib/sentinel/api";
import {
  Bot,
  Loader2,
  SendHorizontal,
  User,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ChatPanelProps {
  patchId: string;
  initialMessages: ChatMessage[];
  onMessagesChange?: (msgs: ChatMessage[]) => void;
}

const SUGGESTIONS = [
  "Why did you choose this fix?",
  "Are there other ways to exploit this?",
  "Could this patch break existing functionality?",
  "How confident are you this is complete?",
];

export function ChatPanel({ patchId, initialMessages, onMessagesChange }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMessages(initialMessages), [initialMessages]);
  useEffect(() => {
    onMessagesChange?.(messages);
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, onMessagesChange]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;
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
        const reply = await sentinelApi.chat(patchId, trimmed);
        setMessages((m) => [
          ...m,
          {
            id: `ai-${Date.now()}`,
            role: "assistant",
            content: reply.content,
            created_at: reply.created_at,
          },
        ]);
      } catch (err) {
        setMessages((m) => [
          ...m,
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: `(error: ${err instanceof Error ? err.message : "unknown"})`,
            created_at: new Date().toISOString(),
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [patchId, sending]
  );

  return (
    <div className="flex flex-col rounded-lg border border-zinc-800 bg-zinc-950/60">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Bot className="size-3.5 text-emerald-400" />
          Ask the AI about this patch
        </div>
        <Badge
          variant="outline"
          className="border-emerald-500/30 bg-emerald-500/5 text-[10px] text-emerald-300"
        >
          <Sparkles className="size-2.5" />
          live
        </Badge>
      </div>

      <div
        ref={scrollRef}
        className="custom-scrollbar max-h-56 min-h-[7rem] flex-1 overflow-y-auto p-3"
      >
        {messages.length === 0 ? (
          <div className="flex h-full min-h-[7rem] flex-col items-center justify-center gap-3 text-center">
            <div className="flex size-9 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <Bot className="size-4 text-emerald-400" />
            </div>
            <p className="max-w-xs text-xs text-zinc-500">
              Discuss this patch with the AI. Ask about the fix, risks, or
              alternative approaches.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}
                >
                  {m.role === "assistant" && (
                    <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
                      <Bot className="size-3.5 text-emerald-400" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      m.role === "user"
                        ? "bg-emerald-600/90 text-white"
                        : "bg-zinc-800/80 text-zinc-200"
                    }`}
                  >
                    {m.content}
                  </div>
                  {m.role === "user" && (
                    <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-700">
                      <User className="size-3.5 text-zinc-200" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {messages.length === 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              disabled={sending}
              className="rounded-full border border-zinc-700 bg-zinc-800/40 px-2.5 py-1 text-[11px] text-zinc-300 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10 hover:text-emerald-300 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-zinc-800 p-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder="Ask about the fix, risks, alternatives…"
          rows={1}
          className="min-h-[2.5rem] resize-none border-zinc-800 bg-zinc-900/60 text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
        />
        <Button
          size="icon"
          onClick={() => void send(input)}
          disabled={sending || !input.trim()}
          className="size-9 shrink-0 bg-emerald-600 text-white hover:bg-emerald-500"
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <SendHorizontal className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
