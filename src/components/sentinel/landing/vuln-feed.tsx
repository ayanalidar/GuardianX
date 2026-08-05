"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ShieldCheck, X } from "lucide-react";

/**
 * VulnFeed
 * --------
 * A horizontal scrolling ticker that streams recent findings from the DB
 * (via `/api/findings?limit=20`) and falls back to realistic anonymized
 * mock data if the API is unavailable or returns nothing.
 *
 * Features:
 *  - LIVE indicator with pulsing emerald dot + DB/sample source badge
 *  - Continuous CSS marquee animation, pauses on hover
 *  - Click a finding → opens a centered detail dialog with description +
 *    payload + remediation
 *  - Duplicate-track seamless infinite scroll
 *  - Respects prefers-reduced-motion (static render)
 */

export interface FeedItem {
  id: string;
  title: string;
  endpoint?: string;
  severity: Severity | string;
  time: string; // HH:MM
  owasp?: string | null;
  method?: string | null;
  description?: string | null;
  payload?: string | null;
  remediation?: string | null;
  confidence?: number | null;
}

type Severity = "critical" | "high" | "medium" | "low" | "info" | "patch";

const SEV_META: Record<
  string,
  { color: string; bg: string; border: string; icon: string }
> = {
  critical: { color: "text-red-300", bg: "bg-red-500/10", border: "border-red-500/30", icon: "🔴" },
  high: { color: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/30", icon: "🟠" },
  medium: { color: "text-yellow-300", bg: "bg-yellow-500/10", border: "border-yellow-500/30", icon: "🟡" },
  low: { color: "text-cyan-300", bg: "bg-cyan-500/10", border: "border-cyan-500/30", icon: "🔵" },
  info: { color: "text-zinc-300", bg: "bg-zinc-500/10", border: "border-zinc-500/30", icon: "⚪" },
  patch: { color: "text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/30", icon: "🟢" },
};

function sevKey(raw: string): keyof typeof SEV_META {
  const k = (raw || "").toLowerCase();
  if (k.includes("crit")) return "critical";
  if (k.includes("high")) return "high";
  if (k.includes("med")) return "medium";
  if (k.includes("low")) return "low";
  if (k.includes("info")) return "info";
  if (k.includes("patch") || k.includes("approve") || k.includes("ok")) return "patch";
  return "info";
}

/** Realistic anonymized mock data — used when the API is unreachable or empty. */
const MOCK_FEED: FeedItem[] = [
  { id: "m1", title: "SQL Injection", endpoint: "/api/users", severity: "critical", time: "14:32", owasp: "A03:2021", method: "GET", description: "User-supplied `id` parameter is concatenated directly into a SQL query, allowing auth bypass.", payload: "' OR 1=1--", remediation: "Use parameterized queries / prepared statements.", confidence: 0.97 },
  { id: "m2", title: "XSS reflected", endpoint: "/search", severity: "high", time: "14:31", owasp: "A03:2021", method: "GET", description: "Search query is echoed into HTML without encoding, allowing script injection.", payload: "<script>alert(1)</script>", remediation: "Encode output on the server; set CSP.", confidence: 0.91 },
  { id: "m3", title: "Patch approved", endpoint: "SP-2026-0039", severity: "patch", time: "14:30", description: "Auto-generated patch for SQLi was approved by analyst. SHA-256 attestation recorded on-chain.", remediation: "Deploy to production.", confidence: 1.0 },
  { id: "m4", title: "Path Traversal", endpoint: "/file", severity: "critical", time: "14:29", owasp: "A01:2021", method: "GET", description: "Filename parameter allows `../` sequences, leaking `/etc/passwd`.", payload: "../../etc/passwd", remediation: "Canonicalize + allowlist file paths.", confidence: 0.94 },
  { id: "m5", title: "Missing HSTS header", endpoint: "/", severity: "medium", time: "14:27", owasp: "A05:2021", method: "GET", description: "Strict-Transport-Security header is not set.", remediation: "Add HSTS with max-age ≥ 31536000.", confidence: 0.88 },
  { id: "m6", title: "IDOR on /api/orders", endpoint: "/api/orders/:id", severity: "high", time: "14:25", owasp: "A01:2021", method: "GET", description: "Order IDs are sequential with no authorization check.", remediation: "Enforce per-user authorization on every read.", confidence: 0.93 },
  { id: "m7", title: "Outdated jQuery 3.4.1", endpoint: "/assets/vendor.js", severity: "low", time: "14:23", owasp: "A06:2021", method: "GET", description: "Known prototype-pollution CVE in jQuery 3.4.1.", remediation: "Upgrade to jQuery ≥ 3.5.0.", confidence: 0.86 },
  { id: "m8", title: "Verbose error leak", endpoint: "/api/login", severity: "low", time: "14:21", owasp: "A05:2021", method: "POST", description: "Stack trace exposed in 500 response.", remediation: "Disable verbose errors in prod.", confidence: 0.82 },
  { id: "m9", title: "SSRF via webhook", endpoint: "/api/webhook/test", severity: "high", time: "14:19", owasp: "A10:2021", method: "POST", description: "Webhook URL fetch has no allowlist — can reach internal metadata endpoints.", remediation: "Allowlist egress hosts; block 169.254.0.0/16.", confidence: 0.9 },
  { id: "m10", title: "Weak TLS — TLS 1.0 enabled", endpoint: ":443", severity: "medium", time: "14:17", owasp: "A02:2021", method: "TLS", description: "Server negotiates deprecated TLS 1.0.", remediation: "Disable TLS < 1.2.", confidence: 0.89 },
  { id: "m11", title: "Open redirect", endpoint: "/redirect", severity: "medium", time: "14:15", owasp: "A01:2021", method: "GET", description: "`next` param allows redirect to arbitrary external hosts.", remediation: "Validate redirect targets against allowlist.", confidence: 0.85 },
  { id: "m12", title: "Patch approved", endpoint: "SP-2026-0040", severity: "patch", time: "14:13", description: "XSS remediation patch approved and attested.", confidence: 1.0 },
  { id: "m13", title: "JWT alg=none", endpoint: "/api/auth/verify", severity: "critical", time: "14:11", owasp: "A02:2021", method: "POST", description: "JWT library accepts `alg: none`, allowing token forgery.", remediation: "Pin allowed algorithms to RS256/HS256.", confidence: 0.96 },
  { id: "m14", title: "Clickjacking", endpoint: "/", severity: "low", time: "14:09", owasp: "A05:2021", method: "GET", description: "X-Frame-Options / CSP frame-ancestors missing.", remediation: "Set frame-ancestors 'none'.", confidence: 0.83 },
  { id: "m15", title: "Rate-limit missing", endpoint: "/api/login", severity: "medium", time: "14:07", owasp: "A07:2021", method: "POST", description: "No throttle on auth endpoint — credential stuffing feasible.", remediation: "Add 5/min/IP rate-limit + MFA.", confidence: 0.87 },
  { id: "m16", title: "CSRF on /api/settings", endpoint: "/api/settings", severity: "high", time: "14:05", owasp: "A01:2021", method: "POST", description: "State-changing endpoint lacks CSRF token.", remediation: "Add SameSite=Lax + CSRF token.", confidence: 0.92 },
  { id: "m17", title: "Debug endpoint exposed", endpoint: "/__debug", severity: "critical", time: "14:03", owasp: "A05:2021", method: "GET", description: "Internal debug endpoint reachable in production.", remediation: "Remove or gate behind auth.", confidence: 0.95 },
  { id: "m18", title: "Sensitive cookie no HttpOnly", endpoint: "/", severity: "medium", time: "14:01", owasp: "A05:2021", method: "GET", description: "Session cookie readable via JS — XSS can exfiltrate.", remediation: "Set HttpOnly + Secure + SameSite.", confidence: 0.88 },
  { id: "m19", title: "Insecure deserialization", endpoint: "/api/import", severity: "critical", time: "13:59", owasp: "A08:2021", method: "POST", description: "Pickle payload deserialized untrusted input.", remediation: "Use JSON or signed payloads.", confidence: 0.96 },
  { id: "m20", title: "Patch approved", endpoint: "SP-2026-0041", severity: "patch", time: "13:57", description: "Path traversal fix attested on chain.", confidence: 1.0 },
];

function fmtTime(dateStr?: string): string {
  if (!dateStr) return "--:--";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
}

interface ApiFinding {
  id: string;
  title: string;
  severity: string;
  endpoint?: string | null;
  owasp?: string | null;
  method?: string | null;
  description?: string | null;
  payload?: string | null;
  remediation?: string | null;
  confidence?: number | null;
  created_at?: string;
}

function fromApiFinding(f: ApiFinding): FeedItem {
  return {
    id: f.id,
    title: f.title,
    endpoint: f.endpoint ?? undefined,
    severity: f.severity,
    time: fmtTime(f.created_at),
    owasp: f.owasp ?? null,
    method: f.method ?? null,
    description: f.description ?? null,
    payload: f.payload ?? null,
    remediation: f.remediation ?? null,
    confidence: f.confidence ?? null,
  };
}

function FeedChip({
  item,
  onOpen,
}: {
  item: FeedItem;
  onOpen: (item: FeedItem) => void;
}) {
  const meta = SEV_META[sevKey(item.severity)];
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={`gx-chip flex shrink-0 items-center gap-2 rounded-full border ${meta.border} ${meta.bg} px-3 py-1.5 text-left font-mono text-xs transition-all hover:scale-[1.02] hover:shadow-[0_0_16px_rgba(16,185,129,0.25)]`}
    >
      <span className="text-sm" aria-hidden>{meta.icon}</span>
      <span className="text-zinc-500 tabular-nums">[{item.time}]</span>
      <span className={`${meta.color} font-semibold`}>{item.title}</span>
      {item.endpoint ? <span className="text-zinc-400">— {item.endpoint}</span> : null}
      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${meta.color} ${meta.bg}`}>
        {item.severity}
      </span>
    </button>
  );
}

function FeedDetailDialog({
  item,
  onClose,
}: {
  item: FeedItem;
  onClose: () => void;
}) {
  const meta = SEV_META[sevKey(item.severity)];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Finding detail: ${item.title}`}>
      <motion.button
        type="button"
        aria-label="Close finding detail"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className={`relative w-[min(92vw,560px)] rounded-lg border ${meta.border} bg-zinc-950/95 p-5 shadow-2xl`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base" aria-hidden>{meta.icon}</span>
              <h3 className={`text-base font-bold ${meta.color}`}>{item.title}</h3>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${meta.color} ${meta.bg}`}>
                {item.severity}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-zinc-500">
              <span className="tabular-nums">[{item.time}]</span>
              {item.method ? <span className="rounded bg-zinc-800 px-1.5 py-0.5">{item.method}</span> : null}
              {item.endpoint ? <span className="text-cyan-300/80">{item.endpoint}</span> : null}
              {item.owasp ? <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-violet-300/80">OWASP {item.owasp}</span> : null}
              {typeof item.confidence === "number" && item.confidence > 0 ? (
                <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-300/80">
                  conf {(item.confidence * 100).toFixed(0)}%
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        {item.description ? (
          <p className="mb-3 text-sm leading-relaxed text-zinc-300">{item.description}</p>
        ) : null}
        {item.payload ? (
          <div className="mb-3">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-red-400/70">Payload</div>
            <pre className="custom-scrollbar overflow-x-auto rounded-md border border-red-500/20 bg-black/60 p-2 font-mono text-[11px] text-red-200">{item.payload}</pre>
          </div>
        ) : null}
        {item.remediation ? (
          <div className="mb-1 flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-emerald-400/70">Remediation</div>
              <p className="text-sm text-zinc-300">{item.remediation}</p>
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex items-center justify-between border-t border-zinc-800 pt-3 font-mono text-[10px] text-zinc-600">
          <span>Finding ID: {item.id.slice(0, 12)}</span>
          <span className="text-emerald-400/70">Sign up to triage →</span>
        </div>
      </motion.div>
    </div>
  );
}

export function VulnFeed() {
  const [items, setItems] = useState<FeedItem[]>(MOCK_FEED);
  const [source, setSource] = useState<"live" | "mock">("mock");
  const [selected, setSelected] = useState<FeedItem | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Respect reduced motion preference (no infinite marquee).
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Try real API first; fall back to mock data on failure / empty.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/findings?limit=20", { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as unknown;
        if (!Array.isArray(data) || data.length === 0) {
          if (!cancelled) setSource("mock");
          return;
        }
        const mapped = (data as ApiFinding[]).map(fromApiFinding);
        if (!cancelled) {
          setItems(mapped);
          setSource("live");
        }
      } catch {
        if (!cancelled) setSource("mock");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close popover on ESC.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  // Duplicate the track so the marquee loop is seamless.
  const track = useMemo(() => [...items, ...items], [items]);

  // Pick a slightly different duration based on item count so the
  // scroll speed feels consistent regardless of feed length.
  const durationSec = useMemo(
    () => Math.max(28, Math.min(80, items.length * 3.2)),
    [items.length]
  );

  return (
    <section
      aria-label="Live vulnerability feed"
      className="relative z-20 border-y border-zinc-800/80 bg-zinc-950/70 backdrop-blur"
    >
      {/* Scoped keyframes + hover-pause rules */}
      <style>{`
        @keyframes gx-marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .gx-ticker:hover .gx-track {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .gx-track { animation: none !important; }
        }
      `}</style>

      <div className="mx-auto flex max-w-[120rem] items-stretch">
        {/* LIVE indicator */}
        <div className="flex shrink-0 items-center gap-2 border-r border-zinc-800/80 bg-zinc-950 px-4 py-2.5">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-emerald-400">
            Live
          </span>
          <span
            className={`hidden rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider sm:inline ${
              source === "live"
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-amber-500/15 text-amber-300"
            }`}
            title={
              source === "live"
                ? "Streaming from /api/findings"
                : "API unavailable — showing anonymized sample data"
            }
          >
            {source === "live" ? "DB" : "sample"}
          </span>
        </div>

        {/* Marquee track */}
        <div
          ref={containerRef}
          className="gx-ticker group relative flex-1 overflow-hidden py-2.5"
          aria-live="polite"
        >
          <div
            className="gx-track flex w-max gap-3 px-3 will-change-transform"
            style={
              reducedMotion
                ? undefined
                : { animation: `gx-marquee ${durationSec}s linear infinite` }
            }
          >
            {track.map((item, idx) => (
              <FeedChip
                key={`${item.id}-${idx}`}
                item={item}
                onOpen={setSelected}
              />
            ))}
          </div>
          {/* Edge fade masks */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-zinc-950 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-zinc-950 to-transparent" />
        </div>
      </div>

      <AnimatePresence>
        {selected ? (
          <FeedDetailDialog item={selected} onClose={() => setSelected(null)} />
        ) : null}
      </AnimatePresence>
    </section>
  );
}
