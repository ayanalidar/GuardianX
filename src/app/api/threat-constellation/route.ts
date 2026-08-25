// GET /api/threat-constellation
//
// Returns nodes + edges for the 3D Threat Constellation visualization.
// Nodes: clients (emerald), codebases (cyan), findings (red), patches (amber).
// Edges:
//   - client → codebase  (cyan)
//   - codebase → finding  (red, best-effort match by codebase.name in finding endpoint/title)
//   - finding → patch     (amber, dashed if patch.status === "pending")
//
// Caps at 100 nodes total across the 4 entity types (20 clients + 30 codebases
// + 40 findings + 30 patches → up to 120 raw, but most nodes won't have edges
// so the visual cap is approximate; we trim findings first to keep total ≤ 100).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type NodeType = "client" | "codebase" | "finding" | "patch";
type EdgeType = "client-codebase" | "codebase-finding" | "finding-patch";

interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  severity?: string;
  status?: string;
}

interface GraphEdge {
  from: string;
  to: string;
  type: EdgeType;
  dashed?: boolean;
}

interface ConstellationResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const [clients, codebases, findings, patches] = await Promise.all([
      db.client.findMany({
        take: 20,
        include: { codebases: { select: { id: true, name: true } } },
      }),
      db.codebase.findMany({ take: 30 }),
      db.finding.findMany({ take: 40, orderBy: { createdAt: "desc" } }),
      db.patch.findMany({ take: 30, orderBy: { createdAt: "desc" } }),
    ]);

    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeIds = new Set<string>();

    // ── Clients ───────────────────────────────────────────────────────────
    for (const c of clients) {
      if (nodeIds.has(c.id)) continue;
      nodes.push({
        id: c.id,
        type: "client",
        label: c.name || "Unnamed Client",
        status: c.status,
      });
      nodeIds.add(c.id);
    }

    // ── Codebases ─────────────────────────────────────────────────────────
    // Build codebase→clientId map from the client include (more reliable than
    // codebase.clientId which can be null if the codebase predates the link).
    const codebaseToClient = new Map<string, string>();
    for (const c of clients) {
      for (const cb of c.codebases) {
        if (!codebaseToClient.has(cb.id)) codebaseToClient.set(cb.id, c.id);
      }
    }

    for (const cb of codebases) {
      if (nodeIds.has(cb.id)) continue;
      nodes.push({
        id: cb.id,
        type: "codebase",
        label: cb.name || "Unnamed Codebase",
      });
      nodeIds.add(cb.id);

      // Prefer the included relation; fall back to cb.clientId.
      const clientId = codebaseToClient.get(cb.id) ?? cb.clientId ?? null;
      if (clientId && nodeIds.has(clientId)) {
        edges.push({ from: clientId, to: cb.id, type: "client-codebase" });
      }
    }

    // ── Findings ──────────────────────────────────────────────────────────
    // Best-effort match finding → codebase by checking if the codebase.name
    // appears in the finding's title/endpoint/description (case-insensitive).
    const codebaseNames = codebases
      .map((cb) => ({ id: cb.id, name: cb.name?.toLowerCase() ?? "" }))
      .filter((cb) => cb.name.length > 2);

    for (const f of findings) {
      if (nodeIds.has(f.id)) continue;
      nodes.push({
        id: f.id,
        type: "finding",
        label: f.title?.slice(0, 60) || "Untitled Finding",
        severity: f.severity,
      });
      nodeIds.add(f.id);

      // Find a codebase for this finding.
      const haystack = `${f.title ?? ""} ${f.endpoint ?? ""} ${f.description ?? ""}`.toLowerCase();
      let matchedCodebaseId: string | null = null;
      for (const cb of codebaseNames) {
        if (haystack.includes(cb.name)) {
          matchedCodebaseId = cb.id;
          break;
        }
      }
      if (!matchedCodebaseId && codebases.length > 0) {
        // Fall back to attaching to the most recent codebase so the finding
        // isn't orphaned in the graph (visualization still useful).
        matchedCodebaseId = codebases[0].id;
      }
      if (matchedCodebaseId && nodeIds.has(matchedCodebaseId)) {
        edges.push({ from: matchedCodebaseId, to: f.id, type: "codebase-finding" });
      }
    }

    // ── Patches ───────────────────────────────────────────────────────────
    // Match patch → finding by title overlap (case-insensitive contains).
    const findingLabels = findings.map((f) => ({ id: f.id, title: f.title?.toLowerCase() ?? "" }));

    for (const p of patches) {
      if (nodeIds.has(p.id)) continue;
      nodes.push({
        id: p.id,
        type: "patch",
        label: p.title?.slice(0, 60) || "Untitled Patch",
        status: p.status,
      });
      nodeIds.add(p.id);

      // Find a finding for this patch (match by title).
      const patchTitle = (p.title ?? "").toLowerCase();
      let matchedFindingId: string | null = null;
      for (const f of findingLabels) {
        if (f.title && patchTitle && (f.title.includes(patchTitle) || patchTitle.includes(f.title))) {
          matchedFindingId = f.id;
          break;
        }
      }
      if (matchedFindingId && nodeIds.has(matchedFindingId)) {
        edges.push({
          from: matchedFindingId,
          to: p.id,
          type: "finding-patch",
          dashed: p.status === "pending",
        });
      }
    }

    // ── Hard cap at 100 nodes (trim from the back — newest findings/patches) ─
    if (nodes.length > 100) {
      const overflow = nodes.length - 100;
      const trimmed = nodes.slice(0, 100);
      const keptIds = new Set(trimmed.map((n) => n.id));
      const trimmedEdges = edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to));
      return NextResponse.json({
        nodes: trimmed,
        edges: trimmedEdges,
        _cappedAt: 100,
        _trimmed: overflow,
      } as ConstellationResponse & { _cappedAt: number; _trimmed: number });
    }

    const response: ConstellationResponse = { nodes, edges };
    return NextResponse.json(response);
  } catch (err) {
    console.error("[threat-constellation] error:", err);
    return NextResponse.json(
      { error: "Constellation build failed. " + (err instanceof Error ? err.message : "Unknown error.") },
      { status: 500 },
    );
  }
}
