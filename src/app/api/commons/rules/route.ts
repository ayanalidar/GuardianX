import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/commons/rules — list all active community rules, sorted by
// upvotes (default) or downloads. Optional query params:
//   ?sort=upvotes|downloads|findings|recent
//   ?language=javascript
//   ?severity=critical|high|medium|low|info
//   ?q=<search string>   (matches name/description)
//   ?take=50              (default 50, max 100)
//
// No auth required — the commons is publicly browsable (like npm or a
// GitHub repo listing). Auth is only required to *submit* a rule.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sort = url.searchParams.get("sort") || "upvotes";
  const language = url.searchParams.get("language");
  const severity = url.searchParams.get("severity");
  const q = url.searchParams.get("q");
  const takeRaw = Number.parseInt(url.searchParams.get("take") || "50", 10);
  const take = Number.isFinite(takeRaw) ? Math.min(Math.max(takeRaw, 1), 100) : 50;

  const where: Record<string, unknown> = { isActive: true };
  if (language) where.language = language;
  if (severity) where.severity = severity;
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { description: { contains: q } },
    ];
  }

  const orderBy: Record<string, "asc" | "desc"> =
    sort === "downloads" ? { downloads: "desc" }
    : sort === "findings" ? { findingsCount: "desc" }
    : sort === "recent" ? { createdAt: "desc" }
    : { upvotes: "desc" };

  try {
    const rules = await db.communityRule.findMany({
      where,
      orderBy,
      take,
    });
    return NextResponse.json({ rules });
  } catch (err) {
    console.error("[commons/rules] error:", err);
    return NextResponse.json(
      { error: "Failed to load community rules." },
      { status: 500 }
    );
  }
}

// POST /api/commons/rules — submit a new community rule. Auth required.
//
// Body:
//   { name, description, pattern, severity, language, cwe? }
// The author is identified by the JWT — authorId/authorName/authorEmail
// are populated from the verified token and cannot be spoofed.
//
// Returns: { ok: true, rule }
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = String(body.name || "").trim();
  const description = String(body.description || "").trim();
  const pattern = String(body.pattern || "").trim();
  const severity = String(body.severity || "").toLowerCase();
  const language = String(body.language || "").toLowerCase();
  const cwe = body.cwe ? String(body.cwe).trim() : null;

  if (!name || !description || !pattern || !severity || !language) {
    return NextResponse.json(
      { error: "Missing required fields: name, description, pattern, severity, language." },
      { status: 400 }
    );
  }
  if (!["critical", "high", "medium", "low", "info"].includes(severity)) {
    return NextResponse.json(
      { error: `Invalid severity "${severity}".` },
      { status: 400 }
    );
  }
  if (name.length > 120) {
    return NextResponse.json({ error: "Name must be ≤ 120 chars." }, { status: 400 });
  }
  if (description.length > 1000) {
    return NextResponse.json({ error: "Description must be ≤ 1000 chars." }, { status: 400 });
  }
  if (pattern.length > 5000) {
    return NextResponse.json({ error: "Pattern must be ≤ 5000 chars." }, { status: 400 });
  }

  try {
    const rule = await db.communityRule.create({
      data: {
        name,
        description,
        pattern,
        severity,
        language,
        cwe: cwe ?? undefined,
        authorId: auth.user.userId,
        authorName: auth.user.name || auth.user.email,
        authorEmail: auth.user.email,
      },
    });
    return NextResponse.json({ ok: true, rule });
  } catch (err) {
    console.error("[commons/rules POST] error:", err);
    return NextResponse.json(
      { error: "Failed to submit rule." },
      { status: 500 }
    );
  }
}
