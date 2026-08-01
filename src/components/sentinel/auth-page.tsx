"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ShieldHalf, Loader2, Mail, Lock, User, ArrowRight, Sparkles, AlertTriangle } from "lucide-react";
import { motion } from "framer-motion";
import { GuardianXLogo } from "./guardianx-logo";

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
  const [dbError, setDbError] = useState<string[] | null>(null);
  const [initLoading, setInitLoading] = useState(false);

  const initializeDb = async () => {
    setInitLoading(true);
    try {
      const res = await fetch("/api/db-init", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        toast({
          title: "Database initialized!",
          description: "You can now sign up. First account becomes Admin.",
        });
        setDbError(null);
      } else {
        setDbError(data.steps || [data.message]);
        toast({
          variant: "destructive",
          title: "Manual setup required",
          description: "Run the SQL migration in your Supabase Dashboard.",
        });
      }
    } catch {
      toast({
        variant: "destructive",
        title: "Init failed",
        description: "See the instructions below.",
      });
    } finally {
      setInitLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!email || !password || (mode === "signup" && !name)) return;
    setLoading(true);
    setDbError(null);
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
        // Detect DB-not-initialized and surface actionable instructions
        if (data.code === "DB_NOT_INITIALIZED" || res.status === 503) {
          setDbError(data.steps || [data.error || "Database not initialized"]);
          toast({
            variant: "destructive",
            title: "Database not initialized",
            description: "Follow the steps below to set up Supabase.",
          });
        } else if (data.code === "PENDING_APPROVAL") {
          // Show pending approval message
          toast({
            variant: "destructive",
            title: "Approval Pending",
            description: data.error,
          });
        } else {
          throw new Error(data.error || "Authentication failed");
        }
        return;
      }

      // If signup returned needsApproval (no token), show message and stay on auth page
      if (data.needsApproval) {
        toast({
          title: "Account Created!",
          description: data.message,
        });
        setMode("login"); // Switch to login mode so they can try after approval
        return;
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
          <div className="mx-auto flex justify-center">
            <GuardianXLogo size={72} />
          </div>
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

          {dbError && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-2 overflow-hidden rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-amber-200">
                    Database not initialized
                  </p>
                  <p className="mt-1 text-[11px] text-amber-100/70">
                    The Supabase tables don&apos;t exist yet. Either:
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={initializeDb}
                    disabled={initLoading}
                    className="mt-2 h-7 border-amber-500/40 bg-amber-500/10 text-[11px] text-amber-200 hover:bg-amber-500/20"
                  >
                    {initLoading ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      "Try auto-init"
                    )}
                  </Button>
                  <p className="mt-2 text-[11px] text-amber-100/70">
                    Or run the SQL migration manually:
                  </p>
                  <ol className="mt-1 space-y-0.5 text-[10px] text-amber-100/60">
                    {dbError.map((step, i) => (
                      <li key={i} className="font-mono leading-relaxed">
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </motion.div>
          )}
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
