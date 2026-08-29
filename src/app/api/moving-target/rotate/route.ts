import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Moving Target Defense, immediate + scheduled rotation sweep ────────────
// POST /api/moving-target/rotate
// Auth: admin only.
//
// Iterates every SecretRotation row whose `nextRotation` is in the past
// (or whose `autoRotate` is on AND `force=true` was passed). For each due
// secret we:
//   1. Move currentValue → previousValue (for rollback).
//   2. Generate a fresh currentValue using crypto.randomBytes(32).hex.
//      (Real provider rotation — Stripe key refresh, JWT secret bump,
//      OAuth token refresh — would be a per-type hook here. For now we
//      generate a deterministic-format random value so the sweep is
//      observable end-to-end without external API calls.)
//   3. Bump lastRotated = now() and nextRotation = now() + intervalHours.
//   4. Append a RotationLog row recording success or error.
//
// Returns `{ rotated: [{name, success, error?}], nextRotation }` where
// `nextRotation` is the earliest upcoming scheduled rotation (or null if
// nothing is scheduled).

interface RotationResult {
  name: string;
  success: boolean;
  error?: string;
}

function generateNewValue(type: string, name: string): string {
  const rand = randomBytes(32).toString("hex");
  switch (type) {
    case "jwt_secret":
      // JWT signing secret — opaque high-entropy string
      return `jwt_${rand}`;
    case "oauth_token":
      // OAuth bearer token shape
      return `gx_oauth_${rand}`;
    case "database_url":
      // Database URL shape (placeholder credentials — caller should
      // substitute real provider rotation here)
      return `postgresql://gx_rotated:${rand}@db.internal.guardianx/${name.toLowerCase()}?sslmode=require`;
    case "api_key":
    default:
      // Generic API key — prefixed with the secret name (uppercased) so
      // logs can trace which key rotated without exposing the value
      return `${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_ROTATED_${rand.slice(0, 24)}`;
  }
}

export async function POST(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";

  const now = new Date();
  const where = force
    ? { autoRotate: true }
    : { autoRotate: true, nextRotation: { lt: now } };

  const due = await db.secretRotation.findMany({ where });

  if (due.length === 0) {
    // Nothing to rotate — still return the next upcoming rotation for the UI
    const next = await db.secretRotation.findFirst({
      where: { autoRotate: true },
      orderBy: { nextRotation: "asc" },
      select: { name: true, nextRotation: true },
    });
    return NextResponse.json({
      rotated: [] as RotationResult[],
      nextRotation: next?.nextRotation ?? null,
      message: "No secrets due for rotation.",
    });
  }

  const rotated: RotationResult[] = [];

  for (const secret of due) {
    try {
      const newValue = generateNewValue(secret.type, secret.name);
      const nextRotation = new Date(
        now.getTime() + secret.rotationIntervalHours * 60 * 60 * 1000,
      );

      await db.secretRotation.update({
        where: { id: secret.id },
        data: {
          previousValue: secret.currentValue,
          currentValue: newValue,
          lastRotated: now,
          nextRotation,
        },
      });

      await db.rotationLog.create({
        data: {
          secretId: secret.id,
          secretName: secret.name,
          success: true,
        },
      });

      rotated.push({ name: secret.name, success: true });
    } catch (err) {
      const error = err instanceof Error ? err.message : "unknown error";
      await db.rotationLog.create({
        data: {
          secretId: secret.id,
          secretName: secret.name,
          success: false,
          error,
        },
      });
      rotated.push({ name: secret.name, success: false, error });
    }
  }

  // Find the next upcoming rotation for the response (the earliest nextRotation
  // strictly greater than now — excludes the ones we just bumped).
  const next = await db.secretRotation.findFirst({
    where: { autoRotate: true, nextRotation: { gt: now } },
    orderBy: { nextRotation: "asc" },
    select: { nextRotation: true },
  });

  return NextResponse.json({
    rotated,
    nextRotation: next?.nextRotation ?? null,
    count: rotated.length,
    successCount: rotated.filter((r) => r.success).length,
    failureCount: rotated.filter((r) => !r.success).length,
  });
}
