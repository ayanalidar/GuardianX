"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { calculatePasswordStrength } from "@/lib/password-strength";

interface PasswordStrengthMeterProps {
  password: string;
}

// Full literal Tailwind class strings per color so the static class
// extractor picks them up. The `calculatePasswordStrength` utility returns
// the color fragment (e.g. "emerald-500"); we map it here to the actual
// classes used for filled bars + the label text.
const FILLED_BAR_CLASSES: Record<string, string> = {
  "red-500": "bg-red-500",
  "orange-500": "bg-orange-500",
  "yellow-500": "bg-yellow-500",
  "lime-500": "bg-lime-500",
  "emerald-500": "bg-emerald-500",
};

const LABEL_TEXT_CLASSES: Record<string, string> = {
  "red-500": "text-red-400",
  "orange-500": "text-orange-400",
  "yellow-500": "text-yellow-400",
  "lime-500": "text-lime-400",
  "emerald-500": "text-emerald-400",
};

const TOTAL_BARS = 4;

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const result = useMemo(
    () => calculatePasswordStrength(password),
    [password]
  );

  // Only render when there's something to show.
  if (!password || password.length === 0) return null;

  const filledClass = FILLED_BAR_CLASSES[result.color] ?? FILLED_BAR_CLASSES["red-500"];
  const labelClass = LABEL_TEXT_CLASSES[result.color] ?? LABEL_TEXT_CLASSES["red-500"];

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.2 }}
      className="mt-2 space-y-1.5"
    >
      {/* Bars + label row */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {Array.from({ length: TOTAL_BARS }).map((_, i) => {
            const isFilled = i < result.score;
            return (
              <div
                key={i}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800"
              >
                <motion.div
                  className={`h-full rounded-full ${isFilled ? filledClass : "bg-transparent"}`}
                  initial={false}
                  animate={{
                    width: isFilled ? "100%" : "0%",
                    opacity: isFilled ? 1 : 0,
                  }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                />
              </div>
            );
          })}
        </div>
        <span className={`text-[11px] font-semibold tabular-nums ${labelClass}`}>
          {result.label}
        </span>
      </div>

      {/* Feedback suggestions */}
      <AnimatePresence initial={false}>
        {result.feedback.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden text-[10.5px] leading-relaxed text-zinc-500"
          >
            {result.feedback.map((tip, i) => (
              <li key={`${tip}-${i}`} className="flex items-start gap-1">
                <span className="mt-px text-zinc-600">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
