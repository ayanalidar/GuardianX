import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// ── Severity → price map (in paise; ₹1 = 100 paise) ──────────────────────
// Critical: ₹500, High: ₹200, Medium: ₹50, Low: ₹10, Info: ₹0.
// These prices match the pricing table shown in the pay-per-vuln.tsx
// component and the public marketing copy. Changing them here updates both.
const SEVERITY_AMOUNT: Record<string, number> = {
  critical: 50000,
  high: 20000,
  medium: 5000,
  low: 1000,
  info: 0,
};

// POST /api/pay-per-vuln/record — INTERNAL endpoint called by the scan
// pipeline when a new finding is created. Adds a FindingsLedger row with
// status="owed" and the amount computed from the finding's severity.
//
// This route is *intentionally* not behind `requireAuth` — it's called
// from server-side scan code (the RedAgent + SAST pipelines) which has
// already authenticated the user via the scan's owning Codebase → Client
// → User chain. The `userId` in the body is authoritative.
//
// Body:
//   { userId: string, findingId: string, severity: string,
//     scanId?: string, codebaseId?: string }
//
// Returns: { ok: true, ledgerId, amount }
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const userId = String(body.userId || "");
  const findingId = String(body.findingId || "");
  const severityRaw = String(body.severity || "").toLowerCase();
  const scanId = body.scanId ? String(body.scanId) : null;
  const codebaseId = body.codebaseId ? String(body.codebaseId) : null;

  if (!userId || !findingId || !severityRaw) {
    return NextResponse.json(
      { error: "Missing required fields: userId, findingId, severity." },
      { status: 400 }
    );
  }

  const amount = SEVERITY_AMOUNT[severityRaw];
  if (amount === undefined) {
    return NextResponse.json(
      { error: `Unknown severity "${severityRaw}". Expected critical|high|medium|low|info.` },
      { status: 400 }
    );
  }

  // Info findings cost ₹0 — skip ledger entry entirely (no row needed).
  if (amount === 0) {
    return NextResponse.json({ ok: true, ledgerId: null, amount: 0 });
  }

  try {
    // Idempotency: if a row for this (userId, findingId) already exists,
    // return the existing one rather than creating a duplicate. This makes
    // the route safe to retry from the scan pipeline.
    const existing = await db.findingsLedger.findFirst({
      where: { userId, findingId },
    });
    if (existing) {
      return NextResponse.json({
        ok: true,
        ledgerId: existing.id,
        amount: existing.amount,
      });
    }

    const ledger = await db.findingsLedger.create({
      data: {
        userId,
        findingId,
        severity: severityRaw,
        amount,
        scanId: scanId ?? undefined,
        codebaseId: codebaseId ?? undefined,
        status: "owed",
      },
    });

    return NextResponse.json({
      ok: true,
      ledgerId: ledger.id,
      amount,
    });
  } catch (err) {
    console.error("[pay-per-vuln/record] error:", err);
    return NextResponse.json(
      { error: "Failed to record finding in ledger." },
      { status: 500 }
    );
  }
}
