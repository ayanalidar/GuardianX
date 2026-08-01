import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_SEVERITIES = ["low", "medium", "high", "critical"];
const VALID_TRIGGERS = ["manual", "automatic", "scheduled", "anomaly", "canary", "honeypot"];

const safeParse = (s: unknown): unknown => {
  if (!s || typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return s; }
};

// GET /api/playbooks - list all active playbooks (optionally inactive too).
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const includeInactive = url.searchParams.get("includeInactive") === "true";
    const category = url.searchParams.get("category");

    const where: Record<string, unknown> = {};
    if (!includeInactive) where.isActive = true;
    if (category) where.category = category;

    const playbooks = await db.playbook.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      playbooks: playbooks.map((p: Record<string, unknown>) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category,
        trigger: p.trigger,
        steps: safeParse(p.steps),
        severity: p.severity,
        isActive: p.isActive,
        stepCount: Array.isArray(safeParse(p.steps)) ? (safeParse(p.steps) as unknown[]).length : 0,
        createdAt: (p.createdAt as Date).toISOString(),
      })),
      count: playbooks.length,
      active: playbooks.filter((p: Record<string, unknown>) => p.isActive).length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load playbooks" },
      { status: 500 }
    );
  }
}

// POST /api/playbooks - create a new playbook (admin only).
// Body: { name, description, category, trigger, steps, severity, isActive }
export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const { name, description, category, trigger, steps, severity, isActive } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Validate + normalize the steps array. Each step is { title, description, automated }.
  let normalizedSteps: unknown[] = [];
  if (Array.isArray(steps)) {
    normalizedSteps = steps
      .filter((s) => s && typeof s === "object")
      .map((s: Record<string, unknown>, idx: number) => ({
        index: idx + 1,
        title: typeof s.title === "string" ? s.title : `Step ${idx + 1}`,
        description: typeof s.description === "string" ? s.description : "",
        automated: s.automated === true,
      }));
  } else if (typeof steps === "string") {
    // Accept a JSON-encoded string for backward compat.
    try {
      const parsed = JSON.parse(steps);
      if (Array.isArray(parsed)) normalizedSteps = parsed;
    } catch { /* leave empty */ }
  }

  if (normalizedSteps.length === 0) {
    return NextResponse.json(
      { error: "steps must be a non-empty array of { title, description, automated }" },
      { status: 400 }
    );
  }

  const finalSeverity = VALID_SEVERITIES.includes(severity) ? severity : "high";
  const finalTrigger = VALID_TRIGGERS.includes(trigger) ? trigger : "manual";

  try {
    const playbook = await db.playbook.create({
      data: {
        name,
        description: typeof description === "string" ? description : null,
        category: typeof category === "string" ? category : "incident_response",
        trigger: finalTrigger,
        steps: JSON.stringify(normalizedSteps),
        severity: finalSeverity,
        isActive: isActive !== false,
      },
    });

    return NextResponse.json(
      {
        id: playbook.id,
        name: playbook.name,
        category: playbook.category,
        trigger: playbook.trigger,
        severity: playbook.severity,
        stepCount: normalizedSteps.length,
        isActive: playbook.isActive,
        message: "Playbook created",
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create playbook" },
      { status: 500 }
    );
  }
}
