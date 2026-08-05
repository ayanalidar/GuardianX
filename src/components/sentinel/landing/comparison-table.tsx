"use client";

import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

interface Cell {
  burp: boolean | "partial";
  snyk: boolean | "partial";
  tenable: boolean | "partial";
  guardianx: boolean;
}

const ROWS: { feature: string; cell: Cell }[] = [
  { feature: "AI-driven attack planning", cell: { burp: false, snyk: false, tenable: false, guardianx: true } },
  { feature: "Auto-remediation (code patches)", cell: { burp: false, snyk: "partial", tenable: false, guardianx: true } },
  { feature: "DPDPA 2023 compliance", cell: { burp: false, snyk: false, tenable: false, guardianx: true } },
  { feature: "Cryptographic patch attestation", cell: { burp: false, snyk: false, tenable: false, guardianx: true } },
  { feature: "Adversarial self-attack arena", cell: { burp: false, snyk: false, tenable: false, guardianx: true } },
  { feature: "Autonomous R&D lab", cell: { burp: false, snyk: false, tenable: false, guardianx: true } },
  { feature: "Self-healing runtime", cell: { burp: false, snyk: false, tenable: false, guardianx: true } },
  { feature: "Live exploit PoC generation", cell: { burp: true, snyk: false, tenable: false, guardianx: true } },
  { feature: "SAST + DAST in one platform", cell: { burp: false, snyk: "partial", tenable: "partial", guardianx: true } },
  { feature: "Multi-tenant SOC operations", cell: { burp: false, snyk: false, tenable: "partial", guardianx: true } },
];

interface Col {
  key: "burp" | "snyk" | "tenable" | "guardianx";
  label: string;
  highlight?: boolean;
}

const COLS: Col[] = [
  { key: "burp", label: "Burp Suite" },
  { key: "snyk", label: "Snyk" },
  { key: "tenable", label: "Tenable" },
  { key: "guardianx", label: "GuardianX", highlight: true },
];

function CellMark({ value, highlight }: { value: boolean | "partial"; highlight?: boolean }) {
  if (value === true) {
    return (
      <span
        className={`inline-flex size-6 items-center justify-center rounded-full ${
          highlight
            ? "bg-emerald-500/25 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.5)]"
            : "bg-emerald-500/15 text-emerald-400"
        }`}
      >
        <Check className="size-3.5" />
      </span>
    );
  }
  if (value === "partial") {
    return (
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-amber-500/15 px-2 text-[10px] font-bold text-amber-400">
        ~
      </span>
    );
  }
  return (
    <span className="inline-flex size-6 items-center justify-center rounded-full bg-zinc-800/60 text-zinc-600">
      <X className="size-3.5" />
    </span>
  );
}

export function ComparisonTable() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="mb-10 text-center">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-emerald-500/60">
          {"// Side-by-side"}
        </div>
        <h2 className="text-3xl font-bold text-zinc-50 sm:text-4xl">GuardianX vs legacy tooling</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-zinc-400">
          Why teams replace 3–5 point tools with one autonomous platform.
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.5 }}
        className="holo-card-sharp hud-corners overflow-hidden p-1 sm:p-2"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="px-4 py-4 text-left font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  Feature
                </th>
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    className={`px-4 py-4 text-center font-mono text-[10px] uppercase tracking-widest ${
                      c.highlight ? "text-emerald-300" : "text-zinc-500"
                    }`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <motion.tr
                  key={row.feature}
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.04 }}
                  className={`border-t border-zinc-800/80 ${i % 2 === 0 ? "bg-zinc-900/30" : ""} hover:bg-emerald-500/5`}
                >
                  <td className="px-4 py-3 text-left text-zinc-300">{row.feature}</td>
                  {COLS.map((c) => {
                    const value = row.cell[c.key];
                    return (
                      <td
                        key={c.key}
                        className={`px-4 py-3 text-center ${
                          c.highlight ? "bg-emerald-500/[0.04]" : ""
                        }`}
                      >
                        <CellMark value={value} highlight={c.highlight} />
                      </td>
                    );
                  })}
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-[11px] text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-flex size-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
            <Check className="size-2.5" />
          </span>
          full support
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex size-4 items-center justify-center rounded-full bg-amber-500/15 text-[9px] font-bold text-amber-400">
            ~
          </span>
          partial / via add-on
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-flex size-4 items-center justify-center rounded-full bg-zinc-800 text-zinc-600">
            <X className="size-2.5" />
          </span>
          not supported
        </span>
      </div>
    </section>
  );
}
