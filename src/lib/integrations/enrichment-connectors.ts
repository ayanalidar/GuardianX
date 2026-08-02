// GuardianX Enrichment Connectors - 5 threat-intel lookups.
//
// Each connector takes an IOC value + type and returns a structured
// enrichment record (reputation, classifications, related IOCs).
// enrichIOC() is the public entry point: it fans out across every
// active enrichment and merges the results.
//
// All connectors use HTTP GET with short timeouts and never throw -
// they return { ok: false, detail } on failure so a single broken
// provider doesn't poison the whole enrichment.

import type { ConnectorSchema } from "./engine";

export type IOCType = "ip" | "hash" | "domain" | "url" | "email" | "user_agent";

export interface EnrichmentResult {
  provider: string;
  ok: boolean;
  status?: number;
  detail?: string;
  reputation?: "clean" | "suspicious" | "malicious" | "unknown";
  score?: number; // 0..100, higher = more malicious
  classifications?: string[];
  tags?: string[];
  relatedIOCs?: Array<{ type: IOCType; value: string }>;
  raw?: unknown;
  latencyMs?: number;
}

export interface EnrichmentConnector extends ConnectorSchema {
  direction: "enrichment";
  supportedTypes: IOCType[];
  lookup: (value: string, type: IOCType, config: Record<string, unknown>) => Promise<EnrichmentResult>;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function safeJson(res: Response): Promise<unknown> {
  try { return res.json(); } catch { return Promise.resolve(null); }
}

// ── Connectors ─────────────────────────────────────────────────────────────

// 1. VirusTotal (v3 API)
function makeVirusTotal(): EnrichmentConnector {
  return {
    id: "virustotal",
    name: "VirusTotal",
    category: "Compliance & Reporting",
    direction: "enrichment",
    description: "Look up file hashes, IPs, domains, and URLs against VirusTotal.",
    icon: "Shield",
    supportedTypes: ["ip", "hash", "domain", "url"],
    configFields: [
      { key: "apiKey", label: "API Key", type: "password", required: true },
    ],
    async lookup(value, type, config) {
      const start = Date.now();
      const apiKey = String(config.apiKey || "");
      if (!apiKey) return { provider: "virustotal", ok: false, detail: "Missing apiKey" };
      const endpoint = type === "ip" ? `ip_addresses/${encodeURIComponent(value)}`
        : type === "hash" ? `files/${encodeURIComponent(value)}`
        : type === "domain" ? `domains/${encodeURIComponent(value)}`
        : type === "url" ? `urls/${Buffer.from(value).toString("base64url").replace(/=/g, "")}`
        : null;
      if (!endpoint) return { provider: "virustotal", ok: false, detail: `Unsupported type: ${type}` };
      try {
        const res = await fetch(`https://www.virustotal.com/api/v3/${endpoint}`, {
          headers: { "x-apikey": apiKey },
          signal: AbortSignal.timeout(10_000),
        });
        const data: any = await safeJson(res);
        const attrs = data?.data?.attributes;
        const stats: Record<string, number> = (attrs?.last_analysis_stats as Record<string, number>) || {};
        const malicious = stats.malicious ?? 0;
        const total = Object.values(stats).reduce((a: number, b: number) => a + b, 0) || 1;
        const score = Math.round((malicious / total) * 100);
        return {
          provider: "virustotal",
          ok: res.ok,
          status: res.status,
          detail: res.ok ? `${malicious}/${total} engines flagged malicious` : `HTTP ${res.status}`,
          reputation: malicious === 0 ? "clean" : malicious < 5 ? "suspicious" : "malicious",
          score,
          classifications: attrs?.popular_threat_classification?.suggested_threat_label ? [String(attrs.popular_threat_classification.suggested_threat_label)] : [],
          tags: (attrs?.tags as string[]) || [],
          raw: data,
          latencyMs: Date.now() - start,
        };
      } catch (err) {
        return { provider: "virustotal", ok: false, detail: err instanceof Error ? err.message : "fetch failed", latencyMs: Date.now() - start };
      }
    },
  };
}

// 2. AbuseIPDB (v2)
function makeAbuseIPDB(): EnrichmentConnector {
  return {
    id: "abuseipdb",
    name: "AbuseIPDB",
    category: "Compliance & Reporting",
    direction: "enrichment",
    description: "Check IP reputation via AbuseIPDB.",
    icon: "Network",
    supportedTypes: ["ip"],
    configFields: [
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "maxAgeInDays", label: "Max Age (days)", type: "string", required: false, defaultValue: "90" },
    ],
    async lookup(value, type, config) {
      const start = Date.now();
      if (type !== "ip") return { provider: "abuseipdb", ok: false, detail: "AbuseIPDB only supports IP lookups" };
      const apiKey = String(config.apiKey || "");
      if (!apiKey) return { provider: "abuseipdb", ok: false, detail: "Missing apiKey" };
      const maxAge = String(config.maxAgeInDays || "90");
      try {
        const res = await fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(value)}&maxAgeInDays=${maxAge}`, {
          headers: { Key: apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        });
        const data: any = await safeJson(res);
        const d = data?.data || {};
        const score = Math.min(100, Math.round((d.abuseConfidenceScore || 0)));
        const rep = score === 0 ? "clean" : score < 50 ? "suspicious" : "malicious";
        return {
          provider: "abuseipdb",
          ok: res.ok,
          status: res.status,
          detail: res.ok ? `abuse confidence: ${score}/100` : `HTTP ${res.status}`,
          reputation: rep,
          score,
          classifications: d?.usageType ? [String(d.usageType)] : [],
          tags: [],
          raw: data,
          latencyMs: Date.now() - start,
        };
      } catch (err) {
        return { provider: "abuseipdb", ok: false, detail: err instanceof Error ? err.message : "fetch failed", latencyMs: Date.now() - start };
      }
    },
  };
}

// 3. Shodan
function makeShodan(): EnrichmentConnector {
  return {
    id: "shodan",
    name: "Shodan",
    category: "Cloud & Infrastructure",
    direction: "enrichment",
    description: "Look up exposed services + host metadata for an IP via Shodan.",
    icon: "Globe",
    supportedTypes: ["ip"],
    configFields: [
      { key: "apiKey", label: "API Key", type: "password", required: true },
    ],
    async lookup(value, type, config) {
      const start = Date.now();
      if (type !== "ip") return { provider: "shodan", ok: false, detail: "Shodan only supports IP lookups" };
      const apiKey = String(config.apiKey || "");
      if (!apiKey) return { provider: "shodan", ok: false, detail: "Missing apiKey" };
      try {
        const res = await fetch(`https://api.shodan.io/shodan/host/${encodeURIComponent(value)}?key=${encodeURIComponent(apiKey)}`, {
          signal: AbortSignal.timeout(10_000),
        });
        const data: any = await safeJson(res);
        const vulns = data?.vulns ? Object.keys(data.vulns) : [];
        const ports = (data?.ports as number[]) || [];
        return {
          provider: "shodan",
          ok: res.ok,
          status: res.status,
          detail: res.ok ? `${ports.length} open ports, ${vulns.length} vulns` : `HTTP ${res.status}`,
          reputation: vulns.length > 0 ? "suspicious" : "unknown",
          score: Math.min(100, vulns.length * 15),
          classifications: vulns,
          tags: (data?.tags as string[]) || [],
          relatedIOCs: [],
          raw: { ports, hostnames: data?.hostnames, org: data?.org, country: data?.country_name },
          latencyMs: Date.now() - start,
        };
      } catch (err) {
        return { provider: "shodan", ok: false, detail: err instanceof Error ? err.message : "fetch failed", latencyMs: Date.now() - start };
      }
    },
  };
}

// 4. AlienVault OTX
function makeOTX(): EnrichmentConnector {
  return {
    id: "otx",
    name: "AlienVault OTX",
    category: "Compliance & Reporting",
    direction: "enrichment",
    description: "Look up IOCs against the AlienVault Open Threat Exchange.",
    icon: "Satellite",
    supportedTypes: ["ip", "hash", "domain", "url", "email"],
    configFields: [
      { key: "apiKey", label: "API Key (optional)", type: "password", required: false, helpText: "Anonymous access works at lower rate limits." },
    ],
    async lookup(value, type, config) {
      const start = Date.now();
      const endpoint =
        type === "ip" ? `indicators/IPv4/${encodeURIComponent(value)}/general`
        : type === "hash" ? `indicators/file/${encodeURIComponent(value)}/general`
        : type === "domain" ? `indicators/domain/${encodeURIComponent(value)}/general`
        : type === "url" ? `indicators/url/${encodeURIComponent(value)}/general`
        : type === "email" ? `indicators/email/${encodeURIComponent(value)}/general`
        : null;
      if (!endpoint) return { provider: "otx", ok: false, detail: `Unsupported type: ${type}` };
      const headers: Record<string, string> = {};
      if (config.apiKey) headers["X-OTX-API-KEY"] = String(config.apiKey);
      try {
        const res = await fetch(`https://otx.alienvault.com/api/v1/${endpoint}`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        });
        const data: any = await safeJson(res);
        const pulseCount = (data?.pulse_info?.count as number) || 0;
        return {
          provider: "otx",
          ok: res.ok,
          status: res.status,
          detail: res.ok ? `mentioned in ${pulseCount} OTX pulses` : `HTTP ${res.status}`,
          reputation: pulseCount === 0 ? "unknown" : pulseCount > 5 ? "malicious" : "suspicious",
          score: Math.min(100, pulseCount * 10),
          classifications: [],
          tags: [],
          raw: data,
          latencyMs: Date.now() - start,
        };
      } catch (err) {
        return { provider: "otx", ok: false, detail: err instanceof Error ? err.message : "fetch failed", latencyMs: Date.now() - start };
      }
    },
  };
}

// 5. MISP (server-side)
function makeMISP(): EnrichmentConnector {
  return {
    id: "misp",
    name: "MISP",
    category: "Compliance & Reporting",
    direction: "enrichment",
    description: "Look up IOCs against a self-hosted MISP instance.",
    icon: "Server",
    supportedTypes: ["ip", "hash", "domain", "url", "email"],
    configFields: [
      { key: "url", label: "MISP URL", type: "url", required: true, placeholder: "https://misp.example.com" },
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "verifyCert", label: "Verify TLS Certificate", type: "boolean", required: false, defaultValue: true },
    ],
    async lookup(value, type, config) {
      const start = Date.now();
      const url = String(config.url || "").replace(/\/$/, "");
      const apiKey = String(config.apiKey || "");
      if (!url || !apiKey) return { provider: "misp", ok: false, detail: "Missing url or apiKey" };
      const typeMap: Record<IOCType, string> = {
        ip: "ip-src|ip-dst",
        hash: "md5|sha1|sha256|sha512",
        domain: "domain|hostname",
        url: "url|link",
        email: "email-src|email-dst",
        user_agent: "user-agent",
      };
      try {
        const res = await fetch(`${url}/attributes/restSearch/json`, {
          method: "POST",
          headers: { Authorization: apiKey, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ value: value, type: typeMap[type] }),
          signal: AbortSignal.timeout(10_000),
        });
        const data: any = await safeJson(res);
        const attrs = (data?.response?.Attribute as unknown[]) || (data?.response as unknown[]) || [];
        const count = attrs.length;
        return {
          provider: "misp",
          ok: res.ok,
          status: res.status,
          detail: res.ok ? `${count} matching MISP attributes` : `HTTP ${res.status}`,
          reputation: count === 0 ? "clean" : count > 3 ? "malicious" : "suspicious",
          score: Math.min(100, count * 20),
          classifications: [],
          tags: [],
          raw: data,
          latencyMs: Date.now() - start,
        };
      } catch (err) {
        return { provider: "misp", ok: false, detail: err instanceof Error ? err.message : "fetch failed", latencyMs: Date.now() - start };
      }
    },
  };
}

export const enrichmentConnectors: EnrichmentConnector[] = [
  makeVirusTotal(),
  makeAbuseIPDB(),
  makeShodan(),
  makeOTX(),
  makeMISP(),
];

export function getEnrichmentConnector(id: string): EnrichmentConnector | undefined {
  return enrichmentConnectors.find((c) => c.id === id);
}

// ── enrichIOC entry point ──────────────────────────────────────────────────
export interface EnrichIOCResult {
  value: string;
  type: IOCType;
  results: EnrichmentResult[];
  merged: {
    reputation: "clean" | "suspicious" | "malicious" | "unknown";
    maxScore: number;
    classifications: string[];
    tags: string[];
    relatedIOCs: Array<{ type: IOCType; value: string }>;
  };
  durationMs: number;
}

/**
 * Fan out across every enrichment connector whose `supportedTypes`
 * includes the IOC's type. `activeEnrichments` is the list of
 * connector IDs the operator has enabled (typically pulled from the
 * Integration table). Returns merged + per-provider results.
 *
 * Always resolves - never throws.
 */
export async function enrichIOC(
  value: string,
  type: IOCType,
  activeEnrichments: Array<{ id: string; config?: Record<string, unknown> }> = []
): Promise<EnrichIOCResult> {
  const start = Date.now();
  const active = activeEnrichments.length
    ? enrichmentConnectors.filter((c) => activeEnrichments.some((a) => a.id === c.id))
    : enrichmentConnectors;

  const supported = active.filter((c) => c.supportedTypes.includes(type));

  const results = await Promise.all(
    supported.map((c) => {
      const cfg = activeEnrichments.find((a) => a.id === c.id)?.config || {};
      return c.lookup(value, type, cfg).catch((err): EnrichmentResult => ({
        provider: c.id,
        ok: false,
        detail: err instanceof Error ? err.message : "lookup threw",
      }));
    })
  );

  // Merge: take the most pessimistic reputation + max score + union of tags.
  const repRank = { clean: 0, unknown: 1, suspicious: 2, malicious: 3 } as const;
  let mergedRep: EnrichIOCResult["merged"]["reputation"] = "unknown";
  let maxScore = 0;
  const classifications = new Set<string>();
  const tags = new Set<string>();
  const related = new Map<string, { type: IOCType; value: string }>();

  for (const r of results) {
    if (r.reputation && repRank[r.reputation] > repRank[mergedRep]) mergedRep = r.reputation;
    if (typeof r.score === "number" && r.score > maxScore) maxScore = r.score;
    for (const c of r.classifications || []) classifications.add(c);
    for (const t of r.tags || []) tags.add(t);
    for (const r2 of r.relatedIOCs || []) related.set(`${r2.type}:${r2.value}`, r2);
  }

  return {
    value,
    type,
    results,
    merged: {
      reputation: mergedRep,
      maxScore,
      classifications: Array.from(classifications),
      tags: Array.from(tags),
      relatedIOCs: Array.from(related.values()),
    },
    durationMs: Date.now() - start,
  };
}
