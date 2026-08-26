import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { sha256hex, randomUUID } from "@/lib/crypto";

export const dynamic = "force-dynamic";

// SIEM API key lifecycle.
//
// Keys are stored as Integration rows with type="siem_api_key" and a JSON
// config: { clientId, clientName, keyHash, keyPrefix, createdAt, createdBy,
// lastUsedAt, isActive, name }. The plaintext key is returned to the caller
// exactly once on creation; we only persist a SHA-256 hash.

const KEY_INTEGRATION_TYPE = "siem_api_key";
const KEY_PREFIX = "gx_siem_";

interface StoredKey {
  id: string;            // Integration row id (also used as key id)
  clientId: string;
  clientName?: string;
  keyHash: string;
  keyPrefix: string;     // first 12 chars of the plaintext, for display
  name: string;
  createdAt: string;
  createdBy: string;
  lastUsedAt: string | null;
  isActive: boolean;
}

async function hashKey(plaintext: string): Promise<string> {
  return sha256hex(plaintext);
}

async function makePlaintext(): Promise<string> {
  // 32 bytes of randomness, hex-encoded, with a recognizable prefix.
  const rand = await sha256hex(randomUUID() + Math.random());
  return KEY_PREFIX + rand.slice(0, 40);
}

async function findKeyRow(keyId: string): Promise<Record<string, unknown> | null> {
  try {
    const row = await db.integration.findUnique({ where: { id: keyId } });
    if (!row) return null;
    const cfg = JSON.parse((row.config as string) || "{}");
    if (row.type !== KEY_INTEGRATION_TYPE) return null;
    return { ...row, _config: cfg };
  } catch {
    return null;
  }
}

// POST /api/siem/api-key - generate a new SIEM API key for a client.
// Body: { clientId, name?, createdBy? }
// Returns the plaintext key exactly once. Store it securely.
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    if (!clientId) {
      return NextResponse.json({ error: "clientId is required" }, { status: 400 });
    }

    // Verify the client exists.
    const client = await db.client.findUnique({ where: { id: clientId } });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const plaintext = await makePlaintext();
    const keyHash = await hashKey(plaintext);
    const keyPrefix = plaintext.slice(0, 12);
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "default";

    const stored: StoredKey = {
      id: randomUUID(),
      clientId,
      clientName: (client.name as string) || undefined,
      keyHash,
      keyPrefix,
      name,
      createdAt: new Date().toISOString(),
      createdBy: auth.user.email,
      lastUsedAt: null,
      isActive: true,
    };

    await db.integration.create({
      data: {
        id: stored.id,
        type: KEY_INTEGRATION_TYPE,
        config: JSON.stringify(stored),
        isActive: true,
      },
    });

    // Audit trail.
    try {
      await db.auditLog.create({
        data: {
          action: "siem.api_key.generated",
          entity: "client",
          actor: auth.user.email,
          details: JSON.stringify({ clientId, clientName: stored.clientName, keyId: stored.id, keyName: name }),
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json(
      {
        keyId: stored.id,
        clientId,
        clientName: stored.clientName,
        name,
        keyPrefix,
        apiKey: plaintext, // returned exactly once
        createdAt: stored.createdAt,
        message: "Store this key securely - it will not be shown again.",
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate SIEM API key" },
      { status: 500 }
    );
  }
}

// DELETE /api/siem/api-key?id=xxx - revoke a SIEM API key.
// Also supports ?clientId=xxx to revoke ALL keys for a client.
export async function DELETE(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const keyId = url.searchParams.get("id");
    const clientId = url.searchParams.get("clientId");

    if (!keyId && !clientId) {
      return NextResponse.json(
        { error: "Either id or clientId query param is required" },
        { status: 400 }
      );
    }

    let revokedCount = 0;

    if (keyId) {
      const row = await findKeyRow(keyId);
      if (!row) {
        return NextResponse.json({ error: "Key not found" }, { status: 404 });
      }
      const cfg = row._config as StoredKey;
      cfg.isActive = false;
      cfg.lastUsedAt = cfg.lastUsedAt || null;
      await db.integration.update({
        where: { id: keyId },
        data: { config: JSON.stringify(cfg), isActive: false },
      });
      revokedCount++;
    } else if (clientId) {
      // Revoke all keys for the client.
      const rows = (await db.integration.findMany({
        where: { type: KEY_INTEGRATION_TYPE, isActive: true },
      })) as Array<Record<string, unknown>>;
      for (const row of rows) {
        let cfg: StoredKey;
        try {
          cfg = JSON.parse((row.config as string) || "{}");
        } catch {
          continue;
        }
        if (cfg.clientId !== clientId || !cfg.isActive) continue;
        cfg.isActive = false;
        await db.integration.update({
          where: { id: row.id as string },
          data: { config: JSON.stringify(cfg), isActive: false },
        });
        revokedCount++;
      }
    }

    // Audit trail.
    try {
      await db.auditLog.create({
        data: {
          action: "siem.api_key.revoked",
          entity: "client",
          actor: auth.user.email,
          details: JSON.stringify({ keyId, clientId, revokedCount }),
        },
      });
    } catch {
      /* ignore */
    }

    return NextResponse.json({ revoked: revokedCount });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to revoke SIEM API key" },
      { status: 500 }
    );
  }
}

// ── Exported helper used by /api/siem/ingest to validate the X-Client-Key. ─
//
// Returns the matched StoredKey (with id + clientId) on success, null on
// failure. Also bumps lastUsedAt (best-effort, not blocking).

export async function validateClientApiKey(
  headerValue: string | null
): Promise<{ keyId: string; clientId: string; clientName?: string } | null> {
  if (!headerValue || !headerValue.startsWith(KEY_PREFIX)) return null;

  const keyHash = await hashKey(headerValue);

  let rows: Array<Record<string, unknown>> = [];
  try {
    rows = (await db.integration.findMany({
      where: { type: KEY_INTEGRATION_TYPE, isActive: true },
    })) as Array<Record<string, unknown>>;
  } catch {
    return null;
  }

  for (const row of rows) {
    let cfg: StoredKey;
    try {
      cfg = JSON.parse((row.config as string) || "{}");
    } catch {
      continue;
    }
    if (!cfg.isActive) continue;
    if (cfg.keyHash === keyHash) {
      // Bump lastUsedAt (best-effort).
      cfg.lastUsedAt = new Date().toISOString();
      try {
        await db.integration.update({
          where: { id: row.id as string },
          data: { config: JSON.stringify(cfg) },
        });
      } catch {
        /* ignore */
      }
      return {
        keyId: cfg.id,
        clientId: cfg.clientId,
        clientName: cfg.clientName,
      };
    }
  }
  return null;
}
