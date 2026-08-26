"use client";

// AdminTwoFactorBanner
//
// Shown at the top of the dashboard for admin users who haven't enabled
// TOTP 2FA yet. Per the task spec (#6-2fa-totp, step 8): we do NOT hard-block
// admin login (to avoid lockout) — we just strongly encourage enabling 2FA.
// The banner fetches the current 2FA status on mount from /api/auth/2fa and
// renders nothing if 2FA is already enabled (or if the user isn't an admin).

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ShieldCheck, Loader2, ArrowRight } from "lucide-react";

interface AdminTwoFactorBannerProps {
  /** Current user. Banner only renders for `role === "admin"`. */
  currentUser?: { role?: string } | null;
  /** Called when the user clicks "Enable 2FA" — typically switches the
   *  parent view to the settings → security tab. */
  onEnable: () => void;
}

export function AdminTwoFactorBanner({ currentUser, onEnable }: AdminTwoFactorBannerProps) {
  const [status, setStatus] = useState<{ enabled: boolean; checked: boolean }>({
    enabled: false,
    checked: false,
  });

  useEffect(() => {
    if (currentUser?.role !== "admin") return;
    let cancelled = false;
    fetch("/api/auth/2fa")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setStatus({ enabled: !!data.enabled, checked: true });
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Fail open — if we can't reach the status endpoint, don't nag
          // the user with a banner (the settings page will show the
          // proper state).
          setStatus({ enabled: true, checked: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.role]);

  // Non-admins and admins who already enabled 2FA see nothing.
  if (currentUser?.role !== "admin") return null;
  if (!status.checked) {
    // While loading, render a tiny placeholder so the dashboard doesn't
    // shift when the banner appears.
    return (
      <div className="mb-3 flex h-9 items-center justify-center">
        <Loader2 className="size-3 animate-spin text-zinc-600" />
      </div>
    );
  }
  if (status.enabled) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mb-4 flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-400" />
        <div>
          <p className="text-sm font-semibold text-amber-200">
            Secure your admin account with 2FA
          </p>
          <p className="mt-0.5 text-[11px] text-amber-100/70">
            Your admin account can approve users, manage credentials, and change platform
            settings. A compromised password alone shouldn&apos;t be enough to take it over —
            enable TOTP two-factor authentication now.
          </p>
        </div>
      </div>
      <Button
        onClick={onEnable}
        className="shrink-0 bg-amber-600 text-white hover:bg-amber-500"
      >
        <ShieldCheck className="size-4" />
        Enable 2FA
        <ArrowRight className="size-4" />
      </Button>
    </motion.div>
  );
}
