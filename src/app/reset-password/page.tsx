"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, CheckCircle2, AlertCircle, ArrowLeft, ShieldCheck } from "lucide-react";
import { PasswordStrengthMeter } from "@/components/sentinel/password-strength-meter";

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // If there's no token in the URL, show an error immediately. We initialise
  // status from the token presence so we don't trigger a setState-in-effect
  // lint error.
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">(
    token ? "idle" : "error"
  );
  const [message, setMessage] = useState(
    token
      ? ""
      : "This reset link is invalid. Please request a new one from the sign-in page."
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!token) {
      setStatus("error");
      setMessage("Missing reset token. Please use the link from your email.");
      return;
    }
    if (password.length < 8) {
      setStatus("error");
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setStatus("error");
      setMessage("Passwords do not match.");
      return;
    }

    setStatus("submitting");
    setMessage("");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        setStatus("success");
        setMessage(data.message || "Your password has been reset. You can now sign in.");
      } else {
        setStatus("error");
        setMessage(data.error || "Failed to reset password. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  };

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
        <h1 className="mb-2 text-2xl font-bold text-zinc-100">Password Reset</h1>
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-md"
    >
      <div className="mb-6 text-center">
        <div className="mb-4 flex justify-center">
          <div className="flex size-14 items-center justify-center rounded-xl bg-emerald-500/15">
            <Lock className="size-7 text-emerald-400" />
          </div>
        </div>
        <h1 className="mb-1 text-2xl font-bold text-zinc-100">Set a new password</h1>
        <p className="text-sm text-zinc-400">Choose a strong password for your GuardianX account.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-zinc-300">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            minLength={8}
            className="border-zinc-800 bg-zinc-900/60 text-zinc-200 placeholder:text-zinc-500 focus-visible:border-emerald-500/50"
          />
          {password.length > 0 && <PasswordStrengthMeter password={password} />}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword" className="text-zinc-300">Confirm new password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter the password"
            required
            minLength={8}
            className="border-zinc-800 bg-zinc-900/60 text-zinc-200 placeholder:text-zinc-500 focus-visible:border-emerald-500/50"
          />
        </div>

        {status === "error" && message && (
          <div className="flex items-start gap-2 rounded-md border border-red-800/60 bg-red-950/40 p-3 text-sm text-red-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
            <span className="break-words">{message}</span>
          </div>
        )}

        <Button
          type="submit"
          disabled={status === "submitting" || !token}
          className="w-full bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {status === "submitting" ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Resetting...
            </>
          ) : (
            <>
              <ShieldCheck className="mr-2 size-4" />
              Reset Password
            </>
          )}
        </Button>
      </form>

      <div className="mt-6 text-center">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="size-3.5" />
          Back to sign in
        </a>
      </div>
    </motion.div>
  );
}

export default function ResetPasswordPage() {
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
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
