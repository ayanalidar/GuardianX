// GET /api/deepfake-phishing/list
// ─────────────────────────────────────────────────────────────────────────────
// Auth-required. Lists all phishing simulations with their click / training
// status, sorted newest-first. Returns summary stats too: totalSent,
// totalClicked, totalTrained, clickRate, trainedRate.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface SimRow {
  id: string;
  targetEmail: string;
  targetName: string;
  personaName: string;
  personaRole: string;
  message: string;
  sentAt: string;
  clickedAt: string | null;
  clicked: boolean;
  trainedAt: string | null;
  status: string;
  campaignId: string | null;
}

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const rows = await db.phishingSimulation.findMany({
      orderBy: { sentAt: "desc" },
      take: 500,
    });

    const sims: SimRow[] = rows.map((r) => ({
      id: r.id,
      targetEmail: r.targetEmail,
      targetName: r.targetName,
      personaName: r.personaName,
      personaRole: r.personaRole,
      message: r.message,
      sentAt: r.sentAt.toISOString(),
      clickedAt: r.clickedAt ? r.clickedAt.toISOString() : null,
      clicked: r.clicked,
      trainedAt: r.trainedAt ? r.trainedAt.toISOString() : null,
      status: r.status,
      campaignId: r.campaignId,
    }));

    const totalSent = sims.length;
    const totalClicked = sims.filter((s) => s.clicked).length;
    const totalTrained = sims.filter((s) => s.status === "trained").length;
    const clickRate = totalSent > 0 ? Math.round((totalClicked / totalSent) * 100) : 0;
    const trainedRate = totalSent > 0 ? Math.round((totalTrained / totalSent) * 100) : 0;

    return NextResponse.json({
      sims,
      totalSent,
      totalClicked,
      totalTrained,
      clickRate,
      trainedRate,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list simulations" },
      { status: 500 }
    );
  }
}
