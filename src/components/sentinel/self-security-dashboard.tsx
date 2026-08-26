"use client";

/**
 * SelfSecurityDashboard
 * --------------------
 * Full-screen tab showing GuardianX's own self-security posture:
 *   1. Runtime Integrity — verifies no source files have been tampered with
 *   2. Honeypot Defense — fake endpoints that trap attackers
 *   3. Holographic Watermark — cryptographic page attestation
 */

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Shield, ShieldCheck, ShieldAlert, Bug, Fingerprint, Lock, ExternalLink, RefreshCw, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface IntegrityStatus {
  ok: boolean;
  tamperedFiles: string[];
  totalFiles: number;
  checkedAt: string;
  baselineAt: string | null;
  baseline?: { totalFiles: number; baselineAt: string | null };
  incidents: Array<{ id: string; tamperedFiles: string; detectedAt: string; status: string }>;
}

interface HoneypotData {
  hits: Array<{ id: string; endpoint: string; ipAddress: string; userAgent: string; severity: string; detectedAt: string; payload?: string }>;
  stats: { totalHits: number; uniqueIps: number; topEndpoints: Array<{ endpoint: string; count: number }> };
}

export function SelfSecurityDashboard() {
  const [integrity, setIntegrity] = useState<IntegrityStatus | null>(null);
  const [honeypot, setHoneypot] = useState<HoneypotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [watermark, setWatermark] = useState("");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [iRes, hRes] = await Promise.all([
        fetch("/api/self-security/integrity"),
        fetch("/api/self-security/honeypot"),
      ]);
      if (iRes.ok) setIntegrity(await iRes.json());
      if (hRes.ok) setHoneypot(await hRes.json());
    } catch {}
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const generateWatermark = () => {
    const ts = new Date().toISOString();
    const hmac = Math.random().toString(36).slice(2, 18) + Math.random().toString(36).slice(2, 18);
    setWatermark(`guardianx:attested:${ts}:admin:${hmac.slice(0, 32)}`);
  };

  const copyWm = () => {
    navigator.clipboard.writeText(watermark);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCw className="size-6 animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="holo-card-sharp hud-corners relative overflow-hidden p-5">
        <div aria-hidden className="cyber-grid pointer-events-none absolute inset-0 opacity-20" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex size-12 items-center justify-center rounded-lg border border-emerald-500/50 bg-emerald-500/10 neon-border">
                <Shield className="size-6 text-emerald-400" />
              </div>
              <span className="absolute -right-1 -top-1 size-3 rounded-full bg-emerald-500 pulse-dot" />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-50">
                <span className="neon-emerald">GUARDIANX</span> SELF-SECURITY
              </h2>
              <div className="font-mono text-[10px] uppercase tracking-wider text-emerald-500/60">
                Self-Attesting Runtime · Honeypot Defense · Holographic Watermark
              </div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Section 1: Runtime Integrity */}
      <div className="holo-card-sharp hud-corners p-5">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="size-5 text-emerald-400" />
          <h3 className="text-lg font-bold text-zinc-50">Runtime Integrity</h3>
          {integrity?.ok ? (
            <Badge className="ml-auto border-emerald-500/40 bg-emerald-500/10 text-emerald-300">ALL FILES VERIFIED</Badge>
          ) : (
            <Badge className="ml-auto border-red-500/40 bg-red-500/10 text-red-300">TAMPER DETECTED</Badge>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Files Monitored" value={integrity?.totalFiles ?? 0} color="emerald" />
          <Stat label="Tampered" value={integrity?.tamperedFiles.length ?? 0} color={integrity?.tamperedFiles.length ? "red" : "emerald"} />
          <Stat label="Incidents" value={integrity?.incidents.length ?? 0} color="amber" />
          <Stat label="Last Check" value={integrity?.checkedAt ? new Date(integrity.checkedAt).toLocaleTimeString() : "—"} color="cyan" small />
        </div>
        {integrity && integrity.tamperedFiles.length > 0 && (
          <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3">
            <div className="mb-2 font-mono text-xs font-bold text-red-300">⚠ TAMPERED FILES:</div>
            <div className="space-y-1">
              {integrity.tamperedFiles.map((f) => (
                <div key={f} className="font-mono text-xs text-red-200">{f}</div>
              ))}
            </div>
          </div>
        )}
        {integrity && integrity.incidents.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">Recent Incidents</div>
            <div className="max-h-32 space-y-1 overflow-y-auto custom-scrollbar">
              {integrity.incidents.slice(0, 5).map((inc) => (
                <div key={inc.id} className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1 text-xs">
                  <ShieldAlert className="size-3 text-amber-400" />
                  <span className="font-mono text-zinc-400">{new Date(inc.detectedAt).toLocaleString()}</span>
                  <span className={`ml-auto font-mono ${inc.status === "open" ? "text-red-400" : "text-emerald-400"}`}>{inc.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Honeypot Defense */}
      <div className="holo-card-sharp hud-corners p-5">
        <div className="mb-4 flex items-center gap-2">
          <Bug className="size-5 text-amber-400" />
          <h3 className="text-lg font-bold text-zinc-50">Honeypot Defense</h3>
          <Badge className="ml-auto border-amber-500/40 bg-amber-500/10 text-amber-300">{honeypot?.stats.totalHits ?? 0} HITS</Badge>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Total Hits" value={honeypot?.stats.totalHits ?? 0} color="amber" />
          <Stat label="Unique IPs" value={honeypot?.stats.uniqueIps ?? 0} color="red" />
          <Stat label="Top Endpoint" value={honeypot?.stats.topEndpoints[0]?.endpoint ?? "—"} color="cyan" small />
        </div>
        {honeypot && honeypot.hits.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">Recent Hits</div>
            <div className="max-h-48 space-y-1 overflow-y-auto custom-scrollbar">
              {honeypot.hits.slice(0, 10).map((h) => (
                <div key={h.id} className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 text-xs">
                  <span className={`size-1.5 rounded-full ${h.severity === "critical" ? "bg-red-500" : "bg-amber-500"}`} />
                  <span className="font-mono text-zinc-300">{h.endpoint}</span>
                  <span className="font-mono text-zinc-500">{h.ipAddress.slice(0, 30)}</span>
                  <span className="ml-auto font-mono text-zinc-600">{new Date(h.detectedAt).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {honeypot && honeypot.stats.totalHits === 0 && (
          <div className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center text-xs text-emerald-300/70">
            No honeypot hits yet. Attackers who probe /api/admin/_internal, /api/.env, /api/debug, or /api/backup will be logged here.
          </div>
        )}
      </div>

      {/* Section 3: Holographic Watermark */}
      <div className="holo-card-sharp hud-corners p-5">
        <div className="mb-4 flex items-center gap-2">
          <Fingerprint className="size-5 text-cyan-400" />
          <h3 className="text-lg font-bold text-zinc-50">Holographic Watermark</h3>
          <a href="/verify" target="_blank" rel="noopener noreferrer" className="ml-auto">
            <Button variant="outline" size="sm">
              <ExternalLink className="size-3.5" /> Verify Page
            </Button>
          </a>
        </div>
        <p className="mb-4 text-sm text-zinc-400">
          Every GuardianX page includes a cryptographic watermark (hidden HTML comment + <code className="text-cyan-400">X-GuardianX-Attestation</code> header).
          Signed with HMAC-SHA256 using the server's secret key. Cannot be forged. Watermarks expire after 90 days.
        </p>
        <div className="flex gap-2">
          <Button onClick={generateWatermark} variant="outline" className="border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20">
            <Fingerprint className="size-4" /> Generate Sample Watermark
          </Button>
          {watermark && (
            <Button onClick={copyWm} variant="outline" size="icon">
              {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
            </Button>
          )}
        </div>
        {watermark && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950/80 p-3"
          >
            <div className="font-mono text-[10px] text-zinc-500">Watermark:</div>
            <div className="mt-1 break-all font-mono text-xs text-cyan-300">{watermark}</div>
          </motion.div>
        )}
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {["Pass vendor security questionnaires", "Win enterprise deals without source-code disclosure", "Prove compliance without sharing findings"].map((uc) => (
            <div key={uc} className="rounded border border-zinc-800 bg-zinc-950/60 p-2 text-xs text-zinc-400">
              <Lock className="mb-1 size-3 text-cyan-400" />
              {uc}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color, small }: { label: string; value: string | number; color: string; small?: boolean }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-400",
    red: "text-red-400",
    amber: "text-amber-400",
    cyan: "text-cyan-400",
  };
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
      <div className={`font-mono text-lg font-bold ${colorMap[color] || colorMap.emerald} ${small ? "text-xs" : ""}`}>{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-zinc-500">{label}</div>
    </div>
  );
}
