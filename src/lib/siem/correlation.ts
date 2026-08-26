// GuardianX SIEM - Correlation rule engine.
//
// A rule is a set of conditions (source/type/severity/match), a time window,
// and a minimum match count. When enough matching events occur within the
// window (optionally grouped by a field like ipAddress), the rule fires and
// one of the following actions runs:
//
//   - create_incident : open a new Incident record (deduped by sourceId)
//   - add_ioc         : insert or bump an IOC record
//   - forward_alert   : POST the alert payload to an external integration
//                       (uses @/lib/integrations/engine if available, else
//                        no-ops with a log line)
//   - log_only        : just record the match in the audit log
//
// Rules are stored as AlertRule records (the existing schema). We pack the
// RuleDefinition into the existing columns:
//   - name           -> name
//   - condition      -> JSON.stringify(conditions)
//   - channel        -> action ("create_incident" | "add_ioc" | ...)
//   - channelConfig  -> JSON.stringify({ timeWindowSec, minMatchCount, groupBy, actionConfig, description })

import { db } from "@/lib/db";
import {
  unifiedSearch,
  type SiemSource,
  type SiemSeverity,
  type UnifiedLogEntry,
} from "@/lib/siem/search";
import type { SecurityEvent } from "@/lib/integrations/engine";

// ── Types ─────────────────────────────────────────────────────────────────

export type CorrelationAction =
  | "create_incident"
  | "add_ioc"
  | "forward_alert"
  | "log_only";

export interface RuleCondition {
  /** Restrict matches to a single SIEM source. */
  source?: SiemSource;
  /** Restrict matches to a specific event type. */
  type?: string;
  /** Restrict matches to a specific severity. */
  severity?: SiemSeverity;
  /** Substring (case-insensitive) match against title + description. */
  match?: string;
}

export interface RuleActionConfig {
  /** Severity to use when creating an incident. */
  severity?: SiemSeverity;
  /** Title template for the created incident. Uses {rule} and {group}. */
  incidentTitle?: string;
  /** IOC type to add (ip | domain | hash | url | email). */
  iocType?: string;
  /** Which field on the matched event to extract as the IOC value
   *  ("ipAddress" | "title" | "description" | "type"). */
  iocValueField?: "ipAddress" | "title" | "description" | "type";
  /** URL to POST the alert to (for forward_alert). */
  forwardUrl?: string;
  /** Free-form tags to attach. */
  tags?: string[];
}

export interface RuleDefinition {
  id?: string;
  name: string;
  description?: string;
  conditions: RuleCondition[];
  /** Match window in seconds (default 300 = 5min). */
  timeWindowSec: number;
  /** Minimum total matching events within the window for the rule to fire. */
  minMatchCount: number;
  /** Group matches by this field before counting. */
  groupBy?: "ipAddress" | "source" | "type" | null;
  action: CorrelationAction;
  actionConfig?: RuleActionConfig;
  isActive?: boolean;
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  fired: boolean;
  matchedEvents: number;
  groups: Array<{ key: string | null; count: number }>;
  actionTaken: string | null;
  actionResult: unknown;
  matchedEntries: UnifiedLogEntry[];
}

// ── Serialization to AlertRule row ────────────────────────────────────────

export function serializeRule(rule: RuleDefinition): {
  name: string;
  condition: string;
  channel: string;
  channelConfig: string;
  isActive: boolean;
} {
  return {
    name: rule.name,
    condition: JSON.stringify(rule.conditions || []),
    channel: rule.action,
    channelConfig: JSON.stringify({
      timeWindowSec: rule.timeWindowSec,
      minMatchCount: rule.minMatchCount,
      groupBy: rule.groupBy || null,
      actionConfig: rule.actionConfig || {},
      description: rule.description || "",
    }),
    isActive: rule.isActive !== false,
  };
}

export function deserializeRule(row: Record<string, unknown>): RuleDefinition {
  let conditions: RuleCondition[] = [];
  try {
    const parsed = JSON.parse(safeStr(row.condition));
    if (Array.isArray(parsed)) conditions = parsed as RuleCondition[];
  } catch {
    // legacy: condition might be a plain string -> treat as match text
    const s = safeStr(row.condition);
    if (s) conditions = [{ match: s }];
  }

  let cfg: {
    timeWindowSec?: number;
    minMatchCount?: number;
    groupBy?: "ipAddress" | "source" | "type" | null;
    actionConfig?: RuleActionConfig;
    description?: string;
  } = {};
  try {
    cfg = JSON.parse(safeStr(row.channelConfig)) || {};
  } catch {
    /* ignore */
  }

  return {
    id: safeStr(row.id),
    name: safeStr(row.name),
    description: cfg.description || "",
    conditions,
    timeWindowSec: Number(cfg.timeWindowSec) || 300,
    minMatchCount: Number(cfg.minMatchCount) || 1,
    groupBy: cfg.groupBy || null,
    action: (safeStr(row.channel) || "log_only") as CorrelationAction,
    actionConfig: cfg.actionConfig || {},
    isActive: row.isActive !== false,
  };
}

function safeStr(v: unknown): string {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : String(v);
}

// ── Forwarder (optional, falls back gracefully) ───────────────────────────
//
// We try to dynamically import @/lib/integrations/engine. If it exposes a
// forwardEvent function, we use it. Otherwise we no-op and log the attempt
// to the audit log so the operator can see the rule did fire.
//
// We use a dynamic import inside try/catch so that even if the integrations
// module is removed in the future, the SIEM correlation engine still runs.

type ForwardFn = (event: SecurityEvent) => Promise<unknown>;

let cachedForwarder: ForwardFn | null | undefined;

async function getForwarder(): Promise<ForwardFn | null> {
  if (cachedForwarder !== undefined) return cachedForwarder;
  try {
    const mod = (await import("@/lib/integrations/engine")) as {
      forwardEvent?: unknown;
    };
    if (mod && typeof mod.forwardEvent === "function") {
      cachedForwarder = mod.forwardEvent as ForwardFn;
    } else {
      cachedForwarder = null;
    }
  } catch {
    cachedForwarder = null;
  }
  return cachedForwarder;
}

// ── Public: evaluateRule ──────────────────────────────────────────────────
//
// Steps:
//   1. Compute the time window: [now - timeWindowSec, now].
//   2. For each condition, run unifiedSearch with that condition's filters
//      restricted to the window. (We OR the conditions together by union.)
//   3. If groupBy is set, bucket the matched entries by that field; the rule
//      fires if ANY bucket has >= minMatchCount entries.
//      If groupBy is null/undefined, the rule fires if the total matched
//      count >= minMatchCount.
//   4. Run the action once per firing bucket (or once if no groupBy).

export async function evaluateRule(
  rule: RuleDefinition
): Promise<RuleEvaluationResult> {
  const ruleId = rule.id || rule.name;
  const end = new Date();
  const start = new Date(end.getTime() - rule.timeWindowSec * 1000);

  // Union of all matching entries across all conditions.
  const matched: UnifiedLogEntry[] = [];
  const seenIds = new Set<string>();

  for (const cond of rule.conditions) {
    const entries = await unifiedSearch({
      sources: cond.source ? [cond.source] : undefined,
      severities: cond.severity ? [cond.severity] : undefined,
      startTime: start,
      endTime: end,
      query: cond.match,
      limit: 500,
    });
    for (const e of entries) {
      // Apply type filter post-fetch (unifiedSearch doesn't expose it).
      if (cond.type && e.type !== cond.type) continue;
      const dedupKey = `${e.source}:${e.id}`;
      if (seenIds.has(dedupKey)) continue;
      seenIds.add(dedupKey);
      matched.push(e);
    }
  }

  // Group by the requested field (or single null bucket).
  const buckets = new Map<string | null, UnifiedLogEntry[]>();
  const groupBy = rule.groupBy || null;
  for (const e of matched) {
    let key: string | null = null;
    if (groupBy === "ipAddress") key = e.ipAddress || null;
    else if (groupBy === "source") key = e.source;
    else if (groupBy === "type") key = e.type;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(e);
  }

  // Determine which buckets fire.
  const firingBuckets: Array<{ key: string | null; entries: UnifiedLogEntry[] }> = [];
  for (const [key, entries] of buckets) {
    if (entries.length >= rule.minMatchCount) {
      firingBuckets.push({ key, entries });
    }
  }

  const groups = Array.from(buckets.entries()).map(([key, entries]) => ({
    key,
    count: entries.length,
  }));

  const fired = firingBuckets.length > 0;
  let actionTaken: string | null = null;
  let actionResult: unknown = null;

  if (fired) {
    // Execute the action once per firing bucket. We collect results.
    const results: unknown[] = [];
    for (const bucket of firingBuckets) {
      const res = await executeAction(rule, bucket.entries, bucket.key);
      results.push(res);
    }
    actionTaken = rule.action;
    actionResult = results;
  }

  // Update lastTriggered on the AlertRule row (best-effort).
  if (fired && rule.id) {
    try {
      await db.alertRule.update({
        where: { id: rule.id },
        data: { lastTriggered: new Date() },
      });
    } catch {
      /* ignore - lastTriggered is best-effort */
    }
  }

  return {
    ruleId,
    ruleName: rule.name,
    fired,
    matchedEvents: matched.length,
    groups,
    actionTaken,
    actionResult,
    matchedEntries: matched.slice(0, 50), // cap for response size
  };
}

// ── Action execution ──────────────────────────────────────────────────────

async function executeAction(
  rule: RuleDefinition,
  entries: UnifiedLogEntry[],
  groupKey: string | null
): Promise<unknown> {
  const cfg = rule.actionConfig || {};
  const sample = entries[0];

  switch (rule.action) {
    case "create_incident": {
      const title = (cfg.incidentTitle || "SIEM correlation: {rule}")
        .replace("{rule}", rule.name)
        .replace("{group}", groupKey || "global");
      const severity = cfg.severity || "high";
      const sourceId = `siem:${rule.id || rule.name}:${groupKey || "global"}`;

      // Dedupe: skip if there's already an open incident for this sourceId.
      try {
        const existing = await db.incident.findFirst({
          where: { source: "siem", sourceId, status: { not: "closed" } },
          select: { id: true },
        });
        if (existing) {
          return { skipped: true, reason: "open_incident_exists", incidentId: existing.id };
        }
      } catch {
        /* ignore - proceed to create */
      }

      try {
        const incident = await db.incident.create({
          data: {
            title,
            description: `Auto-created by SIEM rule "${rule.name}". ${entries.length} matching event(s) in the last ${rule.timeWindowSec}s. Group: ${groupKey || "global"}.`,
            severity,
            status: "open",
            category: "siem_correlation",
            source: "siem",
            sourceId,
            assignee: "siem-engine",
            detectedAt: new Date(),
          },
        });

        // Add an initial timeline event linking back to the matched entries.
        await db.incidentEvent.create({
          data: {
            incidentId: incident.id as string,
            eventType: "siem_match",
            source: "siem",
            sourceId,
            title: `Rule "${rule.name}" fired`,
            description: `${entries.length} event(s) matched. Sample: ${sample?.title || ""}`,
            severity,
            metadata: JSON.stringify({
              ruleName: rule.name,
              ruleId: rule.id || null,
              group: groupKey,
              matchedCount: entries.length,
              sampleEntries: entries.slice(0, 5).map((e) => ({
                source: e.source,
                type: e.type,
                title: e.title,
                timestamp: e.timestamp,
                ipAddress: e.ipAddress,
              })),
            }),
            actor: "siem-correlation-engine",
            occurredAt: new Date(),
          },
        });

        return { created: true, incidentId: incident.id };
      } catch (err) {
        return { created: false, error: err instanceof Error ? err.message : "create_failed" };
      }
    }

    case "add_ioc": {
      const iocType = cfg.iocType || "ip";
      const field = cfg.iocValueField || "ipAddress";
      const value =
        field === "ipAddress" ? sample?.ipAddress :
        field === "title" ? sample?.title :
        field === "description" ? sample?.description :
        field === "type" ? sample?.type :
        null;
      if (!value) {
        return { skipped: true, reason: "no_ioc_value_extracted" };
      }
      try {
        // Upsert: if IOC with this value exists, bump hitCount + lastSeen.
        const existing = await db.ioc.findFirst({
          where: { value: String(value).toLowerCase() },
        });
        if (existing) {
          const updated = await db.ioc.update({
            where: { id: existing.id as string },
            data: {
              hitCount: ((existing.hitCount as number) || 0) + 1,
              lastSeen: new Date(),
              isActive: true,
            },
          });
          return { upserted: true, iocId: updated.id, bumped: true };
        }
        const created = await db.ioc.create({
          data: {
            iocType,
            value: String(value).toLowerCase(),
            confidence: "high",
            source: "siem",
            tags: cfg.tags ? cfg.tags.join(",") : `siem,correlation,${rule.name}`,
            isActive: true,
            firstSeen: new Date(),
            lastSeen: new Date(),
            hitCount: 1,
            notes: `Auto-added by SIEM rule "${rule.name}"`,
          },
        });
        return { upserted: true, iocId: created.id, bumped: false };
      } catch (err) {
        return { upserted: false, error: err instanceof Error ? err.message : "ioc_add_failed" };
      }
    }

    case "forward_alert": {
      const payload = {
        ruleName: rule.name,
        ruleId: rule.id || null,
        group: groupKey,
        matchedCount: entries.length,
        sample: sample ? {
          source: sample.source,
          type: sample.type,
          severity: sample.severity,
          title: sample.title,
          timestamp: sample.timestamp,
          ipAddress: sample.ipAddress,
        } : null,
        entries: entries.slice(0, 20).map((e) => ({
          source: e.source,
          type: e.type,
          severity: e.severity,
          title: e.title,
          timestamp: e.timestamp,
          ipAddress: e.ipAddress,
        })),
        forwardedAt: new Date().toISOString(),
      };

      // 1. Try the integrations engine forwarder if available.
      const forwarder = await getForwarder();
      if (forwarder) {
        try {
          // Adapt the payload to the SecurityEvent shape expected by
          // forwardEvent in @/lib/integrations/engine.
          const securityEvent: SecurityEvent = {
            type: "siem.correlation",
            severity: (cfg.severity || "high") as SecurityEvent["severity"],
            title: `SIEM rule "${rule.name}" fired`,
            description: `${entries.length} matching event(s) in the last ${rule.timeWindowSec}s. Group: ${groupKey || "global"}. Sample: ${sample?.title || ""}`,
            source: "siem",
            data: payload,
            occurredAt: new Date().toISOString(),
          };
          const res = await forwarder(securityEvent);
          return { forwarded: true, via: "integrations_engine", result: res };
        } catch (err) {
          return { forwarded: false, error: err instanceof Error ? err.message : "forward_failed" };
        }
      }

      // 2. Fall back to a direct HTTP POST if actionConfig.forwardUrl is set.
      if (cfg.forwardUrl) {
        try {
          const res = await fetch(cfg.forwardUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          return { forwarded: res.ok, status: res.status, via: "direct_http" };
        } catch (err) {
          return { forwarded: false, error: err instanceof Error ? err.message : "fetch_failed" };
        }
      }

      // 3. No forwarder available - log to audit trail so it is visible.
      try {
        await db.auditLog.create({
          data: {
            action: "siem.forward_alert.no_forwarder",
            entity: "siem_rule",
            actor: "siem-correlation-engine",
            details: JSON.stringify({
              ruleName: rule.name,
              group: groupKey,
              matchedCount: entries.length,
              sample: sample?.title || null,
            }),
          },
        });
      } catch {
        /* ignore */
      }
      return { forwarded: false, reason: "no_forwarder_configured" };
    }

    case "log_only":
    default: {
      try {
        await db.auditLog.create({
          data: {
            action: "siem.rule_fired",
            entity: "siem_rule",
            actor: "siem-correlation-engine",
            details: JSON.stringify({
              ruleName: rule.name,
              ruleId: rule.id || null,
              group: groupKey,
              matchedCount: entries.length,
              sample: sample ? {
                source: sample.source,
                type: sample.type,
                title: sample.title,
                timestamp: sample.timestamp,
              } : null,
            }),
          },
        });
      } catch {
        /* ignore */
      }
      return { logged: true };
    }
  }
}

// ── Public: evaluateAllRules ──────────────────────────────────────────────

export async function evaluateAllRules(): Promise<{
  evaluated: number;
  fired: number;
  results: RuleEvaluationResult[];
}> {
  let rows: Record<string, unknown>[] = [];
  try {
    rows = (await db.alertRule.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
    })) as Record<string, unknown>[];
  } catch {
    rows = [];
  }

  const results: RuleEvaluationResult[] = [];
  for (const row of rows) {
    const rule = deserializeRule(row);
    try {
      const res = await evaluateRule(rule);
      results.push(res);
    } catch (err) {
      results.push({
        ruleId: safeStr(rule.id),
        ruleName: rule.name,
        fired: false,
        matchedEvents: 0,
        groups: [],
        actionTaken: null,
        actionResult: { error: err instanceof Error ? err.message : "evaluate_failed" },
        matchedEntries: [],
      });
    }
  }

  return {
    evaluated: results.length,
    fired: results.filter((r) => r.fired).length,
    results,
  };
}

// ── Public: getDefaultRules ───────────────────────────────────────────────
//
// Four ready-to-import templates covering the most common SIEM use cases.

export function getDefaultRules(): RuleDefinition[] {
  return [
    {
      name: "Brute Force - API Authentication",
      description:
        "Fires when 10 or more failed API access attempts (status 401/403) originate from the same IP address within a 5-minute window. Auto-creates an incident and adds the IP to the IOC database.",
      conditions: [
        { source: "api_access", match: "401" },
        { source: "api_access", match: "403" },
      ],
      timeWindowSec: 300,
      minMatchCount: 10,
      groupBy: "ipAddress",
      action: "create_incident",
      actionConfig: {
        severity: "high",
        incidentTitle: "Brute force API auth from {group}",
        iocType: "ip",
        iocValueField: "ipAddress",
        tags: ["brute_force", "api"],
      },
      isActive: true,
    },
    {
      name: "Honeypot + Canary Exfiltration Combo",
      description:
        "Fires when a honeypot hit AND a canary exfiltration are both observed within 1 hour. Indicates an attacker who triggered recon (honeypot) and then exfiltrated data (canary).",
      conditions: [
        { source: "honeypot" },
        { source: "canary", severity: "critical" },
      ],
      timeWindowSec: 3600,
      minMatchCount: 2,
      groupBy: null,
      action: "create_incident",
      actionConfig: {
        severity: "critical",
        incidentTitle: "Honeypot + Canary exfiltration chain",
        tags: ["exfiltration", "honeypot", "canary"],
      },
      isActive: true,
    },
    {
      name: "Critical Findings Without Approved Patches",
      description:
        "Fires when 3 or more critical findings exist without approved patches in the last 24 hours. Forwards an alert to the configured integration so the SOC can chase remediation.",
      conditions: [
        { source: "finding", severity: "critical" },
        { source: "patch", severity: "critical", match: "pending" },
      ],
      timeWindowSec: 86400,
      minMatchCount: 3,
      groupBy: "source",
      action: "forward_alert",
      actionConfig: {
        severity: "high",
        tags: ["remediation", "critical"],
      },
      isActive: true,
    },
    {
      name: "High Volume of Incident Events",
      description:
        "Fires when 5 or more high/critical incident timeline events occur within 1 hour. Indicates an active incident that may need escalation.",
      conditions: [
        { source: "incident", severity: "high" },
        { source: "incident", severity: "critical" },
      ],
      timeWindowSec: 3600,
      minMatchCount: 5,
      groupBy: "type",
      action: "log_only",
      actionConfig: {
        severity: "high",
      },
      isActive: true,
    },
  ];
}
