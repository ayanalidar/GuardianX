import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_EVIDENCE_TYPES = ["pcap", "memory_dump", "disk_image", "log", "screenshot", "config", "other"];

const safeParse = (s: unknown): unknown => {
  if (!s || typeof s !== "string") return s;
  try { return JSON.parse(s); } catch { return s; }
};

// GET /api/incidents/[id]/evidence - list all evidence collected for an incident.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const incident = await db.incident.findUnique({
      where: { id },
      select: { id: true, title: true },
    });
    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const evidence = await db.evidence.findMany({
      where: { incidentId: id },
      orderBy: { collectedAt: "desc" },
    });

    return NextResponse.json({
      incidentId: id,
      count: evidence.length,
      evidence: evidence.map((e: Record<string, unknown>) => ({
        id: e.id,
        evidenceType: e.evidenceType,
        filename: e.filename,
        sha256: e.sha256,
        collectedBy: e.collectedBy,
        collectedAt: (e.collectedAt as Date).toISOString(),
        description: e.description,
        storagePath: e.storagePath,
        fileSize: e.fileSize,
        chainOfCustody: safeParse(e.chainOfCustody),
        isImmutable: e.isImmutable,
        createdAt: (e.createdAt as Date).toISOString(),
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load evidence" },
      { status: 500 }
    );
  }
}

// POST /api/incidents/[id]/evidence - collect new forensic evidence.
// Computes SHA-256 of the supplied content, persists an Evidence record with
// a chain-of-custody entry recording the initial collection, and marks the
// artifact as immutable so it cannot be silently modified later.
// Body: { evidenceType, filename, content (base64 or text), collectedBy, description }
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const {
    evidenceType,
    filename,
    content,
    collectedBy,
    description,
    storagePath,
  } = body;

  if (!filename || typeof filename !== "string") {
    return NextResponse.json({ error: "filename is required" }, { status: 400 });
  }
  if (!VALID_EVIDENCE_TYPES.includes(evidenceType)) {
    return NextResponse.json(
      { error: `evidenceType must be one of: ${VALID_EVIDENCE_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  if (content === undefined || content === null) {
    return NextResponse.json({ error: "content is required (base64 or text)" }, { status: 400 });
  }

  try {
    const incident = await db.incident.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!incident) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const { randomUUID, createHash } = await import("node:crypto");

    // Decode content to a Buffer. Accept either base64 (default for binary
    // evidence like pcaps / memory dumps) or raw text.
    let buf: Buffer;
    const contentType = typeof body.contentType === "string" ? body.contentType : "";
    if (contentType === "text" || (typeof content === "string" && !content.match(/^[A-Za-z0-9+/=\s]+$/))) {
      buf = Buffer.from(String(content), "utf8");
    } else {
      try {
        buf = Buffer.from(String(content), "base64");
      } catch {
        buf = Buffer.from(String(content), "utf8");
      }
    }

    const sha256 = createHash("sha256").update(buf).digest("hex");
    const fileSize = buf.length;
    const collector = (collectedBy as string) || auth.user.name;
    const now = new Date();

    const chainOfCustody = [
      {
        handler: collector,
        action: "collected",
        timestamp: now.toISOString(),
        note: `Initial collection by ${collector} via GuardianX DFIR API`,
        sha256,
        fileSize,
      },
    ];

    const evidence = await db.evidence.create({
      data: {
        incidentId: id,
        evidenceType,
        filename,
        sha256,
        collectedBy: collector,
        collectedAt: now,
        description: description || null,
        storagePath: storagePath || `incidents/${id}/${filename}`,
        fileSize,
        chainOfCustody: JSON.stringify(chainOfCustody),
        isImmutable: true,
      },
    });

    // Also drop a note on the incident timeline so responders see evidence was added.
    await db.incidentEvent.create({
      data: {
        incidentId: id,
        eventType: "note",
        source: "manual",
        title: `Evidence collected: ${filename}`,
        description: `New ${evidenceType} evidence "${filename}" (${fileSize} bytes, sha256 ${sha256.substring(0, 16)}...) collected by ${collector}.`,
        severity: "info",
        metadata: JSON.stringify({
          action: "evidence_collected",
          evidenceId: evidence.id,
          filename,
          evidenceType,
          sha256,
          fileSize,
          collectedBy: collector,
        }),
        actor: collector,
        occurredAt: now,
      },
    });

    return NextResponse.json(
      {
        id: evidence.id,
        incidentId: id,
        evidenceType: evidence.evidenceType,
        filename: evidence.filename,
        sha256: evidence.sha256,
        collectedBy: evidence.collectedBy,
        collectedAt: (evidence.collectedAt as Date).toISOString(),
        fileSize: evidence.fileSize,
        isImmutable: evidence.isImmutable,
        chainOfCustody,
        message: "Evidence collected and sealed with chain-of-custody entry",
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to collect evidence" },
      { status: 500 }
    );
  }
}
