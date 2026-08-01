import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/email-digest, generates a daily/weekly security summary email per client
// Query: ?clientId=xxx&period=daily|weekly
export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");
  const period = url.searchParams.get("period") || "daily";

  try {
    const periodMs = period === "weekly" ? 7 * 86400000 : 86400000;
    const since = new Date(Date.now() - periodMs).toISOString();

    const clients = clientId
      ? await db.client.findMany({ where: { id: clientId }, select: { id: true, name: true, contactEmail: true } })
      : await db.client.findMany({ select: { id: true, name: true, contactEmail: true } });

    const digests: { client: string; email: string; subject: string; body: string; stats: Record<string, number> }[] = [];

    for (const c of clients) {
      const codebases = await db.codebase.findMany({ where: { clientId: c.id }, select: { id: true, name: true } });
      const targets = await db.target.findMany({ where: { clientId: c.id }, select: { id: true, name: true } });

      let newPatches = 0;
      let approvedPatches = 0;
      let newFindings = 0;
      let criticalFindings = 0;
      let newScans = 0;
      const patchDetails: string[] = [];
      const findingDetails: string[] = [];

      for (const cb of codebases) {
        const scans = await db.scan.findMany({ where: { codebaseId: cb.id, startedAt: { gte: since } }, select: { id: true, status: true } });
        newScans += scans.length;

        const patches = await db.patch.findMany({
          where: { codebaseId: cb.id, createdAt: { gte: since } },
          select: { id: true, title: true, severity: true, status: true, approvedAt: true },
        });
        newPatches += patches.length;
        approvedPatches += patches.filter((p) => p.status === "approved").length;
        for (const p of patches) {
          if (p.severity === "critical" || p.severity === "high") {
            patchDetails.push(`  • [${p.severity.toUpperCase()}] ${p.title}, ${p.status}${p.approvedAt ? " ✅" : " ⏳"}`);
          }
        }
      }

      for (const t of targets) {
        const engs = await db.engagement.findMany({ where: { targetId: t.id, startedAt: { gte: since } }, select: { id: true } });
        for (const e of engs) {
          const findings = await db.finding.findMany({ where: { engagementId: e.id, createdAt: { gte: since } }, select: { id: true, title: true, severity: true, endpoint: true } });
          newFindings += findings.length;
          criticalFindings += findings.filter((f) => f.severity === "critical").length;
          for (const f of findings) {
            if (f.severity === "critical" || f.severity === "high") {
              findingDetails.push(`  • [${f.severity.toUpperCase()}] ${f.title} on ${f.endpoint}`);
            }
          }
        }
      }

      const subject = `[GuardianX] ${period === "weekly" ? "Weekly" : "Daily"} Security Digest, ${c.name}`;
      const body = `Hi ${c.name} team,

Here's your ${period} security summary from GuardianX:

📊 SUMMARY (${period === "weekly" ? "last 7 days" : "last 24 hours"})
   • Scans run: ${newScans}
   • Patches generated: ${newPatches}
   • Patches approved: ${approvedPatches}
   • Findings detected: ${newFindings}
   • Critical findings: ${criticalFindings}

${patchDetails.length > 0 ? `🔧 KEY PATCHES:\n${patchDetails.join("\n")}\n` : ""}
${findingDetails.length > 0 ? `⚠️ KEY FINDINGS:\n${findingDetails.join("\n")}\n` : ""}
${criticalFindings === 0 && newPatches === 0 ? "✅ No critical issues detected. Your security posture is stable.\n" : ""}
View full dashboard: https://guardian-x-git-main-guardianx.vercel.app

- GuardianX Autonomous Security Operations`;

      digests.push({
        client: c.name,
        email: c.contactEmail || "no-email@client.com",
        subject,
        body,
        stats: { newScans, newPatches, approvedPatches, newFindings, criticalFindings },
      });
    }

    return NextResponse.json({
      digests,
      count: digests.length,
      period,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
