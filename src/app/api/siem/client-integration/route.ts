import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/siem/client-integration - returns all 4 integration options for a
// client. This is the menu the operator sees in the "Add Integration" wizard.
//
// Query: ?clientId=xxx (required)
//
// The 4 options are:
//   1. syslog     - configure an external syslog forwarder (one-shot setup)
//   2. http       - HTTP log ingest via /api/siem/ingest + X-Client-Key
//   3. agent      - install the guardian-siem-agent on a host
//   4. splunk     - push to Splunk/ELK via the existing integrations PATCH
//
// Each option includes:
//   - id, name, description, category, difficulty
//   - setupSteps[]     - ordered list of operator actions
//   - config           - rendered config snippet (URL, key prefix, etc.)
//   - status           - "available" | "configured" | "partial"

interface IntegrationOption {
  id: string;
  name: string;
  description: string;
  category: "forwarder" | "agent" | "platform";
  difficulty: "easy" | "medium" | "advanced";
  setupSteps: string[];
  config: Record<string, unknown>;
  status: "available" | "configured" | "partial";
}

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId");
    if (!clientId) {
      return NextResponse.json({ error: "clientId query param is required" }, { status: 400 });
    }

    const client = await db.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://your-guardianx-host";
    const ingestUrl = `${baseUrl}/api/siem/ingest`;
    const agentUrl = `${baseUrl}/api/siem/agent`;
    const clientName = (client.name as string) || clientId;

    // Pull the current state of the client's SIEM API keys + agents so we can
    // mark each option as available/configured/partial.
    let apiKeyCount = 0;
    let apiKeyPrefix = "";
    let agentCount = 0;
    let splunkConfigured = false;

    try {
      const integrations = (await db.integration.findMany({
        where: { isActive: true },
      })) as Array<Record<string, unknown>>;

      for (const row of integrations) {
        const type = row.type as string;
        if (!type) continue;
        let cfg: Record<string, unknown> = {};
        try {
          cfg = JSON.parse((row.config as string) || "{}");
        } catch {
          continue;
        }
        if (type === "siem_api_key" && cfg.clientId === clientId) {
          apiKeyCount++;
          if (!apiKeyPrefix && typeof cfg.keyPrefix === "string") {
            apiKeyPrefix = cfg.keyPrefix;
          }
        } else if (type === "siem_agent" && cfg.clientId === clientId) {
          agentCount++;
        } else if (type === "splunk" || type === "elk") {
          splunkConfigured = true;
        }
      }
    } catch {
      /* ignore - state checks are best-effort */
    }

    const options: IntegrationOption[] = [
      {
        id: "syslog",
        name: "Syslog Forwarder",
        description:
          "Forward syslog/journald entries from your existing SIEM (rsyslog, syslog-ng, journald) directly to GuardianX. Ideal for Linux server fleets that already centralize logs.",
        category: "forwarder",
        difficulty: "medium",
        setupSteps: [
          "Generate a SIEM API key for this client (use the API Key tab).",
          "Add a GuardianX forwarding rule to /etc/rsyslog.d/30-guardian.conf.",
          "Restart rsyslog: sudo systemctl restart rsyslog.",
          "Verify logs appear in SIEM > Search within 30 seconds.",
        ],
        config: {
          ingestUrl,
          syslogTemplate: `*.* action(type="omhttp" server="${baseUrl.replace(/^https?:\/\//, "")}" port="443" usehttps="on" url="/api/siem/ingest" httpheader="X-Client-Key: YOUR_SIEM_API_KEY" action.resumeRetryCount="-1")`,
          keyPrefix: apiKeyPrefix ? apiKeyPrefix + "..." : "(not yet generated)",
        },
        status: apiKeyCount > 0 ? "configured" : "available",
      },
      {
        id: "http",
        name: "HTTP Log Ingest API",
        description:
          "Push log entries via HTTPS POST to /api/siem/ingest using an X-Client-Key header. Best for custom applications, lambda functions, or anything that already speaks HTTP. Supports single entries or batches up to 1000.",
        category: "forwarder",
        difficulty: "easy",
        setupSteps: [
          "Generate a SIEM API key for this client.",
          "POST log entries to the ingest URL with the X-Client-Key header.",
          "Optionally batch up to 1000 entries per call for throughput.",
        ],
        config: {
          ingestUrl,
          method: "POST",
          authHeader: "X-Client-Key: <your-siem-api-key>",
          bodyShape: {
            source: "audit|api_access|honeypot|incident",
            type: "string (event type)",
            severity: "critical|high|medium|low|info",
            title: "string",
            description: "string",
            ipAddress: "string (optional)",
            timestamp: "ISO-8601 string",
          },
          batchShape: { entries: ["..."] },
          curlExample: `curl -X POST ${ingestUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-Client-Key: YOUR_SIEM_API_KEY" \\
  -d '{"source":"api_access","type":"GET","title":"/health","ipAddress":"10.0.0.1","timestamp":"2024-01-01T00:00:00Z"}'`,
          keyPrefix: apiKeyPrefix ? apiKeyPrefix + "..." : "(not yet generated)",
        },
        status: apiKeyCount > 0 ? "configured" : "available",
      },
      {
        id: "agent",
        name: "GuardianX SIEM Agent",
        description:
          "Install the GuardianX SIEM agent on a host to forward logs automatically. The agent runs as a systemd service, handles retries, and supports journald + file tailing. Best for production fleets that need resilience.",
        category: "agent",
        difficulty: "medium",
        setupSteps: [
          "Generate a SIEM API key for this client.",
          "Download the install script from the Agent tab.",
          "Run: GUARDIAN_API_KEY=... bash install-guardian-agent.sh",
          "Verify the systemd service is active: systemctl status guardian-agent.",
        ],
        config: {
          agentRegisterUrl: agentUrl,
          installScriptUrl: `${agentUrl}?clientId=${clientId}&format=bash`,
          systemdServiceName: "guardian-agent",
          registeredAgents: agentCount,
          keyPrefix: apiKeyPrefix ? apiKeyPrefix + "..." : "(not yet generated)",
        },
        status: agentCount > 0 ? "configured" : apiKeyCount > 0 ? "available" : "partial",
      },
      {
        id: "splunk",
        name: "Splunk / ELK Webhook",
        description:
          "Push GuardianX findings, patches, and incidents to an external Splunk HEC or ELK cluster using the existing Integrations module. Best for organisations that already run a SIEM and want GuardianX data to enrich it.",
        category: "platform",
        difficulty: "advanced",
        setupSteps: [
          "Open Integrations > Add Integration and choose splunk or elk.",
          "Configure the HEC URL / Elasticsearch endpoint in the integration config.",
          "Trigger an export via PATCH /api/integrations?format=splunk|elk.",
          "Verify the GuardianX events appear in your Splunk/ELK dashboards.",
        ],
        config: {
          splunkHecUrl: "https://splunk.example.com:8088/services/collector",
          elkBulkUrl: "https://elk.example.com:9200/_bulk",
          exportEndpoint: `${baseUrl}/api/integrations`,
          exportFormats: ["splunk", "elk", "jira"],
          alreadyConfigured: splunkConfigured,
        },
        status: splunkConfigured ? "configured" : "available",
      },
    ];

    return NextResponse.json({
      clientId,
      clientName,
      baseUrl,
      ingestUrl,
      apiKeys: apiKeyCount,
      agents: agentCount,
      options,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load integration options" },
      { status: 500 }
    );
  }
}
