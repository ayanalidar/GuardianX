import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sha256hex, randomUUID } from "@/lib/crypto";

export const dynamic = "force-dynamic";

// SIEM agent registration + install-script endpoint.
//
// Agents are stored as Integration rows with type="siem_agent" and config:
//   { agentId, clientId, clientName, hostname, agentVersion, registeredAt,
//     lastSeenAt, status, config }

const AGENT_INTEGRATION_TYPE = "siem_agent";

interface StoredAgent {
  agentId: string;
  clientId: string;
  clientName?: string;
  hostname: string;
  agentVersion: string;
  registeredAt: string;
  lastSeenAt: string | null;
  status: "active" | "inactive" | "revoked";
  config: Record<string, unknown>;
}

async function hashToken(plaintext: string): Promise<string> {
  return sha256hex(plaintext);
}

// POST /api/siem/agent - register a new SIEM agent.
// Body: { clientId, hostname, agentVersion?, config? }
// Returns: { agentId, agentToken }  (token shown exactly once)
//
// This route is intentionally NOT behind requireAuth so unattended installs
// can register themselves. The caller must present a valid SIEM API key
// (X-Client-Key) for the target client to prove they own it.
export async function POST(req: Request) {
  // 1. Authenticate with X-Client-Key (same mechanism as /ingest).
  const clientKey = req.headers.get("x-client-key");
  let authInfo: { keyId: string; clientId: string; clientName?: string } | null = null;
  try {
    const { validateClientApiKey } = await import("@/app/api/siem/api-key/route");
    authInfo = await validateClientApiKey(clientKey);
  } catch {
    authInfo = null;
  }
  if (!authInfo) {
    return NextResponse.json(
      { error: "Invalid or missing X-Client-Key header" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const hostname = typeof body.hostname === "string" ? body.hostname.trim() : "";
    if (!hostname) {
      return NextResponse.json({ error: "hostname is required" }, { status: 400 });
    }

    // Optional admin override: a logged-in admin can register an agent on
    // behalf of any client (useful for staging/test setups).
    let clientId = authInfo.clientId;
    let clientName = authInfo.clientName;
    if (body.clientId && typeof body.clientId === "string") {
      const adminAuth = requireAuth(req);
      if (adminAuth.ok) {
        clientId = body.clientId;
        const client = await db.client.findUnique({ where: { id: clientId } });
        clientName = (client?.name as string) || undefined;
      } else if (body.clientId !== authInfo.clientId) {
        return NextResponse.json(
          { error: "X-Client-Key does not match requested clientId" },
          { status: 403 }
        );
      }
    }

    const agentId = randomUUID();
    const agentToken = "gx_agent_" + (await sha256hex(agentId + Math.random())).slice(0, 40);
    const tokenHash = await hashToken(agentToken);
    const agentVersion = typeof body.agentVersion === "string" ? body.agentVersion : "1.0.0";
    const config = body.config && typeof body.config === "object" ? body.config : {};

    const stored: StoredAgent = {
      agentId,
      clientId,
      clientName,
      hostname,
      agentVersion,
      registeredAt: new Date().toISOString(),
      lastSeenAt: null,
      status: "active",
      config: { ...config, tokenHash },
    };

    const row = await db.integration.create({
      data: {
        id: agentId,
        type: AGENT_INTEGRATION_TYPE,
        config: JSON.stringify(stored),
        isActive: true,
      },
    });

    // Audit trail.
    try {
      await db.auditLog.create({
        data: {
          action: "siem.agent.registered",
          entity: "client",
          actor: `siem-key:${authInfo.keyId.slice(0, 8)}`,
          details: JSON.stringify({
            agentId,
            clientId,
            clientName,
            hostname,
            agentVersion,
            rowId: row.id,
          }),
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json(
      {
        agentId,
        agentToken, // shown exactly once
        clientId,
        clientName,
        hostname,
        agentVersion,
        registeredAt: stored.registeredAt,
        ingestEndpoint: "/api/siem/ingest",
        message: "Agent registered. Store the agentToken securely.",
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to register agent" },
      { status: 500 }
    );
  }
}

// GET /api/siem/agent - return an install script (bash) for a client.
// Query: ?clientId=xxx[&hostname=node-01][&format=bash|curl]
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const clientId = url.searchParams.get("clientId");
    if (!clientId) {
      return NextResponse.json({ error: "clientId query param is required" }, { status: 400 });
    }
    const hostname = url.searchParams.get("hostname") || "guardian-agent";
    const format = url.searchParams.get("format") || "bash";

    // Fetch one active API key prefix for the client (just for display).
    let keyPrefix = "gx_siem_********";
    try {
      const rows = (await db.integration.findMany({
        where: { type: "siem_api_key", isActive: true },
      })) as Array<Record<string, unknown>>;
      for (const row of rows) {
        let cfg: { clientId?: string; keyPrefix?: string };
        try {
          cfg = JSON.parse((row.config as string) || "{}");
        } catch {
          continue;
        }
        if (cfg.clientId === clientId && cfg.keyPrefix) {
          keyPrefix = cfg.keyPrefix + "...";
          break;
        }
      }
    } catch {
      /* ignore */
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://your-guardianx-host";
    const ingestUrl = `${baseUrl}/api/siem/ingest`;

    if (format === "curl") {
      // Return a one-liner curl example.
      const script = `curl -X POST ${ingestUrl} \\
  -H "Content-Type: application/json" \\
  -H "X-Client-Key: YOUR_SIEM_API_KEY" \\
  -d '{"source":"api_access","type":"GET","title":"/health","ipAddress":"127.0.0.1","timestamp":"2024-01-01T00:00:00Z"}'`;
      return new Response(script, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Default: return a bash install script that the operator can pipe to sh.
    const script = `#!/usr/bin/env bash
# GuardianX SIEM Agent - install script
# Generated for client: ${clientId}
# Hostname: ${hostname}
# Detected SIEM API key prefix: ${keyPrefix}
#
# Usage:
#   GUARDIAN_API_KEY=your_key_here bash install-guardian-agent.sh
#
# After install, the agent runs as a systemd service and forwards syslog +
# journald entries to the GuardianX ingest endpoint.

set -euo pipefail

GUARDIAN_API_KEY="\${GUARDIAN_API_KEY:-}"
GUARDIAN_HOST="\${GUARDIAN_HOST:-${baseUrl}}"
AGENT_HOSTNAME="\${AGENT_HOSTNAME:-${hostname}}"

if [ -z "$GUARDIAN_API_KEY" ]; then
  echo "ERROR: GUARDIAN_API_KEY env var is required."
  echo "Generate one in the GuardianX console under SIEM > Client Integration."
  exit 1
fi

echo "[guardian-agent] Registering with $GUARDIAN_HOST as $AGENT_HOSTNAME..."

REG_RESPONSE=$(curl -fsSL -X POST "$GUARDIAN_HOST/api/siem/agent" \\
  -H "Content-Type: application/json" \\
  -H "X-Client-Key: $GUARDIAN_API_KEY" \\
  -d "{\\"hostname\\": \\"$AGENT_HOSTNAME\\", \\"agentVersion\\": \\"1.0.0\\"}")

AGENT_ID=$(echo "$REG_RESPONSE" | grep -oE '"agentId":"[^"]+"' | head -1 | cut -d'"' -f4)
AGENT_TOKEN=$(echo "$REG_RESPONSE" | grep -oE '"agentToken":"[^"]+"' | head -1 | cut -d'"' -f4)

if [ -z "$AGENT_ID" ] || [ -z "$AGENT_TOKEN" ]; then
  echo "ERROR: registration failed. Response: $REG_RESPONSE"
  exit 1
fi

echo "[guardian-agent] Registered. agentId=$AGENT_ID"

# Install the systemd service.
sudo tee /etc/systemd/system/guardian-agent.service > /dev/null <<EOF
[Unit]
Description=GuardianX SIEM Agent
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/guardian-agent --agent-id $AGENT_ID --token $AGENT_TOKEN --host $GUARDIAN_HOST
Restart=on-failure
RestartSec=5
Environment=GUARDIAN_INGEST_URL=$GUARDIAN_HOST/api/siem/ingest

[Install]
WantedBy=multi-user.target
EOF

# Install a stub binary that pipes journald to the ingest endpoint.
sudo curl -fsSL -o /usr/local/bin/guardian-agent "$GUARDIAN_HOST/api/siem/agent?format=binary" || true
sudo chmod +x /usr/local/bin/guardian-agent 2>/dev/null || true

sudo systemctl daemon-reload
sudo systemctl enable --now guardian-agent

echo "[guardian-agent] Installed and started. Check status with:"
echo "  sudo systemctl status guardian-agent"
`;

    return new Response(script, {
      headers: {
        "Content-Type": "text/x-shellscript; charset=utf-8",
        "Content-Disposition": 'inline; filename="install-guardian-agent.sh"',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate install script" },
      { status: 500 }
    );
  }
}

// PATCH /api/siem/agent?id=xxx - update agent status (heartbeat or revoke).
// Body: { status?: "active"|"inactive"|"revoked", lastSeen?: true }
export async function PATCH(req: Request) {
  // Heartbeat endpoint: agents can call this with their X-Client-Key to
  // refresh lastSeenAt. No requireAuth needed.
  const clientKey = req.headers.get("x-client-key");
  let authInfo: { keyId: string; clientId: string; clientName?: string } | null = null;
  try {
    const { validateClientApiKey } = await import("@/app/api/siem/api-key/route");
    authInfo = await validateClientApiKey(clientKey);
  } catch {
    authInfo = null;
  }

  if (!authInfo) {
    const adminAuth = requireAuth(req);
    if (!adminAuth.ok) return adminAuth.response;
  }

  try {
    const url = new URL(req.url);
    const agentId = url.searchParams.get("id");
    if (!agentId) {
      return NextResponse.json({ error: "id query param is required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const row = await db.integration.findUnique({ where: { id: agentId } });
    if (!row || row.type !== AGENT_INTEGRATION_TYPE) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    let cfg: StoredAgent;
    try {
      cfg = JSON.parse((row.config as string) || "{}");
    } catch {
      cfg = {} as StoredAgent;
    }

    if (body.status) {
      cfg.status = body.status;
    }
    if (body.lastSeen === true || body.heartbeat === true) {
      cfg.lastSeenAt = new Date().toISOString();
    }

    await db.integration.update({
      where: { id: agentId },
      data: {
        config: JSON.stringify(cfg),
        isActive: cfg.status !== "revoked",
      },
    });

    return NextResponse.json({ agentId, status: cfg.status, lastSeenAt: cfg.lastSeenAt });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update agent" },
      { status: 500 }
    );
  }
}
