// GET /api/prompt-injection/runs
// ─────────────────────────────────────────────────────────────────────────────
// Auth-required. Returns the history of past prompt-injection scans, pulled
// from the AuditLog (action = "prompt-injection-scan"). Each run is
// summarized: target URL, tested/vulnerable/critical counts, finding flags,
// timestamp, and the actor (user email) who ran it.
//
// Most recent first. Capped at 50 runs.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RunSummary {
  id: string;
  targetUrl: string;
  actor: string;
  testedCount: number;
  vulnerableCount: number;
  criticalCount: number;
  startedAt: string;
  completedAt: string;
  findings: Array<{
    id: string;
    name: string;
    category: string;
    severity: string;
    vulnerable: boolean;
    error: string | null;
  }>;
}

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const rows = await db.auditLog.findMany({
      where: { action: "prompt-injection-scan" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const runs: RunSummary[] = rows.map((row) => {
      let details: {
        testedCount?: number;
        vulnerableCount?: number;
        criticalCount?: number;
        startedAt?: string;
        completedAt?: string;
        findings?: Array<{
          id: string;
          name: string;
          category: string;
          severity: string;
          vulnerable: boolean;
          error: string | null;
        }>;
      } = {};

      try {
        details = row.details ? JSON.parse(row.details) : {};
      } catch {
        // Corrupt JSON — leave details empty.
      }

      return {
        id: row.id,
        targetUrl: row.entity ?? "",
        actor: row.actor,
        testedCount: details.testedCount ?? 0,
        vulnerableCount: details.vulnerableCount ?? 0,
        criticalCount: details.criticalCount ?? 0,
        startedAt: details.startedAt ?? row.createdAt.toISOString(),
        completedAt: details.completedAt ?? row.createdAt.toISOString(),
        findings: details.findings ?? [],
      };
    });

    return NextResponse.json({ runs, total: runs.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load run history" },
      { status: 500 }
    );
  }
}
