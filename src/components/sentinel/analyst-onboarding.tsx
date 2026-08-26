"use client";

// AnalystOnboarding
//
// A guided 4-step onboarding tour for first-time Analysts (role ===
// "viewer"). Admins already have their own `OnboardingWizard`; this is the
// viewer-facing equivalent — a lightweight, dismissible tour that highlights
// the three core actions an analyst performs:
//
//   1. Create a client       (the "Add Client" button on the clients tab)
//   2. Upload a codebase     (the "Add Codebase" button on the codebases tab)
//   3. Run a SAST/VAPT scan  (the "Start Scan" button on any codebase card)
//
// The tour uses a spotlight/highlight effect: a dark overlay with a
// rectangular "cutout" around the relevant UI element, plus a floating info
// card positioned next to it. Each step has a title, description, Back /
// Next / Skip buttons, and a progress indicator.
//
// State tracking:
//   - localStorage `guardianx-onboarding-completed` = "true" once the user
//     finishes all 4 steps (clicks "Finish" on step 4). After that the tour
//     never auto-shows again.
//   - sessionStorage `guardianx-onboarding-skipped` = "1" if the user clicks
//     "Skip for now" or closes the modal. This suppresses auto-show for the
//     rest of the browser session, so a page refresh doesn't re-trigger the
//     tour. A fresh browser session (where sessionStorage is cleared) will
//     auto-show again — matching the spec: "Show on first login if not
//     completed."
//
// Restart:
//   - The component listens for a `guardianx-restart-onboarding` window
//     event. The user-menu "Restart tour" button, the empty-state "Watch a
//     quick tour" button, and the help-button "Take the tour" item all
//     dispatch this event. This keeps the restart triggers decoupled from
//     the component instance.
//
// Non-viewers render nothing.

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  HelpCircle,
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Rocket,
  Upload,
  ShieldCheck,
  Building2,
  BookOpen,
  LifeBuoy,
  Compass,
} from "lucide-react";

const STORAGE_KEY = "guardianx-onboarding-completed";
const SESSION_SKIP_KEY = "guardianx-onboarding-skipped";
const RESTART_EVENT = "guardianx-restart-onboarding";

interface AnalystOnboardingProps {
  /** Current user. Tour only renders for `role === "viewer"`. */
  currentUser?: { role?: string } | null;
  /**
   * Called when the tour needs to switch the active dashboard tab so the
   * spotlight target is visible. The component memoizes this internally
   * via a ref so callers don't need to useCallback it.
   */
  onNavigate?: (tab: "clients" | "codebases" | "dashboard") => void;
}

interface Step {
  title: string;
  description: string;
  icon: typeof Building2;
  /** Tab to navigate to before measuring the spotlight target. */
  navigateTab?: "clients" | "codebases" | "dashboard";
  /** CSS selector for the element to spotlight. If absent, centered modal. */
  targetSelector?: string;
}

const STEPS: Step[] = [
  {
    title: "Welcome to GuardianX",
    description:
      "As an Analyst, you can upload your own code for security testing. Let's set up your workspace — this quick tour walks you through creating a client, uploading code, and running your first scan in about a minute.",
    icon: Rocket,
  },
  {
    title: "Create your first client",
    description:
      "A client represents a project or organization whose code you want to test. Click the highlighted “Add Client” button to create one — give it a name, contact info, and optionally a target URL or Git repo URL. Your clients are private to your account.",
    icon: Building2,
    navigateTab: "clients",
    targetSelector: '[data-tour="add-client"]',
  },
  {
    title: "Upload your code",
    description:
      "Once you have a client, switch to the Codebases tab and click “Add Codebase”. GuardianX supports JavaScript/TypeScript, Python, Go, Java, PHP, Ruby, C#, and more — paste source code directly or import from a Git URL. Each codebase belongs to a client.",
    icon: Upload,
    navigateTab: "codebases",
    targetSelector: '[data-tour="add-codebase"]',
  },
  {
    title: "Run a SAST/VAPT scan",
    description:
      "After uploading a codebase, click “Start Scan” on any codebase card. GuardianX will run a SAST + VAPT analysis, identify vulnerabilities, generate patch suggestions, and verify the fixes — usually within a minute. Results land in the Patch Queue tab. You can re-watch this tour anytime from the help button.",
    icon: ShieldCheck,
    navigateTab: "codebases",
    targetSelector: '[data-tour="codebase-list"]',
  },
];

export function AnalystOnboarding({ currentUser, onNavigate }: AnalystOnboardingProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  // Keep the latest onNavigate in a ref so the auto-show effect doesn't
  // re-run when the parent re-renders with a new (but stable-behaved)
  // callback identity. The tour itself reads onNavigateRef.current when
  // it needs to switch tabs.
  const onNavigateRef = useRef(onNavigate);
  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  // Auto-show on first login (per session) if not completed.
  useEffect(() => {
    if (currentUser?.role !== "viewer") return;
    if (typeof window === "undefined") return;

    let completed = false;
    let skipped = false;
    try {
      completed = localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      // localStorage unavailable (private mode) — fail open, don't auto-show
      // repeatedly to avoid being annoying if we can't persist the dismiss.
      completed = true;
    }
    try {
      skipped = sessionStorage.getItem(SESSION_SKIP_KEY) === "1";
    } catch {
      // sessionStorage unavailable — treat as not skipped
    }
    if (completed || skipped) return;

    // Small delay so the dashboard can paint first; the modal then slides
    // in over a settled UI rather than fighting the initial layout burst.
    const id = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(id);
  }, [currentUser?.role]);

  // Listen for "restart tour" events dispatched by:
  //   - the user-menu "Restart tour" button (page.tsx sidebar)
  //   - the empty-state "Watch a quick tour" button (clients-dashboard.tsx)
  //   - the help-button "Take the tour" item (this component)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      // Clear the session-skip flag so the auto-show logic doesn't
      // immediately re-suppress if the user dismisses again.
      try {
        sessionStorage.removeItem(SESSION_SKIP_KEY);
      } catch {
        // ignore
      }
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(RESTART_EVENT, handler);
    return () => window.removeEventListener(RESTART_EVENT, handler);
  }, []);

  const complete = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // ignore — in-memory completion still works for the render lifetime
    }
    setOpen(false);
  }, []);

  const skip = useCallback(() => {
    try {
      sessionStorage.setItem(SESSION_SKIP_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  }, []);

  const handleNavigate = useCallback((tab: "clients" | "codebases" | "dashboard") => {
    onNavigateRef.current?.(tab);
  }, []);

  // Non-viewers render nothing. (Placed AFTER all hook calls so the
  // rules-of-hooks invariant holds across renders.)
  if (currentUser?.role !== "viewer") return null;

  return (
    <>
      <HelpButton />
      <AnimatePresence>
        {open && (
          <OnboardingOverlay
            key="analyst-onboarding-overlay"
            step={step}
            onStepChange={setStep}
            onNavigate={handleNavigate}
            onComplete={complete}
            onSkip={skip}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Onboarding overlay (spotlight + info card) ─────────────────────────────

interface OnboardingOverlayProps {
  step: number;
  onStepChange: (step: number) => void;
  onNavigate: (tab: "clients" | "codebases" | "dashboard") => void;
  onComplete: () => void;
  onSkip: () => void;
}

function OnboardingOverlay({
  step,
  onStepChange,
  onNavigate,
  onComplete,
  onSkip,
}: OnboardingOverlayProps) {
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const rect = useTargetRect(
    current?.targetSelector ?? null,
    step,
    current?.navigateTab,
    onNavigate,
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 60 }}
    >
      <SpotlightMask rect={rect} />
      <OnboardingCard
        step={step}
        current={current}
        isLast={isLast}
        rect={rect}
        onBack={() => onStepChange(Math.max(0, step - 1))}
        onNext={() => (isLast ? onComplete() : onStepChange(step + 1))}
        onSkip={onSkip}
        onClose={onSkip}
        onJumpTo={onStepChange}
      />
    </motion.div>
  );
}

// ── useTargetRect: measure the spotlight target after navigation ──────────

function useTargetRect(
  selector: string | null,
  step: number,
  navigateTab: "clients" | "codebases" | "dashboard" | undefined,
  onNavigate: (tab: "clients" | "codebases" | "dashboard") => void,
): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    // Reset the cached rect whenever the target selector changes — otherwise
    // the spotlight would briefly point at the previous step's element while
    // the new one is being measured. This is a legitimate synchronous reset
    // of derived state in an effect (same pattern as analyst-banner.tsx).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRect(null);
    if (!selector) return;

    let cancelled = false;
    let raf = 0;
    const timeouts: ReturnType<typeof setTimeout>[] = [];

    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (cancelled) return;
        const el = document.querySelector(selector);
        if (el instanceof HTMLElement) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.height > 0) {
            setRect(r);
            return;
          }
        }
        setRect(null);
      });
    };

    // 1) Switch to the right tab so the target element actually renders.
    if (navigateTab) onNavigate(navigateTab);

    // 2) The tab switch + data fetch (skeleton → real content) takes a few
    //    frames. Poll at increasing intervals so we measure once the target
    //    is actually laid out.
    [60, 220, 480, 850, 1400].forEach((t) => {
      timeouts.push(setTimeout(measure, t));
    });

    // 3) Scroll the target into view so it's not below the fold. We do
    //    this after a short delay so the tab switch has committed first.
    timeouts.push(
      setTimeout(() => {
        if (cancelled) return;
        const el = document.querySelector(selector);
        if (el instanceof HTMLElement) {
          el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        }
      }, 180),
    );

    // 4) Re-measure on viewport changes (scroll / resize / any nested
    //    scrollable container). Capture=true so we catch inner-scroll.
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      timeouts.forEach(clearTimeout);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
    // We intentionally depend on `selector` + `step` only — `navigateTab` and
    // `onNavigate` are read once per (selector, step) change and their identity
    // is stable via the parent's useCallback wrapper. The exhaustive-deps rule
    // is off in this project's ESLint config, so no directive is needed.
  }, [selector, step]);

  return rect;
}

// ── SpotlightMask: dark overlay with a rectangular cutout ──────────────────

function SpotlightMask({ rect }: { rect: DOMRect | null }) {
  // No rect → full-screen dark backdrop (used for the welcome step or
  // when the target selector can't be resolved).
  if (!rect) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(9, 9, 11, 0.82)",
          zIndex: 60,
        }}
      />
    );
  }

  const padding = 8;
  const top = Math.max(0, rect.top - padding);
  const left = Math.max(0, rect.left - padding);
  const width = rect.width + padding * 2;
  const height = rect.height + padding * 2;

  return (
    <>
      {/* 4 dark panels around the target — these have pointer-events:auto
          so they block clicks on everything except the spotlighted element. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ position: "fixed", top: 0, left: 0, right: 0, height: top, background: "rgba(9, 9, 11, 0.82)", zIndex: 60 }}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ position: "fixed", top: top + height, left: 0, right: 0, bottom: 0, background: "rgba(9, 9, 11, 0.82)", zIndex: 60 }}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ position: "fixed", top, left: 0, width: left, height, background: "rgba(9, 9, 11, 0.82)", zIndex: 60 }}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ position: "fixed", top, left: left + width, right: 0, height, background: "rgba(9, 9, 11, 0.82)", zIndex: 60 }}
      />

      {/* Animated highlight ring (purely visual — pointer-events:none so
          clicks pass through to the spotlighted element). */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.25 }}
        style={{
          position: "fixed",
          top,
          left,
          width,
          height,
          borderRadius: 10,
          border: "2px solid rgba(16, 185, 129, 0.9)",
          boxShadow:
            "0 0 0 4px rgba(16, 185, 129, 0.18), 0 0 28px rgba(16, 185, 129, 0.45)",
          pointerEvents: "none",
          zIndex: 61,
        }}
      >
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-[8px]"
          style={{ border: "1px solid rgba(16, 185, 129, 0.35)" }}
          animate={{ opacity: [0.35, 0.7, 0.35] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
    </>
  );
}

// ── OnboardingCard: the floating info card with progress + actions ─────────

interface OnboardingCardProps {
  step: number;
  current: Step;
  isLast: boolean;
  rect: DOMRect | null;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onClose: () => void;
  /** Jump directly to a previous step (used by the step-dot indicators). */
  onJumpTo: (step: number) => void;
}

function OnboardingCard({
  step,
  current,
  isLast,
  rect,
  onBack,
  onNext,
  onSkip,
  onClose,
  onJumpTo,
}: OnboardingCardProps) {
  const style: React.CSSProperties = rect
    ? computeCardPosition(rect)
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 70,
      };

  const Icon = current.icon;
  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={step}
        initial={{ opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.97 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        style={style}
        className="holo-card-sharp hud-corners w-[min(92vw,28rem)] rounded-xl border border-emerald-500/30 bg-zinc-950/95 p-5 shadow-2xl backdrop-blur-md"
        role="dialog"
        aria-labelledby="analyst-onboarding-title"
      >
        {/* Progress bar */}
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium uppercase tracking-widest text-zinc-500">
            <span>
              Step {step + 1} of {STEPS.length}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-zinc-800">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-400"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
        </div>

        {/* Close (X) button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close onboarding tour"
          title="Skip for now"
          className="absolute right-3 top-3 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <X className="size-4" />
        </button>

        {/* Header */}
        <div className="mb-3 flex items-center gap-3 pr-8">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10">
            <Icon className="size-5 text-emerald-400" />
          </div>
          <h2
            id="analyst-onboarding-title"
            className="text-base font-bold text-zinc-50"
          >
            {current.title}
          </h2>
        </div>

        {/* Description */}
        <p className="mb-5 text-sm leading-relaxed text-zinc-300">
          {current.description}
        </p>

        {/* Footer: step dots + actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => {
              const isCurrent = i === step;
              const isPast = i < step;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => isPast && onJumpTo(i)}
                  disabled={!isPast}
                  aria-label={`Step ${i + 1}${isCurrent ? " (current)" : isPast ? " — go back" : ""}`}
                  aria-current={isCurrent ? "step" : undefined}
                  title={`Step ${i + 1}`}
                  className={`h-1.5 rounded-full transition-all ${
                    isCurrent
                      ? "w-6 bg-emerald-400"
                      : isPast
                        ? "w-4 cursor-pointer bg-emerald-500/60 hover:bg-emerald-500/80"
                        : "w-4 bg-zinc-700"
                  }`}
                />
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                className="text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              >
                <ChevronLeft className="size-4" /> Back
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onSkip}
              className="border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              Skip for now
            </Button>
            <Button
              size="sm"
              onClick={onNext}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              {isLast ? (
                <>
                  Finish <CheckCircle2 className="size-4" />
                </>
              ) : (
                <>
                  Next <ChevronRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── computeCardPosition: place the card below/above the spotlight ─────────

function computeCardPosition(rect: DOMRect): React.CSSProperties {
  if (typeof window === "undefined") {
    return { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 70 };
  }
  const cardWidth = Math.min(window.innerWidth * 0.92, 448); // 28rem
  const cardHeightEstimate = 340; // approximate, for positioning logic
  const padding = 16;
  const gap = 18;

  const spaceBelow = window.innerHeight - (rect.bottom + gap);
  const spaceAbove = rect.top - gap;

  let top: number;
  if (spaceBelow > cardHeightEstimate) {
    top = rect.bottom + gap;
  } else if (spaceAbove > cardHeightEstimate) {
    top = rect.top - gap - cardHeightEstimate;
  } else {
    // Not enough room above or below — clamp into the viewport.
    top = Math.max(
      padding,
      Math.min(rect.bottom + gap, window.innerHeight - cardHeightEstimate - padding),
    );
  }

  // Horizontally center the card on the target, clamped to the viewport.
  let left = rect.left + rect.width / 2 - cardWidth / 2;
  left = Math.max(padding, Math.min(left, window.innerWidth - cardWidth - padding));

  return {
    position: "fixed",
    top,
    left,
    width: cardWidth,
    zIndex: 70,
  };
}

// ── HelpButton: floating bottom-right help dropdown ────────────────────────

function HelpButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const takeTour = () => {
    setOpen(false);
    // Defer so the dropdown's exit animation doesn't fight the overlay's
    // enter animation.
    setTimeout(() => {
      window.dispatchEvent(new Event(RESTART_EVENT));
    }, 60);
  };

  return (
    <div ref={ref} className="fixed bottom-4 right-4 z-40 sm:bottom-6 sm:right-6">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18 }}
            role="menu"
            className="absolute bottom-14 right-0 w-60 overflow-hidden rounded-lg border border-zinc-700 bg-zinc-950/95 p-1 shadow-2xl backdrop-blur-md"
          >
            <HelpMenuItem icon={Compass} label="Take the tour" onClick={takeTour} />
            <HelpMenuItem
              icon={BookOpen}
              label="Documentation"
              href="https://www.guardianx.in"
            />
            <HelpMenuItem
              icon={LifeBuoy}
              label="Contact support"
              href="mailto:hello@guardianx.in"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Help menu"
        aria-expanded={open}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="flex size-11 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition-colors hover:bg-emerald-500 hover:shadow-emerald-500/40"
      >
        <HelpCircle className="size-5" />
      </motion.button>
    </div>
  );
}

interface HelpMenuItemProps {
  icon: typeof BookOpen;
  label: string;
  onClick?: () => void;
  href?: string;
}

function HelpMenuItem({ icon: Icon, label, onClick, href }: HelpMenuItemProps) {
  const inner = (
    <>
      <Icon className="size-4 shrink-0 text-emerald-400" />
      <span className="text-sm text-zinc-200">{label}</span>
    </>
  );
  const className =
    "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-zinc-800/80";
  if (href) {
    return (
      <a
        role="menuitem"
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
        className={className}
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={className}
    >
      {inner}
    </button>
  );
}
