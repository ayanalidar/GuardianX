"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Rocket,
  ShieldCheck,
} from "lucide-react";

const STORAGE_KEY = "guardianx-onboarded";

interface CreatedClient {
  id: string;
  name: string;
}
interface CreatedCodebase {
  id: string;
  name: string;
}

interface OnboardingWizardProps {
  /** Controls overlay visibility. */
  open: boolean;
  /** Called when the user closes, finishes, or skips the wizard. */
  onClose: () => void;
}

const TOTAL_STEPS = 4;

const INDUSTRIES = [
  { value: "fintech", label: "Fintech / Banking" },
  { value: "healthcare", label: "Healthcare / MedTech" },
  { value: "ecommerce", label: "E-commerce / Retail" },
  { value: "saas", label: "SaaS / Cloud" },
  { value: "government", label: "Government / Public" },
  { value: "energy", label: "Energy / Utilities" },
  { value: "manufacturing", label: "Manufacturing / IoT" },
  { value: "other", label: "Other" },
];

const LANGUAGES = [
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
];

// Tiny vulnerable sample so the user can immediately run a scan without
// having to bring their own code. Intentionally obvious SQLi pattern.
const SAMPLE_CODE = `// Sample vulnerable Node.js handler
app.get("/user", (req, res) => {
  const id = req.query.id;
  // BUG: string concatenation → classic SQL injection
  db.query("SELECT * FROM users WHERE id = " + id, (err, rows) => {
    res.json(rows);
  });
});`;

const SCAN_STAGES = [
  { label: "Queued", desc: "Scan submitted to engine" },
  { label: "Analyzing", desc: "SAST pattern matching + LLM triage" },
  { label: "Patching", desc: "Generating AI-candidate patches" },
  { label: "Sandboxing", desc: "Adversarial test harness" },
  { label: "Ready", desc: "Findings queued for review" },
];

export function OnboardingWizard({ open, onClose }: OnboardingWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);

  // Step 2 — client form
  const [clientName, setClientName] = useState("");
  const [clientIndustry, setClientIndustry] = useState("");
  const [createdClient, setCreatedClient] = useState<CreatedClient | null>(null);

  // Step 3 — codebase form
  const [codebaseName, setCodebaseName] = useState("");
  const [codebaseLang, setCodebaseLang] = useState("typescript");
  const [codebaseDesc, setCodebaseDesc] = useState("");
  const [createdCodebase, setCreatedCodebase] = useState<CreatedCodebase | null>(null);

  // Step 4 — scan progress
  const [busy, setBusy] = useState(false);
  const [scanStarted, setScanStarted] = useState(false);
  const [scanStage, setScanStage] = useState(0);

  // Reset internal state whenever the overlay is reopened.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep(0);
    setCreatedClient(null);
    setCreatedCodebase(null);
    setScanStarted(false);
    setScanStage(0);
  }, [open]);

  // Drive the fake scan-progress ticker when a scan has been launched.
  useEffect(() => {
    if (!scanStarted) return;
    if (scanStage >= SCAN_STAGES.length - 1) return;
    const id = setTimeout(() => setScanStage((s) => Math.min(s + 1, SCAN_STAGES.length - 1)), 1100);
    return () => clearTimeout(id);
  }, [scanStarted, scanStage]);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Ignore localStorage failures (e.g. private mode).
    }
    onClose();
  }, [onClose]);

  const handleSkip = useCallback(() => {
    finish();
  }, [finish]);

  // ── Step 2: Add your first client ───────────────────────────────────────
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
          description: clientIndustry
            ? `Industry: ${INDUSTRIES.find((i) => i.value === clientIndustry)?.label ?? clientIndustry}`
            : undefined,
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
  }, [clientName, clientIndustry, toast]);

  // ── Step 3: Add a codebase ──────────────────────────────────────────────
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
          language: codebaseLang,
          sourceCode: SAMPLE_CODE,
          clientId: createdClient?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create codebase");
      setCreatedCodebase({ id: data.id, name: data.name });
      toast({
        title: "Codebase added",
        description: `${data.name} is ready for scanning.`,
      });
      setStep(3);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not add codebase",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  }, [codebaseName, codebaseLang, codebaseDesc, createdClient, toast]);

  // ── Step 4: Run the first scan ──────────────────────────────────────────
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
      setScanStage(1);
      toast({
        title: "Scan started",
        description: `Autonomous pipeline is analyzing ${createdCodebase.name}.`,
      });
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

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-zinc-950/95 p-3 backdrop-blur sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="relative my-auto w-full max-w-lg overflow-hidden rounded-xl border border-emerald-500/30 bg-zinc-950 shadow-[0_0_60px_rgba(16,185,129,0.18)] hud-corners"
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
                onClick={handleSkip}
                aria-label="Skip onboarding"
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Progress dots — 4 dots, current highlighted */}
            <div className="flex items-center justify-center gap-2 px-5 pt-4 sm:px-6">
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <div
                  key={i}
                  className={`size-2 rounded-full transition-all duration-300 ${
                    i === step
                      ? "scale-125 bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.7)]"
                      : i < step
                        ? "bg-emerald-500/60"
                        : "bg-zinc-700"
                  }`}
                />
              ))}
            </div>

            {/* Body — animated step content */}
            <div className="relative px-5 py-6 sm:px-6">
              <AnimatePresence mode="wait">
                {/* ── Step 1: Welcome ─────────────────────────────────────── */}
                {step === 0 && (
                  <StepBody key="welcome">
                    <div className="flex flex-col items-center text-center">
                      <GuardianXLogo size={88} />
                      <h2
                        id="onboarding-title"
                        className="mt-5 text-2xl font-bold tracking-tight text-zinc-50"
                      >
                        Welcome to <span className="text-emerald-300">GuardianX</span>
                      </h2>
                      <p className="mt-2 max-w-sm text-sm text-zinc-400">
                        Autonomous security operations for the modern SOC. Let&apos;s get your
                        first client, codebase, and scan set up in under a minute.
                      </p>
                      <div className="mt-5 grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
                        <FeaturePill icon={Building2} label="Add a client" />
                        <FeaturePill icon={Boxes} label="Add a codebase" />
                        <FeaturePill icon={Zap} label="Run a scan" />
                      </div>
                    </div>
                    <WizardFooter>
                      <Button
                        variant="ghost"
                        onClick={handleSkip}
                        className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      >
                        Skip for now
                      </Button>
                      <Button
                        onClick={() => setStep(1)}
                        className="bg-emerald-600 text-white hover:bg-emerald-500"
                      >
                        Get Started
                        <ChevronRight className="ml-1 size-4" />
                      </Button>
                    </WizardFooter>
                  </StepBody>
                )}

                {/* ── Step 2: Add your first client ─────────────────────── */}
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
                          Client Name <span className="text-red-400">*</span>
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
                        <Label htmlFor="ob-client-industry" className="text-xs text-zinc-400">
                          Industry
                        </Label>
                        <Select value={clientIndustry} onValueChange={setClientIndustry}>
                          <SelectTrigger
                            id="ob-client-industry"
                            className="w-full border-zinc-800 bg-zinc-900/60 text-zinc-100 focus-visible:border-emerald-500/50"
                          >
                            <SelectValue placeholder="Select an industry" />
                          </SelectTrigger>
                          <SelectContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
                            {INDUSTRIES.map((ind) => (
                              <SelectItem
                                key={ind.value}
                                value={ind.value}
                                className="focus:bg-emerald-500/10 focus:text-emerald-300"
                              >
                                {ind.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                        onClick={handleSkip}
                        className="text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                      >
                        Skip
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setStep(0)}
                          className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                        >
                          <ChevronLeft className="mr-1 size-4" />
                          Back
                        </Button>
                        <Button
                          onClick={submitClient}
                          disabled={busy}
                          className="bg-emerald-600 text-white hover:bg-emerald-500"
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

                {/* ── Step 3: Add a codebase ────────────────────────────── */}
                {step === 2 && (
                  <StepBody key="codebase">
                    <StepHeader
                      icon={Boxes}
                      iconColor="text-cyan-400"
                      title="Add a codebase"
                      subtitle="Drop a codebase so the SAST engine has something to analyze. A tiny vulnerable sample is preloaded so you can run a scan immediately."
                    />
                    <div className="mt-5 space-y-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="ob-cb-name" className="text-xs text-zinc-400">
                          Codebase Name <span className="text-red-400">*</span>
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
                        <Label htmlFor="ob-cb-lang" className="text-xs text-zinc-400">
                          Language
                        </Label>
                        <Select value={codebaseLang} onValueChange={setCodebaseLang}>
                          <SelectTrigger
                            id="ob-cb-lang"
                            className="w-full border-zinc-800 bg-zinc-900/60 text-zinc-100 focus-visible:border-emerald-500/50"
                          >
                            <SelectValue placeholder="Select a language" />
                          </SelectTrigger>
                          <SelectContent className="border-zinc-800 bg-zinc-950 text-zinc-100">
                            {LANGUAGES.map((lang) => (
                              <SelectItem
                                key={lang.value}
                                value={lang.value}
                                className="focus:bg-emerald-500/10 focus:text-emerald-300"
                              >
                                {lang.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                      {createdClient && (
                        <p className="text-[10px] text-zinc-500">
                          Will be linked to:{" "}
                          <span className="text-emerald-400">{createdClient.name}</span>
                        </p>
                      )}
                    </div>
                    <WizardFooter>
                      <Button
                        variant="ghost"
                        onClick={handleSkip}
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
                          className="bg-emerald-600 text-white hover:bg-emerald-500"
                        >
                          {busy ? (
                            <Loader2 className="mr-1 size-4 animate-spin" />
                          ) : (
                            <Boxes className="mr-1 size-4" />
                          )}
                          Add Codebase
                        </Button>
                      </div>
                    </WizardFooter>
                  </StepBody>
                )}

                {/* ── Step 4: Run your first scan ───────────────────────── */}
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
                            {scanStarted
                              ? "Scan running — watch the pipeline below."
                              : "Codebase ready. Click below to launch the autonomous pipeline."}
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="size-4" />
                            <span className="font-semibold">No codebase added</span>
                          </div>
                          <p className="mt-1 text-xs text-amber-400/80">
                            You skipped the codebase step. You can run a scan later from the
                            Codebases tab once you add a real codebase.
                          </p>
                        </div>
                      )}

                      {/* Pipeline progress */}
                      <div className="rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
                        <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                          Pipeline stages
                        </div>
                        <ol className="space-y-1.5 text-xs text-zinc-400">
                          {SCAN_STAGES.map((s, i) => {
                            const reached = scanStarted && i <= scanStage;
                            const current = scanStarted && i === scanStage;
                            return (
                              <li
                                key={s.label}
                                className={`flex items-center gap-2 transition-colors ${
                                  current ? "text-emerald-300" : reached ? "text-zinc-300" : ""
                                }`}
                              >
                                {reached ? (
                                  <CheckCircle2 className="size-3.5 text-emerald-400" />
                                ) : current ? (
                                  <Loader2 className="size-3.5 animate-spin text-emerald-400" />
                                ) : (
                                  <span className="size-1.5 rounded-full bg-zinc-700" />
                                )}
                                <span className="font-medium">{s.label}</span>
                                <span className="text-zinc-600">— {s.desc}</span>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    </div>
                    <WizardFooter>
                      <Button
                        variant="outline"
                        onClick={() => setStep(2)}
                        className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                      >
                        <ChevronLeft className="mr-1 size-4" />
                        Back
                      </Button>
                      {!scanStarted ? (
                        <Button
                          onClick={startScan}
                          disabled={busy || !createdCodebase}
                          className="bg-emerald-600 text-white hover:bg-emerald-500"
                        >
                          {busy ? (
                            <Loader2 className="mr-1 size-4 animate-spin" />
                          ) : (
                            <Rocket className="mr-1 size-4" />
                          )}
                          Run First Scan
                        </Button>
                      ) : (
                        <Button
                          onClick={finish}
                          className="bg-emerald-600 text-white hover:bg-emerald-500"
                        >
                          <ShieldCheck className="mr-1 size-4" />
                          Enter Command Center
                        </Button>
                      )}
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

// ── Sub-components ──────────────────────────────────────────────────────────

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
