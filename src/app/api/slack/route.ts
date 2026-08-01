import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST /api/slack, configure Slack/Teams webhook + send test alert
// Body: { action: "test" | "configure", webhookUrl?: string, channel?: string }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { action, webhookUrl } = body;

  if (action === "test") {
    // Gather current security state for the alert
    const clients = await db.client.findMany({ select: { id: true, name: true, status: true } });
    let totalPatches = 0;
    let criticalPatches = 0;
    let totalFindings = 0;

    for (const c of clients) {
      const codebases = await db.codebase.findMany({ where: { clientId: c.id }, select: { id: true } });
      for (const cb of codebases) {
        const patches = await db.patch.findMany({ where: { codebaseId: cb.id }, select: { status: true, severity: true } });
        totalPatches += patches.length;
        criticalPatches += patches.filter((p) => p.severity === "critical" && p.status === "pending").length;
      }
      const targets = await db.target.findMany({ where: { clientId: c.id }, select: { id: true } });
      for (const t of targets) {
        const engs = await db.engagement.findMany({ where: { targetId: t.id }, select: { id: true } });
        for (const e of engs) {
          const findings = await db.finding.findMany({ where: { engagementId: e.id }, select: { id: true } });
          totalFindings += findings.length;
        }
      }
    }

    const alertPayload = {
      text: "🛡️ GuardianX Security Alert",
      attachments: [
        {
          color: criticalPatches > 0 ? "#ef4444" : "#10b981",
          fields: [
            { title: "Clients", value: String(clients.length), short: true },
            { title: "Critical Patches", value: String(criticalPatches), short: true },
            { title: "Total Patches", value: String(totalPatches), short: true },
            { title: "Total Findings", value: String(totalFindings), short: true },
          ],
          footer: "GuardianX Command Center",
          ts: String(Math.floor(Date.now() / 1000)),
        },
      ],
    };

    // If webhookUrl provided, send to Slack
    if (webhookUrl) {
      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(alertPayload),
        });
        if (!res.ok) {
          return NextResponse.json({ error: `Slack returned ${res.status}` }, { status: 500 });
        }
        return NextResponse.json({ ok: true, message: "Test alert sent to Slack!" });
      } catch (err) {
        return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to send" }, { status: 500 });
      }
    }

    // Otherwise just return the payload for preview
    return NextResponse.json({ ok: true, payload: alertPayload, message: "Preview generated. Provide webhookUrl to send." });
  }

  if (action === "configure") {
    // Save webhook URL as an integration
    const { webhookUrl, channel } = body;
    if (!webhookUrl) return NextResponse.json({ error: "webhookUrl required" }, { status: 400 });

    await db.integration.create({
      data: {
        type: "slack",
        config: JSON.stringify({ webhookUrl, channel: channel || "#security" }),
        isActive: true,
      },
    });

    return NextResponse.json({ ok: true, message: "Slack integration configured!" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// GET /api/slack, return current integration config
export async function GET() {
  try {
    const integrations = await db.integration.findMany({
      where: { type: "slack" },
      select: { id: true, config: true, isActive: true, createdAt: true },
    });
    return NextResponse.json(integrations.map((i) => ({
      id: i.id,
      active: i.isActive,
      config: i.config ? JSON.parse(i.config as string) : {},
      created_at: (i.createdAt as Date).toISOString(),
    })));
  } catch {
    return NextResponse.json([]);
  }
}
