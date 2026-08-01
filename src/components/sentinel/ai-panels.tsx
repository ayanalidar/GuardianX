"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Brain, AlertTriangle, TrendingUp, Loader2 } from "lucide-react";

interface ThreatBriefing {
  briefing: string[];
  generated_at: string;
  summary: Record<string, number>;
}

export function ThreatBriefing() {
  const [data, setData] = useState<ThreatBriefing | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    fetch("/api/threat-briefing")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .catch(() => null)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // Refresh every 5 minutes
    const id = setInterval(load, 300000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="holo-card-sharp hud-corners p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="section-header text-sm font-bold text-violet-300">
          <Brain className="inline size-4 mr-1" />
          AI THREAT BRIEFING
        </h3>
        <div className="flex items-center gap-1.5">
          {loading ? (
            <Loader2 className="size-3 animate-spin text-violet-400" />
          ) : (
            <span className="size-1.5 rounded-full bg-violet-500 pulse-dot" />
          )}
          <span className="font-mono text-[9px] uppercase tracking-wider text-violet-400">
            {loading ? "ANALYZING" : "5MIN REFRESH"}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-violet-500/10" />
          ))}
        </div>
      ) : data?.briefing ? (
        <div className="space-y-2">
          {data.briefing.map((bullet, i) => {
            const isCritical = bullet.includes("🔴");
            const isWarning = bullet.includes("🟡");
            const isPositive = bullet.includes("🟢");
            const color = isCritical ? "red" : isWarning ? "amber" : "emerald";
            const colorMap = {
              red: { border: "border-red-500/30", bg: "bg-red-500/5", text: "text-red-300" },
              amber: { border: "border-amber-500/30", bg: "bg-amber-500/5", text: "text-amber-300" },
              emerald: { border: "border-emerald-500/30", bg: "bg-emerald-500/5", text: "text-emerald-300" },
            };
            const cfg = colorMap[color as keyof typeof colorMap];
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`rounded border ${cfg.border} ${cfg.bg} p-2 text-xs`}
              >
                <p className={cfg.text}>{bullet}</p>
              </motion.div>
            );
          })}
          <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-zinc-600">
            <span>Generated: {new Date(data.generated_at).toLocaleTimeString("en-US", { hour12: false })}</span>
            <span>{data.summary.clients} clients · {data.summary.critical_patches} critical patches</span>
          </div>
        </div>
      ) : (
        <div className="py-4 text-center text-xs text-zinc-600">Failed to generate briefing</div>
      )}
    </div>
  );
}

// ── Anomaly Detection Panel ─────────────────────────────────────────────────
export function AnomalyDetection() {
  const [data, setData] = useState<{ anomalies: { severity: string; title: string; detail: string }[]; critical: number; warnings: number } | null>(null);

  useEffect(() => {
    const load = () => {
      fetch("/api/anomaly-detection")
        .then((r) => r.json())
        .then((d) => { if (!d.error) setData(d); })
        .catch(() => null);
    };
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="holo-card-sharp hud-corners p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="section-header text-sm font-bold text-amber-300">
          <AlertTriangle className="inline size-4 mr-1" />
          ANOMALY DETECTION
        </h3>
        <div className="flex items-center gap-2 font-mono text-[10px]">
          {data?.critical ? <span className="text-red-400">🔴 {data.critical}</span> : null}
          {data?.warnings ? <span className="text-amber-400">🟡 {data.warnings}</span> : null}
          {!data?.anomalies?.length && <span className="text-emerald-400">✓ CLEAR</span>}
        </div>
      </div>

      {!data || data.anomalies.length === 0 ? (
        <div className="py-4 text-center font-mono text-xs text-zinc-600">
          <AlertTriangle className="mx-auto size-4 text-zinc-700" />
          <p className="mt-1">No anomalies detected — all systems normal</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
          {data.anomalies.map((a, i) => {
            const cfg = a.severity === "critical"
              ? { border: "border-red-500/30", bg: "bg-red-500/5", text: "text-red-300", icon: "🔴" }
              : a.severity === "warning"
              ? { border: "border-amber-500/30", bg: "bg-amber-500/5", text: "text-amber-300", icon: "🟡" }
              : { border: "border-sky-500/30", bg: "bg-sky-500/5", text: "text-sky-300", icon: "🔵" };
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className={`rounded border ${cfg.border} ${cfg.bg} p-2`}
              >
                <div className={`text-xs font-bold ${cfg.text}`}>{cfg.icon} {a.title}</div>
                <div className="mt-0.5 text-[11px] text-zinc-400">{a.detail}</div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Predictive Risk Score Panel ─────────────────────────────────────────────
export function PredictiveRiskScore() {
  const [data, setData] = useState<{ clients: { client: string; score: number; level: string; factors: string[] }[]; highest_risk: { client: string; score: number; level: string; factors: string[] } | null } | null>(null);

  useEffect(() => {
    fetch("/api/risk-score")
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .catch(() => null);
  }, []);

  const levelColor = (level: string) =>
    level === "CRITICAL" ? "red" : level === "ELEVATED" ? "amber" : level === "MODERATE" ? "sky" : "emerald";
  const colorMap = {
    red: { text: "text-red-400", border: "border-red-500/30", bg: "bg-red-500/5", bar: "bg-red-500" },
    amber: { text: "text-amber-400", border: "border-amber-500/30", bg: "bg-amber-500/5", bar: "bg-amber-500" },
    sky: { text: "text-sky-400", border: "border-sky-500/30", bg: "bg-sky-500/5", bar: "bg-sky-500" },
    emerald: { text: "text-emerald-400", border: "border-emerald-500/30", bg: "bg-emerald-500/5", bar: "bg-emerald-500" },
  };

  return (
    <div className="holo-card-sharp hud-corners p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="section-header text-sm font-bold text-rose-300">
          <TrendingUp className="inline size-4 mr-1" />
          PREDICTIVE RISK SCORE
        </h3>
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">AI MODEL</span>
      </div>

      {!data || !data.clients?.length ? (
        <div className="py-4 text-center font-mono text-xs text-zinc-600">No risk data available</div>
      ) : (
        <div className="space-y-2">
          {data.clients.slice(0, 5).map((c, i) => {
            const cfg = colorMap[levelColor(c.level) as keyof typeof colorMap];
            return (
              <motion.div
                key={c.client}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`rounded border ${cfg.border} ${cfg.bg} p-2`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate text-xs font-medium text-zinc-200">{c.client}</span>
                  <span className={`font-mono text-sm font-bold ${cfg.text}`}>{c.score}</span>
                </div>
                {/* Risk bar */}
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${c.score}%` }}
                      transition={{ duration: 0.8, delay: i * 0.05 }}
                      className={`h-full rounded-full ${cfg.bar}`}
                    />
                  </div>
                  <span className={`font-mono text-[9px] font-bold ${cfg.text}`}>{c.level}</span>
                </div>
                {/* Top factor */}
                {c.factors[0] && (
                  <div className="mt-1 truncate font-mono text-[9px] text-zinc-600">→ {c.factors[0]}</div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
