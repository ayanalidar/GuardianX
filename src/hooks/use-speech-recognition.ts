"use client";

/**
 * useSpeechRecognition — shared voice engine for GuardianX
 * =========================================================
 * One hook that owns the Web Speech API `SpeechRecognition` instance,
 * auto-restart-on-silence, barge-in (speaking interrupts TTS), a real
 * Web Audio `AnalyserNode` waveform, and streaming text-to-speech.
 *
 * Both `<VoiceControl>` (War Room) and `<AgentX>` (dashboard tab)
 * delegate to this hook. Callers wire `onFinalTranscript` to either
 * `parseVoiceCommand(transcript)` (War Room) or `sendMessage(transcript)`
 * (Agent X).
 *
 * Features:
 *   - **Always-on by default.** `continuous=true` + auto-restart in
 *     `onend` after Chrome's ~60s silence timeout. `userStoppedRef`
 *     gates the restart so an explicit stop doesn't resurrect a dead
 *     session.
 *   - **Barge-in.** `onsoundstart` / `onspeechstart` cancel any
 *     in-flight TTS so the user can interrupt the assistant.
 *   - **Real waveform.** Lazily acquires `getUserMedia` + builds an
 *     `AnalyserNode` for a real frequency-bar `<canvas>` waveform.
 *   - **Streaming TTS.** `speak(text)` splits into sentences and
 *     plays them sequentially.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// ── Minimal Web Speech API ambient types ─────────────────────────────────
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
  onsoundstart: (() => void) | null;
  onspeechstart: (() => void) | null;
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

// ── Voice persona picker ──────────────────────────────────────────────────
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

// ── Sentence splitter (for streaming TTS) ──────────────────────────────────
function splitIntoSentences(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const matches = trimmed.match(/[^.!?]*[.!?]+|[^.!?]+$/g);
  if (!matches) return [trimmed];
  return matches.map((s) => s.trim()).filter((s) => s.length > 0);
}

// ── Public types ──────────────────────────────────────────────────────────

export interface UseSpeechRecognitionOptions {
  continuous?: boolean;
  onFinalTranscript?: (text: string) => void;
  onInterim?: (text: string) => void;
  enabled?: boolean;
  lang?: string;
  voicePersona?: "agent" | "analyst";
}

export interface UseSpeechRecognitionReturn {
  supported: boolean;
  listening: boolean;
  speaking: boolean;
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  speak: (text: string, opts?: { interrupt?: boolean }) => void;
  stopSpeaking: () => void;
  analyser: AnalyserNode | null;
  micActive: boolean;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useSpeechRecognition(
  opts: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionReturn {
  const {
    continuous = true,
    onFinalTranscript,
    onInterim,
    enabled = true,
    lang = "en-US",
    voicePersona = "analyst",
  } = opts;

  // Stable refs for latest callbacks/gates
  const onFinalRef = useRef(onFinalTranscript);
  const onInterimRef = useRef(onInterim);
  const enabledRef = useRef(enabled);
  const continuousRef = useRef(continuous);
  const langRef = useRef(lang);
  const personaRef = useRef(voicePersona);
  useEffect(() => { onFinalRef.current = onFinalTranscript; }, [onFinalTranscript]);
  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { continuousRef.current = continuous; }, [continuous]);
  useEffect(() => { langRef.current = lang; }, [lang]);
  useEffect(() => { personaRef.current = voicePersona; }, [voicePersona]);

  // Refs: recognizer + Web Audio
  const ctorRef = useRef<SpeechRecognitionCtor | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const userStoppedRef = useRef(true);
  const speakingRef = useRef(false);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const supported = useSyncExternalStore(
    () => () => {},
    () => !!getSpeechRecognitionCtor(),
    () => false,
  );

  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [analyserState, setAnalyserState] = useState<AnalyserNode | null>(null);
  const [micActive, setMicActive] = useState(false);

  // Init: cache ctor + warm TTS voices
  useEffect(() => {
    ctorRef.current = getSpeechRecognitionCtor();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const loadVoices = () => { voicesRef.current = window.speechSynthesis.getVoices(); };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
      return () => { window.speechSynthesis.onvoiceschanged = null; };
    }
    return;
  }, []);

  // Build a recognizer (lazy, memoized)
  const ensureRecognition = useCallback((): SpeechRecognitionLike | null => {
    if (!ctorRef.current) return null;
    if (recRef.current) return recRef.current;
    const rec = new ctorRef.current();
    rec.lang = langRef.current;
    rec.continuous = continuousRef.current;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      userStoppedRef.current = false;
      setListening(true);
      setError(null);
    };

    // Barge-in: user started making noise → cancel TTS
    rec.onsoundstart = () => {
      if (speakingRef.current) {
        try { window.speechSynthesis.cancel(); } catch { /* noop */ }
        speakingRef.current = false;
        setSpeaking(false);
      }
    };
    rec.onspeechstart = rec.onsoundstart;
    rec.onsoundend = () => { /* VAD bookkeeping */ };

    rec.onresult = (ev: SpeechRecognitionEventLike) => {
      let interimText = "";
      let finalText = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const r = ev.results[i];
        const alt = r[0];
        if (!alt) continue;
        if (r.isFinal) finalText += alt.transcript;
        else interimText += alt.transcript;
      }
      if (interimText) {
        setInterim(interimText);
        onInterimRef.current?.(interimText);
      }
      if (finalText.trim()) {
        setInterim("");
        onFinalRef.current?.(finalText.trim());
      }
    };

    rec.onerror = (ev: SpeechRecognitionErrorEventLike) => {
      if (ev.error === "no-speech" || ev.error === "aborted") return;
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setError("Mic permission denied");
      } else if (ev.error === "network") {
        setError("Network error during recognition");
      } else {
        setError(ev.error || "speech_error");
      }
      setListening(false);
    };

    rec.onend = () => {
      setListening(false);
      setInterim("");
      // Auto-restart gate: don't restart if user stopped, TTS is playing,
      // or parent disabled us.
      if (userStoppedRef.current || speakingRef.current || !enabledRef.current) {
        return;
      }
      try {
        rec.start();
      } catch {
        // InvalidStateError — retry once on next tick
        setTimeout(() => {
          if (userStoppedRef.current || speakingRef.current || !enabledRef.current) return;
          try { rec.start(); } catch { /* give up — onend will fire again */ }
        }, 250);
      }
    };

    recRef.current = rec;
    return rec;
  }, []);

  // Web Audio: acquire mic stream + build AnalyserNode
  const ensureMicAnalyser = useCallback(async () => {
    if (analyserRef.current) return;
    if (typeof window === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      micStreamRef.current = stream;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.7;
      src.connect(analyser);
      analyserRef.current = analyser;
      setAnalyserState(analyser);
      setMicActive(true);
    } catch { /* Permission denied — waveform stays empty */ }
  }, []);

  const stopMicAnalyser = useCallback(() => {
    if (micStreamRef.current) {
      for (const track of micStreamRef.current.getTracks()) {
        try { track.stop(); } catch { /* noop */ }
      }
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      try { void audioCtxRef.current.close(); } catch { /* noop */ }
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setAnalyserState(null);
    setMicActive(false);
  }, []);

  // Start / stop
  const start = useCallback(() => {
    const rec = ensureRecognition();
    if (!rec) return;
    userStoppedRef.current = false;
    try { rec.start(); } catch { /* InvalidStateError if start() raced */ }
    void ensureMicAnalyser();
  }, [ensureRecognition, ensureMicAnalyser]);

  const stop = useCallback(() => {
    userStoppedRef.current = true;
    const rec = recRef.current;
    if (!rec) return;
    try { rec.stop(); } catch { /* noop */ }
    stopMicAnalyser();
  }, [stopMicAnalyser]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Streaming TTS
  const speak = useCallback((text: string, opts?: { interrupt?: boolean }) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const synth = window.speechSynthesis;
    if (opts?.interrupt !== false) synth.cancel();

    const chunks = splitIntoSentences(trimmed);
    if (chunks.length === 0) return;

    const voices = voicesRef.current.length ? voicesRef.current : synth.getVoices();
    const preferred = pickPersonaVoice(voices);

    speakingRef.current = true;
    setSpeaking(true);

    // Pause recognizer while speaking (prevents TTS being picked up as speech)
    const wasListening = listening;
    if (wasListening) {
      try { recRef.current?.stop(); } catch { /* noop */ }
    }

    const isAgent = personaRef.current === "agent";
    let idx = 0;
    const speakNext = () => {
      if (idx >= chunks.length) {
        speakingRef.current = false;
        setSpeaking(false);
        // Restart listening if it was live before
        if (wasListening && enabledRef.current && !userStoppedRef.current) {
          try { recRef.current?.start(); } catch { /* onend will retry */ }
        }
        return;
      }
      const chunk = chunks[idx];
      idx += 1;
      const u = new SpeechSynthesisUtterance(chunk);
      if (preferred) u.voice = preferred;
      u.rate = isAgent ? 0.95 : 1.05;
      u.pitch = isAgent ? 0.85 : 0.95;
      u.volume = 1;
      u.onend = () => { window.setTimeout(speakNext, 0); };
      u.onerror = () => {
        speakingRef.current = false;
        setSpeaking(false);
      };
      synth.speak(u);
    };
    speakNext();
  }, [listening]);

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    speakingRef.current = false;
    setSpeaking(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      userStoppedRef.current = true;
      try { recRef.current?.abort(); } catch { /* noop */ }
      stopMicAnalyser();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [stopMicAnalyser]);

  // Re-sync recognizer config when continuous changes
  useEffect(() => {
    if (recRef.current) recRef.current.continuous = continuous;
  }, [continuous]);

  return {
    supported, listening, speaking, interim, error,
    start, stop, toggle, speak, stopSpeaking,
    analyser: analyserState, micActive,
  };
}

// ── Waveform renderer ───────────────────────────────────────────────────────
export function drawWaveform(
  analyser: AnalyserNode | null,
  ctx2d: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx2d.clearRect(0, 0, width, height);
  if (!analyser) return;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);
  const barCount = Math.min(bufferLength, 32);
  const gap = 2;
  const barWidth = (width - gap * (barCount - 1)) / barCount;
  for (let i = 0; i < barCount; i++) {
    const v = dataArray[i] / 255;
    const barH = Math.max(2, v * height);
    const x = i * (barWidth + gap);
    const y = (height - barH) / 2;
    const grad = ctx2d.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, "rgba(16,185,129,0.9)");
    grad.addColorStop(1, "rgba(34,211,238,0.7)");
    ctx2d.fillStyle = grad;
    ctx2d.fillRect(x, y, barWidth, barH);
  }
}
