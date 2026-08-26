"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { GuardianXLogo } from "./guardianx-logo";
import { useToast } from "@/hooks/use-toast";
import {
  Building2,
  Boxes,
  Zap,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  X,
  Loader2,
  Upload,
  Rocket,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const STORAGE_KEY = "guardianx-onboarded";

interface CreatedClient { id: string; name: string; }
interface CreatedCodebase { id: string; name: string; }

interface OnboardingWizardProps {
  /** Called when the user finishes the wizard (or skips to dashboard). */
  onComplete?: () => void;
}

const TOTAL_STEPS = 5;

// Tiny vulnerable sample so the user can run a scan immediately without
// having to bring their own code. intentionally obvious SQLi pattern.
const SAMPLE_CODE = `// Sample vulnerable Node.js handler
app.get("/user", (req, res) => {
  const id = req.query.id;
  // BUG: string concatenation, classic SQL injection
  db.query("SELECT * FROM users WHERE id = " + id, (err, rows) => {
    res.json(rows);
  });
});`;

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Form state across steps
  const [clientName, setClientName] = useState("");
  const [clientUrl, setClientUrl] = useState("");
  const [createdClient, setCreatedClient] = useState<CreatedClient | null>(null);

  const [codebaseName, setCodebaseName] = useState("");
  const [codebaseDesc, setCodebaseDesc] = useState("");
  const [createdCodebase, setCreatedCodebase] = useState<CreatedCodebase | null>(null);

  const [busy, setBusy] = useState(false);
  const [scanStarted, setScanStarted] = useState(false);

  // Show the wizard on first mount if the user has not finished onboarding.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const done = localStorage.getItem(STORAGE_KEY);
      if (done !== "true") {
        // Small delay so the dashboard can paint first, then the modal slides in.
        const id = setTimeout(() => setOpen(true), 600);
        return () => clearTimeout(id);
      }
    } catch {
      // localStorage might be unavailable (private mode), skip the wizard.
    }
  }, []);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Ignore localStorage failures (e.g. privacy mode).
    }
    setOpen(false);
    onComplete?.();
  }, [onComplete]);

  const handleSkipToDashboard = useCallback(() => {
    finish();
  }, [finish]);

  // ── Step 1: Add your first client ─────────────────────────────────────
  const submitClient = useCallback(async () => {
    if (!clientName.trim()) {
      toast({
        variant: "destructive",
        title: "Client name required",
        description: "Enter a name to continue, or skip this step.",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: clientName.trim(),
          targetUrl: clientUrl.trim() || undefined,
          status: "onboarding",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create client");
      setCreatedClient({ id: data.id, name: data.name });
      toast({
        title: "Client added",
        description: `${data.name} is now in onboarding status.`,
      });
      setStep(2);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not add client",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  }, [clientName, clientUrl, toast]);

  // ── Step 2: Upload your first codebase ────────────────────────────────
  const submitCodebase = useCallback(async () => {
    if (!codebaseName.trim()) {
      toast({
        variant: "destructive",
        title: "Codebase name required",
        description: "Enter a name to continue, or skip this step.",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/codebases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: codebaseName.trim(),
          description: codebaseDesc.trim() || undefined,
          language: "javascript",
          sourceCode: SAMPLE_CODE,
          clientId: createdClient?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create codebase");
      setCreatedCodebase({ id: data.id, name: data.name });
      toast({
        title: "Codebase uploaded",
        description: `${data.name} is ready for scanning.`,
      });
      setStep(3);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not upload codebase",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  }, [codebaseName, codebaseDesc, createdClient, toast]);

  // ── Step 3: Run your first scan ───────────────────────────────────────
  const startScan = useCallback(async () => {
    if (!createdCodebase) {
      toast({
        variant: "destructive",
        title: "No codebase to scan",
        description: "Add a codebase first, or skip this step.",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codebaseId: createdCodebase.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start scan");
      setScanStarted(true);
      toast({
        title: "Scan started",
        description: `Autonomous pipeline is analyzing ${createdCodebase.name}.`,
      });
      setStep(4);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not start scan",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  }, [createdCodebase, toast]);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-md sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="holo-card-sharp hud-corners scanlines cyber-vignette relative my-auto w-full max-w-lg overflow-hidden rounded-xl border border-emerald-500/30 bg-zinc-950/95 shadow-[0_0_60px_rgba(16,185,129,0.18)]"
          >
            {/* Top accent bar */}
            <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400 to-transparent" />

            {/* Header: progress + close */}
            <div className="flex items-center justify-between gap-3 border-b border-emerald-500/15 px-5 py-3 sm:px-6">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 bg-emerald-500/10 font-mono text-[10px] uppercase tracking-wider text-emerald-300"
                >
                  Step {step + 1} / {TOTAL_STEPS}
                </Badge>
                <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
                  GuardianX Onboarding
                </span>
              </div>
              <button
                type="button"
                onClick={handleSkipToDashboard}
                aria-label="Skip onboarding"
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Progress dots */}
            <div className="flex items-center gap-1.5 px-5 pt-3 sm:px-6">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                    i <= step ? "bg-emerald-500" : "bg-zinc-800"
                  }`}
                />
              ))}
            </div>

            {/* Body: animated step content */}
            <div className="relative px-5 py-6 sm:px-6">
              <AnimatePresence mode="wait">
                {step === 0 && (
                  <StepBody key="welcome">
                    <div className="flex flex-col items-center text-center">
                      <GuardianXLogo size={88} />
                      <h2
                        id="onboarding-title"
                        className="mt-5 text-2xl font-bold tracking-tight text-zinc-50"
                      >
                        Welcome to <span className="neon-emerald text-emerald-300">GuardianX</span>
                      </h2>
                      <p className="mt-2 max-w-sm text-sm text-zinc-400">
                        Autonomous security operations for the modern SOC. Lets get your first
                        client, codebase, and scan set up in under a minute.
                      </p>
                      <div className="mt-5 grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
                        <FeaturePill icon={Building2} label="Add a client" />
                        <FeaturePill icon={Boxes} label="Upload code" />
                        <FeaturePill icon={Zap} label="Run a scan" />
                      </div>
                    </div>
                    <WizardFooter>
                      <Button
                        onClick={() => setStep(1)}
                        className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border"
                      >
                        Get Started
                        <ChevronRight className="ml-1 size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={handleSkipToDashboard}
                        className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      >
                        Skip for now
                      </Button>
                    </WizardFooter>
                  </StepBody>
                )}

                {step === 1 && (
                  <StepBody key="client">
                    <StepHeader
                      icon={Building2}
                      iconColor="text-emerald-400"
                      title="Add your first client"
                      subtitle="A client represents an organization you are securing. You can add contact details later from the Clients tab."
                    />
                    <div className="mt-5 space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="ob-client-name" className="text-xs text-zinc-400">
                          Client Name *
                        </Label>
                        <Input
                          id="ob-client-name"
                          value={clientName}
                          onChange={(e) => setClientName(e.target.value)}
                          placeholder="Acme Corp"
                          className="border-zinc-800 bg-zinc-900/60 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                          autoFocus
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ob-client-url" className="text-xs text-zinc-400">
                          Target URL
                        </Label>
                        <Input
                          id="ob-client-url"
                          value={clientUrl}
                          onChange={(e) => setClientUrl(e.target.value)}
                          placeholder="https://app.acme.example"
                          className="border-zinc-800 bg-zinc-900/60 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                        />
                      </div>
                      {createdClient && (
                        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                          <CheckCircle2 className="size-3.5" />
                          <span>
                            Created: <span className="font-semibold">{createdClient.name}</span>
                          </span>
                        </div>
                      )}
                    </div>
                    <WizardFooter>
                      <Button
                        variant="ghost"
                        onClick={() => setStep(2)}
                        className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      >
                        Skip
                      </Button>
                      <div className="flex gap-2">
                        {step > 0 && (
                          <Button
                            variant="outline"
                            onClick={() => setStep(0)}
                            className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                          >
                            <ChevronLeft className="mr-1 size-4" />
                            Back
                          </Button>
                        )}
                        <Button
                          onClick={submitClient}
                          disabled={busy}
                          className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border"
                        >
                          {busy ? (
                            <Loader2 className="mr-1 size-4 animate-spin" />
                          ) : (
                            <Building2 className="mr-1 size-4" />
                          )}
                          Add Client
                        </Button>
                      </div>
                    </WizardFooter>
                  </StepBody>
                )}

                {step === 2 && (
                  <StepBody key="codebase">
                    <StepHeader
                      icon={Boxes}
                      iconColor="text-sky-400"
                      title="Upload your first codebase"
                      subtitle="Drop a codebase so the SAST engine has something to analyze. A tiny vulnerable sample is preloaded so you can run a scan immediately."
                    />
                    <div className="mt-5 space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="ob-cb-name" className="text-xs text-zinc-400">
                          Codebase Name *
                        </Label>
                        <Input
                          id="ob-cb-name"
                          value={codebaseName}
                          onChange={(e) => setCodebaseName(e.target.value)}
                          placeholder="acme-api"
                          className="border-zinc-800 bg-zinc-900/60 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                          autoFocus
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="ob-cb-desc" className="text-xs text-zinc-400">
                          Description
                        </Label>
                        <Input
                          id="ob-cb-desc"
                          value={codebaseDesc}
                          onChange={(e) => setCodebaseDesc(e.target.value)}
                          placeholder="Node.js REST API (optional)"
                          className="border-zinc-800 bg-zinc-900/60 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-emerald-500/50"
                        />
                      </div>
                      <div className="rounded-md border border-zinc-800 bg-zinc-900/60 p-3">
                        <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                          <Upload className="size-3" />
                          Preloaded sample (SQL injection)
                        </div>
                        <pre className="custom-scrollbar max-h-32 overflow-auto rounded bg-zinc-950/80 p-2 font-mono text-[10px] leading-relaxed text-zinc-400">
{SAMPLE_CODE}
                        </pre>
                      </div>
                      {createdClient && (
                        <p className="text-[10px] text-zinc-500">
                          Will be linked to: <span className="text-emerald-400">{createdClient.name}</span>
                        </p>
                      )}
                    </div>
                    <WizardFooter>
                      <Button
                        variant="ghost"
                        onClick={() => setStep(3)}
                        className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      >
                        Skip
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setStep(1)}
                          className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                        >
                          <ChevronLeft className="mr-1 size-4" />
                          Back
                        </Button>
                        <Button
                          onClick={submitCodebase}
                          disabled={busy}
                          className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border"
                        >
                          {busy ? (
                            <Loader2 className="mr-1 size-4 animate-spin" />
                          ) : (
                            <Upload className="mr-1 size-4" />
                          )}
                          Upload Codebase
                        </Button>
                      </div>
                    </WizardFooter>
                  </StepBody>
                )}

                {step === 3 && (
                  <StepBody key="scan">
                    <StepHeader
                      icon={Zap}
                      iconColor="text-amber-400"
                      title="Run your first scan"
                      subtitle="Trigger the autonomous SAST pipeline. It will detect vulnerabilities, generate patches, and sandbox them for review."
                    />
                    <div className="mt-5 space-y-3">
                      {createdCodebase ? (
                        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4">
                          <div className="flex items-center gap-2 text-sm text-emerald-300">
                            <Boxes className="size-4" />
                            <span className="font-semibold">{createdCodebase.name}</span>
                          </div>
                          <p className="mt-1 text-xs text-emerald-400/70">
                            Codebase ready. Click below to launch the autonomous pipeline.
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
                          <div className="flex items-center gap-2">
                            <Sparkles className="size-4" />
                            <span className="font-semibold">No codebase uploaded</span>
                          </div>
                          <p className="mt-1 text-xs text-amber-400/80">
                            You skipped the upload step. You can run a scan later from the Codebases tab once you add a real codebase.
                          </p>
                        </div>
                      )}

                      <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
                        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                          Pipeline stages
                        </div>
                        <ol className="space-y-1.5 text-xs text-zinc-400">
                          <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            Detect vulnerabilities
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            Generate AI patches
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            Sandbox and adversarial test
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            Queue for review
                          </li>
                        </ol>
                      </div>
                    </div>
                    <WizardFooter>
                      <Button
                        variant="ghost"
                        onClick={() => setStep(4)}
                        className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      >
                        Skip
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setStep(2)}
                          className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                        >
                          <ChevronLeft className="mr-1 size-4" />
                          Back
                        </Button>
                        <Button
                          onClick={startScan}
                          disabled={busy || !createdCodebase || scanStarted}
                          className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border"
                        >
                          {busy ? (
                            <Loader2 className="mr-1 size-4 animate-spin" />
                          ) : scanStarted ? (
                            <CheckCircle2 className="mr-1 size-4" />
                          ) : (
                            <Rocket className="mr-1 size-4" />
                          )}
                          {scanStarted ? "Scan Started" : "Run Scan"}
                        </Button>
                      </div>
                    </WizardFooter>
                  </StepBody>
                )}

                {step === 4 && (
                  <StepBody key="done">
                    <div className="flex flex-col items-center text-center">
                      <div className="relative">
                        <GuardianXLogo size={72} />
                        <span className="absolute -right-2 -top-1 flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_12px_rgba(16,185,129,0.6)]">
                          <CheckCircle2 className="size-4" />
                        </span>
                      </div>
                      <h2 className="mt-5 text-2xl font-bold tracking-tight text-zinc-50">
                        You are all set!
                      </h2>
                      <p className="mt-2 max-w-sm text-sm text-zinc-400">
                        GuardianX is configured and your first pipeline is ready. Head to the
                        dashboard to monitor everything in real time.
                      </p>

                      <div className="mt-5 w-full space-y-2 text-left">
                        <SummaryRow
                          icon={Building2}
                          label="Client added"
                          value={createdClient?.name || "Skipped"}
                          ok={!!createdClient}
                        />
                        <SummaryRow
                          icon={Boxes}
                          label="Codebase uploaded"
                          value={createdCodebase?.name || "Skipped"}
                          ok={!!createdCodebase}
                        />
                        <SummaryRow
                          icon={Zap}
                          label="First scan"
                          value={scanStarted ? "Launched" : "Skipped"}
                          ok={scanStarted}
                        />
                      </div>
                    </div>
                    <WizardFooter>
                      <Button
                        variant="outline"
                        onClick={() => setStep(3)}
                        className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                      >
                        <ChevronLeft className="mr-1 size-4" />
                        Back
                      </Button>
                      <Button
                        onClick={finish}
                        className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border"
                      >
                        <ShieldCheck className="mr-1 size-4" />
                        Enter Dashboard
                      </Button>
                    </WizardFooter>
                  </StepBody>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function StepBody({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

function StepHeader({
  icon: Icon,
  iconColor,
  title,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
        <Icon className={`size-5 ${iconColor}`} />
      </div>
      <div>
        <h3 className="text-lg font-bold tracking-tight text-zinc-50">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">{subtitle}</p>
      </div>
    </div>
  );
}

function WizardFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 flex items-center justify-between gap-2 border-t border-zinc-800/60 pt-4">
      {children}
    </div>
  );
}

function FeaturePill({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center justify-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/40 px-2 py-2 text-[10px] font-medium text-zinc-300">
      <Icon className="size-3 text-emerald-400" />
      {label}
    </div>
  );
}

function SummaryRow({
  icon: Icon,
  label,
  value,
  ok,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2">
      <Icon className={`size-4 ${ok ? "text-emerald-400" : "text-zinc-500"}`} />
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">{label}</div>
        <div className="truncate text-xs font-medium text-zinc-200">{value}</div>
      </div>
      {ok ? (
        <CheckCircle2 className="size-4 text-emerald-400" />
      ) : (
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[9px] uppercase tracking-wider text-zinc-500">
          Skipped
        </span>
      )}
    </div>
  );
}
