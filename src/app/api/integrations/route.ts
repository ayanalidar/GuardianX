import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/integrations — list all configured integrations
export async function GET() {
  const integrations = await db.integration.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(integrations.map(i => ({ ...i, config: i.config ? JSON.parse(i.config) : {} })));
}

// POST /api/integrations — add an integration (Jira, Splunk, ELK, Slack, GitHub)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { type, config } = body;
  const validTypes = ["jira", "splunk", "elk", "slack", "github"];
  if (!type || !validTypes.includes(type)) return NextResponse.json({ error: `type must be one of: ${validTypes.join(", ")}` }, { status: 400 });
  const i = await db.integration.create({ data: { type, config: JSON.stringify(config || {}) } });
  return NextResponse.json({ id: i.id, type: i.type, message: `${type} integration configured` }, { status: 201 });
}

// POST /api/integrations/export — export findings to SIEM (Splunk/ELK format)
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { format } = body; // "splunk" | "elk" | "jira"

  const [patches, findings] = await Promise.all([
    db.patch.findMany({ select: { patchId: true, title: true, severity: true, status: true, createdAt: true } }),
    db.finding.findMany({ select: { id: true, title: true, severity: true, category: true, endpoint: true, createdAt: true } }),
  ]);

  if (format === "splunk") {
    // Splunk HEC format
    const events = [
      ...patches.map(p => ({ time: Math.floor(p.createdAt.getTime() / 1000), event: { type: "sast_finding", ...p } })),
      ...findings.map(f => ({ time: Math.floor(f.createdAt.getTime() / 1000), event: { type: "dast_finding", ...f } })),
    ];
    return NextResponse.json({ format: "splunk", eventCount: events.length, events: events.slice(0, 20) });
  } else if (format === "elk") {
    // ELK/Elasticsearch bulk format
    const docs = [
      ...patches.map(p => ({ index: { _index: "guardianx-sast" }, doc: p })),
      ...findings.map(f => ({ index: { _index: "guardianx-dast" }, doc: f })),
    ];
    return NextResponse.json({ format: "elk", docCount: docs.length, docs: docs.slice(0, 20) });
  } else if (format === "jira") {
    // Jira ticket format
    const tickets = [
      ...patches.filter(p => p.status === "pending").map(p => ({
        project: { key: "SEC" },
        summary: `[${p.severity.toUpperCase()}] ${p.title}`,
        description: `GuardianX found: ${p.title}\nPatch ID: ${p.patchId}\nSeverity: ${p.severity}\nStatus: ${p.status}`,
        issuetype: { name: p.severity === "critical" ? "Bug" : "Task" },
        priority: { name: p.severity === "critical" ? "Highest" : p.severity === "high" ? "High" : "Medium" },
        labels: ["security", "guardianx", p.severity],
      })),
    ];
    return NextResponse.json({ format: "jira", ticketCount: tickets.length, tickets: tickets.slice(0, 10) });
  }

  return NextResponse.json({ error: "format must be splunk, elk, or jira" }, { status: 400 });
}
