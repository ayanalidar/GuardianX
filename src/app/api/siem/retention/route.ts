import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getRetentionPolicy,
  setRetentionPolicy,
  getRetentionStats,
  runCleanup,
  type RetentionPolicy,
} from "@/lib/siem/retention";

export const dynamic = "force-dynamic";

// GET /api/siem/retention - current retention policy + per-source counts.
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    if (url.searchParams.get("stats") === "true") {
      const stats = await getRetentionStats();
      return NextResponse.json(stats);
    }
    const policy = await getRetentionPolicy();
    return NextResponse.json(policy);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load retention policy" },
      { status: 500 }
    );
  }
}

// POST /api/siem/retention - update retention policy (partial patch).
// Body: Partial<RetentionPolicy>
//   { hotDays?, warmDays?, coldDays?, tables?, autoCleanup? }
// Use ?action=cleanup to trigger a cleanup run instead.
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    if (url.searchParams.get("action") === "cleanup") {
      const result = await runCleanup();
      return NextResponse.json(result);
    }

    const body = (await req.json().catch(() => ({}))) as Partial<RetentionPolicy>;

    // Validate numeric fields.
    if (body.hotDays !== undefined && (Number(body.hotDays) < 1 || Number(body.hotDays) > 3650)) {
      return NextResponse.json({ error: "hotDays must be between 1 and 3650" }, { status: 400 });
    }
    if (body.warmDays !== undefined && (Number(body.warmDays) < 1 || Number(body.warmDays) > 3650)) {
      return NextResponse.json({ error: "warmDays must be between 1 and 3650" }, { status: 400 });
    }
    if (body.coldDays !== undefined && (Number(body.coldDays) < 1 || Number(body.coldDays) > 36500)) {
      return NextResponse.json({ error: "coldDays must be between 1 and 36500" }, { status: 400 });
    }
    if (body.hotDays && body.warmDays && body.hotDays > body.warmDays) {
      return NextResponse.json({ error: "hotDays must not exceed warmDays" }, { status: 400 });
    }
    if (body.warmDays && body.coldDays && body.warmDays > body.coldDays) {
      return NextResponse.json({ error: "warmDays must not exceed coldDays" }, { status: 400 });
    }

    const updated = await setRetentionPolicy(body);
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update retention policy" },
      { status: 500 }
    );
  }
}
