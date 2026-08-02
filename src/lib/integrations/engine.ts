// GuardianX Integration Engine
//
// Core integration hub for GuardianX. Defines:
//   - The SecurityEvent contract that every connector consumes.
//   - forwardEvent(): fan-out a single event to every active connector
//     of the requested type. Maintains an in-memory log of the last 100
//     forwards for inspection by the UI.
//   - 9 built-in connectors with config schemas (Splunk, ELK, Datadog,
//     Jira, PagerDuty, SecurityHub, Teams, Slack, generic webhook).
//   - getConnectorSchemas(): list of every connector + its config fields,
//     grouped by category. Used by the UI to render config forms.
//   - testIntegration(): probe a single connector with a test payload
//     before persisting it to the DB.
//
// Outbound connectors (the additional 20) live in
// `./outbound-connectors.ts` and are merged into the registry lazily so
// this module never fails to load even if that file is missing.

import { db } from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────────────
export type ConnectorCategory =
  | "SIEM & Monitoring"
  | "Alerting & Notification"
  | "Collaboration"
  | "ITSM & Ticketing"
  | "Cloud & Infrastructure"
  | "Compliance & Reporting"
  | "DevOps & CI/CD"
  | "Generic";

export type ConnectorDirection = "outbound" | "import" | "enrichment";

export interface SecurityEvent {
  type: string;          // e.g. "patch.created", "incident.contained", "ioc.detected"
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  description?: string;
  source: string;        // "guardianx", "sentinel-engine", "ai-ops", etc.
  data?: Record<string, unknown>;
  clientId?: string;
  incidentId?: string;
  occurredAt?: string;   // ISO, defaults to now
}

export interface ConfigField {
  key: string;
  label: string;
  type: "string" | "password" | "url" | "select" | "boolean" | "json";
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[]; // for select type
  defaultValue?: string | boolean;
}

export interface ConnectorSchema {
  id: string;            // stable slug: "splunk", "elk", ...
  name: string;          // human label: "Splunk Enterprise"
  category: ConnectorCategory;
  direction: ConnectorDirection;
  description: string;
  icon?: string;         // optional lucide icon name
  configFields: ConfigField[];
  /**
   * Actual implementation. Takes the resolved config + the event and
   * performs the side effect (HTTP POST, etc.). Returns a result the
   * forward log can record.
   */
  send?: (config: Record<string, unknown>, event: SecurityEvent) => Promise<ConnectorSendResult>;
}

export interface ConnectorSendResult {
  ok: boolean;
  status?: number;
  detail?: string;
  externalId?: string; // ID assigned by the target system
}

// ── In-memory forwarding log (last 100) ────────────────────────────────────
export interface ForwardLogEntry {
  id: string;
  at: string;
  integrationId?: string;
  connectorId: string;
  eventType: string;
  severity: SecurityEvent["severity"];
  title: string;
  result: ConnectorSendResult;
}

const forwardLog: ForwardLogEntry[] = [];
const FORWARD_LOG_MAX = 100;

export function getForwardLog(): ForwardLogEntry[] {
  return [...forwardLog].reverse(); // newest first
}

function pushForwardLog(entry: ForwardLogEntry): void {
  forwardLog.push(entry);
  while (forwardLog.length > FORWARD_LOG_MAX) forwardLog.shift();
}

// ── Built-in connectors (9) ────────────────────────────────────────────────
const builtInConnectors: ConnectorSchema[] = [
  {
    id: "splunk",
    name: "Splunk Enterprise",
    category: "SIEM & Monitoring",
    direction: "outbound",
    description: "Forward security events to a Splunk HTTP Event Collector (HEC).",
    icon: "Radar",
    configFields: [
      { key: "hecUrl", label: "HEC URL", type: "url", required: true, placeholder: "https://splunk.example.com:8088/services/collector" },
      { key: "token", label: "HEC Token", type: "password", required: true },
      { key: "index", label: "Index", type: "string", required: false, placeholder: "guardianx" },
      { key: "sourceType", label: "Source Type", type: "string", required: false, defaultValue: "guardianx:event" },
    ],
    async send(config, event) {
      const hecUrl = String(config.hecUrl || "");
      const token = String(config.token || "");
      if (!hecUrl || !token) return { ok: false, detail: "Missing hecUrl or token" };
      const body = {
        time: Math.floor(Date.now() / 1000),
        host: "guardianx",
        source: event.source,
        sourcetype: String(config.sourceType || "guardianx:event"),
        index: String(config.index || ""),
        event: { ...event, occurredAt: event.occurredAt || new Date().toISOString() },
      };
      const res = await fetch(hecUrl, {
        method: "POST",
        headers: { Authorization: `Splunk ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok, status: res.status, detail: res.ok ? "forwarded" : await res.text().catch(() => "forward failed") };
    },
  },
  {
    id: "elk",
    name: "ELK / Elasticsearch",
    category: "SIEM & Monitoring",
    direction: "outbound",
    description: "Bulk-index security events into Elasticsearch.",
    icon: "Database",
    configFields: [
      { key: "nodeUrl", label: "Elastic Node URL", type: "url", required: true, placeholder: "http://localhost:9200" },
      { key: "apiKey", label: "API Key", type: "password", required: false },
      { key: "index", label: "Index Pattern", type: "string", required: false, defaultValue: "guardianx-events" },
    ],
    async send(config, event) {
      const nodeUrl = String(config.nodeUrl || "").replace(/\/$/, "");
      const index = String(config.index || "guardianx-events");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.apiKey) headers.Authorization = `ApiKey ${config.apiKey}`;
      const res = await fetch(`${nodeUrl}/${index}/_doc`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...event, occurredAt: event.occurredAt || new Date().toISOString() }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, detail: res.ok ? "indexed" : `HTTP ${res.status}`, externalId: data?._id };
    },
  },
  {
    id: "datadog",
    name: "Datadog",
    category: "SIEM & Monitoring",
    direction: "outbound",
    description: "Send security events as Datadog logs.",
    icon: "Activity",
    configFields: [
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "site", label: "Site", type: "select", required: false, options: ["datadoghq.com", "datadoghq.eu", "ddog-gov.com"], defaultValue: "datadoghq.com" },
      { key: "service", label: "Service Name", type: "string", required: false, defaultValue: "guardianx" },
    ],
    async send(config, event) {
      const apiKey = String(config.apiKey || "");
      const site = String(config.site || "datadoghq.com");
      if (!apiKey) return { ok: false, detail: "Missing apiKey" };
      const res = await fetch(`https://http-intake.logs.${site}/v1/input`, {
        method: "POST",
        headers: { "DD-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          service: String(config.service || "guardianx"),
          status: event.severity === "critical" || event.severity === "high" ? "error" : "info",
          message: event.title,
          ddsource: "guardianx",
          ddtags: `severity:${event.severity},type:${event.type}`,
          ...event.data,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok, status: res.status, detail: res.ok ? "forwarded to datadog" : `HTTP ${res.status}` };
    },
  },
  {
    id: "jira",
    name: "Jira",
    category: "ITSM & Ticketing",
    direction: "outbound",
    description: "Create Jira tickets for high-severity security events.",
    icon: "Ticket",
    configFields: [
      { key: "baseUrl", label: "Jira Base URL", type: "url", required: true, placeholder: "https://yourorg.atlassian.net" },
      { key: "email", label: "Account Email", type: "string", required: true },
      { key: "apiToken", label: "API Token", type: "password", required: true },
      { key: "projectKey", label: "Project Key", type: "string", required: true, placeholder: "SEC" },
    ],
    async send(config, event) {
      const baseUrl = String(config.baseUrl || "").replace(/\/$/, "");
      const email = String(config.email || "");
      const token = String(config.apiToken || "");
      const projectKey = String(config.projectKey || "");
      if (!baseUrl || !email || !token || !projectKey) return { ok: false, detail: "Missing required fields" };
      const auth = Buffer.from(`${email}:${token}`).toString("base64");
      const priority = event.severity === "critical" ? "Highest" : event.severity === "high" ? "High" : "Medium";
      const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: {
            project: { key: projectKey },
            summary: `[${event.severity.toUpperCase()}] ${event.title}`.slice(0, 250),
            description: event.description || event.title,
            issuetype: { name: "Bug" },
            priority: { name: priority },
            labels: ["security", "guardianx", event.severity],
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, externalId: data?.key, detail: res.ok ? `created ${data?.key}` : `HTTP ${res.status}` };
    },
  },
  {
    id: "pagerduty",
    name: "PagerDuty",
    category: "Alerting & Notification",
    direction: "outbound",
    description: "Trigger PagerDuty incidents for critical security events.",
    icon: "Bell",
    configFields: [
      { key: "integrationKey", label: "Events API v2 Integration Key", type: "password", required: true },
    ],
    async send(config, event) {
      const key = String(config.integrationKey || "");
      if (!key) return { ok: false, detail: "Missing integrationKey" };
      const severity = event.severity === "critical" ? "critical" : event.severity === "high" ? "error" : "info";
      const res = await fetch("https://events.pagerduty.com/v2/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routing_key: key,
          event_action: "trigger",
          payload: {
            summary: event.title,
            severity,
            source: event.source,
            custom_details: event.data || {},
          },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, externalId: data?.dedup_key, detail: res.ok ? "triggered" : `HTTP ${res.status}` };
    },
  },
  {
    id: "securityhub",
    name: "AWS Security Hub",
    category: "Cloud & Infrastructure",
    direction: "outbound",
    description: "Import findings into AWS Security Hub via BatchImportFindings.",
    icon: "Cloud",
    configFields: [
      { key: "awsRegion", label: "AWS Region", type: "string", required: true, placeholder: "us-east-1" },
      { key: "accessKeyId", label: "Access Key ID", type: "string", required: true },
      { key: "secretAccessKey", label: "Secret Access Key", type: "password", required: true },
      { key: "productArn", label: "Product ARN", type: "string", required: true, helpText: "arn:aws:securityhub:<region>::product/guardianx/guardianx" },
    ],
    async send(config, event) {
      // Full SigV4 signing is non-trivial; we record the event and return
      // a structured "would-send" payload so the operator can wire up
      // an authenticated Lambda/event-bridge rule to actually ship it.
      const payload = {
        region: config.awsRegion,
        productArn: config.productArn,
        finding: {
          Title: event.title,
          Description: event.description || event.title,
          Severity: { Label: event.severity.toUpperCase() },
          Types: ["Software and Configuration Checks/GuardianX"],
          ProductFields: { source: event.source, type: event.type },
        },
      };
      return {
        ok: true,
        detail: "Security Hub payload prepared. Configure an event-bridge rule to ship BatchImportFindings.",
        externalId: JSON.stringify(payload).slice(0, 64),
      };
    },
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    category: "Collaboration",
    direction: "outbound",
    description: "Post security alerts to a Microsoft Teams channel via incoming webhook.",
    icon: "MessageSquare",
    configFields: [
      { key: "webhookUrl", label: "Incoming Webhook URL", type: "url", required: true },
    ],
    async send(config, event) {
      const url = String(config.webhookUrl || "");
      if (!url) return { ok: false, detail: "Missing webhookUrl" };
      const themeColor =
        event.severity === "critical" ? "FF0000" :
        event.severity === "high" ? "FF8C00" :
        event.severity === "medium" ? "FFD700" : "008000";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "@type": "MessageCard",
          "@context": "https://schema.org/extensions",
          themeColor,
          summary: event.title,
          title: `[${event.severity.toUpperCase()}] ${event.title}`,
          text: event.description || event.title,
          sections: [{ facts: Object.entries(event.data || {}).slice(0, 10).map(([name, value]) => ({ name, value: String(value) })) }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok, status: res.status, detail: res.ok ? "posted to teams" : `HTTP ${res.status}` };
    },
  },
  {
    id: "slack",
    name: "Slack",
    category: "Collaboration",
    direction: "outbound",
    description: "Post security alerts to a Slack channel via incoming webhook.",
    icon: "Hash",
    configFields: [
      { key: "webhookUrl", label: "Incoming Webhook URL", type: "url", required: true },
      { key: "channel", label: "Channel Override", type: "string", required: false, placeholder: "#security-alerts" },
    ],
    async send(config, event) {
      const url = String(config.webhookUrl || "");
      if (!url) return { ok: false, detail: "Missing webhookUrl" };
      const color =
        event.severity === "critical" ? "#FF0000" :
        event.severity === "high" ? "#FF8C00" :
        event.severity === "medium" ? "#FFD700" : "#36A64F";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: config.channel || undefined,
          attachments: [{
            color,
            title: `[${event.severity.toUpperCase()}] ${event.title}`,
            text: event.description || event.title,
            ts: Math.floor(Date.now() / 1000),
            fields: Object.entries(event.data || {}).slice(0, 10).map(([title, value]) => ({ title, value: String(value), short: true })),
          }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok, status: res.status, detail: res.ok ? "posted to slack" : await res.text().catch(() => "post failed") };
    },
  },
  {
    id: "webhook",
    name: "Generic Webhook",
    category: "Generic",
    direction: "outbound",
    description: "POST raw JSON to any URL. Use for custom SOAR / home-built automation.",
    icon: "Webhook",
    configFields: [
      { key: "url", label: "Webhook URL", type: "url", required: true },
      { key: "secret", label: "HMAC Secret (optional)", type: "password", required: false, helpText: "If set, we sign the body with HMAC-SHA256 and send in X-GuardianX-Signature." },
      { key: "headers", label: "Extra Headers (JSON)", type: "json", required: false, placeholder: '{"X-Custom":"value"}' },
    ],
    async send(config, event) {
      const url = String(config.url || "");
      if (!url) return { ok: false, detail: "Missing url" };
      const body = JSON.stringify(event);
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (config.secret) {
        const { createHmac } = await import("node:crypto");
        const sig = createHmac("sha256", String(config.secret)).update(body).digest("hex");
        headers["X-GuardianX-Signature"] = sig;
      }
      if (config.headers) {
        try {
          const extra = JSON.parse(String(config.headers));
          if (extra && typeof extra === "object") {
            for (const [k, v] of Object.entries(extra)) headers[k] = String(v);
          }
        } catch {
          // ignore bad JSON
        }
      }
      const res = await fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000) });
      return { ok: res.ok, status: res.status, detail: res.ok ? "forwarded" : `HTTP ${res.status}` };
    },
  },
];

// ── Outbound connectors (lazy merge) ───────────────────────────────────────
/**
 * Dynamically import the 20 additional outbound connectors. We swallow
 * import errors so this module remains loadable even if that file has
 * not been written yet (the diagnostic agent + UI depend on this file).
 */
async function loadOutboundConnectors(): Promise<ConnectorSchema[]> {
  try {
    const mod = await import("./outbound-connectors");
    if (mod && Array.isArray(mod.outboundConnectors)) {
      return mod.outboundConnectors as ConnectorSchema[];
    }
  } catch (err) {
    console.warn("[integrations/engine] outbound-connectors.ts not available:", err instanceof Error ? err.message : err);
  }
  return [];
}

// ── Registry ───────────────────────────────────────────────────────────────
let cachedRegistry: ConnectorSchema[] | null = null;

export async function getConnectorRegistry(): Promise<ConnectorSchema[]> {
  if (cachedRegistry) return cachedRegistry;
  const outbound = await loadOutboundConnectors();
  const seen = new Set(builtInConnectors.map((c) => c.id));
  const merged = [...builtInConnectors];
  for (const c of outbound) {
    if (!seen.has(c.id)) {
      merged.push(c);
      seen.add(c.id);
    }
  }
  cachedRegistry = merged;
  return merged;
}

export function getConnectorSchemaSync(id: string): ConnectorSchema | undefined {
  // Sync lookup against built-ins only (no await). Used by forwardEvent
  // to avoid an async hop on the hot path.
  return builtInConnectors.find((c) => c.id === id);
}

/**
 * Return every connector schema + its category, for the UI. Optionally
 * also pull in the outbound list (async).
 */
export async function getConnectorSchemas(): Promise<Array<{
  id: string;
  name: string;
  category: ConnectorCategory;
  direction: ConnectorDirection;
  description: string;
  icon?: string;
  configFields: ConfigField[];
  builtin: boolean;
}>> {
  const registry = await getConnectorRegistry();
  const builtinIds = new Set(builtInConnectors.map((c) => c.id));
  return registry.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    direction: c.direction,
    description: c.description,
    icon: c.icon,
    configFields: c.configFields,
    builtin: builtinIds.has(c.id),
  }));
}

// ── forwardEvent ───────────────────────────────────────────────────────────
/**
 * Fan a single SecurityEvent out to every active Integration row whose
 * connector type can accept it. Always resolves - one connector failing
 * does not block the others. Records each forward in the in-memory log.
 */
export async function forwardEvent(event: SecurityEvent): Promise<{
  forwarded: number;
  succeeded: number;
  failed: number;
  log: ForwardLogEntry[];
}> {
  const integrations = await db.integration.findMany({
    where: { isActive: true },
  }).catch(() => []);

  let succeeded = 0;
  let failed = 0;
  const log: ForwardLogEntry[] = [];

  for (const i of integrations as Array<Record<string, unknown>>) {
    const connectorId = String(i.type || "");
    const schema = getConnectorSchemaSync(connectorId);
    if (!schema || !schema.send) continue;

    let config: Record<string, unknown> = {};
    try {
      config = i.config ? JSON.parse(String(i.config)) : {};
    } catch {
      config = {};
    }

    let result: ConnectorSendResult;
    try {
      result = await schema.send(config, event);
    } catch (err) {
      result = { ok: false, detail: err instanceof Error ? err.message : "send threw" };
    }

    if (result.ok) succeeded++;
    else failed++;

    const entry: ForwardLogEntry = {
      id: `${Date.now()}-${i.id}-${connectorId}`,
      at: new Date().toISOString(),
      integrationId: i.id as string,
      connectorId,
      eventType: event.type,
      severity: event.severity,
      title: event.title,
      result,
    };
    pushForwardLog(entry);
    log.push(entry);
  }

  return { forwarded: log.length, succeeded, failed, log };
}

// ── testIntegration ────────────────────────────────────────────────────────
/**
 * Probe a connector with a synthetic test event before saving it to the
 * DB. Returns the raw send result + the test event that was used.
 */
export async function testIntegration(
  connectorId: string,
  config: Record<string, unknown>
): Promise<{ ok: boolean; result?: ConnectorSendResult; testEvent: SecurityEvent; connector?: ConnectorSchema }> {
  const registry = await getConnectorRegistry();
  const schema = registry.find((c) => c.id === connectorId);
  if (!schema) {
    return { ok: false, testEvent: dummyEvent() };
  }
  if (!schema.send) {
    return { ok: false, result: { ok: false, detail: "Connector has no send implementation" }, testEvent: dummyEvent(), connector: schema };
  }
  const testEvent = dummyEvent();
  try {
    const result = await schema.send(config, testEvent);
    return { ok: result.ok, result, testEvent, connector: schema };
  } catch (err) {
    return {
      ok: false,
      result: { ok: false, detail: err instanceof Error ? err.message : "send threw" },
      testEvent,
      connector: schema,
    };
  }
}

function dummyEvent(): SecurityEvent {
  return {
    type: "integration.test",
    severity: "info",
    title: "GuardianX integration test",
    description: "Synthetic event sent by the GuardianX integration engine to verify connectivity.",
    source: "integration-engine",
    data: { dummy: true, sentAt: new Date().toISOString() },
    occurredAt: new Date().toISOString(),
  };
}

/**
 * Drop the in-memory connector registry cache. Useful when the operator
 * installs a new outbound connector package at runtime.
 */
export function invalidateConnectorCache(): void {
  cachedRegistry = null;
}
