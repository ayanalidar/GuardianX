"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Cookie, X, ShieldCheck, ExternalLink } from "lucide-react";

const STORAGE_KEY = "guardianx-cookie-consent";

type Consent = "accepted" | "declined" | null;

/**
 * GDPR / DPDPA cookie consent banner. Bottom of screen on first visit.
 * Persists choice in localStorage. Shows on every page until the user
 * accepts or declines.
 */
export function CookieBanner() {
  const [consent, setConsent] = useState<Consent>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Consent;
      if (saved === "accepted" || saved === "declined") {
        setConsent(saved);
      }
    } catch { /* ignore */ }
  }, []);

  const choose = (choice: Exclude<Consent, null>) => {
    setConsent(choice);
    try {
      localStorage.setItem(STORAGE_KEY, choice);
      // Fire a global event so analytics scripts can react.
      window.dispatchEvent(new CustomEvent("guardianx:cookie-consent", { detail: { consent: choice } }));
    } catch { /* ignore */ }
  };

  // SSR safety: don't render anything until mounted so the choice has time to hydrate.
  if (!mounted || consent) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 32 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 32 }}
        transition={{ type: "spring", stiffness: 200, damping: 22 }}
        className="fixed inset-x-2 bottom-2 z-[100] mx-auto max-w-3xl sm:inset-x-4 sm:bottom-4"
        role="dialog"
        aria-live="polite"
        aria-label="Cookie consent"
      >
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/30 bg-zinc-950/95 p-4 shadow-2xl backdrop-blur-md sm:flex-row sm:items-center sm:p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30">
            <Cookie className="size-5 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <ShieldCheck className="size-3.5 text-emerald-400" />
              Cookie consent
            </div>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              We use essential cookies to keep you signed in and remember your preferences, plus
              optional analytics cookies to improve GuardianX. Read our{" "}
              <a
                href="/privacy"
                className="inline-flex items-center gap-0.5 text-emerald-400 underline-offset-2 hover:underline"
              >
                Privacy Policy
                <ExternalLink className="size-2.5" />
              </a>
              .
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => choose("declined")}
              className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
            >
              Decline
            </Button>
            <Button
              size="sm"
              onClick={() => choose("accepted")}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              Accept all
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200 sm:hidden"
              onClick={() => choose("declined")}
              aria-label="Close banner"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
