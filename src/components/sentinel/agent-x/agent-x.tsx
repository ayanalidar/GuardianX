"use client";

/**
 * AgentX
 * ------
 * Always-on conversational AI for the GuardianX Command Center.
 *
 * Voice infrastructure: the War Room's <VoiceControl> component is reused
 * purely as an STT + TTS primitive. We mount it visually-hidden (sr-only)
 * with `continuous` + `speakResponses={false}` so it owns the
 * SpeechRecognition instance and auto-restarts on browser silence
 * timeouts. Its `onCommand` callback hands us every parsed utterance;
 * for unrecognized input we get `{action: "unknown", raw: transcript}`
 * which we forward to `/api/agent-x/chat` for an LLM/heuristic reply.
 *
 * Talkback: we do NOT use VoiceControl's `speak()` for the LLM reply
 * because its default rate is 1.05 / pitch 0.95. Agent X is a "sophisticated
 * + lethal" SOC analyst — we want a slower, lower-pitched, authoritative
 * voice. So we run our own SpeechSynthesisUtterance with rate 0.95 / pitch
 * 0.85 and pick a male-coded voice when available.
 *
 * Continuous listening: once activated (open=true) the mic stays hot
 * until the panel is closed. No per-command mic tap.
 *
 * Proactive monitoring: every 60s while open we re-fetch
 * `/api/agent-x/briefing` and, if pending patches appeared or the
 * posture score dropped, we speak a heads-up aloud + drop an alert
 * message in the conversation.
 *
 * Tab awareness: when `currentTab` changes we fetch
 * `/api/agent-x/context?tab={tab}` and surface 2–3 contextual
 * quick-reply chips.
 *
 * Persistence: the last 20 messages are mirrored to
 * localStorage `agent_x_conversation` so a reload while the panel is
 * open picks up where the user left off.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertCircle,
  Bot,
  Mic,
  MicOff,
  Radio,
  Send,
  Sparkles,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import {
  VoiceControl,
  type VoiceCommand,
  type VoiceControlHandle,
  type VoiceControlState,
} from "../war-room/voice-control";

// ─── Public types ────────────────────────────────────────────────────────────

export interface AgentXUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AgentXProps {
  /** Current active tab — sent to /api/agent-x/context for tab-aware suggestions. */
  currentTab: string;
  /** Current user (for greeting personalization). */
  currentUser: AgentXUser | null;
  /** Called when Agent X returns a navigate action. */
  onNavigate?: (tab: string) => void;
  /** Called when Agent X returns a scan action. */
  onScan?: (codebaseName: string) => void;
  /** Called when Agent X returns an approve-patch action. */
  onApprovePatch?: (patchId: string) => void;
  /** Called when Agent X returns a search action. */
  onSearch?: (query: string) => void;
  /** Called when Agent X returns a war_room action. */
  onOpenWarRoom?: () => void;
  /** Controlled open state (driven by the activation button in the header). */
  open: boolean;
  /** Close handler. */
  onClose: () => void;
}

// ─── Backend contract types ─────────────────────────────────────────────────
// The backend is built by a parallel agent; these mirror the documented
// response shape of `/api/agent-x/*`.

interface AgentXAction {
  type:
    | "navigate"
    | "scan"
    | "approve_patch"
    | "search"
    | "war_room"
    | string;
  target: string;
}

interface AgentXChatResponse {
  reply: string;
  actions?: AgentXAction[];
  suggestions?: string[];
  intent?: string;
  context?: {
    postureScore?: number;
    pendingPatches?: number;
    criticalFindings?: number;
  };
}

interface AgentXBriefing {
  greeting?: string;
  timeOfDay?: string;
  lastLogin?: string;
  postureScore?: number;
  postureGrade?: string;
  pendingTasks?: number;
  criticalCount?: number;
  suggestions?: string[];
  recentActivity?: Array<{ label?: string; ts?: number }>;
  activeScans?: Array<{ name?: string; status?: string }>;
}

interface AgentXTabContext {
  currentTab?: string;
  tabTitle?: string;
  tabDescription?: string;
  suggestions?: string[];
  quickActions?: Array<{ label?: string; action?: string }>;
}

// ─── Conversation message shape ─────────────────────────────────────────────

type MessageKind = "default" | "alert" | "error" | "briefing";

interface AgentMessage {
  role: "user" | "agent";
  content: string;
  ts: number;
  kind?: MessageKind;
}

const STORAGE_KEY = "agent_x_conversation";
const MAX_HISTORY = 20;
const PROACTIVE_POLL_MS = 60_000;

// ─── Voice persona: lower-pitched voice picker ───────────────────────────────
// SpeechSynthesis voice names vary by OS/browser. We prefer a male-coded
// en-US voice (David/Alex/Daniel/Fred/etc.) for an authoritative SOC
// analyst persona. Falls back to any en voice, then any voice at all.

function pickPersonaVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (!voices.length) return null;
  const maleNames = /david|alex|daniel|fred|james|mark|oliver|george|rishi|arjun/i;
  return (
    voices.find((v) => /^en[-_]US/i.test(v.lang) && maleNames.test(v.name)) ||
    voices.find((v) => /^en[-_]GB/i.test(v.lang) && maleNames.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang) && maleNames.test(v.name)) ||
    voices.find((v) => /en[-_]US/i.test(v.lang) && /google|samantha|jenny/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang)) ||
    voices[0] ||
    null
  );
}

// ─── Reconstruct a synthetic transcript from a parsed VoiceCommand ────────────
// VoiceControl's parser strips intent + target apart. To preserve the
// natural-language phrasing for the Agent X LLM, we rebuild a short
// utterance that mirrors the original intent. The LLM can then echo it
// back contextually.

function reconstructTranscript(cmd: VoiceCommand): string | null {
  switch (cmd.action) {
    case "scan":
      return `scan ${cmd.target}`;
    case "navigate":
      return `show ${cmd.target}`;
    case "approve":
      return `approve patch ${cmd.target}`;
    case "search":
      return `search for ${cmd.target}`;
    case "status":
      return "What's my current security posture?";
    case "unknown":
      return cmd.raw;
    case "stop":
      return null; // signal: cancel TTS only, no Agent X round-trip
    default:
      return null;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AgentX({
  currentTab,
  currentUser,
  onNavigate,
  onScan,
  onApprovePatch,
  onSearch,
  onOpenWarRoom,
  open,
  onClose,
}: AgentXProps) {
  const voiceRef = useRef<VoiceControlHandle>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // ── Voice state mirror (driven by VoiceControl's onStateChange) ─────────
  const [voiceState, setVoiceState] = useState<VoiceControlState>({
    listening: false,
    speaking: false,
    interim: "",
    supported: true,
  });

  // ── Local TTS speaking flag — driven by our own speakReply() so the
  //    "Agent X is speaking" indicator tracks our slower-rate utterances
  //    even though VoiceControl's own speaking flag stays false.
  const [speakingLocal, setSpeakingLocal] = useState(false);

  // ── Conversation + UI state ─────────────────────────────────────────────
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState("");
  const [briefing, setBriefing] = useState<AgentXBriefing | null>(null);
  const [tabContext, setTabContext] = useState<AgentXTabContext | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [resumedSession, setResumedSession] = useState(false);

  // ── Proactive-monitoring baseline (last seen counts) ────────────────────
  const lastPatchCountRef = useRef<number | null>(null);
  const lastPostureScoreRef = useRef<number | null>(null);

  // ── Refs mirroring state for use inside stable callbacks ────────────────
  // The VoiceControl onCommand callback is created once; we need the
  // latest `thinking` + `currentTab` + `messages` without re-subscribing
  // VoiceControl's effect on every render.
  const currentTabRef = useRef(currentTab);
  const messagesRef = useRef<AgentMessage[]>(messages);
  const thinkingRef = useRef(thinking);
  const openRef = useRef(open);

  useEffect(() => {
    currentTabRef.current = currentTab;
  }, [currentTab]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  useEffect(() => {
    thinkingRef.current = thinking;
  }, [thinking]);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Warm TTS voices (some browsers load them async) ────────────────────
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const loadVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  // ── Restore prior conversation from localStorage on first open ──────────
  // We do this ONCE per mount (not on every open) so a reload while
  // already-open picks up where the user left off, but re-opening after
  // a close keeps the existing in-memory messages.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!open || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AgentMessage[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setMessages(parsed.slice(-MAX_HISTORY));
        setResumedSession(true);
      }
    } catch {
      /* quota / privacy mode — ignore */
    }
  }, [open]);

  // ── Persist conversation to localStorage ────────────────────────────────
  useEffect(() => {
    if (messages.length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)));
    } catch {
      /* quota / privacy mode — ignore */
    }
  }, [messages]);

  // ── Auto-scroll to bottom on new messages ───────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  // ── Voice persona talkback ──────────────────────────────────────────────
  // rate 0.95 (slower for clarity) + pitch 0.85 (lower, authoritative).
  // Picks a male-coded en voice when available so Agent X sounds like a
  // seasoned SOC analyst rather than a default assistant chirp.
  const speakReply = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const synth = window.speechSynthesis;
    synth.cancel(); // interrupt any in-flight utterance
    const voices = voicesRef.current.length ? voicesRef.current : synth.getVoices();
    const preferred = pickPersonaVoice(voices);
    const u = new SpeechSynthesisUtterance(trimmed);
    if (preferred) u.voice = preferred;
    u.rate = 0.95;
    u.pitch = 0.85;
    u.volume = 1;
    u.onstart = () => setSpeakingLocal(true);
    u.onend = () => setSpeakingLocal(false);
    u.onerror = () => setSpeakingLocal(false);
    synth.speak(u);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setSpeakingLocal(false);
  }, []);

  // ── Execute Agent X actions returned from the chat endpoint ─────────────
  const executeActions = useCallback(
    (actions: AgentXAction[] | undefined) => {
      if (!actions || actions.length === 0) return;
      for (const action of actions) {
        switch (action.type) {
          case "navigate":
            onNavigate?.(action.target);
            break;
          case "scan":
            onScan?.(action.target);
            break;
          case "approve_patch":
            onApprovePatch?.(action.target);
            break;
          case "search":
            onSearch?.(action.target);
            break;
          case "war_room":
            onOpenWarRoom?.();
            break;
          default:
            // Unknown action types are silently ignored — the backend may
            // emit intents the frontend hasn't wired up yet.
            break;
        }
      }
    },
    [onApprovePatch, onNavigate, onOpenWarRoom, onScan, onSearch],
  );

  // ── Send a message to /api/agent-x/chat ─────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || thinkingRef.current) return;

      setInput("");
      setThinking(true);
      setMessages((prev) => [
        ...prev,
        { role: "user", content: trimmed, ts: Date.now() },
      ]);

      try {
        const res = await fetch("/api/agent-x/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            context: {
              currentTab: currentTabRef.current,
              history: messagesRef.current
                .slice(-10)
                .map((m) => ({ role: m.role, content: m.content })),
            },
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AgentXChatResponse;

        const reply = data.reply?.trim() || "I didn't catch that. Try again.";
        setMessages((prev) => [
          ...prev,
          { role: "agent", content: reply, ts: Date.now() },
        ]);
        speakReply(reply);
        executeActions(data.actions);
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSuggestions(data.suggestions.slice(0, 4));
        }
      } catch {
        const errMsg =
          "I'm having trouble reaching the security core. Try again in a moment.";
        setMessages((prev) => [
          ...prev,
          { role: "agent", content: errMsg, ts: Date.now(), kind: "error" },
        ]);
        speakReply(errMsg);
      } finally {
        setThinking(false);
      }
    },
    [executeActions, speakReply],
  );

  // ── VoiceControl onCommand — receives parsed VoiceCommands ──────────────
  // For `unknown` actions we forward `raw` to Agent X. For built-in
  // commands we reconstruct a synthetic transcript so the LLM stays in
  // the loop and can produce a contextual reply. `stop` cancels TTS only.
  const handleVoiceCommand = useCallback(
    (cmd: VoiceCommand) => {
      if (cmd.action === "stop") {
        stopSpeaking();
        return;
      }
      const transcript = reconstructTranscript(cmd);
      if (transcript) void sendMessage(transcript);
    },
    [sendMessage, stopSpeaking],
  );

  const handleStateChange = useCallback((next: VoiceControlState) => {
    setVoiceState(next);
  }, []);

  // ── On open: fetch briefing, speak greeting, auto-start listening ───────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/agent-x/briefing");
        if (!res.ok) return;
        const data = (await res.json()) as AgentXBriefing;
        if (cancelled) return;
        setBriefing(data);
        lastPatchCountRef.current = data.pendingTasks ?? null;
        lastPostureScoreRef.current = data.postureScore ?? null;

        const greeting =
          data.greeting ||
          (currentUser?.name
            ? `Good to see you, ${currentUser.name}. Agent X online.`
            : "Agent X online. Ready when you are.");

        setMessages((prev) => [
          ...prev,
          { role: "agent", content: greeting, ts: Date.now(), kind: "briefing" },
        ]);
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSuggestions(data.suggestions.slice(0, 4));
        }
        speakReply(greeting);

        // Auto-start continuous listening once the greeting begins to
        // play — give the TTS a beat to start so it doesn't capture its
        // own voice through the mic.
        const v = voiceRef.current;
        if (v?.isSupported()) {
          window.setTimeout(() => {
            if (cancelled) return;
            try {
              v.startListening();
            } catch {
              /* InvalidStateError if start() raced — ignored */
            }
          }, 600);
        }
      } catch {
        /* network/silent failure — panel still usable via text input */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, currentUser, speakReply]);

  // ── Tab-aware context: re-fetch suggestions when currentTab changes ─────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/agent-x/context?tab=${encodeURIComponent(currentTab)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as AgentXTabContext;
        if (cancelled || !data) return;
        setTabContext(data);
        if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
          setSuggestions(data.suggestions.slice(0, 4));
        }
      } catch {
        /* ignore — fall back to existing suggestions */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, currentTab]);

  // ── Proactive monitoring: poll briefing every 60s, speak alerts ─────────
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(async () => {
      if (!openRef.current) return;
      try {
        const res = await fetch("/api/agent-x/briefing");
        if (!res.ok) return;
        const data = (await res.json()) as AgentXBriefing;
        const newPatches = data.pendingTasks ?? 0;
        const newScore = data.postureScore ?? 0;

        if (
          lastPatchCountRef.current !== null &&
          newPatches > lastPatchCountRef.current
        ) {
          const msg =
            "Heads up — a new critical patch was just generated. Want me to show you?";
          setMessages((prev) => [
            ...prev,
            { role: "agent", content: msg, ts: Date.now(), kind: "alert" },
          ]);
          speakReply(msg);
        }
        if (
          lastPostureScoreRef.current !== null &&
          newScore < lastPostureScoreRef.current
        ) {
          const msg = `Your security posture dropped to ${newScore}. Want me to investigate?`;
          setMessages((prev) => [
            ...prev,
            { role: "agent", content: msg, ts: Date.now(), kind: "alert" },
          ]);
          speakReply(msg);
        }
        lastPatchCountRef.current = newPatches;
        lastPostureScoreRef.current = newScore;
      } catch {
        /* swallow — proactive polling must never crash the panel */
      }
    }, PROACTIVE_POLL_MS);
    return () => window.clearInterval(id);
  }, [open, speakReply]);

  // ── Stop TTS + listening when the panel closes ──────────────────────────
  useEffect(() => {
    if (open) return;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeakingLocal(false);
    try {
      voiceRef.current?.stopListening();
    } catch {
      /* noop */
    }
  }, [open]);

  // ── ESC closes the panel (VoiceControl's own ESC handler stops listening
  //    when active; we only close if it isn't, so users can ESC-out of a
  //    stray listen session without dismissing Agent X entirely).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (voiceState.listening) return; // let VoiceControl handle it
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, voiceState.listening]);

  // ── Cleanup TTS on unmount ──────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // ── Derived display state ───────────────────────────────────────────────
  const listening = voiceState.listening;
  const speaking = speakingLocal || voiceState.speaking;
  const supported = voiceState.supported;
  const interim = voiceState.interim;

  const micToggle = useCallback(() => {
    const v = voiceRef.current;
    if (!v || !v.isSupported()) return;
    if (voiceState.listening) v.stopListening();
    else v.startListening();
  }, [voiceState.listening]);

  // ── Visible suggestion chips (merge tab context + chat suggestions) ─────
  const visibleSuggestions = useMemo(() => {
    const merged = Array.from(
      new Set([
        ...suggestions,
        ...(tabContext?.suggestions ?? []),
      ]),
    );
    return merged.slice(0, 4);
  }, [suggestions, tabContext]);

  // ── Waveform bars (animated when listening) ─────────────────────────────
  const bars = useMemo(() => Array.from({ length: 18 }, (_, i) => i), []);

  return (
    <>
      {/* VoiceControl — owns the SpeechRecognition instance + auto-restart
          in continuous mode. Visually hidden inside an sr-only wrapper so
          only the floating top-center status chip escapes (which is fine —
          it's pointer-events-none and shows the live transcript). */}
      <div className="sr-only" aria-hidden="true">
        <VoiceControl
          ref={voiceRef}
          continuous
          speakResponses={false}
          compact
          onCommand={handleVoiceCommand}
          onStateChange={handleStateChange}
        />
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="agent-x-panel"
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            role="dialog"
            aria-label="Agent X conversational panel"
            aria-live="polite"
            className="hud-corners fixed bottom-20 right-4 z-[90] flex max-h-[calc(100vh-7rem)] w-[min(28rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-emerald-500/30 bg-zinc-950/90 shadow-2xl backdrop-blur-xl sm:bottom-24 sm:right-6"
          >
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between border-b border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-transparent px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="relative flex size-7 items-center justify-center rounded-md border border-emerald-500/40 bg-emerald-500/10">
                  <Bot className="size-4 text-emerald-300" />
                  <span className="pulse-dot absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-500" />
                </div>
                <div className="flex flex-col leading-none">
                  <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] neon-emerald text-emerald-300">
                    Agent X
                  </span>
                  <span className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-zinc-500">
                    Autonomous SOC
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {open && (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 bg-emerald-500/10 font-mono text-[8px] uppercase tracking-wider text-emerald-300"
                  >
                    <span className="size-1 animate-pulse rounded-full bg-emerald-400" />
                    ACTIVE
                  </Badge>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close Agent X"
                  className="flex size-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-400 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>

            {/* ── Briefing strip (posture score + pending tasks) ────────────── */}
            {briefing && (
              <div className="grid grid-cols-3 gap-1.5 border-b border-emerald-500/10 bg-zinc-950/60 px-3 py-2">
                <BriefingStat
                  label="POSTURE"
                  value={
                    briefing.postureScore != null
                      ? `${briefing.postureScore}`
                      : "—"
                  }
                  sub={briefing.postureGrade ?? ""}
                  tone="emerald"
                />
                <BriefingStat
                  label="PATCHES"
                  value={
                    briefing.pendingTasks != null
                      ? `${briefing.pendingTasks}`
                      : "—"
                  }
                  sub="pending"
                  tone={
                    (briefing.pendingTasks ?? 0) > 0 ? "amber" : "emerald"
                  }
                />
                <BriefingStat
                  label="CRITICAL"
                  value={
                    briefing.criticalCount != null
                      ? `${briefing.criticalCount}`
                      : "—"
                  }
                  sub="findings"
                  tone={
                    (briefing.criticalCount ?? 0) > 0 ? "rose" : "emerald"
                  }
                />
              </div>
            )}
            {!briefing && open && (
              <div className="grid grid-cols-3 gap-1.5 border-b border-emerald-500/10 bg-zinc-950/60 px-3 py-2">
                <Skeleton className="h-10 rounded-md bg-zinc-900/60" />
                <Skeleton className="h-10 rounded-md bg-zinc-900/60" />
                <Skeleton className="h-10 rounded-md bg-zinc-900/60" />
              </div>
            )}

            {/* ── Conversation body ───────────────────────────────────────── */}
            <div
              ref={scrollRef}
              className="custom-scrollbar flex-1 space-y-2.5 overflow-y-auto p-3"
              style={{ maxHeight: "20rem", minHeight: "8rem" }}
            >
              {resumedSession && messages.length > 1 && (
                <div className="flex justify-center">
                  <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                    Picking up where we left off…
                  </span>
                </div>
              )}

              <AnimatePresence mode="popLayout">
                {messages.map((m, i) => (
                  <motion.div
                    key={`${m.ts}-${i}`}
                    layout
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.18 }}
                    className={`flex ${
                      m.role === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`group max-w-[88%] rounded-lg px-3 py-2 ${
                        m.role === "user"
                          ? "border border-emerald-500/30 bg-emerald-600/15 text-emerald-100"
                          : m.kind === "error"
                            ? "border border-rose-500/40 bg-rose-500/5 text-rose-200"
                            : m.kind === "alert"
                              ? "border border-amber-500/40 bg-amber-500/5 text-amber-100"
                              : "border border-emerald-500/20 bg-zinc-900/70 text-zinc-200"
                      }`}
                    >
                      {m.role === "agent" && (
                        <div className="mb-1 flex items-center gap-1">
                          {m.kind === "error" ? (
                            <AlertCircle className="size-3 text-rose-400" />
                          ) : m.kind === "alert" ? (
                            <AlertCircle className="size-3 text-amber-400" />
                          ) : m.kind === "briefing" ? (
                            <Sparkles className="size-3 text-emerald-400" />
                          ) : (
                            <Bot className="size-3 text-emerald-400" />
                          )}
                          <span
                            className={`font-mono text-[8px] uppercase tracking-wider ${
                              m.kind === "error"
                                ? "text-rose-400/70"
                                : m.kind === "alert"
                                  ? "text-amber-400/70"
                                  : "text-emerald-400/60"
                            }`}
                          >
                            {m.kind === "error"
                              ? "ERR"
                              : m.kind === "alert"
                                ? "ALERT"
                                : m.kind === "briefing"
                                  ? "BRIEF"
                                  : "AGENT X"}
                          </span>
                        </div>
                      )}
                      <p className="whitespace-pre-wrap text-xs leading-relaxed">
                        {m.content}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* ── Thinking indicator ────────────────────────────────────── */}
              <AnimatePresence>
                {thinking && (
                  <motion.div
                    key="thinking"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex justify-start"
                  >
                    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-zinc-900/70 px-3 py-2">
                      <Bot className="size-3 text-emerald-400" />
                      <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-400/60">
                        Agent X is thinking
                      </span>
                      <span className="flex items-center gap-0.5">
                        {[0, 1, 2].map((i) => (
                          <motion.span
                            key={i}
                            className="size-1 rounded-full bg-emerald-400"
                            animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                            transition={{
                              duration: 0.7,
                              repeat: Infinity,
                              delay: i * 0.15,
                              ease: "easeInOut",
                            }}
                          />
                        ))}
                      </span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── Live interim transcript (while listening) ─────────────── */}
              <AnimatePresence>
                {listening && interim && (
                  <motion.div
                    key="interim"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex justify-end"
                  >
                    <div className="max-w-[88%] rounded-lg border border-cyan-500/30 bg-cyan-500/5 px-3 py-2 italic text-cyan-200/80">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-cyan-400/60">
                        HEARING
                      </span>
                      <p className="mt-0.5 text-xs">{interim}&hellip;</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {messages.length === 0 && !thinking && (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-center">
                  <Bot className="size-6 text-emerald-500/40" />
                  <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                    {supported
                      ? "Initializing Agent X…"
                      : "Voice unsupported — type below"}
                  </p>
                </div>
              )}
            </div>

            {/* ── Quick-reply suggestion chips ────────────────────────────── */}
            {visibleSuggestions.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto border-t border-emerald-500/10 px-3 py-2 custom-scrollbar">
                {visibleSuggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void sendMessage(s)}
                    disabled={thinking}
                    className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 font-mono text-[10px] text-emerald-300 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {s.length > 40 ? `${s.slice(0, 38)}…` : s}
                  </button>
                ))}
              </div>
            )}

            {/* ── Status strip (listening waveform / speaking indicator) ──── */}
            <div className="border-t border-emerald-500/10 bg-zinc-950/60 px-3 py-1.5">
              {speaking ? (
                <div className="flex items-center gap-2">
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Radio className="size-3 text-amber-300" />
                  </motion.span>
                  <span className="font-mono text-[9px] uppercase tracking-wider text-amber-300/80">
                    Agent X is speaking…
                  </span>
                  <button
                    type="button"
                    onClick={stopSpeaking}
                    className="ml-auto font-mono text-[9px] uppercase tracking-wider text-zinc-500 underline-offset-2 hover:text-amber-200 hover:underline"
                  >
                    mute
                  </button>
                </div>
              ) : listening ? (
                <div className="flex items-center gap-2">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
                  <span className="font-mono text-[9px] uppercase tracking-wider text-emerald-300/80">
                    Listening
                  </span>
                  <div className="flex h-3 flex-1 items-center gap-0.5 overflow-hidden">
                    {bars.map((i) => (
                      <motion.div
                        key={i}
                        className="flex-1 rounded-sm bg-emerald-400"
                        animate={{
                          height: [
                            2,
                            4 + Math.abs(Math.sin(i * 0.7)) * 8,
                            2,
                          ],
                          opacity: [0.3, 0.9, 0.3],
                        }}
                        transition={{
                          duration: 0.6 + (i % 5) * 0.08,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: i * 0.02,
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Activity className="size-3 text-zinc-500" />
                  <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                    {supported
                      ? "Standing by — speak or type"
                      : "Voice unsupported — type below"}
                  </span>
                </div>
              )}
            </div>

            {/* ── Footer: text input + mic + send ─────────────────────────── */}
            <div className="flex items-center gap-1.5 border-t border-emerald-500/20 bg-zinc-950/80 p-2">
              <button
                type="button"
                onClick={micToggle}
                disabled={!supported}
                aria-label={
                  !supported
                    ? "Voice unsupported"
                    : listening
                      ? "Stop listening"
                      : "Start listening"
                }
                title={
                  !supported
                    ? "Web Speech API unavailable. Try Chrome."
                    : listening
                      ? "Stop listening"
                      : "Start listening"
                }
                className={`relative flex size-9 shrink-0 items-center justify-center rounded-md border transition-all ${
                  listening
                    ? "border-red-500/60 bg-red-500/20"
                    : supported
                      ? "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20"
                      : "cursor-not-allowed border-zinc-800 bg-zinc-900 opacity-50"
                }`}
              >
                {listening ? (
                  <MicOff className="size-4 text-red-300" />
                ) : (
                  <Mic className="size-4 text-emerald-300" />
                )}
                {listening && (
                  <motion.span
                    initial={{ scale: 1, opacity: 0.6 }}
                    animate={{ scale: 1.4, opacity: 0 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "easeOut" }}
                    className="absolute inset-0 rounded-md border border-red-500/40"
                  />
                )}
              </button>

              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage(input);
                  }
                }}
                placeholder="Ask Agent X anything…"
                disabled={thinking}
                aria-label="Message Agent X"
                className="border-emerald-500/20 bg-zinc-900/60 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
              />

              <Button
                type="button"
                size="icon"
                onClick={() => void sendMessage(input)}
                disabled={thinking || !input.trim()}
                aria-label="Send message"
                className="size-9 shrink-0 border border-emerald-500/40 bg-emerald-600/80 text-white hover:bg-emerald-500"
              >
                <Send className="size-4" />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Briefing stat cell ──────────────────────────────────────────────────────

interface BriefingStatProps {
  label: string;
  value: string;
  sub: string;
  tone: "emerald" | "amber" | "rose";
}

function BriefingStat({ label, value, sub, tone }: BriefingStatProps) {
  const toneClasses =
    tone === "emerald"
      ? "border-emerald-500/30 text-emerald-300"
      : tone === "amber"
        ? "border-amber-500/40 text-amber-300"
        : "border-rose-500/40 text-rose-300";
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-md border bg-zinc-900/40 px-1.5 py-1.5 ${toneClasses}`}
    >
      <span className="font-mono text-[8px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <span className="font-mono text-base font-bold leading-none">{value}</span>
      <span className="mt-0.5 font-mono text-[8px] uppercase tracking-wider opacity-70">
        {sub}
      </span>
    </div>
  );
}

export default AgentX;
