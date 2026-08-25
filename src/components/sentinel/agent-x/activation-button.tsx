"use client";

/**
 * AgentXActivationButton
 * -----------------------
 * Dashboard-header toggle that activates Agent X.
 *
 * The button is mounted next to the existing Refresh / Creds / Logout
 * buttons in the Command Center header. It owns no state of its own —
 * `active` is a controlled prop driven by the parent (page.tsx), and
 * a single `onClick` callback flips it.
 *
 * 'X' keyboard shortcut: when not focused in an input/textarea, pressing
 * 'X' toggles Agent X via the same `onClick` callback. This is the only
 * place where the shortcut lives — the Agent X panel itself only has an
 * `onClose` (no `onOpen`) and so cannot self-toggle. The button is always
 * mounted in the header, so the shortcut works whether or not the panel
 * is currently open.
 *
 * Visual states:
 *   - inactive: subtle zinc border, dim Bot icon, "AGENT X" label
 *   - active:   emerald glow, pulsing dot, "ACTIVE" badge
 *
 * Reuses the `pulse-dot` + `neon-emerald` design tokens so it matches
 * the rest of the Command Center HUD aesthetic.
 */

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Bot } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface AgentXActivationButtonProps {
  active: boolean;
  onClick: () => void;
}

export function AgentXActivationButton({
  active,
  onClick,
}: AgentXActivationButtonProps) {
  // 'X' keyboard shortcut — toggle Agent X from anywhere in the Command
  // Center, EXCEPT when the user is typing in an input/textarea/contenteditable
  // (so we don't steal 'x' from typed text) or when a modifier is held
  // (Ctrl+X cut, Cmd+X, etc.).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();
      if (key !== "x") return;
      // Skip if focused inside a typing surface.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      // Skip modified 'x' (Ctrl+X cut, Cmd+X, Alt+X, etc.).
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      onClick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClick]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={active ? "Deactivate Agent X" : "Activate Agent X"}
          aria-pressed={active}
          className={`relative flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[10px] uppercase tracking-wider transition-all ${
            active
              ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300 shadow-[0_0_16px_rgba(16,185,129,0.25)] hover:bg-emerald-500/25"
              : "border-zinc-700 bg-zinc-900/60 text-zinc-400 hover:border-emerald-500/40 hover:bg-emerald-500/5 hover:text-emerald-300"
          }`}
        >
          <span className="relative flex items-center">
            <Bot
              className={`size-3.5 ${active ? "text-emerald-300" : "text-zinc-400"}`}
            />
            {active && (
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="pulse-dot absolute -right-1 -top-1 size-1.5 rounded-full bg-emerald-500"
              />
            )}
          </span>
          <span className={active ? "neon-emerald" : ""}>Agent X</span>
          {active && (
            <span className="ml-0.5 rounded-sm border border-emerald-500/40 bg-emerald-500/10 px-1 py-0 text-[8px] tracking-widest text-emerald-300">
              ACTIVE
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {active ? "Deactivate Agent X" : "Activate Agent X (X)"}
      </TooltipContent>
    </Tooltip>
  );
}

export default AgentXActivationButton;
