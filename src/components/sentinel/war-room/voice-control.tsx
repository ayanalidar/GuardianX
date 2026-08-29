"use client";

/**
 * VoiceControl
 * ------------
 * Command-and-control voice interface for the GuardianX War Room.
 *
 * Built on the shared `useSpeechRecognition` hook — one engine shared
 * with `<AgentX>`. This file is just the command parser + UI chrome.
 *
 * Features (via the hook):
 *   - Always-on by default (auto-restarts after Chrome's ~60s silence
 *     timeout — no need to re-tap the mic per utterance).
 *   - Barge-in: speaking interrupts TTS.
 *   - Real Web Audio AnalyserNode waveform on a <canvas>.
 *   - Streaming sentence-by-sentence TTS.
 *
 * Voice commands:
 *   "scan <codebase>"             → { action: "scan", target }
 *   "show <tab>"                  → { action: "navigate", target }
 *   "search findings for <query>" → { action: "search", target }
 *   "approve patch <id>"           → { action: "approve", target }
 *   "what's the security posture" → { action: "status" }
 *   "stop"                         → cancels TTS playback
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Volume2, VolumeX, Radio, Activity } from "lucide-react";
import {
  useSpeechRecognition,
  drawWaveform,
} from "@/hooks/use-speech-recognition";

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
  speak(text: string, opts?: { interrupt?: boolean }): void;
  stopSpeaking(): void;
  startListening(): void;
  stopListening(): void;
  isSupported(): boolean;
}

export interface VoiceControlState {
  listening: boolean;
  speaking: boolean;
  interim: string;
  supported: boolean;
}

export interface VoiceControlProps {
  onCommand?: (cmd: VoiceCommand) => void;
  speakResponses?: boolean;
  compact?: boolean;
  /** Continuous (always-on) listening. Default true. */
  continuous?: boolean;
  onStateChange?: (state: VoiceControlState) => void;
  className?: string;
}

// ── Command parser ────────────────────────────────────────────────────────
export function parseVoiceCommand(raw: string): VoiceCommand {
  const text = raw.trim().replace(/\s+/g, " ").toLowerCase();
  if (!text) return { action: "unknown", raw };

  if (/^(stop|quiet|silence|shut up|cancel reading)$/.test(text)) {
    return { action: "stop" };
  }

  if (/(security|security posture|posture|status report|threat level|how are we doing)/.test(text)) {
    return { action: "status" };
  }

  let m = text.match(/^scan\s+(.+)$/);
  if (m && m[1]) return { action: "scan", target: m[1] };

  m = text.match(/^(show|go to|open|switch to|view)\s+(.+)$/);
  if (m && m[2]) return { action: "navigate", target: m[2] };

  m = text.match(/^(?:search|find)\s+(?:findings?\s+(?:for|containing|matching)\s+|for\s+)?(.+)$/);
  if (m && m[1] && /^(search|find)\b/.test(text)) {
    return { action: "search", target: m[1] };
  }

  m = text.match(/^approve\s+patch\s+(.+)$/);
  if (m && m[1]) return { action: "approve", target: m[1] };

  return { action: "unknown", raw };
}

// ── Component ──────────────────────────────────────────────────────────────
export const VoiceControl = forwardRef<VoiceControlHandle, VoiceControlProps>(
  function VoiceControl(
    { onCommand, speakResponses = true, compact = false, continuous = true, onStateChange, className },
    ref,
  ) {
    const [lastHeard, setLastHeard] = useState("");
    const [lastReply, setLastReply] = useState("");

    // Refs so dispatchCommand can call speak/stopSpeaking without re-creating
    const speakRef = useRef<(text: string, opts?: { interrupt?: boolean }) => void>(() => {});
    const stopSpeakingRef = useRef<() => void>(() => {});

    // Dispatch a parsed command
    const dispatchCommand = useCallback(
      async (cmd: VoiceCommand) => {
        if (cmd.action === "stop") {
          stopSpeakingRef.current();
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
            speakRef.current(data.message, { interrupt: true });
          }
        } catch { /* swallow */ }
      },
      [onCommand, speakResponses],
    );

    // The shared voice engine
    const onFinal = useCallback(
      (text: string) => {
        setLastHeard(text);
        const cmd = parseVoiceCommand(text);
        void dispatchCommand(cmd);
      },
      [dispatchCommand],
    );

    const voice = useSpeechRecognition({
      continuous,
      onFinalTranscript: onFinal,
      voicePersona: "analyst",
    });
    const { supported, listening, speaking, interim, error } = voice;

    // Keep refs in sync
    useEffect(() => { speakRef.current = voice.speak; }, [voice.speak]);
    useEffect(() => { stopSpeakingRef.current = voice.stopSpeaking; }, [voice.stopSpeaking]);

    // Imperative handle
    useImperativeHandle(
      ref,
      (): VoiceControlHandle => ({
        speak: voice.speak,
        stopSpeaking: voice.stopSpeaking,
        startListening: voice.start,
        stopListening: voice.stop,
        isSupported: () => supported,
      }),
      [voice.speak, voice.stopSpeaking, voice.start, voice.stop, supported],
    );

    // Mirror state to parent
    useEffect(() => {
      onStateChange?.({ listening, speaking, interim, supported });
    }, [listening, speaking, interim, supported, onStateChange]);

    // Real waveform canvas
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);
    useEffect(() => {
      if (!listening || speaking) {
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx2d = canvas.getContext("2d");
          if (ctx2d) ctx2d.clearRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;
      const draw = () => {
        drawWaveform(voice.analyser, ctx2d, canvas.width, canvas.height);
        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);
      return () => {
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
      };
    }, [listening, speaking, voice.analyser]);

    const handleTestSpeak = useCallback(() => {
      voice.speak("Voice interface online.");
      setLastReply("Voice interface online.");
    }, [voice]);

    const ringColor = listening ? "#ff4d5e" : speaking ? "#e7c368" : supported ? "#3ddc84" : "#71717a";
    const statusLabel = !supported ? "VOICE UNSUPPORTED" : listening ? "LISTENING" : speaking ? "SPEAKING" : "VOICE IDLE";

    // Floating "voice status" chip (continuous mode only)
    const floatingStatus =
      continuous && supported ? (
        <div className="pointer-events-none fixed left-1/2 top-2 z-[90] -translate-x-1/2" aria-hidden="true">
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-zinc-950/80 px-3 py-1.5 backdrop-blur-md">
            <span className={`size-1.5 rounded-full ${listening ? "animate-pulse bg-emerald-400" : "bg-zinc-600"}`} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-300/90">
              {listening ? "LISTENING" : "IDLE"}
            </span>
            {interim ? (
              <span className="hidden max-w-[40vw] truncate font-mono text-[10px] italic text-zinc-400 sm:inline">{interim}</span>
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
              onClick={voice.toggle}
              aria-label={listening ? "Stop listening" : "Start voice command"}
              className={`relative flex size-10 items-center justify-center rounded-full border transition-all ${
                listening ? "border-red-500/60 bg-red-500/20" : supported ? "border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20" : "border-zinc-700 bg-zinc-900 opacity-50"
              }`}
            >
              {listening ? <MicOff className="size-4 text-red-300" /> : <Mic className="size-4 text-emerald-300" />}
              {listening && <span className="absolute inset-0 animate-ping rounded-full border border-red-500/40" style={{ animationDuration: "1s" }} />}
            </button>
            {speaking && (
              <button
                type="button"
                onClick={voice.stopSpeaking}
                aria-label="Stop speaking"
                className="flex size-10 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20"
              >
                <VolumeX className="size-4 text-amber-300" />
              </button>
            )}
            <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{statusLabel}</div>
          </div>
        </>
      );
    }

    return (
      <>
        {floatingStatus}
        <div className={`flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-zinc-950/80 p-4 backdrop-blur-xl ${className ?? ""}`}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="size-4 text-emerald-400" />
            <span className="font-mono text-xs uppercase tracking-widest text-emerald-400/80">Voice Control</span>
          </div>
          <div className="flex items-center gap-1.5">
            {continuous && (
              <span className="flex items-center gap-1 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-emerald-300">
                <span className="size-1 animate-pulse rounded-full bg-emerald-400" />
                CONTINUOUS
              </span>
            )}
            <span className="size-1.5 rounded-full" style={{ backgroundColor: ringColor }} />
            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{statusLabel}</span>
          </div>
        </div>

        {/* Mic + waveform */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!supported}
            onClick={voice.toggle}
            aria-label={listening ? "Stop listening" : "Start voice command"}
            title={supported ? "Click to talk (always-on). ESC stops." : "SpeechRecognition not available in this browser"}
            className={`relative flex size-14 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
              listening ? "border-red-500/60 bg-red-500/20" : supported ? "border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20" : "border-zinc-700 bg-zinc-900 opacity-50"
            }`}
          >
            {listening ? <MicOff className="size-5 text-red-300" /> : <Mic className="size-5 text-emerald-300" />}
            {listening && (
              <motion.span
                initial={{ scale: 1, opacity: 0.6 }}
                animate={{ scale: 1.4, opacity: 0 }}
                transition={{ duration: 1, repeat: Infinity, ease: "easeOut" }}
                className="absolute inset-0 rounded-full border-2 border-red-500/40"
              />
            )}
          </button>

          {/* Real waveform (Web Audio AnalyserNode) */}
          <div className="flex h-12 flex-1 items-center gap-0.5 overflow-hidden rounded-lg border border-zinc-800 bg-black/40 px-2">
            {supported ? (
              <canvas ref={canvasRef} width={280} height={40} className="h-full w-full" aria-hidden="true" />
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
            onClick={() => (speaking ? voice.stopSpeaking() : handleTestSpeak())}
            aria-label={speaking ? "Stop speaking" : "Test voice"}
            title={speaking ? "Stop speaking" : "Test voice"}
            className={`flex size-10 shrink-0 items-center justify-center rounded-full border transition-all ${
              speaking ? "border-amber-500/50 bg-amber-500/15" : "border-zinc-700 bg-zinc-900 hover:bg-zinc-800"
            }`}
          >
            {speaking ? <VolumeX className="size-4 text-amber-300" /> : <Volume2 className="size-4 text-zinc-300" />}
          </button>
        </div>

        {/* Transcript / status panel */}
        <div className="min-h-[3.5rem] rounded-lg border border-zinc-800 bg-black/40 p-2.5 font-mono text-xs">
          <AnimatePresence mode="wait">
            {error ? (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-red-400">
                <Activity className="size-3" />
                <span>ERR: {error}</span>
              </motion.div>
            ) : listening && interim ? (
              <motion.div key="interim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-cyan-300">
                <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                <span className="italic">{interim}…</span>
              </motion.div>
            ) : lastReply ? (
              <motion.div key="reply" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-start gap-2 text-amber-300">
                <Volume2 className="mt-0.5 size-3 shrink-0" />
                <span className="leading-relaxed">{lastReply}</span>
              </motion.div>
            ) : lastHeard ? (
              <motion.div key="heard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-start gap-2 text-emerald-300">
                <Mic className="mt-0.5 size-3 shrink-0" />
                <span className="leading-relaxed">&ldquo;{lastHeard}&rdquo;</span>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 text-zinc-600">
                <Mic className="size-3" />
                <span>{supported ? (continuous ? "Click the mic to toggle always-on listening." : "Click the mic, then say a command.") : "Voice control unavailable in this browser."}</span>
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
