"use client";

/**
 * AgentX — Sidebar Tab Edition
 * ----------------------------
 * Always-on conversational AI for the GuardianX Command Center.
 *
 * Previously a floating drawer at `fixed bottom-20 right-4 z-[90]`, Agent X
 * is now a full-tab view that fills the main content area (just like
 * Overview / All Clients / Patches / etc.). The parent mounts it inside
 * the main panel whenever `tab === "agent-x"` and controls visibility
 * via the `open` prop. When `open={false}` the component renders nothing.
 *
 * Voice architecture (rebuilt — no longer uses <VoiceControl>):
 *
 *   - We own a `SpeechRecognition` instance directly so we can hook the
 *     `onsoundstart` / `onsoundend` events for voice-activity detection.
 *   - `speakingRef` gates the recognition `onend` auto-restart: when
 *     Agent X is speaking, a browser-side silence timeout that fires
 *     `onend` is suppressed (no auto-restart). The mic is *still live*
 *     to the extent the browser allows it — so if the user starts
 *     speaking mid-TTS, `onsoundstart` fires and we cancel TTS
 *     immediately (interruptible).
 *   - When TTS finishes (`utterance.onend`), we flip `speakingRef` off
 *     and restart recognition if it had stopped.
 *
 * Streaming TTS:
 *
 *   - Replies are split into sentences. The first sentence is spoken
 *     immediately as a "fast first response"; subsequent sentences are
 *     queued (`onend` of utterance N triggers start of N+1). Display
 *     is also progressive: the message bubble starts with the first
 *     sentence and grows as subsequent chunks arrive.
 *
 * Layout (when open):
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ Header: AGENT X · provider badge · mic toggle · clear · export    │
 *   ├──────────────────────────────────────┬──────────────────────────┤
 *   │                                       │  Briefing panel (30%)    │
 *   │  Conversation (70%, scrollable)       │  - Posture score         │
 *   │                                       │  - Pending patches       │
 *   │  [user msg]                           │  - Critical findings     │
 *   │  [agent msg with thinking dots]       │  - Recent activity       │
 *   │                                       │                          │
 *   ├───────────────────────────────────────┤                          │
 *   │ Text input + Send                     │                          │
 *   │ [Brief me][Show patches][Explain…][Next]                         │
 *   │ ▁▂▄█▆▃▁▂▄ waveform (when listening)                              │
 *   └───────────────────────────────────────┴──────────────────────────┘
 *
 * Greeting behavior:
 *
 *   - On the first `open={true}` transition, fetch /api/agent-x/briefing
 *     ONCE. Build a short greeting ("Good morning, Ayan. Your security
 *     posture is excellent — score 100/100 (grade A). What are you up
 *     to today?"). Speak it. Only start listening after the utterance
 *     finishes (utterance.onend) — no 600ms timer.
 *
 * Proactive monitoring:
 *
 *   - Poll /api/agent-x/briefing every 5 minutes. Compare pending-patch
 *     IDs (not counts). If a NEW patch ID appears, drop an alert message
 *     + speak a heads-up. Never auto-explain per-tab.
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
  Download,
  Mic,
  MicOff,
  Radio,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ─── Public types (unchanged — back-compat with page.tsx) ───────────────────

export interface AgentXUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AgentXProps {
  /** Current active tab — sent to /api/agent-x/chat as context (NOT
   *  used to auto-fetch per-tab suggestions anymore). */
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
  /** Controlled open state (driven by the parent's tab system). */
  open: boolean;
  /** Close handler (back-compat — when the tab closes). */
  onClose: () => void;
}

// ─── Backend contract types ─────────────────────────────────────────────────

interface AgentXAction {
  type:
    | "navigate"
    | "scan"
    | "approve"
    | "approve_patch"
    | "search"
    | "war_room"
    | "status"
    | string;
  target?: string;
  query?: string;
}

interface AgentXChatResponse {
  reply: string;
  actions?: AgentXAction[];
  suggestions?: string[];
  intent?: string;
}

interface BriefingPendingTask {
  type?: "patch" | "finding" | "scan";
  id: string;
  title: string;
  severity: string;
  age: string;
}

interface AgentXBriefing {
  greeting?: string;
  timeOfDay?: string;
  lastLogin?: string | null;
  postureScore?: number;
  postureGrade?: string;
  pendingTasks?: BriefingPendingTask[];
  criticalCount?: number;
  suggestions?: string[];
  recentActivity?: string[];
  activeScans?: number;
}

// ─── Conversation message shape ─────────────────────────────────────────────

type MessageKind = "default" | "alert" | "error" | "briefing";

interface AgentMessage {
  role: "user" | "agent";
  content: string;
  ts: number;
  kind?: MessageKind;
  /** ID used for AnimatePresence + staggered entrance. */
  id: string;
}

const STORAGE_KEY = "agent_x_conversation";
const MAX_HISTORY = 20;
const PROACTIVE_POLL_MS = 5 * 60 * 1000; // 5 minutes (was 60s)

// ─── Web Speech API ambient types ───────────────────────────────────────────
// SpeechRecognition isn't in the TS DOM lib. Declare just enough to type
// the surface we use. Loose by design — the API is non-standard.

interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionResultLike {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternativeLike;
  readonly isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionResultListLike {
  readonly length: number;
  item(index: number): SpeechRecognitionResultLike;
  [index: number]: SpeechRecognitionResultLike;
}
interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}
interface SpeechRecognitionErrorEventLike extends Event {
  readonly error: string;
  readonly message: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onsoundstart: (() => void) | null;
  onsoundend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// ─── Voice persona: lower-pitched voice picker ───────────────────────────────

function pickPersonaVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null {
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

// ─── Sentence splitter (for streaming TTS) ──────────────────────────────────
// Splits a reply into speakable chunks. Splits on `.`, `!`, `?`, and
// newlines, keeping the punctuation with the sentence. Filters out empty
// chunks (e.g. trailing periods). Keeps the splitter simple — we don't
// need NLP-grade segmentation for SOC analyst replies.

function splitIntoSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // Match runs that end with . ! ? or end-of-string, including the punctuation.
  const matches = trimmed.match(/[^.!?]*[.!?]+|[^.!?]+$/g);
  if (!matches) return [trimmed];
  return matches
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ─── Quick actions (static, always visible) ─────────────────────────────────

interface QuickAction {
  label: string;
  prompt: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { label: "Brief me", prompt: "brief me on the current security posture" },
  { label: "Show patches", prompt: "show me pending patches" },
  { label: "Explain a vuln", prompt: "explain a common vulnerability" },
  { label: "What should I do next?", prompt: "what should I do next?" },
];

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
  // ── Conversation + UI state ─────────────────────────────────────────────
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState("");
  const [briefing, setBriefing] = useState<AgentXBriefing | null>(null);
  const [resumedSession, setResumedSession] = useState(false);
  const [providerName, setProviderName] = useState<string>("…");

  // ── Voice state ─────────────────────────────────────────────────────────
  const [listening, setListening] = useState(false);
  const [speakingLocal, setSpeakingLocal] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  // ── Refs mirroring state for use inside stable callbacks ────────────────
  // The SpeechRecognition handlers are bound once; we need the latest
  // `thinking` + `currentTab` + `messages` + `speaking` without re-subscribing.
  const currentTabRef = useRef(currentTab);
  const messagesRef = useRef<AgentMessage[]>(messages);
  const thinkingRef = useRef(thinking);
  const openRef = useRef(open);
  const speakingRef = useRef(false);
  const greetedRef = useRef(false);
  const userStoppedRef = useRef(true); // true until the user (or greeting) starts listening
  const latestTranscriptRef = useRef("");

  // ── SpeechRecognition + Web Audio refs ──────────────────────────────────
  const ctorRef = useRef<SpeechRecognitionCtor | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Proactive-monitoring baseline (last seen patch IDs) ─────────────────
  const lastPatchIdsRef = useRef<Set<string>>(new Set());

  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Mirror state into refs ──────────────────────────────────────────────
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

  // ── Feature detection (post-hydration to avoid SSR mismatch) ────────────
  useEffect(() => {
    ctorRef.current = getSpeechRecognitionCtor();
    setSupported(!!ctorRef.current);

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const loadVoices = () => {
        voicesRef.current = window.speechSynthesis.getVoices();
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
      return () => {
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
    return;
  }, []);

  // ── Restore prior conversation from localStorage on first open ──────────
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
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(messages.slice(-MAX_HISTORY)),
      );
    } catch {
      /* quota / privacy mode — ignore */
    }
  }, [messages]);

  // ── Auto-scroll to bottom on new messages ───────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, thinking, interim]);

  // ── Fetch LLM provider name once per activation ─────────────────────────
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agent-x/provider");
        if (!res.ok) return;
        const data = (await res.json()) as { provider?: string };
        if (cancelled || !data.provider) return;
        setProviderName(data.provider);
      } catch {
        /* silent — badge just stays "…" */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // ── Build a SpeechRecognition instance (lazy) ───────────────────────────
  const ensureRecognition = useCallback((): SpeechRecognitionLike | null => {
    if (!ctorRef.current) return null;
    if (recRef.current) return recRef.current;
    const rec = new ctorRef.current();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      userStoppedRef.current = false;
      setListening(true);
      setVoiceError(null);
    };

    rec.onsoundstart = () => {
      // User started making noise — if we're speaking, that's an interrupt.
      if (speakingRef.current) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* noop */
        }
        speakingRef.current = false;
        setSpeakingLocal(false);
      }
    };

    rec.onspeechstart = () => {
      // Same interrupt semantics — speech is a stronger signal than sound.
      if (speakingRef.current) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* noop */
        }
        speakingRef.current = false;
        setSpeakingLocal(false);
      }
    };

    rec.onsoundend = () => {
      /* Just VAD bookkeeping — no action needed. */
    };

    rec.onresult = (ev: SpeechRecognitionEventLike) => {
      const results = ev.results;
      let interimText = "";
      let finalText = "";
      for (let i = ev.resultIndex; i < results.length; i++) {
        const alt = results[i]?.[0];
        if (!alt) continue;
        const t = alt.transcript;
        if (results[i].isFinal) finalText += t;
        else interimText += t;
      }
      setInterim(interimText);
      if (finalText.trim()) {
        latestTranscriptRef.current = finalText.trim();
        setInterim("");
        // Send the final transcript to the chat endpoint.
        void sendMessage(latestTranscriptRef.current);
      }
    };

    rec.onerror = (ev: SpeechRecognitionErrorEventLike) => {
      // "no-speech" and "aborted" are routine in continuous mode — don't surface.
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setVoiceError("Mic permission denied");
      } else if (ev.error === "network") {
        setVoiceError("Network error during recognition");
      }
    };

    rec.onend = () => {
      setListening(false);
      setInterim("");
      // Auto-restart gate: don't restart if (a) the user explicitly stopped,
      // (b) Agent X is currently speaking (let the utterance.onend handler
      // restart), or (c) the panel is no longer open.
      if (
        !openRef.current ||
        userStoppedRef.current ||
        speakingRef.current
      ) {
        return;
      }
      try {
        rec.start();
      } catch {
        /* InvalidStateError if start() raced — ignored; onend will fire again */
      }
    };

    recRef.current = rec;
    return rec;
  }, []);

  // ── Start listening ──────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const rec = ensureRecognition();
    if (!rec) return;
    userStoppedRef.current = false;
    try {
      rec.start();
    } catch {
      /* InvalidStateError if start() raced — ignored */
    }
    void ensureMicAnalyser();
  }, [ensureRecognition]);

  // ── Stop listening (user-initiated) ─────────────────────────────────────
  const stopListening = useCallback(() => {
    userStoppedRef.current = true;
    const rec = recRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      /* noop */
    }
    stopMicAnalyser();
  }, []);

  // ── Mic toggle (button click) ────────────────────────────────────────────
  const micToggle = useCallback(() => {
    if (listening) stopListening();
    else startListening();
  }, [listening, startListening, stopListening]);

  // ── Web Audio API: wire up AnalyserNode on the mic stream ────────────────
  // Used by the waveform canvas. Created lazily on first startListening and
  // torn down on stopListening + on unmount.
  const ensureMicAnalyser = useCallback(async () => {
    if (analyserRef.current) return;
    if (typeof window === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      micStreamRef.current = stream;
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.7;
      src.connect(analyser);
      analyserRef.current = analyser;
    } catch {
      /* Permission denied or unavailable — waveform just stays empty */
    }
  }, []);

  const stopMicAnalyser = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (micStreamRef.current) {
      for (const track of micStreamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          /* noop */
        }
      }
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        void audioCtxRef.current.close();
      } catch {
        /* noop */
      }
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  // ── Waveform render loop (only when listening && !speaking) ──────────────
  useEffect(() => {
    if (!listening || speakingLocal) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Clear the canvas when not actively drawing.
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx2d = canvas.getContext("2d");
        if (ctx2d) {
          ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const draw = () => {
      const analyser = analyserRef.current;
      if (!analyser) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteFrequencyData(dataArray);

      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      // Draw a centerline baseline.
      const barCount = Math.min(bufferLength, 32);
      const gap = 2;
      const barWidth = (w - gap * (barCount - 1)) / barCount;
      for (let i = 0; i < barCount; i++) {
        const v = dataArray[i] / 255; // 0..1
        const barH = Math.max(2, v * h);
        const x = i * (barWidth + gap);
        const y = (h - barH) / 2;
        // Gradient: emerald → cyan.
        const grad = ctx2d.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, "rgba(16,185,129,0.9)");
        grad.addColorStop(1, "rgba(34,211,238,0.7)");
        ctx2d.fillStyle = grad;
        ctx2d.fillRect(x, y, barWidth, barH);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [listening, speakingLocal]);

  // ── Streaming TTS: speak sentences sequentially ──────────────────────────
  // The first sentence is spoken immediately. Each utterance's `onend`
  // triggers the next sentence. While speaking, `speakingRef` is true →
  // the recognition `onend` auto-restart is gated off (no race).
  // The mic stays live to the extent the browser allows — if the user
  // starts talking, `onsoundstart` cancels TTS (see ensureRecognition).
  const speakChunked = useCallback(
    (text: string, opts?: { onAllDone?: () => void }) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        opts?.onAllDone?.();
        return;
      }
      const trimmed = text.trim();
      if (!trimmed) {
        opts?.onAllDone?.();
        return;
      }
      const synth = window.speechSynthesis;
      synth.cancel(); // interrupt any in-flight utterance
      const chunks = splitIntoSentences(trimmed);
      if (chunks.length === 0) {
        opts?.onAllDone?.();
        return;
      }
      const voices = voicesRef.current.length
        ? voicesRef.current
        : synth.getVoices();
      const preferred = pickPersonaVoice(voices);

      speakingRef.current = true;
      setSpeakingLocal(true);

      // If recognition is currently running, stop it so the browser doesn't
      // pick up its own TTS as "speech" (we'll restart on completion).
      const wasListening = listening;
      if (wasListening) {
        try {
          recRef.current?.stop();
        } catch {
          /* noop */
        }
      }

      let idx = 0;
      const speakNext = () => {
        if (idx >= chunks.length) {
          speakingRef.current = false;
          setSpeakingLocal(false);
          opts?.onAllDone?.();
          // Restart listening if it was live before we started speaking.
          if (wasListening && openRef.current && !userStoppedRef.current) {
            try {
              recRef.current?.start();
            } catch {
              /* InvalidStateError if start() raced — onend will retry */
            }
          }
          return;
        }
        const chunk = chunks[idx];
        idx += 1;
        const u = new SpeechSynthesisUtterance(chunk);
        if (preferred) u.voice = preferred;
        u.rate = 0.95;
        u.pitch = 0.85;
        u.volume = 1;
        u.onend = () => {
          // Defer to next tick to avoid the synth racing ahead.
          window.setTimeout(speakNext, 0);
        };
        u.onerror = () => {
          speakingRef.current = false;
          setSpeakingLocal(false);
          opts?.onAllDone?.();
        };
        synth.speak(u);
      };
      speakNext();
    },
    [listening],
  );

  // ── Stop TTS (manual mute) ───────────────────────────────────────────────
  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    speakingRef.current = false;
    setSpeakingLocal(false);
  }, []);

  // ── Execute Agent X actions returned from the chat endpoint ─────────────
  const executeActions = useCallback(
    (actions: AgentXAction[] | undefined) => {
      if (!actions || actions.length === 0) return;
      for (const action of actions) {
        switch (action.type) {
          case "navigate":
            if (action.target) onNavigate?.(action.target);
            break;
          case "scan":
            if (action.target) onScan?.(action.target);
            break;
          case "approve":
          case "approve_patch":
            if (action.target) onApprovePatch?.(action.target);
            break;
          case "search":
            onSearch?.(action.target || action.query || "");
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

  // ── Progressive message display ──────────────────────────────────────────
  // Helper to append the next sentence to a specific agent message ID.
  const appendToMessage = useCallback((id: string, chunk: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, content: m.content + chunk } : m,
      ),
    );
  }, []);

  // ── Send a message to /api/agent-x/chat ─────────────────────────────────
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || thinkingRef.current) return;

      // Stop any in-flight TTS — the user is talking over Agent X.
      if (speakingRef.current) {
        stopSpeaking();
      }

      setInput("");
      setThinking(true);
      const userMsgId = `u-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const agentMsgId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content: trimmed, ts: Date.now() },
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

        // Stream the reply: split into sentences, display first sentence
        // immediately, then progressively append the rest as TTS plays.
        const sentences = splitIntoSentences(reply);
        const firstSentence = sentences[0] || reply;
        const rest = sentences.slice(1);

        // Seed the agent message with the first sentence.
        setMessages((prev) => [
          ...prev,
          {
            id: agentMsgId,
            role: "agent",
            content: firstSentence,
            ts: Date.now(),
          },
        ]);

        executeActions(data.actions);

        // Speak the first sentence immediately; subsequent sentences are
        // queued by the chunked speaker (its onend triggers the next).
        speakChunked(reply, {
          onAllDone: () => {
            // After all chunks have played, ensure the full text is in the
            // message bubble (in case the chunker appended progressively
            // faster/slower than expected — this is idempotent).
          },
        });

        // Progressive display: append subsequent sentences at a cadence
        // that roughly matches the speaking rate. We use a timer based on
        // sentence length to avoid the message appearing all at once.
        if (rest.length > 0) {
          let delay = 600; // initial delay gives the first utterance a beat
          for (const s of rest) {
            window.setTimeout(() => {
              appendToMessage(agentMsgId, " " + s);
            }, delay);
            delay += Math.max(800, s.length * 55);
          }
        }
      } catch {
        const errMsg =
          "I'm having trouble reaching the security core. Try again in a moment.";
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "agent",
            content: errMsg,
            ts: Date.now(),
            kind: "error",
          },
        ]);
        speakChunked(errMsg);
      } finally {
        setThinking(false);
      }
    },
    [appendToMessage, executeActions, speakChunked, stopSpeaking],
  );

  // ── On open: fetch briefing ONCE, greet + speak, start listening after TTS ─
  useEffect(() => {
    if (!open) return;
    if (greetedRef.current) return;
    greetedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/agent-x/briefing");
        if (!res.ok) return;
        const data = (await res.json()) as AgentXBriefing;
        if (cancelled) return;
        setBriefing(data);

        // Seed the proactive-monitoring baseline with patch IDs (not counts).
        const patchIds = new Set<string>(
          (data.pendingTasks ?? [])
            .filter((t) => t.type === "patch")
            .map((t) => t.id),
        );
        lastPatchIdsRef.current = patchIds;

        const firstName = (currentUser?.name || "there").split(" ")[0];
        const postureSummary = buildPostureSummary(data);
        const greeting = `Good ${data.timeOfDay || "day"}, ${firstName}. ${postureSummary} What are you up to today?`;

        setMessages((prev) => [
          ...prev,
          {
            id: `greeting-${Date.now()}`,
            role: "agent",
            content: greeting,
            ts: Date.now(),
            kind: "briefing",
          },
        ]);

        // Speak greeting. After TTS finishes (utterance.onend → onAllDone),
        // start listening. This guarantees the mic opens only after the
        // greeting is done — no race with TTS playback.
        speakChunked(greeting, {
          onAllDone: () => {
            if (cancelled || !openRef.current) return;
            startListening();
          },
        });
      } catch {
        /* network/silent failure — tab still usable via text input */
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally only depend on `open` — we want the greeting to fire
    // exactly once per activation. currentUser + speakChunked + startListening
    // are stable or accessed via refs.
  }, [open, currentUser, speakChunked, startListening]);

  // ── Proactive monitoring: poll briefing every 5 min, alert on NEW patch IDs ─
  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(async () => {
      if (!openRef.current) return;
      try {
        const res = await fetch("/api/agent-x/briefing");
        if (!res.ok) return;
        const data = (await res.json()) as AgentXBriefing;
        setBriefing(data);

        const currentPatchIds = new Set<string>(
          (data.pendingTasks ?? [])
            .filter((t) => t.type === "patch")
            .map((t) => t.id),
        );

        // Find patch IDs that exist now but weren't in the baseline.
        const newIds: string[] = [];
        for (const id2 of currentPatchIds) {
          if (!lastPatchIdsRef.current.has(id2)) newIds.push(id2);
        }

        if (newIds.length > 0) {
          const topNew =
            (data.pendingTasks ?? []).find((t) => t.id === newIds[0])?.title ||
            "a new patch";
          const msg = `Heads up — a new critical patch was just generated: ${topNew}. Want me to show you?`;
          setMessages((prev) => [
            ...prev,
            {
              id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              role: "agent",
              content: msg,
              ts: Date.now(),
              kind: "alert",
            },
          ]);
          speakChunked(msg);
        }

        lastPatchIdsRef.current = currentPatchIds;
      } catch {
        /* swallow — proactive polling must never crash the tab */
      }
    }, PROACTIVE_POLL_MS);
    return () => window.clearInterval(id);
  }, [open, speakChunked]);

  // ── Stop TTS + listening when the panel closes ──────────────────────────
  useEffect(() => {
    if (open) return;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    speakingRef.current = false;
    setSpeakingLocal(false);
    userStoppedRef.current = true;
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
    stopMicAnalyser();
  }, [open, stopMicAnalyser]);

  // ── Cleanup TTS + recognition on unmount ──────────────────────────────────
  useEffect(() => {
    return () => {
      userStoppedRef.current = true;
      try {
        recRef.current?.abort();
      } catch {
        /* noop */
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      stopMicAnalyser();
    };
  }, [stopMicAnalyser]);

  // ── Conversation export (.txt) ───────────────────────────────────────────
  const exportConversation = useCallback(() => {
    if (messages.length === 0) return;
    const lines = messages.map((m) => {
      const when = new Date(m.ts).toISOString();
      const who = m.role === "user" ? "YOU" : "AGENT X";
      const kindTag = m.kind ? ` [${m.kind.toUpperCase()}]` : "";
      return `[${when}] ${who}${kindTag}:\n${m.content}`;
    });
    const header = [
      "GuardianX — Agent X Conversation Export",
      `Exported: ${new Date().toISOString()}`,
      `Messages: ${messages.length}`,
      "",
      "─".repeat(60),
      "",
    ].join("\n");
    const blob = new Blob([header + lines.join("\n\n") + "\n"], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-x-conversation-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [messages]);

  // ── Clear conversation ────────────────────────────────────────────────────
  const clearConversation = useCallback(() => {
    setMessages([]);
    setResumedSession(false);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }, []);

  // ── Derived display state ────────────────────────────────────────────────
  const speaking = speakingLocal;

  // ── If closed, render nothing ────────────────────────────────────────────
  if (!open) return null;

  return (
    <div
      className="hud-corners flex h-full w-full flex-col overflow-hidden bg-zinc-950"
      role="region"
      aria-label="Agent X conversational tab"
      aria-live="polite"
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-transparent px-3 py-2.5 sm:px-4">
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
          <Badge
            variant="outline"
            className="ml-1 hidden border-emerald-500/40 bg-emerald-500/10 font-mono text-[8px] uppercase tracking-wider text-emerald-300 sm:inline-flex"
          >
            <span className="size-1 animate-pulse rounded-full bg-emerald-400" />
            ACTIVE
          </Badge>
          <Badge
            variant="outline"
            className="ml-1 hidden border-zinc-700 bg-zinc-900/60 font-mono text-[8px] uppercase tracking-wider text-zinc-400 md:inline-flex"
          >
            {providerName}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
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
            className={`relative flex size-8 items-center justify-center rounded-md border transition-all ${
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
          <button
            type="button"
            onClick={exportConversation}
            disabled={messages.length === 0}
            aria-label="Export conversation as text file"
            title="Export conversation (.txt)"
            className="flex size-8 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900/60 text-zinc-400 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/5 hover:text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={clearConversation}
            disabled={messages.length === 0}
            aria-label="Clear conversation"
            title="Clear conversation"
            className="flex size-8 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900/60 text-zinc-400 transition-colors hover:border-rose-500/40 hover:bg-rose-500/5 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </header>

      {/* ── Main split: conversation (70%) + briefing (30%) ─────────────────── */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* ── Conversation column ────────────────────────────────────────────── */}
        <section
          className="flex min-h-0 flex-1 flex-col md:basis-7/12 md:flex-none"
          aria-label="Agent X conversation"
        >
          {/* Conversation body */}
          <div
            ref={scrollRef}
            className="custom-scrollbar min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 sm:p-4"
          >
            {resumedSession && messages.length > 0 && (
              <div className="flex justify-center">
                <span className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                  Picking up where we left off…
                </span>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {messages.map((m, i) => (
                <motion.div
                  key={m.id}
                  layout
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{
                    type: "spring",
                    stiffness: 380,
                    damping: 28,
                    delay: Math.min(i * 0.02, 0.08),
                  }}
                  className={`flex ${
                    m.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`group max-w-[88%] rounded-lg px-3 py-2 sm:max-w-[80%] ${
                      m.role === "user"
                        ? "border border-emerald-500/30 bg-emerald-600/15 text-emerald-100"
                        : m.kind === "error"
                          ? "border border-rose-500/40 bg-rose-500/5 text-rose-200"
                          : m.kind === "alert"
                            ? "border border-amber-500/40 bg-amber-500/5 text-amber-100"
                            : m.kind === "briefing"
                              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
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
                    <p className="whitespace-pre-wrap break-words text-xs leading-relaxed sm:text-[13px]">
                      {m.content}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* ── Thinking indicator (3 dots) ─────────────────────────────── */}
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

            {/* ── Live interim transcript (while listening) ─────────────────── */}
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

          {/* ── Status strip (waveform / speaking indicator) ─────────────────── */}
          <div className="shrink-0 border-t border-emerald-500/10 bg-zinc-950/60 px-3 py-1.5">
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
                  Listening — interrupt anytime
                </span>
                <canvas
                  ref={canvasRef}
                  width={240}
                  height={16}
                  className="ml-2 h-4 flex-1"
                  aria-hidden="true"
                />
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
            {voiceError && (
              <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-rose-400/80">
                {voiceError}
              </p>
            )}
          </div>

          {/* ── Footer: text input + send ────────────────────────────────────── */}
          <div className="flex shrink-0 items-center gap-1.5 border-t border-emerald-500/20 bg-zinc-950/80 p-2 sm:p-3">
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
              className="border-emerald-500/20 bg-zinc-900/60 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20 sm:text-[13px]"
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

          {/* ── Quick actions bar ─────────────────────────────────────────────── */}
          <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-emerald-500/10 bg-zinc-950/60 px-2 py-2 custom-scrollbar sm:px-3">
            <span className="hidden font-mono text-[9px] uppercase tracking-wider text-zinc-600 sm:inline">
              Quick
            </span>
            {QUICK_ACTIONS.map((qa) => (
              <button
                key={qa.label}
                type="button"
                onClick={() => void sendMessage(qa.prompt)}
                disabled={thinking}
                className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1 font-mono text-[10px] text-emerald-300 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {qa.label}
              </button>
            ))}
          </div>
        </section>

        {/* ── Briefing panel (right side, 30% desktop) ───────────────────────── */}
        <aside
          className="min-h-0 shrink-0 overflow-y-auto border-t border-emerald-500/10 bg-zinc-950/40 p-3 md:w-[30%] md:border-l md:border-t-0 sm:p-4 custom-scrollbar"
          aria-label="Agent X briefing panel"
        >
          <BriefingPanel briefing={briefing} currentUser={currentUser} />
        </aside>
      </div>
    </div>
  );
}

// ─── Briefing panel ──────────────────────────────────────────────────────────

interface BriefingPanelProps {
  briefing: AgentXBriefing | null;
  currentUser: AgentXUser | null;
}

function BriefingPanel({ briefing, currentUser }: BriefingPanelProps) {
  const posture = briefing?.postureScore;
  const grade = briefing?.postureGrade ?? "—";
  const pendingTasks = briefing?.pendingTasks ?? [];
  const patches = pendingTasks.filter((t) => t.type === "patch");
  const findings = pendingTasks.filter((t) => t.type === "finding");
  const critical = briefing?.criticalCount ?? 0;
  const firstName = (currentUser?.name || "Operator").split(" ")[0];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Sparkles className="size-3 text-emerald-400" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-300/80">
          Live Briefing
        </span>
      </div>

      {/* Posture score */}
      <div
        className="holo-card-sharp rounded-lg border border-emerald-500/30 bg-zinc-900/50 p-3"
      >
        <div className="flex items-center justify-between">
          <span className="font-mono text-[8px] uppercase tracking-wider text-zinc-500">
            Security Posture
          </span>
          <span
            className={`font-mono text-[8px] uppercase tracking-wider ${
              posture == null
                ? "text-zinc-500"
                : posture >= 90
                  ? "text-emerald-300"
                  : posture >= 70
                    ? "text-amber-300"
                    : "text-rose-300"
            }`}
          >
            Grade {grade}
          </span>
        </div>
        <div className="mt-2 flex items-end gap-2">
          {posture == null ? (
            <Skeleton className="h-8 w-16 rounded-md bg-zinc-800" />
          ) : (
            <span className="font-mono text-3xl font-bold leading-none text-emerald-300">
              {posture}
            </span>
          )}
          <span className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            / 100
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full ${
              posture == null
                ? "bg-zinc-700"
                : posture >= 90
                  ? "bg-emerald-500"
                  : posture >= 70
                    ? "bg-amber-500"
                    : "bg-rose-500"
            }`}
            style={{ width: `${Math.max(0, Math.min(100, posture ?? 0))}%` }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <BriefingStat
          label="PATCHES"
          value={patches.length.toString()}
          sub="pending"
          tone={patches.length > 0 ? "amber" : "emerald"}
        />
        <BriefingStat
          label="CRITICAL"
          value={critical.toString()}
          sub="findings"
          tone={critical > 0 ? "rose" : "emerald"}
        />
      </div>

      {/* Pending patches list */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
        <div className="mb-1.5 flex items-center gap-1">
          <ShieldAlert
            className={`size-3 ${
              patches.length > 0 ? "text-amber-400" : "text-emerald-400"
            }`}
          />
          <span className="font-mono text-[8px] uppercase tracking-wider text-zinc-500">
            Pending Patches
          </span>
        </div>
        {patches.length === 0 ? (
          <p className="px-1 py-1.5 font-mono text-[10px] text-zinc-600">
            No pending patches. Nice work, {firstName}.
          </p>
        ) : (
          <ul className="max-h-44 space-y-1 overflow-y-auto custom-scrollbar">
            {patches.slice(0, 5).map((p) => (
              <li
                key={p.id}
                className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[10px] text-zinc-300">
                    {p.title}
                  </span>
                  <span
                    className={`shrink-0 rounded-sm px-1 font-mono text-[8px] uppercase tracking-wider ${
                      p.severity === "critical"
                        ? "bg-rose-500/15 text-rose-300"
                        : p.severity === "high"
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-zinc-700/40 text-zinc-400"
                    }`}
                  >
                    {p.severity}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="font-mono text-[8px] text-zinc-600">
                    {p.id}
                  </span>
                  <span className="font-mono text-[8px] text-zinc-600">
                    {p.age}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Critical findings list */}
      {findings.length > 0 && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2">
          <div className="mb-1.5 flex items-center gap-1">
            <AlertCircle className="size-3 text-rose-400" />
            <span className="font-mono text-[8px] uppercase tracking-wider text-rose-300/80">
              Critical Findings
            </span>
          </div>
          <ul className="max-h-32 space-y-1 overflow-y-auto custom-scrollbar">
            {findings.slice(0, 5).map((f) => (
              <li
                key={f.id}
                className="rounded border border-rose-500/20 bg-zinc-950/60 px-2 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[10px] text-zinc-300">
                    {f.title}
                  </span>
                  <span className="shrink-0 rounded-sm bg-rose-500/15 px-1 font-mono text-[8px] uppercase tracking-wider text-rose-300">
                    {f.severity}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="font-mono text-[8px] text-zinc-600">
                    {f.id}
                  </span>
                  <span className="font-mono text-[8px] text-zinc-600">
                    {f.age}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent activity */}
      {briefing?.recentActivity && briefing.recentActivity.length > 0 && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2">
          <div className="mb-1.5 flex items-center gap-1">
            <Activity className="size-3 text-cyan-400" />
            <span className="font-mono text-[8px] uppercase tracking-wider text-zinc-500">
              Recent Activity
            </span>
          </div>
          <ul className="space-y-1">
            {briefing.recentActivity.slice(0, 3).map((a, i) => (
              <li
                key={i}
                className="font-mono text-[10px] leading-snug text-zinc-400"
              >
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
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

// ─── Posture summary string for greeting ─────────────────────────────────────

function buildPostureSummary(data: AgentXBriefing): string {
  const score = data.postureScore;
  const grade = data.postureGrade ?? "—";
  if (score == null) return "Security posture is currently unavailable.";
  if (score < 70) {
    return `Your security posture needs attention — score ${score}/100 (grade ${grade}).`;
  }
  if (score >= 90) {
    return `Your security posture is excellent — score ${score}/100 (grade ${grade}).`;
  }
  return `Security posture is currently ${score}/100 (grade ${grade}).`;
}

export default AgentX;
