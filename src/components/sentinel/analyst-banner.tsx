"use client";

// AnalystBanner
//
// Shown at the top of the dashboard Overview tab for users with
// role === "viewer" (Analyst). It explains what an Analyst can do and how
// to request elevated access. Dismissible for the current browser session —
// the dismissed flag is stored in sessionStorage so a refresh won't bring it
// back, but a brand-new session (closing the tab/window) will show it again.
//
// Non-viewers see nothing.
//
// The component uses a three-state `view` ("loading" → "visible" |
// "dismissed") so that on the very first render after `currentUser` becomes
// a viewer we don't flash the banner before sessionStorage has been read:
// the effect resolves the stored flag and then flips `view` to either
// "visible" or "dismissed".

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Info, X } from "lucide-react";

interface AnalystBannerProps {
  /** Current user. Banner only renders for `role === "viewer"`. */
  currentUser?: { role?: string } | null;
}

const STORAGE_KEY = "guardianx-analyst-banner-dismissed";

type ViewState = "loading" | "visible" | "dismissed";

export function AnalystBanner({ currentUser }: AnalystBannerProps) {
  const [view, setView] = useState<ViewState>("loading");

  useEffect(() => {
    if (currentUser?.role !== "viewer") return;
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      // sessionStorage may be unavailable (private mode / disabled) — fail
      // open and just show the banner.
    }
    // Reading sessionStorage is an external-store sync, which is exactly
    // what effects are for. The lint rule fires on any setState in an
    // effect body, but this is the legitimate pattern (same as the
    // existing localStorage read in page.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setView(dismissed ? "dismissed" : "visible");
  }, [currentUser?.role]);

  // Non-viewers render nothing.
  if (currentUser?.role !== "viewer") return null;
  // While loading the stored flag (or if dismissed), render nothing so we
  // never flash the banner.
  if (view !== "visible") return null;

  const handleDismiss = () => {
    setView("dismissed");
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore — in-memory dismissal still works for the render lifetime
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mb-4 flex flex-col gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2.5">
        <Info className="mt-0.5 size-5 shrink-0 text-sky-400" />
        <div>
          <p className="text-sm font-semibold text-sky-200">
            You are signed in as an Analyst
          </p>
          <p className="mt-0.5 text-[11px] text-sky-100/70">
            You can upload your own clients and codebases for testing. Contact
            an admin to elevate your access.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss analyst banner"
        title="Dismiss for this session"
        className="shrink-0 self-start rounded-md p-1.5 text-sky-300/70 transition-colors hover:bg-sky-500/15 hover:text-sky-200 sm:self-center"
      >
        <X className="size-4" />
      </button>
    </motion.div>
  );
}
