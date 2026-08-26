import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  enrichmentConnectors,
  enrichIOC,
  type IOCType,
} from "@/lib/integrations/enrichment-connectors";

export const dynamic = "force-dynamic";

const VALID_TYPES: IOCType[] = ["ip", "hash", "domain", "url", "email", "user_agent"];

// GET /api/iocs/enrich
//   ?value=<ioc>&type=<iocType>   -> run enrichment across active connectors
//   ?connectors=true              -> return the catalog of enrichment connectors
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);

    if (url.searchParams.get("connectors") === "true") {
      return NextResponse.json({
        connectors: enrichmentConnectors.map((c) => ({
          id: c.id,
          name: c.name,
          category: c.category,
          description: c.description,
          icon: c.icon,
          supportedTypes: c.supportedTypes,
          configFields: c.configFields,
        })),
        count: enrichmentConnectors.length,
      });
    }

    const value = url.searchParams.get("value");
    const type = url.searchParams.get("type") as IOCType | null;

    if (!value) {
      return NextResponse.json({ error: "value query parameter is required" }, { status: 400 });
    }
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    // Pull active enrichment integrations from the DB so we use the
    // operator-configured API keys.
    const integrationRows = await db.integration.findMany({
      where: { isActive: true },
    }).catch(() => []);

    const activeEnrichments = (integrationRows as Array<Record<string, unknown>>)
      .filter((i) => enrichmentConnectors.some((c) => c.id === i.type))
      .map((i) => {
        let config: Record<string, unknown> = {};
        try {
          config = i.config ? JSON.parse(i.config as string) : {};
        } catch {
          config = {};
        }
        return { id: String(i.type), config };
      });

    const result = await enrichIOC(value, type, activeEnrichments);

    // Persist the IOC if it doesn't exist + record the enrichment.
    try {
      const normalized = value.trim().toLowerCase();
      const existing = await db.ioc.findFirst({ where: { value: normalized } });
      const notes = `Enrichment: ${result.merged.reputation} (score ${result.merged.maxScore}). Providers: ${result.results.map((r) => r.provider).join(", ")}`;
      if (existing) {
        await db.ioc.update({
          where: { id: existing.id as string },
          data: {
            lastSeen: new Date(),
            hitCount: ((existing.hitCount as number) || 0) + 1,
            confidence: result.merged.reputation === "malicious" ? "high" : result.merged.reputation === "suspicious" ? "medium" : "low",
            notes,
          },
        });
      } else {
        await db.ioc.create({
          data: {
            iocType: type,
            value: normalized,
            confidence: result.merged.reputation === "malicious" ? "high" : result.merged.reputation === "suspicious" ? "medium" : "low",
            source: "enrichment",
            tags: result.merged.tags.length ? result.merged.tags.join(",") : null,
            notes,
            isActive: true,
            hitCount: 1,
            firstSeen: new Date(),
            lastSeen: new Date(),
          },
        });
      }
    } catch {
      // IOC persistence is best-effort; don't fail the enrichment.
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Enrichment failed" },
      { status: 500 }
    );
  }
}

// POST /api/iocs/enrich
// Body: { value: string, type: IOCType }
// Same as GET but allows larger payloads + avoids URL-encoding issues
// for long URLs / file hashes.
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { value, type } = body as { value?: string; type?: IOCType };

    if (!value || typeof value !== "string") {
      return NextResponse.json({ error: "value is required" }, { status: 400 });
    }
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const integrationRows = await db.integration.findMany({
      where: { isActive: true },
    }).catch(() => []);

    const activeEnrichments = (integrationRows as Array<Record<string, unknown>>)
      .filter((i) => enrichmentConnectors.some((c) => c.id === i.type))
      .map((i) => {
        let config: Record<string, unknown> = {};
        try {
          config = i.config ? JSON.parse(i.config as string) : {};
        } catch {
          config = {};
        }
        return { id: String(i.type), config };
      });

    const result = await enrichIOC(value, type, activeEnrichments);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Enrichment failed" },
      { status: 500 }
    );
  }
}
