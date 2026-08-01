import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/audit-export?clientId=xxx — exports all security evidence as JSON
// For ISO/SOC2 auditors — contains scans, patches, findings, attestations
export async function GET(req: Request) {
  const url = new URL(req.url);
  const clientId = url.searchParams.get("clientId");

  try {
    const client = clientId
      ? await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, frameworks: true, status: true, authorized: true } })
      : null;

    const codebaseFilter = clientId ? { clientId } : {};
    const codebases = await db.codebase.findMany({ where: codebaseFilter, select: { id: true, name: true, language: true, createdAt: true } });

    const evidence: {
      client: { name: string; frameworks: string[]; status: string; authorized: boolean } | null;
      codebases: { name: string; language: string; created_at: string }[];
      scans: { id: string; status: string; stage: string | null; started: string; completed: string | null }[];
      patches: { patchId: string; title: string; severity: string; status: string; sandboxPassed: boolean; created: string; approved: string | null }[];
      findings: { title: string; severity: string; category: string; endpoint: string; owasp: string | null; created: string }[];
      attestations: { patchId: string; hash: string; prevHash: string; created: string }[];
      canaries: { label: string; type: string; endpoint: string; active: boolean; detected: boolean }[];
      audit_logs: { action: string; entity: string | null; actor: string; details: string | null; created: string }[];
    } = {
      client: client ? {
        name: client.name as string,
        frameworks: client.frameworks ? (client.frameworks as string).split(",") : [],
        status: client.status as string,
        authorized: client.authorized as boolean,
      } : null,
      codebases: [],
      scans: [],
      patches: [],
      findings: [],
      attestations: [],
      canaries: [],
      audit_logs: [],
    };

    evidence.codebases = codebases.map((cb) => ({
      name: cb.name as string,
      language: cb.language as string,
      created_at: (cb.createdAt as Date).toISOString(),
    }));

    for (const cb of codebases) {
      const scans = await db.scan.findMany({ where: { codebaseId: cb.id }, select: { id: true, status: true, stageLabel: true, startedAt: true, completedAt: true } });
      for (const s of scans) {
        evidence.scans.push({
          id: s.id as string,
          status: s.status as string,
          stage: s.stageLabel as string | null,
          started: (s.startedAt as Date).toISOString(),
          completed: s.completedAt ? (s.completedAt as Date).toISOString() : null,
        });
      }

      const patches = await db.patch.findMany({ where: { codebaseId: cb.id }, select: { patchId: true, title: true, severity: true, status: true, sandboxPassed: true, createdAt: true, approvedAt: true } });
      for (const p of patches) {
        evidence.patches.push({
          patchId: p.patchId as string,
          title: p.title as string,
          severity: p.severity as string,
          status: p.status as string,
          sandboxPassed: p.sandboxPassed as boolean,
          created: (p.createdAt as Date).toISOString(),
          approved: p.approvedAt ? (p.approvedAt as Date).toISOString() : null,
        });
      }
    }

    // Findings
    const targets = clientId
      ? await db.target.findMany({ where: { clientId }, select: { id: true } })
      : await db.target.findMany({ select: { id: true } });
    for (const t of targets) {
      const engs = await db.engagement.findMany({ where: { targetId: t.id }, select: { id: true } });
      for (const e of engs) {
        const findings = await db.finding.findMany({ where: { engagementId: e.id }, select: { title: true, severity: true, category: true, endpoint: true, owasp: true, createdAt: true } });
        for (const f of findings) {
          evidence.findings.push({
            title: f.title as string,
            severity: f.severity as string,
            category: f.category as string,
            endpoint: f.endpoint as string,
            owasp: f.owasp as string | null,
            created: (f.createdAt as Date).toISOString(),
          });
        }
      }

      // Canaries
      const canaries = await db.canary.findMany({ where: { targetId: t.id }, select: { label: true, canaryType: true, injectedEndpoint: true, isActive: true, detected: true } });
      for (const c of canaries) {
        evidence.canaries.push({
          label: c.label as string,
          type: c.canaryType as string,
          endpoint: c.injectedEndpoint as string,
          active: c.isActive as boolean,
          detected: c.detected as boolean,
        });
      }
    }

    // Attestations
    const attestations = await db.attestation.findMany({ orderBy: { createdAt: "desc" }, select: { patchId: true, hash: true, prevHash: true, createdAt: true } });
    evidence.attestations = attestations.map((a) => ({
      patchId: a.patchId as string,
      hash: a.hash as string,
      prevHash: a.prevHash as string,
      created: (a.createdAt as Date).toISOString(),
    }));

    // Audit logs
    const logs = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { action: true, entity: true, actor: true, details: true, createdAt: true } });
    evidence.audit_logs = logs.map((l) => ({
      action: l.action as string,
      entity: l.entity as string | null,
      actor: l.actor as string,
      details: l.details as string | null,
      created: (l.createdAt as Date).toISOString(),
    }));

    return NextResponse.json({
      evidence,
      export_date: new Date().toISOString(),
      summary: {
        codebases: evidence.codebases.length,
        scans: evidence.scans.length,
        patches: evidence.patches.length,
        findings: evidence.findings.length,
        attestations: evidence.attestations.length,
        canaries: evidence.canaries.length,
        audit_logs: evidence.audit_logs.length,
      },
      message: "Audit evidence pack ready for export.",
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
