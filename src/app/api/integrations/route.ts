import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  getConnectorSchemas,
  testIntegration,
  forwardEvent,
  getForwardLog,
  type SecurityEvent,
} from "@/lib/integrations/engine";

export const dynamic = "force-dynamic";

// GET /api/integrations
//   ?schemas=true            -> return the catalog of connector schemas (for the UI)
//   ?log=true                -> return the in-memory forwarding log (last 100)
//   default                  -> return all configured Integration rows
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const wantSchemas = url.searchParams.get("schemas") === "true";
    const wantLog = url.searchParams.get("log") === "true";

    if (wantSchemas) {
      const schemas = await getConnectorSchemas();
      return NextResponse.json({ schemas, count: schemas.length });
    }

    if (wantLog) {
      return NextResponse.json({ log: getForwardLog() });
    }

    const integrations = await db.integration.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      integrations.map((i: Record<string, unknown>) => {
        let config: Record<string, unknown> = {};
        try {
          config = i.config ? JSON.parse(i.config as string) : {};
        } catch {
          config = {};
        }
        return {
          id: i.id,
          type: i.type,
          config,
          isActive: i.isActive,
          createdAt: (i.createdAt as Date).toISOString(),
        };
      })
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load integrations" },
      { status: 500 }
    );
  }
}

// POST /api/integrations
// Body: { type: string, config: object, isActive?: boolean }
// OR:    { test: true, type, config }     -> probe the connector without saving
// OR:    { forward: true, event: SecurityEvent } -> fan-out a single event to every active connector
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));

    // Forward-mode: fan an event out to every active integration.
    if (body.forward === true && body.event) {
      const event = body.event as SecurityEvent;
      const result = await forwardEvent(event);
      return NextResponse.json({
        forwarded: result.forwarded,
        succeeded: result.succeeded,
        failed: result.failed,
        log: result.log,
      });
    }

    const { type, config, isActive, test } = body as {
      type?: string;
      config?: Record<string, unknown>;
      isActive?: boolean;
      test?: boolean;
    };

    if (!type || typeof type !== "string") {
      return NextResponse.json({ error: "type is required" }, { status: 400 });
    }

    // Test-mode: probe the connector without persisting.
    if (test === true) {
      const result = await testIntegration(type, config || {});
      return NextResponse.json(result, { status: result.ok ? 200 : 400 });
    }

    const created = await db.integration.create({
      data: {
        type,
        config: JSON.stringify(config || {}),
        isActive: isActive !== false,
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        type: created.type,
        isActive: created.isActive,
        message: `${type} integration configured`,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to configure integration" },
      { status: 500 }
    );
  }
}

// PATCH /api/integrations
// Body: { id: string, isActive?: boolean, config?: object }
// Toggles active state or updates the config of an existing integration.
export async function PATCH(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { id, isActive, config } = body as {
      id?: string;
      isActive?: boolean;
      config?: Record<string, unknown>;
    };

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existing = await db.integration.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = {};
    if (typeof isActive === "boolean") data.isActive = isActive;
    if (config !== undefined) data.config = JSON.stringify(config);

    const updated = await db.integration.update({ where: { id }, data });

    return NextResponse.json({
      id: updated.id,
      type: updated.type,
      isActive: updated.isActive,
      message: "Integration updated",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update integration" },
      { status: 500 }
    );
  }
}

// DELETE /api/integrations?id=<integrationId>
export async function DELETE(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
    }

    const existing = await db.integration.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 });
    }

    await db.integration.delete({ where: { id } });

    return NextResponse.json({ id, message: "Integration removed" });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to remove integration" },
      { status: 500 }
    );
  }
}
