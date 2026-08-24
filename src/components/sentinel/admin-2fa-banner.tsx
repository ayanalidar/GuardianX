"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ShieldCheck, Loader2, X, Lock } from "lucide-react";

interface AdminTwoFactorBannerProps {
  currentUser?: { id: string; email: string; name: string; role: string } | null;
  /** Navigate to Settings → Security tab. */
  onOpenSettings?: () => void;
}

const DISMISS_KEY = "guardianx-2fa-banner-dismissed";

/**
 * Shows for admins without 2FA enabled. Dismissible per-session
 * (sessionStorage), reappears next browser session.
 */
export function AdminTwoFactorBanner({ currentUser, onOpenSettings }: AdminTwoFactorBannerProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissal when the user changes.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch { /* ignore */ }
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser?.role !== "admin") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEnabled(null);
      return;
    }
    let cancelled = false;
    fetch("/api/2fa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status" }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        setEnabled(data?.enabled === true);
      })
      .catch(() => !cancelled && setEnabled(null));
    return () => {
      cancelled = true;
    };
  }, [currentUser?.role]);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch { /* ignore */ }
  };

  const shouldShow =
    currentUser?.role === "admin" && enabled === false && !dismissed;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-transparent p-3 sm:p-4"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 ring-1 ring-amber-500/30">
            <ShieldAlert className="size-4 text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
              Enable 2FA for account security
              <Lock className="size-3.5" />
            </div>
            <p className="mt-0.5 text-xs text-zinc-400">
              Your admin account can approve users, change roles, and view all client data.
              Protect it with an authenticator app — it takes 30 seconds.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => onOpenSettings?.()}
              className="bg-amber-600 text-white hover:bg-amber-500"
            >
              <ShieldCheck className="size-3.5" /> Enable 2FA
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
      {enabled === null && currentUser?.role === "admin" && !dismissed && (
        <div className="mb-3 flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="size-3 animate-spin" /> Checking 2FA status…
        </div>
      )}
    </AnimatePresence>
  );
}
