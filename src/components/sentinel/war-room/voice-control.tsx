"use client";

/**
 * VoiceControl
 * ------------
 * backtalk-inspired voice interface for the GuardianX War Room.
 *
 * backtalk (github.com/jaredrhod/backtalk) uses Whisper STT + Kokoro TTS
 * via a local Python server with VAD endpointing and push-to-talk. We
 * can't ship a Python runtime to the browser, so this component ports
 * the *shape* of backtalk — hold-to-talk capture, a spoken reply,
 * status ring that breathes while idle / pulses while listening — onto
 * the native Web Speech API:
 *
 *   - SpeechRecognition  (STT)  — Chrome's webkitSpeechRecognition
 *   - SpeechSynthesis    (TTS)  — W3C SpeechSynthesis API
 *
 * No external dependencies. No Python server. No API keys. Everything
 * happens in the browser, which means it only works in Chrome/Edge and
 * any other browser that ships Web Speech. We gracefully degrade to a
 * "Voice unsupported" chip on Firefox/Safari.
 *
 * Voice commands (parsed locally, executed via onCommand callback OR
 * POSTed to /api/voice-command for backend actions):
 *
 *   "scan <codebase>"             → { action: "scan", target }
 *   "show <tab>"                  → { action: "navigate", target }
 *   "search findings for <query>" → { action: "search", target }
 *   "approve patch <id>"           → { action: "approve", target }
 *   "what's the security posture" → { action: "status" }
 *   "stop"                         → cancels TTS playback
 *
 * The component exposes an imperative handle (`useRef<VoiceControlHandle>`)
 * so the War Room overlay can call `speak(...)` to read AI responses and
 * critical findings aloud, and `startListening()` / `stopListening()`
 * from a gesture (fist = stop) or hot-key.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Volume2, VolumeX, Radio, Activity } from "lucide-react";

// ── Minimal Web Speech API ambient types ─────────────────────────────────
// SpeechRecognition isn't in the TS DOM lib (only EventTarget bits are).
// Declare just enough to type the surface we use. We deliberately keep
// these loose — the API is non-standard (`webkitSpeechRecognition`) and
// only Chrome/Edge/Safari ship it.
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

// ── Parsed voice command shape ────────────────────────────────────────────
export type VoiceCommand =
  | { action: "scan"; target: string }
  | { action: "navigate"; target: string }
  | { action: "search"; target: string }
  | { action: "approve"; target: string }
  | { action: "status" }
  | { action: "stop" }
  | { action: "unknown"; raw: string };

export interface VoiceControlHandle {
  /** Speak a string aloud (queues behind any in-flight utterance). */
  speak(text: string, opts?: { interrupt?: boolean }): void;
  /** Stop any in-flight TTS playback immediately. */
  stopSpeaking(): void;
  /** Begin a single push-to-talk capture session. */
  startListening(): void;
  /** Abort a capture in flight. */
  stopListening(): void;
  /** Whether the browser exposes SpeechRecognition at all. */
  isSupported(): boolean;
}

export interface VoiceControlState {
  listening: boolean;
  speaking: boolean;
  interim: string;
  supported: boolean;
}

export interface VoiceControlProps {
  /** Called with a parsed command. If omitted, the component POSTs the
   *  raw transcript to `/api/voice-command` and reads the response aloud. */
  onCommand?: (cmd: VoiceCommand) => void;
  /** Auto-read the result of /api/voice-command aloud. Default true. */
  speakResponses?: boolean;
  /** Compact variant for the corner of the War Room. */
  compact?: boolean;
  /**
   * Continuous (always-on) listening mode. When true the recognizer is
   * configured with `continuous=true` + `interimResults=true` and
   * auto-restarts in `onend` until the user explicitly stops it. The
   * mic button toggles the session on/off, hold-SPACE becomes a no-op,
   * and a floating "● LISTENING" status chip appears at the top of the
   * viewport. Defaults to false (single-shot push-to-talk).
   */
  continuous?: boolean;
  /**
   * Live state mirror for parent UIs (e.g. an outer floating panel that
   * wants to show the interim transcript). Fires on every listening /
   * speaking / interim transition.
   */
  onStateChange?: (state: VoiceControlState) => void;
  /** Optional CSS class. */
  className?: string;
}

// ── Command parser ────────────────────────────────────────────────────────
// Matches the six documented command shapes. Runs case-insensitively on
// the trimmed final transcript. Returns `unknown` for anything we don't
// recognize so the UI can echo it back without dropping it.
export function parseVoiceCommand(raw: string): VoiceCommand {
  const text = raw.trim().replace(/\s+/g, " ").toLowerCase();
  if (!text) return { action: "unknown", raw };

  // "stop" — cancel TTS. Single-word intent.
  if (/^(stop|quiet|silence|shut up|cancel reading)$/.test(text)) {
    return { action: "stop" };
  }

  // "what's the security posture" / "status report" / "posture"
  if (/(security|security posture|posture|status report|threat level|how are we doing)/.test(text)) {
    return { action: "status" };
  }

  // "scan <codebase>"
  let m = text.match(/^scan\s+(.+)$/);
  if (m && m[1]) return { action: "scan", target: m[1] };

  // "show <tab>"
  m = text.match(/^(show|go to|open|switch to|view)\s+(.+)$/);
  if (m && m[2]) return { action: "navigate", target: m[2] };

  // "search findings for <query>" / "search for ..."
  m = text.match(/^(?:search|find)\s+(?:findings?\s+(?:for|containing|matching)\s+|for\s+)?(.+)$/);
  if (m && m[1] && /^(search|find)\b/.test(text)) {
    return { action: "search", target: m[1] };
  }

  // "approve patch <id>"
  m = text.match(/^approve\s+patch\s+(.+)$/);
  if (m && m[1]) return { action: "approve", target: m[1] };

  return { action: "unknown", raw };
}

// ── Component ──────────────────────────────────────────────────────────────
export const VoiceControl = forwardRef<VoiceControlHandle, VoiceControlProps>(
  function VoiceControl(
    { onCommand, speakResponses = true, compact = false, continuous = false, onStateChange, className },
    ref,
  ) {
    const ctorRef = useRef<SpeechRecognitionCtor | null>(null);
    const recRef = useRef<SpeechRecognitionLike | null>(null);
    const ttsVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
    // Latest transcript captured during a recognition session — kept in
    // a ref so the `onend` closure (created once at startListening time)
    // can read the freshest partial without re-subscribing on every interim.
    const latestTranscriptRef = useRef("");
    // In continuous mode, tracks whether the user has *explicitly* stopped
    // listening (via mic click, ESC, or unmount). When false, `onend` is
    // treated as a browser-side silence timeout and we auto-restart the
    // same recognizer instance. Defaults to true so a stale `onend` fired
    // before the first `startListening()` doesn't try to resurrect a dead
    // session.
    const userStoppedRef = useRef(true);

    // Feature detection via useSyncExternalStore: returns false during SSR,
    // the real value post-hydration. Avoids setState-in-effect.
    const supported = useSyncExternalStore(
      () => () => {},
      () => !!getSpeechRecognitionCtor(),
      () => false,
    );
    const [listening, setListening] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const [interim, setInterim] = useState("");
    const [lastHeard, setLastHeard] = useState("");
    const [lastReply, setLastReply] = useState("");
    const [error, setError] = useState<string | null>(null);

    // ── Initialize on mount: warm TTS voices ────────────────────────────
    useEffect(() => {
      // Set the ctor ref (used by startListening) on the client.
      ctorRef.current = getSpeechRecognitionCtor();

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        const loadVoices = () => {
          ttsVoicesRef.current = window.speechSynthesis.getVoices();
        };
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
        return () => {
          window.speechSynthesis.onvoiceschanged = null;
        };
      }
      return;
    }, []);

    // ── Cleanup on unmount ───────────────────────────────────────────────
    useEffect(() => {
      return () => {
        // Mark as user-stopped BEFORE aborting so the `onend` that fires
        // from abort() doesn't try to auto-restart a dead session in
        // continuous mode.
        userStoppedRef.current = true;
        try {
          recRef.current?.abort();
        } catch {
          /* noop */
        }
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
      };
    }, []);

    // ── TTS ──────────────────────────────────────────────────────────────
    const speak = useCallback(
      (text: string, opts?: { interrupt?: boolean }) => {
        if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
        if (!text.trim()) return;
        const synth = window.speechSynthesis;
        if (opts?.interrupt) synth.cancel();

        // Pick a voice that sounds vaguely like a SOC analyst — prefer
        // an English voice, ideally one named "Google US English" or
        // similar. Falls back to the first available voice.
        const voices = ttsVoicesRef.current.length
          ? ttsVoicesRef.current
          : synth.getVoices();
        const preferred =
          voices.find((v) => /en[-_]US/i.test(v.lang) && /google|samantha|jenny/i.test(v.name)) ||
          voices.find((v) => /^en/i.test(v.lang)) ||
          voices[0];

        const u = new SpeechSynthesisUtterance(text);
        if (preferred) u.voice = preferred;
        u.rate = 1.05;
        u.pitch = 0.95;
        u.volume = 1;
        u.onstart = () => setSpeaking(true);
        u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);
        synth.speak(u);
        setLastReply(text);
      },
      [],
    );

    const stopSpeaking = useCallback(() => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }, []);

    // ── Dispatch a parsed command ────────────────────────────────────────
    // If the parent passed an `onCommand`, hand it over. Otherwise POST
    // to /api/voice-command and read the response back aloud (when
    // speakResponses is on).
    const dispatchCommand = useCallback(
      async (cmd: VoiceCommand) => {
        // "stop" always cancels TTS locally — never round-trips.
        if (cmd.action === "stop") {
          stopSpeaking();
          return;
        }
        if (onCommand) {
          onCommand(cmd);
          return;
        }
        try {
          const res = await fetch("/api/voice-command", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ command: cmd }),
          });
          const data = (await res.json()) as { ok?: boolean; message?: string; action?: string };
          if (speakResponses && data?.message) {
            speak(data.message, { interrupt: true });
          }
        } catch {
          /* swallow — the UI already shows the transcript */
        }
      },
      [onCommand, speak, speakResponses, stopSpeaking],
    );

    // ── Push-to-talk: start a capture session ───────────────────────────
    // In `continuous` mode the recognizer is configured for always-on
    // listening and auto-restarts in `onend` until `stopListening()` (or
    // unmount) flips `userStoppedRef`. Each `isFinal` chunk is dispatched
    // as its own command so the user gets immediate feedback without
    // waiting for the session to end. In single-shot mode the whole
    // hold-SPACE phrase is dispatched once from `onend`.
    const startListening = useCallback(() => {
      const ctor = ctorRef.current;
      if (!ctor) return;
      // Abort any prior session — reentrancy safety.
      try {
        recRef.current?.abort();
      } catch {
        /* noop */
      }
      userStoppedRef.current = false;
      const rec = new ctor();
      rec.lang = "en-US";
      rec.continuous = continuous;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      let finalText = "";

      rec.onstart = () => {
        setListening(true);
        setInterim("");
        latestTranscriptRef.current = "";
        setError(null);
      };
      rec.onresult = (ev: SpeechRecognitionEventLike) => {
        let interimText = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          const alt = r[0];
          if (r.isFinal) {
            const chunk = alt.transcript;
            finalText += chunk;
            // In continuous mode, dispatch each finalized utterance as
            // it arrives — the session may keep running for minutes
            // and the user shouldn't have to wait for `onend` to get a
            // response. Single-shot mode still waits for `onend` so the
            // whole hold-SPACE phrase dispatches as one command.
            if (continuous) {
              const trimmed = chunk.trim();
              if (trimmed) {
                setLastHeard(trimmed);
                const cmd = parseVoiceCommand(trimmed);
                void dispatchCommand(cmd);
              }
            }
          } else {
            interimText += alt.transcript;
          }
        }
        latestTranscriptRef.current = finalText || interimText;
        setInterim(interimText);
      };
      rec.onerror = (ev: SpeechRecognitionErrorEventLike) => {
        // `no-speech` and `aborted` fire routinely in continuous mode
        // when the browser times out a quiet stretch — don't surface
        // those as user-visible errors. They're expected.
        if (!continuous || (ev.error !== "no-speech" && ev.error !== "aborted")) {
          setError(ev.error || "speech_error");
        }
        setListening(false);
      };
      rec.onend = () => {
        if (continuous && !userStoppedRef.current) {
          // Browser-side silence timeout (Chrome ends continuous sessions
          // after ~60s even with `continuous=true`). Auto-restart the
          // same recognizer instance. Each final chunk was already
          // dispatched from `onresult`, so there's nothing to flush.
          setInterim("");
          latestTranscriptRef.current = "";
          try {
            rec.start();
            setListening(true);
            return;
          } catch {
            // InvalidStateError if start() is called too quickly
            // after end(). Retry once on the next tick — keeps
            // always-on mode resilient without spamming retries.
            setTimeout(() => {
              if (userStoppedRef.current) return;
              try {
                rec.start();
                setListening(true);
              } catch {
                setListening(false);
              }
            }, 250);
            return;
          }
        }
        // Single-shot path (or user-stopped continuous): flush the
        // accumulated transcript as one command. In continuous mode
        // each final chunk was already dispatched from `onresult`,
        // so we skip the dispatch here to avoid double-firing.
        setListening(false);
        const transcript = (finalText || latestTranscriptRef.current).trim();
        setInterim("");
        latestTranscriptRef.current = "";
        if (!transcript) return;
        setLastHeard(transcript);
        if (!continuous) {
          const cmd = parseVoiceCommand(transcript);
          void dispatchCommand(cmd);
        }
      };

      recRef.current = rec;
      try {
        rec.start();
      } catch {
        // start() throws if called twice in a row without end — swallow.
        setListening(false);
      }
    }, [continuous, dispatchCommand]);

    const stopListening = useCallback(() => {
      // Mark as user-stopped BEFORE calling stop() so the `onend` that
      // fires from stop() doesn't try to auto-restart the session in
      // continuous mode.
      userStoppedRef.current = true;
      try {
        recRef.current?.stop();
      } catch {
        /* noop */
      }
      setListening(false);
    }, []);

    // ── Hold-space push-to-talk + ESC to cancel ──────────────────────────
    // In continuous mode, listening is always on once started — hold-SPACE
    // push-to-talk would be redundant (and steal the spacebar from scrollers
    // and any focused button). ESC still kills the session so the user can
    // bail out of always-on mode without clicking the mic.
    useEffect(() => {
      if (continuous) {
        const onKey = (e: KeyboardEvent) => {
          if (e.key === "Escape" && listening) {
            stopListening();
          }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
      }
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.code === "Space" && !e.repeat) {
          // Don't steal space from inputs/textareas.
          const t = e.target as HTMLElement | null;
          if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
            return;
          }
          e.preventDefault();
          if (!listening) startListening();
        }
        if (e.key === "Escape" && listening) {
          stopListening();
        }
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === "Space" && listening) {
          const t = e.target as HTMLElement | null;
          if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
            return;
          }
          e.preventDefault();
          stopListening();
        }
      };
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
      };
    }, [continuous, listening, startListening, stopListening]);

    // ── Imperative handle ───────────────────────────────────────────────
    useImperativeHandle(
      ref,
      (): VoiceControlHandle => ({
        speak,
        stopSpeaking,
        startListening,
        stopListening,
        isSupported: () => supported,
      }),
      [speak, stopSpeaking, startListening, stopListening, supported],
    );

    // ── Mirror state to the parent (if it asked us to) ─────────────────
    // Fires on every listening / speaking / interim transition so a parent
    // floating chip can render the live transcript without holding its
    // own SpeechRecognition instance.
    useEffect(() => {
      onStateChange?.({ listening, speaking, interim, supported });
    }, [listening, speaking, interim, supported, onStateChange]);

    // ── Status ring color ───────────────────────────────────────────────
    const ringColor = listening
      ? "#ff4d5e"
      : speaking
        ? "#e7c368"
        : supported
          ? "#3ddc84"
          : "#71717a";

    const statusLabel = !supported
      ? "VOICE UNSUPPORTED"
      : listening
        ? "LISTENING"
        : speaking
          ? "SPEAKING"
          : "VOICE IDLE";

    // ── Waveform bars (animated when listening) ──────────────────────────
    const bars = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

    // ── Floating "voice status" chip (continuous mode only) ─────────────
    // Fixed at the top-center of the viewport, `pointer-events-none` so it
    // doesn't steal clicks from headers / nav. Mirrors the live listening
    // state + interim transcript so the user always knows voice is on even
    // when the VoiceControl's own UI is scrolled off-screen or hidden inside
    // an overlay.
    const floatingStatus =
      continuous && supported ? (
        <div
          className="pointer-events-none fixed left-1/2 top-2 z-[90] -translate-x-1/2"
          aria-hidden="true"
        >
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-zinc-950/80 px-3 py-1.5 backdrop-blur-md">
            <span
              className={`size-1.5 rounded-full ${
                listening ? "animate-pulse bg-emerald-400" : "bg-zinc-600"
              }`}
            />
            <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-300/90">
              {listening ? "LISTENING" : "IDLE"}
            </span>
            {interim ? (
              <span className="hidden max-w-[40vw] truncate font-mono text-[10px] italic text-zinc-400 sm:inline">
                {interim}
              </span>
            ) : null}
          </div>
        </div>
      ) : null;

    if (compact) {
      return (
        <>
          {floatingStatus}
          <div className={`flex items-center gap-2 ${className ?? ""}`}>
            {continuous && (
              <span className="flex items-center gap-1 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-300">
                <span className="size-1 animate-pulse rounded-full bg-emerald-400" />
                CONTINUOUS
              </span>
            )}
            <button
              type="button"
              disabled={!supported}
              onClick={() => (listening ? stopListening() : startListening())}
              aria-label={listening ? "Stop listening" : "Start voice command"}
              className={`relative flex size-10 items-center justify-center rounded-full border transition-all ${
                listening
                  ? "border-red-500/60 bg-red-500/20"
                  : supported
                    ? "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20"
                    : "border-zinc-700 bg-zinc-900 opacity-50"
              }`}
            >
              {listening ? (
                <MicOff className="size-4 text-red-300" />
              ) : (
                <Mic className="size-4 text-emerald-300" />
              )}
              {listening && (
                <span
                  className="absolute inset-0 animate-ping rounded-full border border-red-500/40"
                  style={{ animationDuration: "1s" }}
                />
              )}
            </button>
            {speaking && (
              <button
                type="button"
                onClick={stopSpeaking}
                aria-label="Stop speaking"
                className="flex size-10 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20"
              >
                <VolumeX className="size-4 text-amber-300" />
              </button>
            )}
            <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
              {statusLabel}
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        {floatingStatus}
        <div
          className={`flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-zinc-950/80 p-4 backdrop-blur-xl ${className ?? ""}`}
        >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="size-4 text-emerald-400" />
            <span className="font-mono text-xs uppercase tracking-widest text-emerald-400/80">
              Voice Control
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {continuous && (
              <span className="flex items-center gap-1 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-300">
                <span className="size-1 animate-pulse rounded-full bg-emerald-400" />
                CONTINUOUS
              </span>
            )}
            <span
              className="size-1.5 rounded-full"
              style={{ backgroundColor: ringColor }}
            />
            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Mic + waveform */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!supported}
            onClick={() => (listening ? stopListening() : startListening())}
            aria-label={listening ? "Stop listening" : "Start voice command"}
            title={supported ? "Click or hold SPACE to talk" : "SpeechRecognition not available in this browser"}
            className={`relative flex size-14 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
              listening
                ? "border-red-500/60 bg-red-500/20"
                : supported
                  ? "border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20"
                  : "border-zinc-700 bg-zinc-900 opacity-50"
            }`}
          >
            {listening ? (
              <MicOff className="size-5 text-red-300" />
            ) : (
              <Mic className="size-5 text-emerald-300" />
            )}
            {listening && (
              <motion.span
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 1.4, opacity: 0 }}
                transition={{ duration: 1, repeat: Infinity, ease: "easeOut" }}
                className="absolute inset-0 rounded-full border-2 border-red-500/40"
              />
            )}
          </button>

          {/* Waveform */}
          <div className="flex h-12 flex-1 items-center gap-0.5 overflow-hidden rounded-lg border border-zinc-800 bg-black/40 px-2">
            {supported ? (
              bars.map((i) => (
                <motion.div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    backgroundColor: listening ? "#ff4d5e" : "#3ddc84",
                    opacity: listening ? 0.85 : 0.25,
                  }}
                  animate={
                    listening
                      ? { height: [4, 8 + Math.abs(Math.sin(i * 0.7)) * 28, 4] }
                      : { height: 3 }
                  }
                  transition={
                    listening
                      ? {
                          duration: 0.6 + (i % 5) * 0.08,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: i * 0.02,
                        }
                      : { duration: 0.3 }
                  }
                />
              ))
            ) : (
              <div className="flex items-center gap-2 px-2 text-xs text-zinc-500">
                <VolumeX className="size-4" />
                <span>Web Speech API unavailable. Try Chrome.</span>
              </div>
            )}
          </div>

          {/* TTS toggle */}
          <button
            type="button"
            onClick={() => (speaking ? stopSpeaking() : speak("Voice interface online."))}
            aria-label={speaking ? "Stop speaking" : "Test voice"}
            title={speaking ? "Stop speaking" : "Test voice"}
            className={`flex size-10 shrink-0 items-center justify-center rounded-full border transition-all ${
              speaking
                ? "border-amber-500/50 bg-amber-500/15"
                : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
            }`}
          >
            {speaking ? (
              <VolumeX className="size-4 text-amber-300" />
            ) : (
              <Volume2 className="size-4 text-zinc-300" />
            )}
          </button>
        </div>

        {/* Transcript / status panel */}
        <div className="min-h-[3.5rem] rounded-lg border border-zinc-800 bg-black/40 p-2.5 font-mono text-xs">
          <AnimatePresence mode="wait">
            {error ? (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-red-400"
              >
                <Activity className="size-3" />
                <span>ERR: {error}</span>
              </motion.div>
            ) : listening && interim ? (
              <motion.div
                key="interim"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-cyan-300"
              >
                <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                <span className="italic">{interim}…</span>
              </motion.div>
            ) : lastReply ? (
              <motion.div
                key="reply"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 text-amber-300"
              >
                <Volume2 className="mt-0.5 size-3 shrink-0" />
                <span className="leading-relaxed">{lastReply}</span>
              </motion.div>
            ) : lastHeard ? (
              <motion.div
                key="heard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 text-emerald-300"
              >
                <Mic className="mt-0.5 size-3 shrink-0" />
                <span className="leading-relaxed">&ldquo;{lastHeard}&rdquo;</span>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-zinc-600"
              >
                <Mic className="size-3" />
                <span>
                  {supported
                    ? continuous
                      ? "Click the mic to toggle always-on listening."
                      : "Hold SPACE or click the mic, then say a command."
                    : "Voice control unavailable in this browser."}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Command cheatsheet */}
        <div className="grid grid-cols-2 gap-1 font-mono text-[10px] text-zinc-500">
          <CmdExample cmd="scan &lt;codebase&gt;" />
          <CmdExample cmd="show &lt;tab&gt;" />
          <CmdExample cmd="search findings for &lt;query&gt;" />
          <CmdExample cmd="approve patch &lt;id&gt;" />
          <CmdExample cmd="what&apos;s the security posture" />
          <CmdExample cmd="stop" />
        </div>
      </div>
      </>
    );
  },
);

function CmdExample({ cmd }: { cmd: string }) {
  return (
    <div className="truncate rounded border border-zinc-800 bg-zinc-950/60 px-1.5 py-0.5 text-zinc-500">
      <span className="text-emerald-400/60">›</span> {cmd}
    </div>
  );
}
