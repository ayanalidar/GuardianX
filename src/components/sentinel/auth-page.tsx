"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ShieldHalf, Loader2, Mail, Lock, User, ArrowRight, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

interface AuthPageProps {
  onAuth: (user: { id: string; email: string; name: string; role: string }, token: string) => void;
}

export function AuthPage({ onAuth }: AuthPageProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !password || (mode === "signup" && !name)) return;
    setLoading(true);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/signup";
      const body = mode === "login" ? { email, password } : { email, name, password };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      // Store session
      localStorage.setItem("guardianx-user", JSON.stringify(data.user));
      localStorage.setItem("guardianx-token", data.token);
      localStorage.setItem("guardianx-view", "console");

      toast({
        title: mode === "login" ? "Welcome back!" : "Account created!",
        description: `${data.user.name} (${data.user.role})`,
      });

      onAuth(data.user, data.token);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Authentication failed",
        description: err instanceof Error ? err.message : "unknown error",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="scanlines cyber-vignette relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 p-4">
      {/* Background */}
      <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-40" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-40 left-1/2 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-emerald-700/10 blur-3xl" />
      </div>

      {/* Auth card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="holo-card hud-corners relative z-10 w-full max-w-md rounded-2xl p-8"
      >
        {/* Logo */}
        <div className="mb-6 text-center">
          <img src="/guardianx-logo.png" alt="GuardianX" className="mx-auto size-16 rounded-xl object-contain neon-border" />
          <h1 className="mt-3 text-2xl font-bold text-zinc-50 neon-emerald">
            Guardian<span className="text-emerald-400">X</span>
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            Autonomous Security Operations Platform
          </p>
        </div>

        {/* Mode toggle */}
        <div className="mb-6 flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 p-1">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
              mode === "login" ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-all ${
              mode === "signup" ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30" : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          {mode === "signup" && (
            <div>
              <Label className="text-xs text-zinc-400">Full Name</Label>
              <div className="relative mt-1">
                <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="border-zinc-700 bg-zinc-900/60 pl-9 text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                />
              </div>
            </div>
          )}
          <div>
            <Label className="text-xs text-zinc-400">Email</Label>
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="border-zinc-700 bg-zinc-900/60 pl-9 text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs text-zinc-400">Password</Label>
            <div className="relative mt-1">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-500" />
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                placeholder="••••••••"
                className="border-zinc-700 bg-zinc-900/60 pl-9 text-zinc-200 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
              />
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading || !email || !password || (mode === "signup" && !name)}
            className="w-full bg-emerald-600 py-2.5 text-white hover:bg-emerald-500"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                {mode === "login" ? "Sign In" : "Create Account"}
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
        </div>

        {/* Role info */}
        {mode === "signup" && (
          <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
            <Badge className="border border-emerald-500/30 bg-emerald-500/10 text-[9px] text-emerald-300">
              <Sparkles className="size-2.5" /> First account becomes Admin
            </Badge>
            <p className="mt-1.5 text-[10px] text-zinc-500">
              Roles: Admin (full access) · Analyst (scan + review) · Viewer (read-only)
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center text-[10px] text-zinc-600">
          www.guardianx.in · hello@guardianx.in · +91 70067 12347
        </div>
      </motion.div>
    </div>
  );
}
