"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Loader2, MailCheck, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";

function VerifyEmailForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">(
    token ? "idle" : "error"
  );
  const [message, setMessage] = useState(
    token
      ? ""
      : "This verification link is invalid. Please use the link from your email."
  );

  // Auto-submit the verification request once on mount (if we have a token).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const run = async () => {
      setStatus("submitting");
      setMessage("");
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (cancelled) return;

        if (res.ok && data.ok) {
          setStatus("success");
          setMessage(data.message || "Email verified. You can now log in.");
        } else {
          setStatus("error");
          setMessage(data.error || "Failed to verify email. Please try again.");
        }
      } catch {
        if (cancelled) return;
        setStatus("error");
        setMessage("Network error. Please try again.");
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (status === "success") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto w-full max-w-md text-center"
      >
        <div className="mb-6 flex justify-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/15">
            <CheckCircle2 className="size-8 text-emerald-400" />
          </div>
        </div>
        <h1 className="mb-2 text-2xl font-bold text-zinc-100">Email Verified</h1>
        <p className="mb-8 text-sm text-zinc-400">{message}</p>
        <Button
          asChild
          className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
        >
          <a href="/">Sign In</a>
        </Button>
      </motion.div>
    );
  }

  if (status === "error") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto w-full max-w-md text-center"
      >
        <div className="mb-6 flex justify-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-red-500/15">
            <AlertCircle className="size-8 text-red-400" />
          </div>
        </div>
        <h1 className="mb-2 text-2xl font-bold text-zinc-100">Verification Failed</h1>
        <p className="mb-8 text-sm text-zinc-400">{message}</p>
        <Button
          asChild
          className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
        >
          <a href="/">Back to Sign In</a>
        </Button>
      </motion.div>
    );
  }

  // idle / submitting — show the spinner state.
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-md text-center"
    >
      <div className="mb-6 flex justify-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/15">
          <MailCheck className="size-8 text-emerald-400" />
        </div>
      </div>
      <h1 className="mb-2 text-2xl font-bold text-zinc-100">Verifying your email</h1>
      <p className="mb-8 text-sm text-zinc-400">
        Hang tight while we confirm your email address&hellip;
      </p>
      <div className="flex items-center justify-center gap-2 text-sm text-zinc-300">
        <Loader2 className="size-4 animate-spin text-emerald-400" />
        <span>Verifying&hellip;</span>
      </div>
    </motion.div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 py-12">
      <div className="mb-8 text-center">
        <div className="mb-2 inline-flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500 font-black text-white">G</div>
          <span className="text-xl font-bold text-zinc-100">
            Guardian<span className="text-emerald-400">X</span>
          </span>
        </div>
      </div>
      <Suspense fallback={<div className="text-zinc-400">Loading...</div>}>
        <VerifyEmailForm />
      </Suspense>
      <div className="mt-6 text-center">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="size-3.5" />
          Back to sign in
        </a>
      </div>
    </div>
  );
}
