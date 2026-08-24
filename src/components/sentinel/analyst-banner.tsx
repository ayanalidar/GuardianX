"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Eye, X, Upload, ShieldCheck } from "lucide-react";

interface AnalystBannerProps {
  currentUser?: { id: string; email: string; name: string; role: string } | null;
  /** Navigate to a tab — used by the "Upload your own client" CTA. */
  onNavigate?: (tab: "clients") => void;
}

const DISMISS_KEY = "guardianx-analyst-banner-dismissed";

/**
 * Info banner for viewers (role === "viewer"). Tells them they're
 * signed in as an Analyst and can upload their own clients for testing.
 * Dismissible per-session.
 */
export function AnalystBanner({ currentUser, onNavigate }: AnalystBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch { /* ignore */ }
  }, [currentUser?.id]);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch { /* ignore */ }
  };

  const shouldShow = currentUser?.role === "viewer" && !dismissed;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-500/40 bg-gradient-to-r from-sky-500/10 via-emerald-500/5 to-transparent p-3 sm:p-4"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 ring-1 ring-sky-500/30">
            <Eye className="size-4 text-sky-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-sky-300">
              You are signed in as an Analyst
              <ShieldCheck className="size-3.5 text-emerald-400" />
            </div>
            <p className="mt-0.5 text-xs text-zinc-400">
              You have read-only access to the platform. Upload your own clients and codebases for
              testing — patches stay scoped to your workspace and won&apos;t affect other users.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => onNavigate?.("clients")}
              className="border-sky-500/40 bg-sky-500/5 text-sky-300 hover:bg-sky-500/15"
            >
              <Upload className="size-3.5" /> Upload your own client
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200"
              onClick={dismiss}
              aria-label="Dismiss for this session"
            >
              <X className="size-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
