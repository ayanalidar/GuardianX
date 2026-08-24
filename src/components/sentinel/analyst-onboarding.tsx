"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  X,
  ChevronRight,
  ChevronLeft,
  Check,
  HelpCircle,
  Sparkles,
  Building2,
  Upload,
  Crosshair,
} from "lucide-react";

interface AnalystOnboardingProps {
  /** Show automatically only for viewers (or anyone whose role matches). */
  role?: string;
  /** Called when the user navigates via a tour step. */
  onNavigate?: (tab: "clients" | "codebases" | "patches") => void;
}

const STORAGE_KEY = "guardianx-onboarding-completed";

interface Step {
  id: string;
  title: string;
  body: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  cta?: { label: string; tab: "clients" | "codebases" | "patches" };
  spotlightSelector?: string;
}

const STEPS: Step[] = [
  {
    id: "welcome",
    title: "Welcome to GuardianX 👋",
    body: "You&apos;re signed in as an Analyst. GuardianX autonomously scans code, generates AI patches, attacks live targets, and tracks every fix. This 4-step tour takes ~30 seconds.",
    icon: Sparkles,
    accent: "emerald",
  },
  {
    id: "create-client",
    title: "1 · Create your first client",
    body: "A Client groups an engagement: contact, scope, target URL, repo, and frameworks (DPDPA, GDPR, etc.). Head to the All Clients tab and click New Client to set one up.",
    icon: Building2,
    accent: "emerald",
    cta: { label: "Open Clients", tab: "clients" },
    spotlightSelector: '[data-onboarding="clients"]',
  },
  {
    id: "upload-code",
    title: "2 · Upload a codebase",
    body: "Drop a codebase (paste source, push from a public Git URL, or import via credentials). The SAST layer scans it for vulnerabilities and generates candidate patches.",
    icon: Upload,
    accent: "sky",
    cta: { label: "Open Codebases", tab: "codebases" },
    spotlightSelector: '[data-onboarding="codebases"]',
  },
  {
    id: "run-scan",
    title: "3 · Run a scan",
    body: "Hit Scan on any codebase. The pipeline runs SAST → AI patch generation → sandbox test → exploit verification → adversarial rounds. Approved patches land in the Patch Queue.",
    icon: Crosshair,
    accent: "amber",
    cta: { label: "Open Patch Queue", tab: "patches" },
    spotlightSelector: '[data-onboarding="patches"]',
  },
];

const ACCENT_CLASSES: Record<string, { text: string; bg: string; ring: string; btn: string }> = {
  emerald: {
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/30",
    btn: "bg-emerald-600 text-white hover:bg-emerald-500",
  },
  sky: {
    text: "text-sky-300",
    bg: "bg-sky-500/10",
    ring: "ring-sky-500/30",
    btn: "bg-sky-600 text-white hover:bg-sky-500",
  },
  amber: {
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/30",
    btn: "bg-amber-600 text-white hover:bg-amber-500",
  },
};

export function AnalystOnboarding({ role, onNavigate }: AnalystOnboardingProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [spotlight, setSpotlight] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // ── Auto-open for viewers on first login (localStorage tracking) ──
  useEffect(() => {
    try {
      const done = localStorage.getItem(STORAGE_KEY);
      if (!done && role === "viewer") {
        const t = setTimeout(() => setOpen(true), 800);
        return () => clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, [role]);

  // ── Spotlight effect: highlight the element matching the current step ──
  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSpotlight(null);
      return;
    }
    const step = STEPS[stepIdx];
    if (!step?.spotlightSelector) {
      setSpotlight(null);
      return;
    }
    const update = () => {
      const el = document.querySelector(step.spotlightSelector!) as HTMLElement | null;
      if (!el) {
        setSpotlight(null);
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      const r = el.getBoundingClientRect();
      setSpotlight({ x: r.left, y: r.top, w: r.width, h: r.height });
    };
    update();
    // Re-measure on resize / scroll.
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const t = setTimeout(update, 350); // wait for sidebar animations
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      clearTimeout(t);
    };
  }, [open, stepIdx]);

  const close = (completed: boolean) => {
    setOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, completed ? "complete" : "skipped");
    } catch { /* ignore */ }
    if (completed) {
      toast({
        title: "Tour complete 🎉",
        description: "You're all set. Explore the dashboard — we'll be in the chat if you need us.",
      });
    }
  };

  const next = () => {
    if (stepIdx + 1 >= STEPS.length) {
      close(true);
      return;
    }
    setStepIdx((i) => i + 1);
  };
  const prev = () => setStepIdx((i) => Math.max(0, i - 1));

  const step = STEPS[stepIdx];
  const accent = ACCENT_CLASSES[step.accent] || ACCENT_CLASSES.emerald;
  const Icon = step.icon;

  return (
    <>
      {/* Spotlight overlay: dims everything except the highlighted element */}
      <AnimatePresence>
        {open && spotlight && (
          <motion.div
            aria-hidden
            className="pointer-events-none fixed inset-0 z-[85]"
            style={{
              background: `radial-gradient(circle at ${spotlight.x + spotlight.w / 2}px ${
                spotlight.y + spotlight.h / 2
              }px, transparent ${Math.max(spotlight.w, spotlight.h) / 2}px, rgba(0,0,0,0.78) ${
                Math.max(spotlight.w, spotlight.h) / 2 + 14
              }px)`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>

      {/* Floating help button (bottom-right, above the support chat launcher) */}
      <motion.button
        type="button"
        onClick={() => {
          setStepIdx(0);
          setOpen(true);
        }}
        className="fixed right-4 z-[78] flex size-11 items-center justify-center rounded-full border border-emerald-500/30 bg-zinc-950/80 text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.25)] backdrop-blur-md transition-transform hover:scale-105 hover:bg-zinc-900 sm:right-6"
        style={{ bottom: "calc(5.5rem)" }}
        aria-label="Replay onboarding tour"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
      >
        <HelpCircle className="size-5" />
        <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-zinc-950 pulse-dot" />
      </motion.button>

      {/* Tour card */}
      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed z-[86] w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-emerald-500/30 bg-zinc-950/95 shadow-2xl backdrop-blur-md"
            style={{
              right: "1rem",
              bottom: spotlight ? "auto" : "calc(11rem)",
              top: spotlight ? "1rem" : "auto",
            }}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
          >
            {/* Header */}
            <div className="relative flex items-start justify-between border-b border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-transparent p-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex size-10 items-center justify-center rounded-xl ${accent.bg} ring-1 ${accent.ring}`}
                >
                  <Icon className={`size-5 ${accent.text}`} />
                </div>
                <div className="leading-tight">
                  <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-500/60">
                    Onboarding · Step {stepIdx + 1} / {STEPS.length}
                  </div>
                  <div className="text-sm font-bold text-zinc-50">{step.title}</div>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-zinc-500 hover:bg-zinc-800/50 hover:text-zinc-200"
                onClick={() => close(false)}
                aria-label="Skip tour"
              >
                <X className="size-4" />
              </Button>
            </div>

            {/* Progress dots */}
            <div className="flex items-center gap-1.5 px-4 pt-3">
              {STEPS.map((s, i) => (
                <div
                  key={s.id}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i <= stepIdx ? "bg-emerald-500" : "bg-zinc-800"
                  }`}
                />
              ))}
            </div>

            {/* Body */}
            <div className="p-4">
              <p
                className="text-sm leading-relaxed text-zinc-300"
                dangerouslySetInnerHTML={{ __html: step.body }}
              />

              {step.cta && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 border-emerald-500/40 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/15"
                  onClick={() => {
                    onNavigate?.(step.cta!.tab);
                  }}
                >
                  {step.cta.label}
                  <ChevronRight className="size-3.5" />
                </Button>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-zinc-800/60 px-4 py-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={prev}
                disabled={stepIdx === 0}
                className="text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
              >
                <ChevronLeft className="size-4" /> Back
              </Button>
              <button
                onClick={() => close(false)}
                className="text-[10px] text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
              >
                Skip tour
              </button>
              {stepIdx + 1 < STEPS.length ? (
                <Button size="sm" onClick={next} className={accent.btn}>
                  Next <ChevronRight className="size-4" />
                </Button>
              ) : (
                <Button size="sm" onClick={() => close(true)} className="bg-emerald-600 text-white hover:bg-emerald-500">
                  <Check className="size-4" /> Done
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
