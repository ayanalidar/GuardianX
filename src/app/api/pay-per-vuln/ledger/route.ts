import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/pay-per-vuln/ledger — returns the calling user's findings ledger
// with a summary of total owed (in paise) and a breakdown by severity.
//
// Auth: required. The user is identified by the JWT (requireAuth).
// Response shape:
//   {
//     entries: FindingsLedger[],
//     totalOwed: number,        // paise — sum of all "owed" entries
//     totalInvoiced: number,    // paise — sum of all "invoiced" entries (not yet paid)
//     totalPaid: number,        // paise — sum of all "paid" entries
//     breakdown: { critical, high, medium, low, info }  // counts of owed entries
//   }
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const entries = await db.findingsLedger.findMany({
      where: { userId: auth.user.userId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    let totalOwed = 0;
    let totalInvoiced = 0;
    let totalPaid = 0;
    const breakdown: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };

    for (const e of entries) {
      const sev = (e.severity || "info").toLowerCase();
      if (e.status === "owed") {
        totalOwed += e.amount;
        if (sev in breakdown) breakdown[sev]++;
      } else if (e.status === "invoiced") {
        totalInvoiced += e.amount;
      } else if (e.status === "paid") {
        totalPaid += e.amount;
      }
    }

    return NextResponse.json({
      entries,
      totalOwed,
      totalInvoiced,
      totalPaid,
      breakdown,
    });
  } catch (err) {
    console.error("[pay-per-vuln/ledger] error:", err);
    return NextResponse.json(
      { error: "Failed to load findings ledger." },
      { status: 500 }
    );
  }
}
