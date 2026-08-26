"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Cookie, X } from "lucide-react";
import Link from "next/link";

const CONSENT_KEY = "guardianx-cookie-consent";
const CONSENT_VERSION = 1; // bump when policy changes to re-prompt

interface ConsentRecord {
  version: number;
  accepted: boolean;
  timestamp: string;
}

/**
 * GDPR-style cookie consent banner. Shows on first visit (and whenever the
 * CONSENT_VERSION is bumped). Persists the choice in localStorage. Only
 * essential cookies are used regardless of choice — this banner is about
 * transparency, not gating functionality.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CONSENT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ConsentRecord;
        if (parsed.version === CONSENT_VERSION && parsed.accepted) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setVisible(false);
          return;
        }
      }
      // Small delay so it doesn't flash before page paints
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    } catch {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    const record: ConsentRecord = {
      version: CONSENT_VERSION,
      accepted: true,
      timestamp: new Date().toISOString(),
    };
    try {
      localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
    } catch { /* ignore */ }
    setVisible(false);
  };

  const dismiss = () => {
    // Dismiss without accepting — we won't re-show this session
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-xl border border-zinc-700 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-md sm:flex-row sm:items-center sm:gap-4 sm:p-5">
            <div className="flex shrink-0 items-start gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/15">
                <Cookie className="size-5 text-emerald-400" />
              </div>
            </div>
            <div className="flex-1 text-sm text-zinc-300">
              <p>
                We use essential cookies to keep you logged in and remember your
                preferences. We do not sell your data or use tracking cookies.
                See our{" "}
                <Link href="/privacy" className="font-medium text-emerald-400 underline-offset-2 hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                onClick={dismiss}
                variant="outline"
                size="sm"
                className="border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                Decline
              </Button>
              <Button
                onClick={accept}
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-500"
              >
                Accept
              </Button>
              <button
                onClick={dismiss}
                className="ml-1 text-zinc-500 hover:text-zinc-300"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
