"use client";

/**
 * CommandCenterVoiceBar
 * ----------------------
 * Command-Center-wide wrapper around the War Room's <VoiceControl>.
 *
 * The VoiceControl component is the speech primitive — it owns the
 * SpeechRecognition instance, parses voice commands, and (optionally)
 * speaks replies. But it's only mounted inside the War Room overlay,
 * so out of War Room the user has no voice access at all.
 *
 * This wrapper mounts a <VoiceControl continuous> as a compact floating
 * chip at the bottom-right of the viewport (above the support-chat
 * button), so the user can talk to GuardianX from anywhere in the
 * Command Center — the scans tab, the findings list, the DFIR panel,
 * etc. — without opening the War Room overlay.
 *
 * Features:
 *   - Always-on (continuous) listening once the user clicks the mic on.
 *   - Live interim transcript in a spring-in panel above the mic.
 *   - 'V' keyboard shortcut to toggle the mic (skips inputs).
 *   - Speaks replies aloud when `speakResponses` is on.
 *   - Routes parsed commands back to the parent via `onCommand`.
 *
 * The component is dark-themed (bg-zinc-950/90, emerald accents,
 * backdrop-blur) and uses NO indigo/blue. Mobile-first: the chip is
 * anchored bottom-right but the transcript panel grows up to the
 * viewport width on small screens.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Radio } from "lucide-react";

import {
  VoiceControl,
  type VoiceControlHandle,
  type VoiceControlState,
  type VoiceCommand,
} from "./war-room/voice-control";

export interface CommandCenterVoiceBarProps {
  /** Route parsed voice commands to the right Command Center tab. */
  onCommand?: (cmd: VoiceCommand) => void;
  /** Speak AI replies aloud. Default false — opt-in for noise-sensitive
   *  environments. */
  speakResponses?: boolean;
  /** Compact floating chip (default true). Set false for a wider panel. */
  compact?: boolean;
  /** Always-on listening mode. Default true. */
  continuous?: boolean;
  /** Extra classes for the outer positioning wrapper. */
  className?: string;
}

export function CommandCenterVoiceBar({
  onCommand,
  speakResponses = false,
  compact = true,
  continuous = true,
  className,
}: CommandCenterVoiceBarProps) {
  const voiceRef = useRef<VoiceControlHandle>(null);
  // Local mirror of VoiceControl's state — kept in sync via the
  // `onStateChange` callback prop. Drives the expanding transcript
  // panel and the mic-button label.
  const [state, setState] = useState<VoiceControlState>({
    listening: false,
    speaking: false,
    interim: "",
    supported: true,
  });

  // VoiceControl fires `onStateChange` on every listening/interim/speaking
  // transition. We store it in a ref-stable callback so VoiceControl's
  // effect doesn't re-subscribe on every render of this wrapper.
  const handleStateChange = useCallback((next: VoiceControlState) => {
    setState(next);
  }, []);

  // Toggle the mic from our own button OR the 'V' keyboard shortcut.
  const toggleListening = useCallback(() => {
    const v = voiceRef.current;
    if (!v) return;
    if (state.listening) {
      v.stopListening();
    } else {
      v.startListening();
    }
  }, [state.listening]);

  // 'V' keyboard shortcut — only when not focused in an input/textarea.
  // Lets the user toggle voice from anywhere in the Command Center
  // without clicking the floating chip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (key !== "v") return;
      // Skip if the user is typing somewhere.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      // Skip modified 'v' (Ctrl+V paste, Cmd+V, etc.).
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      toggleListening();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleListening]);

  const supported = state.supported;
  const listening = state.listening;
  const interim = state.interim;

  return (
    <div
      className={`pointer-events-none fixed bottom-20 right-4 z-[80] flex flex-col items-end gap-2 sm:bottom-24 sm:right-6 ${
        className ?? ""
      }`}
    >
      {/* Live interim transcript — spring-in panel above the mic chip. */}
      <AnimatePresence>
        {listening && (
          <motion.div
            key="transcript"
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="hud-corners pointer-events-auto w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-emerald-500/30 bg-zinc-950/90 p-3 shadow-2xl backdrop-blur-md"
            role="status"
            aria-live="polite"
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />
              <span className="font-mono text-[9px] uppercase tracking-widest text-emerald-400/80">
                Hearing
              </span>
            </div>
            <div className="min-h-[1.5rem] font-mono text-xs leading-relaxed text-emerald-200">
              {interim ? (
                <span className="italic">{interim}&hellip;</span>
              ) : (
                <span className="text-zinc-500">Listening&hellip;</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The mic chip — wraps VoiceControl's compact UI. VoiceControl owns
          the actual mic button + status text + TTS toggle; we just frame
          it in a holo-card chip and add a "click to toggle" affordance by
          attaching our own onClick on the chip wrapper (the underlying
          VoiceControl mic button still works independently). */}
      <div
        className={`hud-corners pointer-events-auto flex items-center gap-2 rounded-full border bg-zinc-950/90 p-1.5 pl-2 backdrop-blur-md ${
          listening
            ? "border-emerald-500/60 shadow-[0_0_24px_rgba(16,185,129,0.25)]"
            : "border-emerald-500/30"
        }`}
      >
        {/* Our own mic toggle button — drives the imperative handle. The
            underlying VoiceControl is rendered visually-hidden INSIDE the
            chip so it still owns the SpeechRecognition instance and shows
            the floating top-center status indicator, but its own mic
            button is suppressed (we provide our own). */}
        <button
          type="button"
          disabled={!supported}
          onClick={toggleListening}
          aria-label={
            !supported
              ? "Voice control unsupported in this browser"
              : listening
                ? "Stop voice command"
                : "Start voice command (V)"
          }
          title={
            supported
              ? listening
                ? "Stop listening (V or click)"
                : "Start listening (V or click)"
              : "Web Speech API unavailable. Try Chrome."
          }
          className={`relative flex size-9 items-center justify-center rounded-full border transition-all ${
            listening
              ? "border-red-500/60 bg-red-500/20"
              : supported
                ? "border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20"
                : "border-zinc-700 bg-zinc-900 opacity-50"
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
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeOut" }}
              className="absolute inset-0 rounded-full border border-red-500/40"
            />
          )}
        </button>

        {/* Status label */}
        <div className="flex flex-col pr-1">
          <div className="flex items-center gap-1">
            <Radio
              className={`size-2.5 ${listening ? "text-emerald-400" : "text-zinc-500"}`}
            />
            <span
              className={`font-mono text-[9px] uppercase tracking-widest ${
                listening ? "neon-emerald text-emerald-300" : "text-zinc-500"
              }`}
            >
              {!supported
                ? "VOICE UNSUPPORTED"
                : listening
                  ? "LISTENING"
                  : state.speaking
                    ? "SPEAKING"
                    : "VOICE IDLE"}
            </span>
          </div>
          <span className="font-mono text-[8px] uppercase tracking-wider text-zinc-600">
            press &lsquo;V&rsquo;
          </span>
        </div>

        {/* VoiceControl — owns the speech logic. Rendered compact (so its
            own chip is small) but visually hidden inside our chip: we
            suppress its mic button via CSS (sr-only on its outer div) so
            only our toggle is visible. The floating top-center status
            indicator it renders (continuous mode) still shows — that's a
            `position: fixed` element that escapes any parent hiding. */}
        <div className="sr-only">
          <VoiceControl
            ref={voiceRef}
            continuous={continuous}
            compact={compact}
            speakResponses={speakResponses}
            onCommand={onCommand}
            onStateChange={handleStateChange}
          />
        </div>
      </div>
    </div>
  );
}

export default CommandCenterVoiceBar;
