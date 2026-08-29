import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// ── Moving Target Defense, secret schedule list + add ──────────────────────
// GET  /api/moving-target/secrets  (auth required)
//   Lists every tracked secret + its rotation schedule. NEVER returns the
//   actual `currentValue` / `previousValue` — those are write-only from
//   the API surface. The UI shows status (overdue / scheduled / paused)
//   derived from nextRotation vs now.
//
// POST /api/moving-target/secrets  (auth required — admin only for write)
//   Body: { name, type, value, rotationIntervalHours }
//   Creates a new SecretRotation entry. `nextRotation` is set to now() +
//   rotationIntervalHours so the first rotation happens on schedule.

const VALID_TYPES = ["api_key", "database_url", "jwt_secret", "oauth_token"] as const;
type SecretType = (typeof VALID_TYPES)[number];

function isSecretType(v: unknown): v is SecretType {
  return typeof v === "string" && (VALID_TYPES as readonly string[]).includes(v);
}

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const secrets = await db.secretRotation.findMany({
    orderBy: { nextRotation: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      lastRotated: true,
      nextRotation: true,
      autoRotate: true,
      rotationIntervalHours: true,
    },
  });

  const now = new Date();
  const totalRotations = await db.rotationLog.count();
  const failedRotations = await db.rotationLog.count({ where: { success: false } });

  // ── Rotation history (last 50 entries) for the scrollable log tile ──────
  const historyRows = await db.rotationLog.findMany({
    orderBy: { rotatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      secretId: true,
      secretName: true,
      rotatedAt: true,
      success: true,
      error: true,
    },
  });
  const history = historyRows.map((h) => ({
    id: h.id,
    secretId: h.secretId,
    secretName: h.secretName,
    rotatedAt: h.rotatedAt.toISOString(),
    success: h.success,
    error: h.error,
  }));

  // Status logic for the UI:
  //   - "overdue"   — autoRotate on AND nextRotation < now
  //   - "scheduled" — autoRotate on AND nextRotation >= now
  //   - "paused"    — autoRotate off
  const items = secrets.map((s) => {
    let status: "overdue" | "scheduled" | "paused";
    if (!s.autoRotate) status = "paused";
    else if (s.nextRotation < now) status = "overdue";
    else status = "scheduled";

    return {
      id: s.id,
      name: s.name,
      type: s.type,
      lastRotated: s.lastRotated.toISOString(),
      nextRotation: s.nextRotation.toISOString(),
      autoRotate: s.autoRotate,
      rotationIntervalHours: s.rotationIntervalHours,
      status,
    };
  });

  // Earliest upcoming rotation (for the "next rotation in: 4h 23m" tile)
  const upcoming = await db.secretRotation.findFirst({
    where: { autoRotate: true, nextRotation: { gt: now } },
    orderBy: { nextRotation: "asc" },
    select: { nextRotation: true },
  });

  return NextResponse.json({
    secrets: items,
    total: items.length,
    active: items.filter((s) => s.autoRotate).length,
    overdue: items.filter((s) => s.status === "overdue").length,
    nextRotation: upcoming?.nextRotation.toISOString() ?? null,
    totalRotations,
    failedRotations,
    history,
  });
}

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  // Only admins can add new secrets to rotation (defense in depth — anyone
  // with read access can see the schedule, only admins can extend it).
  if (auth.user.role !== "admin") {
    return NextResponse.json(
      { error: "Admin access required to add a secret to rotation." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = body.type;
  const value = typeof body.value === "string" ? body.value : "";
  const rotationIntervalHours =
    typeof body.rotationIntervalHours === "number" && body.rotationIntervalHours > 0
      ? Math.min(Math.floor(body.rotationIntervalHours), 24 * 30) // cap at 30d
      : 24;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!isSecretType(type)) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
      { status: 400 },
    );
  }
  if (!value) {
    return NextResponse.json({ error: "value is required" }, { status: 400 });
  }

  // If a secret with the same name already exists, reject — rotation must be
  // explicitly extended per-name (no silent overwrite of a tracked secret).
  const existing = await db.secretRotation.findFirst({
    where: { name },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: `A secret named "${name}" is already tracked. Delete it first to re-add.` },
      { status: 409 },
    );
  }

  const now = new Date();
  const nextRotation = new Date(now.getTime() + rotationIntervalHours * 60 * 60 * 1000);

  const created = await db.secretRotation.create({
    data: {
      name,
      type,
      currentValue: value,
      rotationIntervalHours,
      lastRotated: now,
      nextRotation,
      autoRotate: true,
    },
    select: {
      id: true,
      name: true,
      type: true,
      rotationIntervalHours: true,
      nextRotation: true,
    },
  });

  // Record an audit entry in the AuditLog so admins can trace who added what.
  await db.auditLog.create({
    data: {
      action: "moving_target.secret_added",
      entity: "SecretRotation",
      actor: auth.user.email,
      details: JSON.stringify({
        secretId: created.id,
        name,
        type,
        rotationIntervalHours,
      }),
    },
  });

  return NextResponse.json(
    {
      id: created.id,
      name: created.name,
      type: created.type,
      rotationIntervalHours: created.rotationIntervalHours,
      nextRotation: created.nextRotation.toISOString(),
      message: `Secret "${name}" added to rotation. Next rotation in ${rotationIntervalHours}h.`,
    },
    { status: 201 },
  );
}
