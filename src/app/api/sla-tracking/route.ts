import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "@/lib/crypto";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// SLA definitions per severity (hours to remediate)
const SLA_HOURS: Record<string, number> = {
  critical: 24,
  high: 72,
  medium: 168, // 7 days
  low: 336, // 14 days
};

// GET /api/sla-tracking?clientId=xxx, tracks SLA compliance per client
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");

  try {
    const clients = clientId
      ? await db.client.findMany({ where: { id: clientId }, select: { id: true, name: true } })
      : await db.client.findMany({ select: { id: true, name: true } });

    const slaReport: { client: string; total_findings: number; within_sla: number; breached: number; at_risk: number; breaches: { title: string; severity: string; hours_over: number; endpoint: string }[] }[] = [];

    for (const c of clients) {
      const targets = await db.target.findMany({ where: { clientId: c.id }, select: { id: true } });
      let withinSla = 0;
      let breached = 0;
      let atRisk = 0;
      const breaches: { title: string; severity: string; hours_over: number; endpoint: string }[] = [];

      for (const t of targets) {
        const engs = await db.engagement.findMany({ where: { targetId: t.id }, select: { id: true } });
        for (const e of engs) {
          const findings = await db.finding.findMany({ where: { engagementId: e.id }, select: { id: true, title: true, severity: true, endpoint: true, createdAt: true } });
          for (const f of findings) {
            const slaHours = SLA_HOURS[f.severity as string] || 336;
            const ageHours = (Date.now() - new Date(f.createdAt as string).getTime()) / 3600000;

            if (ageHours > slaHours) {
              breached++;
              breaches.push({
                title: f.title as string,
                severity: f.severity as string,
                hours_over: Math.round(ageHours - slaHours),
                endpoint: f.endpoint as string,
              });
            } else if (ageHours > slaHours * 0.8) {
              atRisk++;
            } else {
              withinSla++;
            }
          }
        }
      }

      slaReport.push({
        client: c.name,
        total_findings: withinSla + breached + atRisk,
        within_sla: withinSla,
        breached,
        at_risk: atRisk,
        breaches: breaches.sort((a, b) => b.hours_over - a.hours_over).slice(0, 5),
      });
    }

    const totalBreached = slaReport.reduce((s, r) => s + r.breached, 0);
    const totalAtRisk = slaReport.reduce((s, r) => s + r.at_risk, 0);

    return NextResponse.json({
      sla_report: slaReport,
      summary: {
        clients: slaReport.length,
        total_breached: totalBreached,
        total_at_risk: totalAtRisk,
        sla_definitions: SLA_HOURS,
      },
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
