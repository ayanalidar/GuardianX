"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Rocket, Bug, Crosshair, ShieldCheck, Swords, Shield, Gavel,
  Loader2, X, CheckCircle2, ChevronRight, Building2,
} from "lucide-react";

interface ServiceLauncherProps {
  open: boolean;
  onClose: () => void;
  preselectedClientIds?: string[];
  onLaunched?: () => void;
}

const SERVICES = [
  { key: "scan", label: "Scan", desc: "SAST + DAST vulnerability scanning", icon: Bug, color: "cyan", stage: 2 },
  { key: "test", label: "Test", desc: "Run exploit PoCs against findings", icon: Crosshair, color: "amber", stage: 3 },
  { key: "patch", label: "Patch", desc: "Auto-approve patches that passed sandbox", icon: ShieldCheck, color: "violet", stage: 4 },
  { key: "verify", label: "Verify", desc: "Re-run exploits against patched code", icon: Swords, color: "sky", stage: 5 },
  { key: "defend", label: "Defend", desc: "Deploy canaries + honeypots", icon: Shield, color: "rose", stage: 6 },
  { key: "comply", label: "Comply", desc: "Verify compliance + generate report", icon: Gavel, color: "emerald", stage: 7 },
];

// Simple client type for the launcher (lightweight — no nested stats)
interface SimpleClient {
  id: string;
  name: string;
  authorized: boolean;
}

const COLOR_MAP: Record<string, { text: string; border: string; bg: string; ring: string }> = {
  cyan: { text: "text-cyan-400", border: "border-cyan-500/40", bg: "bg-cyan-500/10", ring: "ring-cyan-500/30" },
  amber: { text: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-500/10", ring: "ring-amber-500/30" },
  violet: { text: "text-violet-400", border: "border-violet-500/40", bg: "bg-violet-500/10", ring: "ring-violet-500/30" },
  sky: { text: "text-sky-400", border: "border-sky-500/40", bg: "bg-sky-500/10", ring: "ring-sky-500/30" },
  rose: { text: "text-rose-400", border: "border-rose-500/40", bg: "bg-rose-500/10", ring: "ring-rose-500/30" },
  emerald: { text: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10", ring: "ring-emerald-500/30" },
};

export function ServiceLauncher({ open, onClose, preselectedClientIds = [], onLaunched }: ServiceLauncherProps) {
  const { toast } = useToast();
  const [clients, setClients] = useState<SimpleClient[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(preselectedClientIds);
  const [selectedService, setSelectedService] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [step, setStep] = useState(1);

  // Lock body scroll when modal is open + load clients
  useEffect(() => {
    if (open) {
      // Lock background scroll
      document.body.style.overflow = "hidden";
      // Fetch lightweight client list (id + name + authorized only — fast)
      fetch("/api/clients")
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d)) {
            // Map to simple format — don't keep heavy stats in state
            setClients(d.map((c: any) => ({ id: c.id, name: c.name, authorized: c.authorized })));
          }
        })
        .catch(() => null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIds(preselectedClientIds);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStep(1);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResult(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedService("");
    } else {
      // Unlock background scroll when closed
      document.body.style.overflow = "";
    }
    // Cleanup on unmount
    return () => { document.body.style.overflow = ""; };
  }, [open, preselectedClientIds]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [open, onClose]);

  if (!open) return null;

  const launch = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/launch-service", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service: selectedService,
          clientIds: selectedIds,
          config: selectedService === "patch" ? { severity: "critical" } : {},
        }),
      });
      const data = await res.json();
      setResult(data);
      toast({ title: "Service launched!", description: data.message });
      if (onLaunched) onLaunched();
    } catch {
      toast({ variant: "destructive", title: "Launch failed" });
    }
    setLoading(false);
  };

  const toggleClient = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  };

  const selectedClients = clients.filter((c) => selectedIds.includes(c.id));

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="holo-card-sharp hud-corners custom-scrollbar max-h-[85vh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-lg p-6"
        style={{ scrollbarGutter: "stable" }}
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10">
              <Rocket className="size-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-zinc-50">Launch Service</h2>
              <p className="text-[10px] font-mono uppercase tracking-wider text-emerald-500/60">STEP {step} OF 3 · PRESS ESC TO CLOSE</p>
            </div>
          </div>
          {/* Close button — FIXED: now calls onClose */}
          <button
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-400 transition-all hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Step 1: Select Clients */}
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-2">
            <span className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${step >= 1 ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-600"}`}>1</span>
            <span className="text-sm font-semibold text-zinc-200">Select Client(s)</span>
            {selectedIds.length > 0 && <span className="text-[10px] text-emerald-400">{selectedIds.length} selected</span>}
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {clients.map((c) => (
              <label
                key={c.id}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-xs transition-all ${
                  selectedIds.includes(c.id)
                    ? "border-emerald-500/50 bg-emerald-500/10"
                    : "border-zinc-700 bg-zinc-900/50 hover:border-zinc-600"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(c.id)}
                  onChange={() => toggleClient(c.id)}
                  className="accent-emerald-500"
                />
                <Building2 className="size-3 text-emerald-400" />
                <span className="flex-1 truncate text-zinc-200">{c.name}</span>
                {!c.authorized && <span className="text-[8px] text-amber-400">NO AUTH</span>}
              </label>
            ))}
          </div>
        </div>

        {/* Step 2: Select Service */}
        {selectedIds.length > 0 && (
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2">
              <span className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${step >= 2 ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-600"}`}>2</span>
              <span className="text-sm font-semibold text-zinc-200">Select Service</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {SERVICES.map((s) => {
                const cfg = COLOR_MAP[s.color];
                const isSelected = selectedService === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => { setSelectedService(s.key); setStep(3); }}
                    className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${
                      isSelected
                        ? `${cfg.border} ${cfg.bg} ring-1 ${cfg.ring}`
                        : "border-zinc-700 bg-zinc-900/50 hover:border-zinc-600"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <s.icon className={`size-4 ${isSelected ? cfg.text : "text-zinc-500"}`} />
                      <span className={`text-xs font-bold ${isSelected ? cfg.text : "text-zinc-300"}`}>{s.label}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500">{s.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3: Review + Launch */}
        {selectedService && (
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-bold text-emerald-300">3</span>
              <span className="text-sm font-semibold text-zinc-200">Review & Launch</span>
            </div>
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3">
              <div className="mb-2 text-xs text-zinc-400">Will execute:</div>
              <div className="space-y-1">
                {selectedClients.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-xs">
                    <ChevronRight className="size-3 text-emerald-400" />
                    <span className="text-zinc-200">{SERVICES.find((s) => s.key === selectedService)?.label}</span>
                    <span className="text-zinc-500">on</span>
                    <span className="text-emerald-300">{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="mb-5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-300">
              <CheckCircle2 className="size-4" />
              {result.message}
            </div>
            {result.launched?.length > 0 && (
              <div className="mt-2 space-y-1">
                {result.launched.slice(0, 10).map((l: any, i: number) => (
                  <div key={i} className="text-[11px] text-zinc-400">
                    • <span className="text-zinc-300">{l.client}</span> — <span className="text-emerald-400">{l.service}</span>: {l.status}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800">
            Cancel
          </Button>
          <Button
            onClick={launch}
            disabled={!selectedService || selectedIds.length === 0 || loading}
            className="bg-emerald-600 text-white hover:bg-emerald-500 neon-border"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
            Launch {SERVICES.find((s) => s.key === selectedService)?.label || "Service"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
