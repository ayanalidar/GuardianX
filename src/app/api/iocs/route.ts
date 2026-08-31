import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_IOC_TYPES = ["ip", "hash", "domain", "url", "email", "user_agent"];
const VALID_CONFIDENCES = ["low", "medium", "high"];
const VALID_SOURCES = ["honeypot", "canary", "api_log", "threat_intel", "manual"];

// GET /api/iocs - list IOCs with optional ?type= and ?active= filters.
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type");
    const active = url.searchParams.get("active");
    const source = url.searchParams.get("source");
    const take = url.searchParams.get("take");

    const where: Record<string, unknown> = {};
    if (type && VALID_IOC_TYPES.includes(type)) where.iocType = type;
    if (source && VALID_SOURCES.includes(source)) where.source = source;
    if (active === "true") where.isActive = true;
    if (active === "false") where.isActive = false;

    const args: Record<string, unknown> = {
      where,
      orderBy: { lastSeen: "desc" },
    };
    if (take) {
      const n = parseInt(take, 10);
      if (!isNaN(n) && n > 0) args.take = n;
    }

    const iocs = await db.iOC.findMany(args);

    const safeParse = (s: unknown): string[] => {
      if (!s || typeof s !== "string") return [];
      try {
        const v = JSON.parse(s);
        return Array.isArray(v) ? v : String(v).split(",").map((x) => x.trim()).filter(Boolean);
      } catch {
        return String(s).split(",").map((x) => x.trim()).filter(Boolean);
      }
    };

    return NextResponse.json({
      iocs: iocs.map((ioc: Record<string, unknown>) => ({
        id: ioc.id,
        iocType: ioc.iocType,
        value: ioc.value,
        confidence: ioc.confidence,
        source: ioc.source,
        tags: safeParse(ioc.tags),
        firstSeen: (ioc.firstSeen as Date).toISOString(),
        lastSeen: (ioc.lastSeen as Date).toISOString(),
        hitCount: ioc.hitCount,
        isActive: ioc.isActive,
        notes: ioc.notes,
        createdAt: (ioc.createdAt as Date).toISOString(),
      })),
      count: iocs.length,
      active: iocs.filter((i: Record<string, unknown>) => i.isActive).length,
      byType: VALID_IOC_TYPES.map((t) => ({
        type: t,
        count: iocs.filter((i: Record<string, unknown>) => i.iocType === t).length,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load IOCs" },
      { status: 500 }
    );
  }
}

// PATCH /api/iocs - toggle active status of an IOC by id.
// Body: { id, isActive }
export async function PATCH(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => ({}));
    const { id, isActive } = body;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const existing = await db.iOC.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "IOC not found" }, { status: 404 });
    }

    const updated = await db.iOC.update({
      where: { id },
      data: { isActive: !!isActive },
    });

    return NextResponse.json({
      id: updated.id,
      isActive: updated.isActive,
      message: `IOC ${isActive ? "activated" : "deactivated"}`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update IOC" },
      { status: 500 }
    );
  }
}

// POST /api/iocs - add an IOC manually or from a honeypot hit.
// If the value already exists, increment hitCount + update lastSeen (and
// optionally upgrade confidence) instead of creating a duplicate.
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const { iocType, value, confidence, source, tags, notes, isActive } = body;

  if (!value || typeof value !== "string") {
    return NextResponse.json({ error: "value is required" }, { status: 400 });
  }
  if (!iocType || !VALID_IOC_TYPES.includes(iocType)) {
    return NextResponse.json(
      { error: `iocType must be one of: ${VALID_IOC_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const normalizedValue = value.trim().toLowerCase();
  const finalConfidence = VALID_CONFIDENCES.includes(confidence) ? confidence : "medium";
  const finalSource = VALID_SOURCES.includes(source) ? source : "manual";

  try {
    // Look up by unique value (case-insensitive lookup is not supported via
    // the REST proxy, so we store canonical lowercased values).
    const existing = await db.iOC.findFirst({
      where: { value: normalizedValue },
    });

    if (existing) {
      // Upsert: bump hitCount, refresh lastSeen, optionally upgrade confidence.
      const confOrder: Record<string, number> = { low: 0, medium: 1, high: 2 };
      const newConfidence =
        confOrder[finalConfidence as string] > confOrder[existing.confidence as string]
          ? finalConfidence
          : existing.confidence;

      const updated = await db.iOC.update({
        where: { id: existing.id as string },
        data: {
          hitCount: ((existing.hitCount as number) || 0) + 1,
          lastSeen: new Date(),
          confidence: newConfidence,
          isActive: true, // re-confirm it is still a live threat
          ...(notes ? { notes: notes as string } : {}),
        },
      });

      return NextResponse.json({
        id: updated.id,
        iocType: updated.iocType,
        value: updated.value,
        confidence: updated.confidence,
        hitCount: updated.hitCount,
        lastSeen: (updated.lastSeen as Date).toISOString(),
        message: "Existing IOC re-confirmed (hitCount incremented, lastSeen refreshed)",
        updated: true,
      });
    }

    // New IOC - create it.
    const tagsStr = Array.isArray(tags)
      ? tags.join(",")
      : typeof tags === "string"
        ? tags
        : null;

    const ioc = await db.iOC.create({
      data: {
        iocType,
        value: normalizedValue,
        confidence: finalConfidence,
        source: finalSource,
        tags: tagsStr,
        notes: typeof notes === "string" ? notes : null,
        isActive: isActive !== false,
        hitCount: 1,
        firstSeen: new Date(),
        lastSeen: new Date(),
      },
    });

    return NextResponse.json(
      {
        id: ioc.id,
        iocType: ioc.iocType,
        value: ioc.value,
        confidence: ioc.confidence,
        source: ioc.source,
        hitCount: ioc.hitCount,
        message: "New IOC added to threat intelligence database",
        created: true,
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to add IOC" },
      { status: 500 }
    );
  }
}
