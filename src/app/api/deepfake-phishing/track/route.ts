// POST /api/deepfake-phishing/track
// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC endpoint (no auth — the phishing target lands here from an email
// link). Marks a simulation as `clicked: true, clickedAt: now()` and updates
// status to "clicked" (unless already trained). Returns `{ ok, redirectUrl }`
// so the client can route the user to a training page.
//
// Body: { simulationId }
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface TrackBody {
  simulationId?: string;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as TrackBody;
  const simulationId = (body.simulationId ?? "").trim();

  if (!simulationId) {
    return NextResponse.json(
      { ok: false, error: "simulationId is required" },
      { status: 400 }
    );
  }

  try {
    const sim = await db.phishingSimulation.findUnique({
      where: { id: simulationId },
      select: {
        id: true,
        targetEmail: true,
        targetName: true,
        personaName: true,
        personaRole: true,
        message: true,
        clicked: true,
        trainedAt: true,
        status: true,
      },
    });

    if (!sim) {
      return NextResponse.json(
        { ok: false, error: "simulation not found" },
        { status: 404 }
      );
    }

    // Only flip to clicked if not already trained — once a target has
    // completed training, the click is no longer a fresh failure signal.
    if (sim.status !== "trained") {
      await db.phishingSimulation.update({
        where: { id: simulationId },
        data: {
          clicked: true,
          clickedAt: new Date(),
          status: "clicked",
        },
      });
    }

    return NextResponse.json({
      ok: true,
      redirectUrl: "/phishing/sim?stage=training",
      simulation: {
        targetName: sim.targetName,
        personaName: sim.personaName,
        personaRole: sim.personaRole,
        message: sim.message,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to track click" },
      { status: 500 }
    );
  }
}
