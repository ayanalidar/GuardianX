import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST /api/iocs/check - look up whether a value is a known IOC.
// Body: { value: "1.2.3.4" }
// If found, increments hitCount and refreshes lastSeen so the threat intel
// database reflects the most recent observation. Returns { found, ioc }.
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const rawValue = typeof body.value === "string" ? body.value.trim() : "";

  if (!rawValue) {
    return NextResponse.json({ error: "value is required" }, { status: 400 });
  }

  const value = rawValue.toLowerCase();

  try {
    const ioc = await db.iOC.findFirst({
      where: { value },
    });

    if (!ioc) {
      return NextResponse.json({
        found: false,
        ioc: null,
        value,
        message: "Value not found in IOC database - no threat intelligence match.",
      });
    }

    // Found a match - bump hitCount and refresh lastSeen so threat intel
    // reflects the most recent observation. Only count as a hit if the IOC
    // is active; a deactivated IOC is reported but not bumped.
    let updated: Record<string, unknown> | null = ioc as Record<string, unknown>;
    if (ioc.isActive) {
      try {
        updated = await db.iOC.update({
          where: { id: ioc.id as string },
          data: {
            hitCount: ((ioc.hitCount as number) || 0) + 1,
            lastSeen: new Date(),
          },
        });
      } catch {
        // If the bump fails (e.g. concurrent update), fall back to the
        // original record so the caller still gets a positive answer.
        updated = ioc as Record<string, unknown>;
      }
    }

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
      found: true,
      ioc: {
        id: updated?.id,
        iocType: updated?.iocType,
        value: updated?.value,
        confidence: updated?.confidence,
        source: updated?.source,
        tags: safeParse(updated?.tags),
        firstSeen: updated?.firstSeen ? new Date(updated.firstSeen as string).toISOString() : null,
        lastSeen: updated?.lastSeen ? new Date(updated.lastSeen as string).toISOString() : null,
        hitCount: updated?.hitCount,
        isActive: updated?.isActive,
        notes: updated?.notes,
      },
      message: `Match found - IOC "${value}" with confidence ${updated?.confidence} (hitCount now ${updated?.hitCount}).`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to check IOC" },
      { status: 500 }
    );
  }
}
