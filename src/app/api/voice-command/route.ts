import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { engineFireAndForget } from "@/lib/sentinel/engine-proxy";
import {
  GENESIS_PREV_HASH,
  computeAttestationHash,
} from "@/lib/sentinel/attestation";
import { onPatchApproved } from "@/lib/memory-vault/memory-writer";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/voice-command
 * -----------------------
 * Receives a parsed (or raw-transcript) voice command and executes it
 * server-side so the action survives a page refresh and writes to the
 * same DB + attestation chain as the keyboard-driven UI.
 *
 * Body shapes accepted:
 *   { command: { action, target } }   // pre-parsed by voice-control.tsx
 *   { transcript: "scan cybershield" } // raw text, parsed server-side
 *   { text: "scan cybershield" }       // alias
 *
 * Supported actions:
 *   scan <codebase>            → creates a Scan row, kicks the engine
 *   navigate <tab>             → no-op server-side, returned to client
 *   search findings for <query> → returns matching Finding rows
 *   approve patch <id>         → approves the patch + writes attestation
 *   status                     → returns posture score + summary
 *
 * Returns:
 *   { ok, action, message, ...payload }
 */
export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const body = await req.json().catch(() => ({}));
  const cmd = normalizeCommand(body);
  if (!cmd) {
    return NextResponse.json(
      { ok: false, action: "unknown", message: "No command provided." },
      { status: 400 },
    );
  }

  try {
    switch (cmd.action) {
      case "scan":
        return await handleScan(cmd.target);
      case "navigate":
        return NextResponse.json({
          ok: true,
          action: "navigate",
          message: `Navigate to ${cmd.target}.`,
          target: cmd.target,
        });
      case "search":
        return await handleSearch(cmd.target);
      case "approve":
        return await handleApprove(user.userId, cmd.target);
      case "status":
        return await handleStatus();
      case "stop":
        return NextResponse.json({
          ok: true,
          action: "stop",
          message: "TTS playback cancelled.",
        });
      default:
        return NextResponse.json(
          {
            ok: false,
            action: "unknown",
            message: `I heard "${cmd.raw ?? ""}" but didn't recognize a command. Try "scan <codebase>", "show <tab>", "search findings for <query>", "approve patch <id>", or "what's the security posture".`,
          },
          { status: 400 },
        );
    }
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        action: cmd.action,
        message: `Voice command failed: ${err instanceof Error ? err.message : String(err)}`,
      },
      { status: 500 },
    );
  }
}

// ── Command normalization ────────────────────────────────────────────────
type VoiceCommand =
  | { action: "scan"; target: string }
  | { action: "navigate"; target: string }
  | { action: "search"; target: string }
  | { action: "approve"; target: string }
  | { action: "status" }
  | { action: "stop" }
  | { action: "unknown"; raw: string };

function normalizeCommand(body: unknown): VoiceCommand | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  // Pre-parsed command shape.
  if (b.command && typeof b.command === "object") {
    const c = b.command as Record<string, unknown>;
    const action = typeof c.action === "string" ? c.action : "";
    const target = typeof c.target === "string" ? c.target.trim() : "";
    switch (action) {
      case "scan": return target ? { action: "scan", target } : null;
      case "navigate": return target ? { action: "navigate", target } : null;
      case "search": return target ? { action: "search", target } : null;
      case "approve": return target ? { action: "approve", target } : null;
      case "status": return { action: "status" };
      case "stop": return { action: "stop" };
      case "unknown": return { action: "unknown", raw: typeof c.raw === "string" ? c.raw : "" };
    }
  }

  // Raw transcript — parse it server-side too.
  const raw = typeof b.transcript === "string" ? b.transcript : typeof b.text === "string" ? b.text : "";
  if (!raw) return null;
  return parseTranscript(raw);
}

/** Mirror of voice-control.tsx's parseVoiceCommand — kept in sync so a
 *  raw transcript from any client (mobile, CLI, external agent) parses
 *  the same way as the in-browser one. */
function parseTranscript(raw: string): VoiceCommand {
  const text = raw.trim().replace(/\s+/g, " ").toLowerCase();
  if (!text) return { action: "unknown", raw };
  if (/^(stop|quiet|silence|shut up|cancel reading)$/.test(text)) return { action: "stop" };
  if (/(security posture|posture|status report|threat level|how are we doing)/.test(text)) return { action: "status" };

  let m = text.match(/^scan\s+(.+)$/);
  if (m && m[1]) return { action: "scan", target: m[1] };

  m = text.match(/^(show|go to|open|switch to|view)\s+(.+)$/);
  if (m && m[2]) return { action: "navigate", target: m[2] };

  m = text.match(/^(?:search|find)\s+(?:findings?\s+(?:for|containing|matching)\s+|for\s+)?(.+)$/);
  if (m && m[1] && /^(search|find)\b/.test(text)) return { action: "search", target: m[1] };

  m = text.match(/^approve\s+patch\s+(.+)$/);
  if (m && m[1]) return { action: "approve", target: m[1] };

  return { action: "unknown", raw };
}

// ── Action handlers ──────────────────────────────────────────────────────
async function handleScan(target: string) {
  // Look up the codebase by name (case-insensitive contains).
  const codebases = (await db.codebase.findMany({
    select: { id: true, name: true, language: true },
  })) as Array<{ id: string; name: string; language: string }>;
  const lq = target.toLowerCase();
  const match = codebases.find((c) => c.name.toLowerCase().includes(lq));
  if (!match) {
    return NextResponse.json({
      ok: false,
      action: "scan",
      message: `No codebase named "${target}" found.`,
    }, { status: 404 });
  }

  // Prevent concurrent scans on the same codebase.
  const running = await db.scan.findFirst({
    where: { codebaseId: match.id, status: { in: ["queued", "analyzing", "patching", "sandboxing"] } },
    orderBy: { startedAt: "desc" },
  });
  if (running) {
    return NextResponse.json({
      ok: false,
      action: "scan",
      message: `A scan is already running on ${match.name}.`,
      scanId: running.id,
    }, { status: 409 });
  }

  const scan = await db.scan.create({
    data: {
      codebaseId: match.id,
      status: "queued",
      stageLabel: "Queued by voice command…",
    },
  });

  engineFireAndForget("/api/run-sast", { codebaseId: match.id, scanId: scan.id });

  return NextResponse.json({
    ok: true,
    action: "scan",
    message: `Scan started on ${match.name}. I'll let you know when it completes.`,
    scanId: scan.id,
    codebaseId: match.id,
  });
}

async function handleSearch(target: string) {
  // ILIKE-style contains: the db proxy maps `{ contains }` to .ilike("%x%").
  const findings = (await db.finding.findMany({
    where: {
      OR: [
        { title: { contains: target } },
        { category: { contains: target } },
        { endpoint: { contains: target } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 25,
  })) as Array<{ id: string; title: string; severity: string; category: string; endpoint: string }>;

  return NextResponse.json({
    ok: true,
    action: "search",
    message: `Found ${findings.length} ${findings.length === 1 ? "finding" : "findings"} matching "${target}".`,
    findings: findings.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      category: f.category,
      endpoint: f.endpoint,
    })),
  });
}

async function handleApprove(userId: string, target: string) {
  // Resolve the patch by patchId OR id, mirroring /api/patches/[id]/approve.
  const patch = await db.patch.findFirst({
    where: { OR: [{ patchId: target }, { id: target }] },
    include: { codebase: { select: { name: true } } },
  });
  if (!patch) {
    return NextResponse.json({
      ok: false,
      action: "approve",
      message: `Patch ${target} not found.`,
    }, { status: 404 });
  }
  if (patch.status !== "pending") {
    return NextResponse.json({
      ok: false,
      action: "approve",
      message: `Patch ${target} is already ${patch.status}.`,
      patch_id: patch.patchId,
      status: patch.status,
    }, { status: 409 });
  }

  const updated = await db.patch.update({
    where: { id: patch.id },
    data: { status: "approved", approvedAt: new Date() },
  });

  // Apply the patched source to the codebase.
  if (patch.patchedCode) {
    await db.codebase.update({
      where: { id: patch.codebaseId },
      data: { sourceCode: patch.patchedCode },
    });
  }

  // Append to the tamper-evident attestation chain.
  const latestAtt = await db.attestation.findFirst({ orderBy: { createdAt: "desc" } });
  const prevHash = (latestAtt?.hash as string | undefined) ?? GENESIS_PREV_HASH;
  const approvedAt = (updated.approvedAt as Date).toISOString();
  const patchedCodeHash = createHash("sha256")
    .update((patch.patchedCode as string) || "")
    .digest("hex");
  const data = JSON.stringify({
    patchId: patch.patchId,
    codebase: (patch.codebase as { name: string } | null)?.name,
    title: patch.title,
    severity: patch.severity,
    cve: patch.cve ?? null,
    affectedFile: patch.affectedFile,
    approvedAt,
    patchedCodeHash,
    schemaVersion: 1,
  });
  const hash = computeAttestationHash(prevHash, patch.id as string, patchedCodeHash, approvedAt);
  const att = await db.attestation.create({
    data: { patchId: patch.id, prevHash, hash, data },
  });

  // Memory vault: fire-and-forget.
  try {
    onPatchApproved(userId, {
      id: patch.id as string,
      patchId: patch.patchId as string,
      title: patch.title as string,
      severity: patch.severity as string,
      affectedFile: patch.affectedFile as string | undefined,
      status: "approved",
      approvedAt: updated.approvedAt as Date,
    });
  } catch {
    /* swallow — memory writes never block the user */
  }

  return NextResponse.json({
    ok: true,
    action: "approve",
    message: `Patch ${patch.patchId ?? target} approved and cryptographically attested.`,
    patch_id: updated.patchId,
    status: updated.status,
    approved_at: approvedAt,
    attestation: {
      id: att.id,
      hash: att.hash,
      prev_hash: att.prevHash,
      verify_url: `/attestations/${updated.patchId}`,
    },
  });
}

async function handleStatus() {
  // Compute posture inline — same formula as /api/posture-score.
  const codebases = await db.codebase.findMany({
    include: {
      patches: {
        select: { severity: true, status: true, sandboxPassed: true, adversarialWon: true, adversarialRounds: true },
      },
    },
  });

  const scores = (codebases as Array<{
    id: string; name: string;
    patches: Array<{ severity: string; status: string; sandboxPassed: boolean; adversarialWon: boolean; adversarialRounds: number }>;
  }>).map((cb) => {
    const patches = cb.patches || [];
    const total = patches.length;
    const pendingCritical = patches.filter((p) => p.status === "pending" && p.severity === "critical").length;
    const pendingHigh = patches.filter((p) => p.status === "pending" && p.severity === "high").length;
    const approved = patches.filter((p) => p.status === "approved").length;
    const sandboxPassed = patches.filter((p) => p.sandboxPassed).length;
    const advRounds = patches.filter((p) => p.adversarialRounds > 0).length;
    const advWon = patches.filter((p) => p.adversarialWon).length;
    let score = 100;
    score -= Math.min(pendingCritical * 15, 45);
    score -= Math.min(pendingHigh * 8, 24);
    if (total === 0) score -= 10;
    if (total > 0) score += Math.round((sandboxPassed / total) * 10);
    if (advRounds > 0) score += Math.round((advWon / advRounds) * 10);
    if (total > 0) score += Math.round((approved / total) * 5);
    return Math.max(0, Math.min(100, score));
  });

  const overall = scores.length > 0 ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : 100;
  const grade = overall >= 90 ? "A" : overall >= 75 ? "B" : overall >= 60 ? "C" : overall >= 40 ? "D" : "F";
  const verdict =
    overall >= 75 ? "Status is healthy." :
    overall >= 50 ? "Status is fair; address pending patches." :
    "Status requires immediate attention.";

  return NextResponse.json({
    ok: true,
    action: "status",
    message: `Security posture: ${overall} out of 100. Grade ${grade}. ${verdict}`,
    overall,
    grade,
    codebases_evaluated: scores.length,
  });
}
