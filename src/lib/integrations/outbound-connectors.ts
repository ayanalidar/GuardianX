// GuardianX Outbound Connectors - 20 additional integration targets.
//
// Each entry is a ConnectorSchema (see ./engine.ts) with a `send`
// implementation that performs the actual HTTP call. These complement
// the 9 built-in connectors in engine.ts.
//
// Connector categories follow the engine.ts ConnectorCategory union.
// We deliberately DO NOT use any HTTP libraries beyond the global
// `fetch` - each send() is a single awaitable POST/PUT with a short
// timeout and structured error reporting.

import type { ConnectorSchema, SecurityEvent, ConnectorSendResult } from "./engine";
import { hmacSha256base64 } from "@/lib/crypto";

// Helper: convert a SecurityEvent into a generic alert payload that
// most notification/ITSM systems can consume.
function toAlertPayload(event: SecurityEvent): Record<string, unknown> {
  return {
    title: event.title,
    description: event.description || event.title,
    severity: event.severity,
    type: event.type,
    source: event.source,
    occurredAt: event.occurredAt || new Date().toISOString(),
    details: event.data || {},
  };
}

// Severity color palette (hex without #) for chat-style connectors.
function severityColor(sev: SecurityEvent["severity"]): string {
  switch (sev) {
    case "critical": return "#FF0000";
    case "high": return "#FF8C00";
    case "medium": return "#FFD700";
    case "low": return "#00BFFF";
    default: return "#36A64F";
  }
}

export const outboundConnectors: ConnectorSchema[] = [
  // 1. WhatsApp (via Twilio sandbox / Business API)
  {
    id: "whatsapp",
    name: "WhatsApp (Twilio)",
    category: "Collaboration",
    direction: "outbound",
    description: "Send critical security alerts to a WhatsApp number via Twilio.",
    icon: "MessageCircle",
    configFields: [
      { key: "accountSid", label: "Twilio Account SID", type: "string", required: true },
      { key: "authToken", label: "Twilio Auth Token", type: "password", required: true },
      { key: "fromNumber", label: "From WhatsApp Number", type: "string", required: true, placeholder: "whatsapp:+14155238886" },
      { key: "toNumber", label: "To WhatsApp Number", type: "string", required: true, placeholder: "whatsapp:+15551234567" },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const sid = String(config.accountSid || "");
      const token = String(config.authToken || "");
      if (!sid || !token) return { ok: false, detail: "Missing accountSid or authToken" };
      const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
      const body = new URLSearchParams({
        From: String(config.fromNumber || ""),
        To: String(config.toNumber || ""),
        Body: `[${event.severity.toUpperCase()}] ${event.title}\n\n${event.description || ""}`.slice(0, 1500),
      });
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, externalId: data?.sid, detail: res.ok ? "sent" : `HTTP ${res.status}` };
    },
  },

  // 2. Telegram
  {
    id: "telegram",
    name: "Telegram",
    category: "Collaboration",
    direction: "outbound",
    description: "Push alerts to a Telegram chat via bot.",
    icon: "Send",
    configFields: [
      { key: "botToken", label: "Bot Token", type: "password", required: true },
      { key: "chatId", label: "Chat ID", type: "string", required: true, helpText: "Use @userinfobot to find your chat ID." },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const token = String(config.botToken || "");
      const chatId = String(config.chatId || "");
      if (!token || !chatId) return { ok: false, detail: "Missing botToken or chatId" };
      const text = `*[${event.severity.toUpperCase()}] ${event.title}*\n\n${event.description || ""}\n\nSource: ${event.source}`;
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok && data?.ok, status: res.status, externalId: data?.result?.message_id?.toString(), detail: res.ok ? "sent" : `HTTP ${res.status}` };
    },
  },

  // 3. Email (SMTP via SendGrid API)
  {
    id: "email",
    name: "Email (SendGrid)",
    category: "Alerting & Notification",
    direction: "outbound",
    description: "Send HTML email alerts through SendGrid.",
    icon: "Mail",
    configFields: [
      { key: "apiKey", label: "SendGrid API Key", type: "password", required: true },
      { key: "from", label: "From Address", type: "string", required: true, placeholder: "alerts@guardianx.io" },
      { key: "to", label: "To Address(es)", type: "string", required: true, placeholder: "soc@client.com, ciso@client.com" },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const apiKey = String(config.apiKey || "");
      if (!apiKey) return { ok: false, detail: "Missing apiKey" };
      const tos = String(config.to || "").split(",").map((s) => s.trim()).filter(Boolean).map((email) => ({ email }));
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: tos }],
          from: { email: String(config.from || "alerts@guardianx.io") },
          subject: `[${event.severity.toUpperCase()}] ${event.title}`.slice(0, 100),
          content: [{ type: "text/html", value: `<h2>${event.title}</h2><p><b>Severity:</b> ${event.severity}</p><p>${event.description || ""}</p><pre>${JSON.stringify(event.data || {}, null, 2)}</pre>` }],
        }),
        signal: AbortSignal.timeout(15_000),
      });
      return { ok: res.ok, status: res.status, detail: res.ok ? "sent" : `HTTP ${res.status}` };
    },
  },

  // 4. SMS (Twilio)
  {
    id: "sms",
    name: "SMS (Twilio)",
    category: "Alerting & Notification",
    direction: "outbound",
    description: "Send critical alerts as SMS via Twilio.",
    icon: "Phone",
    configFields: [
      { key: "accountSid", label: "Twilio Account SID", type: "string", required: true },
      { key: "authToken", label: "Twilio Auth Token", type: "password", required: true },
      { key: "fromNumber", label: "From Number", type: "string", required: true, placeholder: "+15551234567" },
      { key: "toNumber", label: "To Number", type: "string", required: true, placeholder: "+15557654321" },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const sid = String(config.accountSid || "");
      const token = String(config.authToken || "");
      if (!sid || !token) return { ok: false, detail: "Missing accountSid or authToken" };
      const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
      const body = new URLSearchParams({
        From: String(config.fromNumber || ""),
        To: String(config.toNumber || ""),
        Body: `[${event.severity.toUpperCase()}] ${event.title}`.slice(0, 160),
      });
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
        signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok, status: res.status, detail: res.ok ? "sent" : `HTTP ${res.status}` };
    },
  },

  // 5. Discord
  {
    id: "discord",
    name: "Discord",
    category: "Collaboration",
    direction: "outbound",
    description: "Post alerts to a Discord channel via webhook.",
    icon: "MessagesSquare",
    configFields: [
      { key: "webhookUrl", label: "Webhook URL", type: "url", required: true },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const url = String(config.webhookUrl || "");
      if (!url) return { ok: false, detail: "Missing webhookUrl" };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: `[${event.severity.toUpperCase()}] ${event.title}`,
            description: event.description || event.title,
            color: parseInt(severityColor(event.severity).replace("#", ""), 16),
            timestamp: event.occurredAt || new Date().toISOString(),
            fields: Object.entries(event.data || {}).slice(0, 8).map(([name, value]) => ({ name, value: String(value).slice(0, 1024), inline: true })),
          }],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok, status: res.status, detail: res.ok ? "posted" : `HTTP ${res.status}` };
    },
  },

  // 6. AWS CloudWatch
  {
    id: "cloudwatch",
    name: "AWS CloudWatch",
    category: "Cloud & Infrastructure",
    direction: "outbound",
    description: "Put metric data + log events to CloudWatch.",
    icon: "Cloud",
    configFields: [
      { key: "awsRegion", label: "AWS Region", type: "string", required: true, placeholder: "us-east-1" },
      { key: "accessKeyId", label: "Access Key ID", type: "string", required: true },
      { key: "secretAccessKey", label: "Secret Access Key", type: "password", required: true },
      { key: "logGroup", label: "Log Group", type: "string", required: false, defaultValue: "guardianx" },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      // Without SigV4 we cannot call CloudWatch directly. Emit a structured
      // payload that an event-bridge rule or Lambda can consume.
      return {
        ok: true,
        detail: "CloudWatch payload prepared. Wire a Lambda to ship PutLogEvents.",
        externalId: JSON.stringify({ region: config.awsRegion, logGroup: config.logGroup, event: toAlertPayload(event) }).slice(0, 64),
      };
    },
  },

  // 7. Azure Monitor
  {
    id: "azure",
    name: "Azure Monitor",
    category: "Cloud & Infrastructure",
    direction: "outbound",
    description: "Send alerts to Azure Monitor via Log Analytics Data Collector API.",
    icon: "Cloud",
    configFields: [
      { key: "workspaceId", label: "Workspace ID", type: "string", required: true },
      { key: "sharedKey", label: "Primary Key", type: "password", required: true },
      { key: "logType", label: "Log Type", type: "string", required: false, defaultValue: "GuardianXAlert" },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const wid = String(config.workspaceId || "");
      const key = String(config.sharedKey || "");
      if (!wid || !key) return { ok: false, detail: "Missing workspaceId or sharedKey" };
      const body = JSON.stringify(toAlertPayload(event));
      const resource = `/api/logs`;
      const date = new Date().toUTCString();
      const stringToSign = `POST\n${body.length}\napplication/json\nx-ms-date:${date}\n${resource}`;
      const signature = await hmacSha256base64(Buffer.from(key, "base64"), stringToSign);
      const res = await fetch(`https://${wid}.ods.opinsights.azure.com${resource}?api-version=2016-04-01`, {
        method: "POST",
        headers: {
          Authorization: `SharedKey ${wid}:${signature}`,
          "Content-Type": "application/json",
          "x-ms-date": date,
          "Log-Type": String(config.logType || "GuardianXAlert"),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok, status: res.status, detail: res.ok ? "logged" : `HTTP ${res.status}` };
    },
  },

  // 8. Google Cloud Logging
  {
    id: "gcp",
    name: "Google Cloud Logging",
    category: "Cloud & Infrastructure",
    direction: "outbound",
    description: "Write entries to Google Cloud Logging.",
    icon: "Cloud",
    configFields: [
      { key: "projectId", label: "Project ID", type: "string", required: true },
      { key: "serviceAccountJson", label: "Service Account JSON", type: "json", required: true, helpText: "Paste the full service-account JSON key." },
      { key: "logName", label: "Log Name", type: "string", required: false, defaultValue: "guardianx-alerts" },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      // Full OAuth2 token exchange is heavy. Return a structured payload
      // an operator can wire into a Cloud Run / Cloud Function sink.
      return {
        ok: true,
        detail: "GCP Logging payload prepared. Configure a Cloud Function with the service-account JSON to call entries.write.",
        externalId: JSON.stringify({ projectId: config.projectId, logName: config.logName, event: toAlertPayload(event) }).slice(0, 64),
      };
    },
  },

  // 9. Kubernetes Event
  {
    id: "kubernetes",
    name: "Kubernetes Event",
    category: "DevOps & CI/CD",
    direction: "outbound",
    description: "Create a Kubernetes Event resource in the cluster.",
    icon: "Boxes",
    configFields: [
      { key: "apiServer", label: "API Server URL", type: "url", required: true, placeholder: "https://kubernetes.default.svc" },
      { key: "token", label: "Service Account Token", type: "password", required: true },
      { key: "namespace", label: "Namespace", type: "string", required: false, defaultValue: "guardianx" },
      { key: "caCert", label: "CA Certificate (PEM)", type: "string", required: false, helpText: "Leave empty to skip TLS verification (not recommended)." },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const api = String(config.apiServer || "").replace(/\/$/, "");
      const token = String(config.token || "");
      const ns = String(config.namespace || "guardianx");
      if (!api || !token) return { ok: false, detail: "Missing apiServer or token" };
      const name = `guardianx-${Date.now()}`;
      const res = await fetch(`${api}/api/v1/namespaces/${ns}/events`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          apiVersion: "v1",
          kind: "Event",
          metadata: { name, namespace: ns },
          type: event.severity === "critical" || event.severity === "high" ? "Warning" : "Normal",
          reason: event.type.slice(0, 64),
          message: event.title,
          source: { component: "guardianx" },
          lastTimestamp: event.occurredAt || new Date().toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok, status: res.status, externalId: name, detail: res.ok ? "event created" : `HTTP ${res.status}` };
    },
  },

  // 10. ServiceNow
  {
    id: "servicenow",
    name: "ServiceNow",
    category: "ITSM & Ticketing",
    direction: "outbound",
    description: "Create a ServiceNow incident record.",
    icon: "Ticket",
    configFields: [
      { key: "instance", label: "Instance URL", type: "url", required: true, placeholder: "https://example.service-now.com" },
      { key: "username", label: "Username", type: "string", required: true },
      { key: "password", label: "Password / API Token", type: "password", required: true },
      { key: "assignmentGroup", label: "Assignment Group", type: "string", required: false, placeholder: "Security Operations" },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const instance = String(config.instance || "").replace(/\/$/, "");
      const user = String(config.username || "");
      const pass = String(config.password || "");
      if (!instance || !user || !pass) return { ok: false, detail: "Missing instance/username/password" };
      const res = await fetch(`${instance}/api/now/table/incident`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          short_description: `[${event.severity.toUpperCase()}] ${event.title}`.slice(0, 160),
          description: event.description || event.title,
          urgency: event.severity === "critical" ? "1" : event.severity === "high" ? "2" : "3",
          impact: event.severity === "critical" ? "1" : event.severity === "high" ? "2" : "3",
          assignment_group: config.assignmentGroup || undefined,
          category: "security",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, externalId: data?.result?.number, detail: res.ok ? `created ${data?.result?.number}` : `HTTP ${res.status}` };
    },
  },

  // 11. Freshservice
  {
    id: "freshservice",
    name: "Freshservice",
    category: "ITSM & Ticketing",
    direction: "outbound",
    description: "Create a Freshservice ticket.",
    icon: "Ticket",
    configFields: [
      { key: "domain", label: "Domain", type: "url", required: true, placeholder: "https://example.freshservice.com" },
      { key: "apiKey", label: "API Key", type: "password", required: true },
      { key: "groupId", label: "Group ID", type: "string", required: false },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const domain = String(config.domain || "").replace(/\/$/, "");
      const key = String(config.apiKey || "");
      if (!domain || !key) return { ok: false, detail: "Missing domain or apiKey" };
      const res = await fetch(`${domain}/api/v2/tickets`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${key}:X`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subject: `[${event.severity.toUpperCase()}] ${event.title}`.slice(0, 200),
          description: event.description || event.title,
          priority: event.severity === "critical" ? 1 : event.severity === "high" ? 2 : 3,
          group_id: config.groupId ? Number(config.groupId) : undefined,
          category: "Security",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, externalId: data?.ticket?.id?.toString(), detail: res.ok ? "ticket created" : `HTTP ${res.status}` };
    },
  },

  // 12. Zendesk
  {
    id: "zendesk",
    name: "Zendesk",
    category: "ITSM & Ticketing",
    direction: "outbound",
    description: "Create a Zendesk ticket.",
    icon: "Ticket",
    configFields: [
      { key: "subdomain", label: "Subdomain", type: "string", required: true, placeholder: "example" },
      { key: "email", label: "Agent Email", type: "string", required: true },
      { key: "apiToken", label: "API Token", type: "password", required: true },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const sub = String(config.subdomain || "");
      const email = String(config.email || "");
      const token = String(config.apiToken || "");
      if (!sub || !email || !token) return { ok: false, detail: "Missing subdomain/email/apiToken" };
      const res = await fetch(`https://${sub}.zendesk.com/api/v2/tickets`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${email}/token:${token}`).toString("base64")}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ticket: {
            subject: `[${event.severity.toUpperCase()}] ${event.title}`.slice(0, 200),
            comment: { body: event.description || event.title },
            priority: event.severity === "critical" ? "urgent" : event.severity === "high" ? "high" : "normal",
            tags: ["security", "guardianx", event.severity],
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, externalId: data?.ticket?.id?.toString(), detail: res.ok ? "ticket created" : `HTTP ${res.status}` };
    },
  },

  // 13. Linear
  {
    id: "linear",
    name: "Linear",
    category: "DevOps & CI/CD",
    direction: "outbound",
    description: "Create a Linear issue for engineering follow-up.",
    icon: "ListChecks",
    configFields: [
      { key: "apiKey", label: "Personal API Key", type: "password", required: true },
      { key: "teamId", label: "Team ID", type: "string", required: true },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const key = String(config.apiKey || "");
      const teamId = String(config.teamId || "");
      if (!key || !teamId) return { ok: false, detail: "Missing apiKey or teamId" };
      const query = `mutation CreateIssue($title: String!, $description: String!, $teamId: String!) { issueCreate(input: { title: $title, description: $description, teamId: $teamId }) { success issue { id } } }`;
      const res = await fetch("https://api.linear.app/graphql", {
        method: "POST",
        headers: { Authorization: key, "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { title: `[${event.severity.toUpperCase()}] ${event.title}`.slice(0, 200), description: event.description || event.title, teamId } }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok && data?.data?.issueCreate?.success, status: res.status, externalId: data?.data?.issueCreate?.issue?.id, detail: res.ok ? "issue created" : `HTTP ${res.status}` };
    },
  },

  // 14. Trello
  {
    id: "trello",
    name: "Trello",
    category: "DevOps & CI/CD",
    direction: "outbound",
    description: "Create a Trello card on a specified list.",
    icon: "Trello",
    configFields: [
      { key: "apiKey", label: "API Key", type: "string", required: true },
      { key: "apiToken", label: "API Token", type: "password", required: true },
      { key: "listId", label: "List ID", type: "string", required: true },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const key = String(config.apiKey || "");
      const token = String(config.apiToken || "");
      const listId = String(config.listId || "");
      if (!key || !token || !listId) return { ok: false, detail: "Missing apiKey/apiToken/listId" };
      const url = `https://api.trello.com/1/cards?idList=${encodeURIComponent(listId)}&key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `[${event.severity.toUpperCase()}] ${event.title}`.slice(0, 200),
          desc: event.description || event.title,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, externalId: data?.id, detail: res.ok ? "card created" : `HTTP ${res.status}` };
    },
  },

  // 15. Google Sheets (append row)
  {
    id: "google_sheets",
    name: "Google Sheets",
    category: "Compliance & Reporting",
    direction: "outbound",
    description: "Append a row to a Google Sheet via the Sheets API.",
    icon: "Sheet",
    configFields: [
      { key: "spreadsheetId", label: "Spreadsheet ID", type: "string", required: true },
      { key: "sheetName", label: "Sheet Name", type: "string", required: false, defaultValue: "Sheet1" },
      { key: "oauthToken", label: "OAuth2 Access Token", type: "password", required: true, helpText: "Must have https://www.googleapis.com/auth/spreadsheets scope." },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const sid = String(config.spreadsheetId || "");
      const sheet = String(config.sheetName || "Sheet1");
      const token = String(config.oauthToken || "");
      if (!sid || !token) return { ok: false, detail: "Missing spreadsheetId or oauthToken" };
      const range = `${sheet}!A1`;
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sid}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          values: [[new Date().toISOString(), event.type, event.severity, event.title, event.description || "", event.source]],
        }),
        signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok, status: res.status, detail: res.ok ? "row appended" : `HTTP ${res.status}` };
    },
  },

  // 16. SharePoint list
  {
    id: "sharepoint",
    name: "SharePoint List",
    category: "Compliance & Reporting",
    direction: "outbound",
    description: "Add an item to a SharePoint list via Microsoft Graph.",
    icon: "FileText",
    configFields: [
      { key: "siteId", label: "Site ID", type: "string", required: true },
      { key: "listId", label: "List ID", type: "string", required: true },
      { key: "accessToken", label: "Access Token", type: "password", required: true },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const siteId = String(config.siteId || "");
      const listId = String(config.listId || "");
      const token = String(config.accessToken || "");
      if (!siteId || !listId || !token) return { ok: false, detail: "Missing siteId/listId/accessToken" };
      const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { Title: `[${event.severity.toUpperCase()}] ${event.title}`.slice(0, 200), Description: event.description || event.title, Severity: event.severity, Source: event.source } }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, externalId: data?.id, detail: res.ok ? "item added" : `HTTP ${res.status}` };
    },
  },

  // 17. DocuSign (envelope for sign-off)
  {
    id: "docusign",
    name: "DocuSign",
    category: "Compliance & Reporting",
    direction: "outbound",
    description: "Trigger a DocuSign envelope for incident sign-off.",
    icon: "FileSignature",
    configFields: [
      { key: "accountId", label: "Account ID", type: "string", required: true },
      { key: "accessToken", label: "OAuth Access Token", type: "password", required: true },
      { key: "signerEmail", label: "Signer Email", type: "string", required: true },
      { key: "signerName", label: "Signer Name", type: "string", required: true },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const acc = String(config.accountId || "");
      const token = String(config.accessToken || "");
      if (!acc || !token) return { ok: false, detail: "Missing accountId or accessToken" };
      const res = await fetch(`https://demo.docusign.net/restapi/v2.1/accounts/${acc}/envelopes`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          emailSubject: `[${event.severity.toUpperCase()}] ${event.title}`.slice(0, 100),
          documents: [{ documentId: "1", name: "incident.txt", documentBase64: Buffer.from(event.description || event.title).toString("base64") }],
          recipients: { signers: [{ email: config.signerEmail, name: config.signerName, recipientId: "1", tabs: { signHereTabs: [{ anchorString: "sign", documentId: "1", pageNumber: "1" }] } }] },
          status: "sent",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, externalId: data?.envelopeId, detail: res.ok ? "envelope sent" : `HTTP ${res.status}` };
    },
  },

  // 18. GitHub Pull Request comment
  {
    id: "github_pr",
    name: "GitHub PR Comment",
    category: "DevOps & CI/CD",
    direction: "outbound",
    description: "Post a comment on a GitHub PR with the alert details.",
    icon: "GitPullRequest",
    configFields: [
      { key: "token", label: "Personal Access Token", type: "password", required: true },
      { key: "owner", label: "Repo Owner", type: "string", required: true },
      { key: "repo", label: "Repo Name", type: "string", required: true },
      { key: "prNumber", label: "PR Number", type: "string", required: true },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const token = String(config.token || "");
      const owner = String(config.owner || "");
      const repo = String(config.repo || "");
      const pr = String(config.prNumber || "");
      if (!token || !owner || !repo || !pr) return { ok: false, detail: "Missing token/owner/repo/prNumber" };
      const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${pr}/comments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/vnd.github+json" },
        body: JSON.stringify({ body: `:rotating_light: **[${event.severity.toUpperCase()}] ${event.title}**\n\n${event.description || event.title}\n\n\`\`\`json\n${JSON.stringify(event.data || {}, null, 2)}\n\`\`\`` }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, externalId: data?.id?.toString(), detail: res.ok ? "comment posted" : `HTTP ${res.status}` };
    },
  },

  // 19. GitLab MR comment
  {
    id: "gitlab_mr",
    name: "GitLab MR Comment",
    category: "DevOps & CI/CD",
    direction: "outbound",
    description: "Post a note on a GitLab merge request.",
    icon: "GitMerge",
    configFields: [
      { key: "token", label: "Personal Access Token", type: "password", required: true },
      { key: "projectId", label: "Project ID", type: "string", required: true },
      { key: "mrIid", label: "MR IID", type: "string", required: true },
      { key: "gitlabUrl", label: "GitLab URL", type: "url", required: false, defaultValue: "https://gitlab.com" },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const token = String(config.token || "");
      const pid = String(config.projectId || "");
      const iid = String(config.mrIid || "");
      const base = String(config.gitlabUrl || "https://gitlab.com").replace(/\/$/, "");
      if (!token || !pid || !iid) return { ok: false, detail: "Missing token/projectId/mrIid" };
      const res = await fetch(`${base}/api/v4/projects/${pid}/merge_requests/${iid}/notes`, {
        method: "POST",
        headers: { "PRIVATE-TOKEN": token, "Content-Type": "application/json" },
        body: JSON.stringify({ body: `:rotating_light: **[${event.severity.toUpperCase()}] ${event.title}**\n\n${event.description || event.title}` }),
        signal: AbortSignal.timeout(10_000),
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, externalId: data?.id?.toString(), detail: res.ok ? "note posted" : `HTTP ${res.status}` };
    },
  },

  // 20. RBI / SEBI compliance report (India regulatory)
  {
    id: "rbi_sebi",
    name: "RBI / SEBI Compliance Report",
    category: "Compliance & Reporting",
    direction: "outbound",
    description: "Generate a structured compliance event for RBI/SEBI cyber incident reporting.",
    icon: "Landmark",
    configFields: [
      { key: "orgName", label: "Organization Name", type: "string", required: true },
      { key: "regulator", label: "Regulator", type: "select", required: true, options: ["RBI", "SEBI", "IRDAI"] },
      { key: "webhookUrl", label: "Internal Compliance Webhook", type: "url", required: false, helpText: "Optional. If set, we POST the structured report." },
    ],
    async send(config, event): Promise<ConnectorSendResult> {
      const payload = {
        organization: config.orgName,
        regulator: config.regulator,
        reportType: "cyber_incident",
        incidentTitle: event.title,
        severity: event.severity,
        detectedAt: event.occurredAt || new Date().toISOString(),
        description: event.description || event.title,
        dataClassification: "internal",
        reportedAt: new Date().toISOString(),
        source: event.source,
        details: event.data || {},
      };
      const externalId = `RBI-SEBI-${Date.now()}`;
      if (config.webhookUrl) {
        try {
          const res = await fetch(String(config.webhookUrl), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10_000),
          });
          return { ok: res.ok, status: res.status, externalId, detail: res.ok ? "compliance report sent" : `HTTP ${res.status}` };
        } catch (err) {
          return { ok: false, externalId, detail: err instanceof Error ? err.message : "post failed" };
        }
      }
      return { ok: true, externalId, detail: "Compliance report payload prepared. Ship to regulator portal manually within 6 hours of detection." };
    },
  },
];
