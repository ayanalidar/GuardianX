"use client";

// PUBLIC phishing simulation landing page (/phishing/sim?id=...)
// ─────────────────────────────────────────────────────────────────────────────
// This page is the destination of every phishing email sent by the Deepfake
// Phishing Simulator. The flow:
//
//   1. Read `?id=...` from the URL.
//   2. POST /api/deepfake-phishing/track → marks the simulation as clicked.
//   3. The page renders a fake "secure video call" UI with a glowing CEO
//      avatar and a transcript of the phishing message, WHILE speaking the
//      message aloud via the Web Speech API (SpeechSynthesis). This mimics
//      a deepfake voice/video of the CEO.
//   4. After 5 seconds the page flips to a "THIS WAS A SIMULATION" reveal
//      explaining what just happened, why it was a phish, and how to spot
//      it next time.
//   5. "Start training" button → routes to a 2-minute training page.
//
// Mobile-first, dark theme, red/amber/emerald accents.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Mic,
  PhoneOff,
  ShieldAlert,
  Sparkles,
  Volume2,
} from "lucide-react";

interface SimPayload {
  targetName: string;
  personaName: string;
  personaRole: string;
  message: string;
}

type Stage = "connecting" | "speaking" | "revealed";

function SimContent() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get("id");

  const [sim, setSim] = useState<SimPayload | null>(null);
  const [stage, setStage] = useState<Stage>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const revealedRef = useRef(false);

  // The "missing simulation ID" case is derived from the URL — render the
  // error UI directly rather than capturing it via state.
  const missingId = !id;

  // 1. POST /api/deepfake-phishing/track on mount (only when id is present).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/deepfake-phishing/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ simulationId: id }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          simulation?: SimPayload;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Failed to load simulation.");
          return;
        }
        if (!data.simulation) {
          setError("Simulation payload missing.");
          return;
        }
        setSim(data.simulation);
        setStage("speaking");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Network error");
        }
      }
    })();
    return () => {
      cancelled = true;
      // Stop any in-flight TTS if the user navigates away mid-speech.
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [id]);

  // 2. Speak the phishing message via Web Speech API when stage === "speaking".
  useEffect(() => {
    if (stage !== "speaking" || !sim) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      // No TTS available — still reveal after 5s.
      const t = setTimeout(() => setStage("revealed"), 5_000);
      return () => clearTimeout(t);
    }

    const synth = window.speechSynthesis;
    synth.cancel();

    const utter = new SpeechSynthesisUtterance(sim.message);
    // Try to pick a voice that matches the persona (male for "CEO", etc.).
    // Heuristic: prefer en-US male voices for "CEO" personas.
    const voices = synth.getVoices();
    const preferredVoice =
      voices.find((v) => v.lang.startsWith("en") && /male|david|mark|alex|daniel/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith("en")) ||
      voices[0];
    if (preferredVoice) utter.voice = preferredVoice;
    utter.rate = 0.95;
    utter.pitch = 0.9; // slightly lower pitch for "CEO" tone

    utter.onstart = () => setSpeaking(true);
    utter.onend = () => {
      setSpeaking(false);
      if (!revealedRef.current) {
        revealedRef.current = true;
        setStage("revealed");
      }
    };
    utter.onerror = () => {
      setSpeaking(false);
      if (!revealedRef.current) {
        revealedRef.current = true;
        setStage("revealed");
      }
    };

    synth.speak(utter);

    // Safety net: even if TTS stalls, reveal after 6s.
    const safety = setTimeout(() => {
      if (!revealedRef.current) {
        revealedRef.current = true;
        synth.cancel();
        setStage("revealed");
      }
    }, 6_000);

    return () => {
      clearTimeout(safety);
      synth.cancel();
    };
  }, [stage, sim]);

  // 3. Always reveal after 5s, even if TTS is still going.
  useEffect(() => {
    if (stage !== "speaking") return;
    const t = setTimeout(() => {
      if (!revealedRef.current) {
        revealedRef.current = true;
        if (typeof window !== "undefined" && "speechSynthesis" in window) {
          window.speechSynthesis.cancel();
        }
        setStage("revealed");
      }
    }, 5_000);
    return () => clearTimeout(t);
  }, [stage]);

  // ── Error state (missing id or fetch failure) ────────────────────────────
  if (missingId || error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-center">
        <AlertTriangle className="size-12 text-amber-400" />
        <h1 className="mt-4 font-mono text-lg font-bold text-zinc-100">
          Simulation link invalid
        </h1>
        <p className="mt-2 max-w-md text-sm text-zinc-400">
          {missingId ? "Missing simulation ID." : error}
        </p>
      </div>
    );
  }

  // ── Connecting state ───────────────────────────────────────────────────
  if (stage === "connecting" || !sim) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-center">
        <Loader2 className="size-10 animate-spin text-emerald-400" />
        <p className="mt-4 font-mono text-sm text-zinc-400">Establishing secure video call…</p>
      </div>
    );
  }

  // ── Speaking state (fake CEO video call) ───────────────────────────────
  if (stage === "speaking") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 px-4 py-8 text-zinc-100">
        <div className="mx-auto max-w-2xl">
          {/* Call header */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-emerald-500 pulse-dot" />
              <span className="font-mono text-[11px] uppercase tracking-widest text-emerald-400">
                Encrypted · Live
              </span>
            </div>
            <span className="font-mono text-[11px] text-zinc-500">
              {new Date().toLocaleTimeString()}
            </span>
          </div>

          {/* CEO avatar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 180, damping: 22 }}
            className="relative mx-auto aspect-video w-full max-w-md overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-zinc-900 to-zinc-950 shadow-2xl"
          >
            {/* "Camera feed" placeholder */}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.div
                animate={{
                  boxShadow: speaking
                    ? ["0 0 30px rgba(16,185,129,0.4)", "0 0 80px rgba(16,185,129,0.7)", "0 0 30px rgba(16,185,129,0.4)"]
                    : "0 0 20px rgba(16,185,129,0.2)",
                }}
                transition={{ duration: 1.4, repeat: speaking ? Infinity : 0 }}
                className="flex size-32 items-center justify-center rounded-full border-2 border-emerald-500/60 bg-emerald-500/10 sm:size-40"
              >
                <span className="font-mono text-4xl font-bold text-emerald-300 sm:text-5xl">
                  {sim.personaName.charAt(0)}
                </span>
              </motion.div>
            </div>
            {/* Audio waveform indicator */}
            {speaking && (
              <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-end gap-0.5">
                {Array.from({ length: 12 }).map((_, i) => (
                  <motion.span
                    key={i}
                    className="w-1 rounded-full bg-emerald-400/80"
                    animate={{ height: [4, 18, 6, 14, 4] }}
                    transition={{
                      duration: 0.8,
                      repeat: Infinity,
                      delay: i * 0.06,
                    }}
                  />
                ))}
              </div>
            )}
            {/* Name caption */}
            <div className="absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 backdrop-blur">
              <div className="text-[11px] font-bold text-emerald-300">{sim.personaName}</div>
              <div className="text-[9px] text-zinc-400">{sim.personaRole}</div>
            </div>
            <div className="absolute right-3 top-3 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 backdrop-blur">
              <Mic className="size-3 text-emerald-400" />
              <span className="text-[9px] font-mono text-emerald-300">LIVE</span>
            </div>
          </motion.div>

          {/* Transcript (the phishing message) */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
          >
            <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              <Volume2 className="size-3 text-emerald-400" />
              Live transcription
            </div>
            <p className="text-sm leading-relaxed text-zinc-200">{sim.message}</p>
          </motion.div>

          <p className="mt-6 text-center font-mono text-[10px] text-zinc-600">
            listening · {speaking ? "speaking" : "paused"} · do not share credentials
          </p>
        </div>
      </div>
    );
  }

  // ── Revealed state ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-950/30 via-zinc-950 to-zinc-950 px-4 py-10 text-zinc-100">
      <div className="mx-auto max-w-2xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
          className="rounded-2xl border border-rose-500/40 bg-rose-500/5 p-6 sm:p-8"
        >
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-full border border-rose-500/40 bg-rose-500/10">
              <ShieldAlert className="size-6 text-rose-400" />
            </div>
            <div>
              <h1 className="font-mono text-xl font-bold uppercase tracking-tight text-rose-300">
                This was a simulation
              </h1>
              <p className="text-xs text-rose-300/70">
                GuardianX Deepfake Phishing Defense · no real harm done
              </p>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-zinc-300">
            The voice you just heard was generated entirely in your browser using the
            Web Speech API — there was no real call from{" "}
            <span className="font-semibold text-zinc-100">{sim.personaName}</span> (
            {sim.personaRole}). This is exactly how a deepfake phishing attack works:
          </p>

          <ol className="mt-4 space-y-2 text-sm text-zinc-300">
            {[
              "Attacker clones the executive's voice with AI (5 seconds of audio is enough).",
              "Attacker sends you a 'voice message' link via email or chat.",
              "When you click, the deepfake plays — pressuring you to act fast.",
              "If you had followed the instructions, you'd have wired money or leaked data.",
            ].map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-rose-500/20 font-mono text-[10px] font-bold text-rose-300">
                  {i + 1}
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ol>

          <div className="mt-5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-amber-400">
              <Sparkles className="size-3" /> Red flags you should have caught
            </div>
            <ul className="space-y-1 text-xs text-amber-200/90">
              <li>• Urgency + secrecy ("don't put it in writing")</li>
              <li>• Unsolicited link from an executive you don't usually hear from</li>
              <li>• The "voice" sounded slightly robotic or had odd pauses</li>
              <li>• No verifiable second channel (call back via known number)</li>
            </ul>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => router.push("/phishing/sim?stage=training")}
              className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-500"
            >
              Start training (2 min)
            </button>
            <button
              onClick={() => router.push("/")}
              className="rounded-lg border border-zinc-700 px-4 py-3 text-sm font-medium text-zinc-300 transition hover:bg-zinc-800"
            >
              Dismiss
            </button>
          </div>

          <div className="mt-6 flex items-center gap-2 text-[10px] text-zinc-500">
            <CheckCircle2 className="size-3 text-emerald-400" />
            Your click has been recorded. Training completion will be tracked.
          </div>
        </motion.div>

        <AnimatePresence>
          {params.get("stage") === "training" && <TrainingPanel sim={sim} id={id} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Inline training panel (rendered when stage=training is in the URL) ─────
function TrainingPanel({ sim, id }: { sim: SimPayload; id: string | null }) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const markedRef = useRef(false);

  const steps = [
    {
      title: "Verify the channel",
      body: "Always verify an urgent executive request via a SECOND channel you already trust (their known phone number, Slack DM, in-person). Never reply to the email link itself.",
    },
    {
      title: "Listen for the tells",
      body: "Deepfake audio often has flat intonation, odd pauses, or a metallic edge. Real executives have natural hesitations, coughs, background noise.",
    },
    {
      title: "Slow it down",
      body: "Phishing thrives on urgency. Real executives accept 'let me call you right back' — attackers panic. Take 60 seconds before acting on any urgent financial ask.",
    },
    {
      title: "Report it",
      body: "Forward the suspicious message to your security team (security@yourcompany.com) so they can warn colleagues and add the sender to blocklists.",
    },
  ];

  // Mark simulation as trained when the user reaches the final step.
  useEffect(() => {
    if (step < steps.length - 1) return;
    if (markedRef.current || !id) return;
    markedRef.current = true;
    // Use the track endpoint to also bump status to "trained" — we send an
    // extra flag here via query string since the API is intentionally minimal.
    void fetch("/api/deepfake-phishing/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simulationId: id }),
    }).catch(() => {
      /* best-effort */
    });
  }, [step, steps.length, id]);

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else setDone(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6"
    >
      <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-emerald-400">
        <Sparkles className="size-3" /> 2-minute training · step {step + 1}/{steps.length}
      </div>
      {!done ? (
        <>
          <h3 className="text-lg font-bold text-emerald-200">{steps[step].title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">{steps[step].body}</p>
          <div className="mt-4 flex gap-2">
            <button
              onClick={next}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500"
            >
              {step < steps.length - 1 ? "Next" : "Finish"}
            </button>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-800">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${((step + 1) / steps.length) * 100}%` }}
            />
          </div>
        </>
      ) : (
        <div className="text-center">
          <CheckCircle2 className="mx-auto size-12 text-emerald-400" />
          <h3 className="mt-3 text-xl font-bold text-emerald-200">Training complete</h3>
          <p className="mt-2 text-sm text-zinc-300">
            Nice work, {sim.targetName.split(" ")[0]}. You now know how to spot a
            deepfake phish. Stay alert — attackers are getting better every week.
          </p>
        </div>
      )}
    </motion.div>
  );
}

export default function PhishingSimPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
          <Loader2 className="size-10 animate-spin text-emerald-400" />
        </div>
      }
    >
      <SimContent />
    </Suspense>
  );
}
