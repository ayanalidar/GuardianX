import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { randomBytes } from "node:crypto";

export const dynamic = "force-dynamic";

// ── Cryptographic Canary Tokens, generate a new per-resource token ─────────
// POST /api/canary/generate
// Auth required.
//
// Body: { resourceType, resourceId, label }
// Generates a unique token: `gx_canary_${crypto.randomBytes(16).toString('hex')}`
// (16 bytes → 32 hex chars → total length 41, well above any realistic
// collision probability and trivially greppable in source/exports).
//
// Returns `{ token, embedInstructions }` describing how to invisibly embed
// the token in the resource so that, if the resource is exfiltrated, the
// token travels with it and surfaces when the monitoring sweep calls
// /api/canary/check.

const VALID_RESOURCE_TYPES = [
  "finding",
  "credential",
  "client_data",
  "api_key",
] as const;
type ResourceType = (typeof VALID_RESOURCE_TYPES)[number];

function isResourceType(v: unknown): v is ResourceType {
  return typeof v === "string" && (VALID_RESOURCE_TYPES as readonly string[]).includes(v);
}

function embedInstructions(resourceType: string, token: string): string[] {
  switch (resourceType) {
    case "finding":
      return [
        "Append the token as an HTML comment in the finding's proof response: <!-- gx_canary:TOKEN -->",
        "Add a zero-width-space sequence after the token so it survives copy-paste.",
        "Embed in the JSON `metadata.canary` field of any exported finding record.",
      ];
    case "credential":
      return [
        "Inject the token as an extra X-GuardianX-Canary header in credential-bearing API responses.",
        "Append to .env as GX_CANARY_KEY=TOKEN so any leaked .env reveals this token.",
        "Add to the credential's metadata field returned by /api/credentials/:id.",
      ];
    case "client_data":
      return [
        "Embed as a hidden column in client data exports (CSV/JSON): `__gx_canary` = TOKEN.",
        "Append as an invisible HTML span in client portal pages: <span style=\"display:none\">TOKEN</span>.",
        "Insert as a zero-width-character-encoded watermark in document exports.",
      ];
    case "api_key":
      return [
        "Append the token as a query-param checksum in API key usage logs: ?gx=TOKEN.",
        "Embed in the key's metadata blob returned by the key-info endpoint.",
        "Include in the X-GuardianX-Trace header on every authenticated request using this key.",
      ];
    default:
      return [`Embed the token ${token} in any data path that touches this resource.`];
  }
}

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => ({}));
  const resourceType = body.resourceType;
  const resourceId = typeof body.resourceId === "string" ? body.resourceId.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";

  if (!isResourceType(resourceType)) {
    return NextResponse.json(
      { error: `resourceType must be one of: ${VALID_RESOURCE_TYPES.join(", ")}` },
      { status: 400 },
    );
  }
  if (!resourceId) {
    return NextResponse.json({ error: "resourceId is required" }, { status: 400 });
  }
  if (!label) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }

  // Per-resource: one active token at a time. If the caller asks for a new
  // token on a resource that already has an active one, we deactivate the
  // old one (so a future trigger on it still resolves to the right
  // resource — but no fresh hits are recorded against it).
  await db.canaryToken.updateMany({
    where: { resourceType, resourceId, isActive: true },
    data: { isActive: false },
  });

  const token = `gx_canary_${randomBytes(16).toString("hex")}`;

  const created = await db.canaryToken.create({
    data: {
      token,
      resourceType,
      resourceId,
      label,
      isActive: true,
    },
    select: {
      id: true,
      token: true,
      label: true,
      resourceType: true,
      resourceId: true,
      createdAt: true,
    },
  });

  // Audit trail — who generated which canary, for which resource.
  await db.auditLog.create({
    data: {
      action: "canary.token_generated",
      entity: "CanaryToken",
      actor: auth.user.email,
      details: JSON.stringify({
        canaryId: created.id,
        resourceType,
        resourceId,
        label,
      }),
    },
  });

  return NextResponse.json(
    {
      id: created.id,
      token: created.token,
      resourceType: created.resourceType,
      resourceId: created.resourceId,
      label: created.label,
      createdAt: created.createdAt.toISOString(),
      embedInstructions: embedInstructions(resourceType, created.token),
    },
    { status: 201 },
  );
}
