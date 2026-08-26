"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Shield, Lock, Fingerprint, CheckCircle2, XCircle, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function VerifyPage() {
  const [watermark, setWatermark] = useState("");
  const [result, setResult] = useState<{ valid: boolean; timestamp?: string; userId?: string; ageSeconds?: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const verify = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/self-security/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watermark }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ valid: false });
    }
    setLoading(false);
  };

  const copyWatermark = () => {
    navigator.clipboard.writeText(watermark);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="scanlines cyber-vignette relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div aria-hidden className="cyber-grid pointer-events-none fixed inset-0 z-0 opacity-30" />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-40 left-1/4 h-96 w-[44rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-4 py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full"
        >
          <div className="mb-8 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-cyan-300">
              <Fingerprint className="size-3" />
              Holographic Watermark Verifier
            </div>
            <h1 className="text-3xl font-bold text-zinc-50 sm:text-4xl">
              Verify a GuardianX Page
            </h1>
            <p className="mt-3 text-sm text-zinc-400">
              Paste a GuardianX holographic watermark to verify it was rendered by the
              authentic GuardianX server. Phishing copies cannot forge this signature.
            </p>
          </div>

          <div className="holo-card-sharp hud-corners rounded-xl border border-cyan-500/30 bg-zinc-950/80 p-6 backdrop-blur-xl">
            <label className="mb-2 block font-mono text-xs uppercase tracking-wider text-cyan-400">
              Watermark String
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={watermark}
                onChange={(e) => setWatermark(e.target.value)}
                placeholder="guardianx:attested:2026-08-25T..."
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-cyan-500/50 focus:outline-none"
              />
              {watermark && (
                <Button size="icon" variant="outline" onClick={copyWatermark} title="Copy">
                  {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                </Button>
              )}
            </div>
            <Button
              onClick={verify}
              disabled={!watermark || loading}
              className="mt-4 w-full bg-cyan-600 text-white hover:bg-cyan-500"
            >
              <Shield className="size-4" />
              {loading ? "Verifying..." : "Verify Watermark"}
            </Button>

            {result && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-6 rounded-lg border p-4 ${
                  result.valid
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-red-500/40 bg-red-500/10"
                }`}
              >
                {result.valid ? (
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="size-5 shrink-0 text-emerald-400" />
                    <div>
                      <div className="font-mono text-sm font-bold text-emerald-300">AUTHENTIC</div>
                      <div className="mt-1 text-xs text-zinc-400">
                        Rendered at: {result.timestamp}
                      </div>
                      {result.userId && result.userId !== "anonymous" && (
                        <div className="text-xs text-zinc-400">User: {result.userId}</div>
                      )}
                      {result.ageSeconds !== undefined && (
                        <div className="text-xs text-zinc-400">Age: {result.ageSeconds}s</div>
                      )}
                      <div className="mt-2 text-xs text-emerald-300/80">
                        This page was served by the real GuardianX server. The signature is valid.
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <XCircle className="size-5 shrink-0 text-red-400" />
                    <div>
                      <div className="font-mono text-sm font-bold text-red-300">INVALID</div>
                      <div className="mt-1 text-xs text-zinc-400">
                        This watermark is not a valid GuardianX signature. The page may be a
                        phishing copy or the watermark has expired.
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-950/60 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs text-zinc-400">
              <Lock className="size-3" />
              <span className="font-mono uppercase tracking-wider">How it works</span>
            </div>
            <p className="text-xs text-zinc-500">
              Every GuardianX page includes a hidden HTML comment + an <code className="text-cyan-400">X-GuardianX-Attestation</code> response header.
              The watermark is HMAC-SHA256 signed using the server's secret key + includes a timestamp.
              It cannot be forged without the secret. Watermarks expire after 90 days.
            </p>
          </div>

          <div className="mt-6 text-center">
            <a href="/" className="text-xs text-cyan-400 hover:text-cyan-300">
              ← Back to GuardianX
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
