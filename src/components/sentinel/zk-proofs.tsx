"use client";

// GuardianX — ZERO-KNOWLEDGE SECURITY PROOFS
// ===========================================
// Innovation #3: prove your security posture to an auditor (or customer)
// WITHOUT revealing your source code, your findings list, or even your
// exact posture score. Generate a signed proof that "postureScore >= 80"
// and the auditor verifies it via /api/zk-proof/verify (publicly).
//
// This component is a self-contained tab view:
//   • Header with lock icon + "ZERO-KNOWLEDGE SECURITY PROOFS"
//   • "Generate proof" section: threshold slider (50-100), generate button
//   • Proof JSON output (copyable, monospace)
//   • "Verify a proof" section: paste textarea, verify button, valid/invalid banner
//   • Use cases explainer (vendor questionnaires, enterprise deals, compliance)
//
// Visual idiom: holo-card-sharp + hud-corners, bg-zinc-950, cyan + emerald
// accents (NO indigo/blue). Mobile-first, responsive.
//
// NOTE on the ZK-ish design: this is NOT a real zk-SNARK (which would
// require snarkjs + a trusted setup). It's a signed-claim scheme: the
// proof contains the claim, a hash of the underlying data (so it's
// bound to the real posture), a nonce (replay protection), and an
// HMAC-SHA256 signature using JWT_SECRET. Anyone with JWT_SECRET can
// verify; the verifier learns the claim ("score >= 80") but NOT the
// score, the findings list, or the underlying snapshot.

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Lock,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  FileText,
  Building2,
  Award,
  Sparkles,
  ScrollText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

// ── Types (mirror server response shape) ─────────────────────────────────
interface ZkProof {
  claim: string;
  threshold: number;
  dataHash: string;
  nonce: string;
  signature: string;
  generatedAt: string;
  version: 1;
}

interface GenerateResponse {
  proof?: ZkProof;
  info?: {
    actualScore: number;
    meetsThreshold: boolean;
    snapshot: Record<string, number>;
  };
  error?: string;
}

interface VerifyResponse {
  valid?: boolean;
  reason?: string;
  claim?: string;
  threshold?: number;
  generatedAt?: string;
  version?: number;
  issuer?: string;
  error?: string;
}

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("guardianx-token") : null;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function generateProof(threshold: number): Promise<GenerateResponse> {
  const res = await fetch("/api/zk-proof/generate", {
    method: "POST",
    credentials: "same-origin",
    headers: authHeaders(),
    body: JSON.stringify({ threshold }),
  });
  return (await res.json().catch(() => ({ error: "Invalid response" }))) as GenerateResponse;
}

async function verifyProof(proof: ZkProof): Promise<VerifyResponse> {
  // Verification is PUBLIC — no Authorization header. Anyone with a proof
  // JSON can verify it. We intentionally don't send our token so the
  // request matches what an auditor's tool would send.
  const res = await fetch("/api/zk-proof/verify", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proof }),
  });
  return (await res.json().catch(() => ({ error: "Invalid response" }))) as VerifyResponse;
}

const USE_CASES = [
  {
    icon: FileText,
    title: "Pass vendor security questionnaires",
    body: "Share the proof JSON with procurement teams. They verify it without ever touching your source code or scan logs.",
    color: "#06b6d4",
  },
  {
    icon: Building2,
    title: "Win enterprise deals",
    body: "Procurement wants proof of security. Hand them a verifiable cryptographic claim instead of opening your repo.",
    color: "#10b981",
  },
  {
    icon: Award,
    title: "Prove compliance without sharing findings",
    body: "Auditors see only that your posture is above the threshold. Your vulnerability list stays private.",
    color: "#f59e0b",
  },
];

export function ZkProofs() {
  const { toast } = useToast();

  const [threshold, setThreshold] = useState(80);
  const [generating, setGenerating] = useState(false);
  const [proof, setProof] = useState<ZkProof | null>(null);
  const [info, setInfo] = useState<GenerateResponse["info"] | null>(null);

  const [verifyInput, setVerifyInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);

  const [copied, setCopied] = useState(false);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setProof(null);
    setInfo(null);
    setVerifyResult(null);
    try {
      const r = await generateProof(threshold);
      if (r.error) {
        toast({ title: "Generation failed", description: r.error, variant: "destructive" });
        return;
      }
      if (r.proof) {
        setProof(r.proof);
        setInfo(r.info ?? null);
        if (r.info?.meetsThreshold) {
          toast({
            title: "Proof generated",
            description: `Claim "${r.proof.claim}" is true. Share this proof JSON with auditors.`,
          });
        } else if (r.info) {
          toast({
            title: "Proof generated (claim NOT met)",
            description: `Your score is ${r.info.actualScore} — below threshold ${threshold}. You can still share the proof, but the verifier will see the claim isn't satisfied.`,
            variant: "destructive",
          });
        }
      }
    } catch (e) {
      toast({ title: "Generation failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }, [threshold, toast]);

  const handleCopy = useCallback(async () => {
    if (!proof) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(JSON.stringify(proof, null, 2));
        setCopied(true);
        if (copyResetRef.current) clearTimeout(copyResetRef.current);
        copyResetRef.current = setTimeout(() => setCopied(false), 2000);
        toast({ title: "Proof copied to clipboard" });
      } else {
        toast({ title: "Clipboard unavailable", variant: "destructive" });
      }
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  }, [proof, toast]);

  const handleVerify = useCallback(async () => {
    const trimmed = verifyInput.trim();
    if (!trimmed) {
      toast({ title: "Paste a proof JSON first", variant: "destructive" });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      setVerifyResult({ valid: false, reason: "invalid_json" });
      toast({ title: "Invalid JSON", description: "The proof must be a valid JSON object.", variant: "destructive" });
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const r = await verifyProof(parsed as ZkProof);
      setVerifyResult(r);
      if (r.valid) {
        toast({
          title: "Proof is valid",
          description: `Claim "${r.claim}" was signed by GuardianX on ${new Date(r.generatedAt || "").toLocaleString()}.`,
        });
      } else {
        toast({
          title: "Proof is invalid",
          description: r.reason || "Verification failed.",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({ title: "Verification failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setVerifying(false);
    }
  }, [verifyInput, toast]);

  const handleVerifyThis = useCallback(async () => {
    if (!proof) return;
    setVerifyInput(JSON.stringify(proof, null, 2));
    // Defer to next tick so the textarea state flushes first.
    setTimeout(() => {
      void (async () => {
        const r = await verifyProof(proof);
        setVerifyResult(r);
        if (r.valid) {
          toast({ title: "Self-verification passed", description: "Your proof is well-formed and signed." });
        } else {
          toast({ title: "Self-verification failed", description: r.reason || "Invalid", variant: "destructive" });
        }
      })();
    }, 50);
  }, [proof, toast]);

  return (
    <div className="space-y-4 p-1">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="holo-card-sharp hud-corners flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10">
            <Lock className="size-6 text-cyan-300" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight text-zinc-50 sm:text-xl">
              ZERO-KNOWLEDGE SECURITY PROOFS
            </h2>
            <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-300/70">
              Prove posture · Reveal nothing
            </p>
          </div>
        </div>
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[9px] uppercase tracking-widest text-emerald-300">
          <KeyRound className="mr-1 size-3" />
          HMAC-SHA256 Signed
        </Badge>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Generate proof ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="holo-card-sharp hud-corners flex flex-col gap-4 p-5"
        >
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Sparkles className="size-4 text-cyan-400" />
              Generate a proof
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Choose the minimum posture-score threshold you want to claim. The proof will assert your score is at or above this value — without revealing the exact number.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-zinc-400">Threshold</Label>
              <span className="font-mono text-2xl font-bold text-cyan-300">
                ≥ {threshold}
              </span>
            </div>
            <Slider
              value={[threshold]}
              onValueChange={(v) => setThreshold(v[0] ?? 80)}
              min={50}
              max={100}
              step={1}
              className="[&_[role=slider]]:border-cyan-500 [&_[role=slider]]:bg-cyan-500"
            />
            <div className="flex justify-between font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              <span>50</span>
              <span>75</span>
              <span>100</span>
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-cyan-500 text-zinc-950 hover:bg-cyan-400"
          >
            {generating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            Generate proof
          </Button>

          {info && (
            <div
              className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${
                info.meetsThreshold
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200"
                  : "border-rose-500/30 bg-rose-500/5 text-rose-200"
              }`}
            >
              {info.meetsThreshold ? (
                <CheckCircle2 className="size-4 text-emerald-400" />
              ) : (
                <ShieldAlert className="size-4 text-rose-400" />
              )}
              <span>
                Your actual posture score is <span className="font-mono font-bold">{info.actualScore}</span>.
                The claim "score ≥ {threshold}" is{" "}
                <span className="font-semibold">{info.meetsThreshold ? "TRUE" : "FALSE"}</span>.
                {info.meetsThreshold
                  ? " Safe to share this proof."
                  : " Hold off — raise your real posture or lower the threshold before sharing."}
              </span>
            </div>
          )}

          {proof ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  Proof JSON · copyable
                </span>
                <Button
                  onClick={handleCopy}
                  variant="outline"
                  size="sm"
                  className="border-zinc-700 bg-zinc-900/60 text-zinc-300 hover:border-cyan-500/40 hover:text-cyan-300"
                >
                  {copied ? (
                    <>
                      <Check className="size-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="size-3" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <pre className="max-h-64 overflow-y-auto custom-scrollbar rounded-lg border border-zinc-800 bg-zinc-950/80 p-3 font-mono text-[10px] leading-relaxed text-emerald-200">
{JSON.stringify(proof, null, 2)}
              </pre>
              <Button
                onClick={handleVerifyThis}
                variant="ghost"
                size="sm"
                className="w-full text-xs text-zinc-400 hover:text-cyan-300"
              >
                <RefreshCw className="size-3" />
                Self-verify this proof
              </Button>
            </div>
          ) : generating ? (
            <Skeleton className="h-40 w-full bg-cyan-500/5" />
          ) : null}
        </motion.div>

        {/* ── Verify a proof ──────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="holo-card-sharp hud-corners flex flex-col gap-4 p-5"
        >
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <ShieldCheck className="size-4 text-emerald-400" />
              Verify a proof
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Paste a proof JSON below. The verification endpoint is public — anyone with a proof can verify it, no GuardianX account required.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="verify-input" className="text-xs text-zinc-400">
              Proof JSON
            </Label>
            <Textarea
              id="verify-input"
              value={verifyInput}
              onChange={(e) => setVerifyInput(e.target.value)}
              placeholder={'{\n  "claim": "postureScore >= 80",\n  "threshold": 80,\n  ...\n}'}
              className="min-h-[160px] font-mono text-xs border-zinc-700 bg-zinc-900/60 text-emerald-200"
            />
          </div>

          <Button
            onClick={handleVerify}
            disabled={verifying || !verifyInput.trim()}
            className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
          >
            {verifying ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShieldCheck className="size-4" />
            )}
            Verify proof
          </Button>

          {verifyResult && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex flex-col gap-2 rounded-lg border p-4 ${
                verifyResult.valid
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-rose-500/30 bg-rose-500/5"
              }`}
            >
              <div className="flex items-center gap-2">
                {verifyResult.valid ? (
                  <CheckCircle2 className="size-5 text-emerald-400" />
                ) : (
                  <AlertCircle className="size-5 text-rose-400" />
                )}
                <span
                  className={`text-sm font-bold ${
                    verifyResult.valid ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {verifyResult.valid ? "PROOF IS VALID" : "PROOF IS INVALID"}
                </span>
              </div>
              {verifyResult.valid ? (
                <div className="space-y-1 text-xs text-zinc-300">
                  <div><span className="text-zinc-500">Claim:</span> <span className="font-mono text-emerald-200">{verifyResult.claim}</span></div>
                  <div><span className="text-zinc-500">Threshold:</span> <span className="font-mono">{verifyResult.threshold}</span></div>
                  <div>
                    <span className="text-zinc-500">Generated:</span>{" "}
                    <span className="font-mono">
                      {verifyResult.generatedAt
                        ? new Date(verifyResult.generatedAt).toLocaleString()
                        : "—"}
                    </span>
                  </div>
                  <div><span className="text-zinc-500">Issuer:</span> <span className="font-mono">{verifyResult.issuer || "GuardianX"}</span></div>
                  <div><span className="text-zinc-500">Version:</span> <span className="font-mono">{verifyResult.version}</span></div>
                </div>
              ) : (
                <div className="text-xs text-rose-200">
                  <span className="font-semibold">Reason:</span>{" "}
                  <span className="font-mono">{verifyResult.reason || "unknown"}</span>
                </div>
              )}
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* ── Explainer ─────────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="holo-card-sharp hud-corners p-5"
      >
        <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-cyan-400/80">
          <ScrollText className="size-3.5" />
          How it works
        </div>
        <p className="text-xs leading-relaxed text-zinc-400">
          Share this proof with auditors or customers to prove your security posture WITHOUT revealing
          your code or vulnerability list. The proof is cryptographically signed with{" "}
          <span className="font-mono text-cyan-300">HMAC-SHA256(JWT_SECRET, …)</span> and cannot be
          forged. The verifier learns only the claim ({" "}
          <span className="font-mono text-emerald-300">postureScore ≥ 80</span>{" "}
          ) — never your actual score, your findings, or your scan history.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {USE_CASES.map((uc) => {
            const Icon = uc.icon;
            return (
              <div
                key={uc.title}
                className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4"
              >
                <Icon className="size-4" style={{ color: uc.color }} />
                <div className="mt-1.5 text-sm font-semibold text-zinc-100">
                  {uc.title}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                  {uc.body}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-200/90">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <span>
            <span className="font-semibold">Implementation note:</span> this is
            a signed-claim scheme — not a true zk-SNARK (which would need snarkjs
            + a trusted setup). It conveys the same UX for auditors while being
            implementable in a day. To upgrade to true zk-SNARKs, swap the
            signing for a circuit-compiled proof with snarkjs + a Groth16 setup.
          </span>
        </div>
      </motion.div>
    </div>
  );
}

export default ZkProofs;
