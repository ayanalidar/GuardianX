// GET /api/posture-timeline?days=30
//
// Time-Travel Posture Debugger — historical + projected security posture.
//
// Builds a per-day timeline (default 30 days, max 90) of the org's posture
// score using the SAME formula as /api/posture-score, but applied to the
// patch/finding snapshot as it existed on each day. Each day also carries a
// structured event log (scans started, findings introduced, patches
// generated/approved, audit log entries) with best-effort commit attribution
// mined from the audit log's `details` field.
//
// Returns:
//   {
//     timeline: [{ date, postureScore, newFindings, resolvedFindings,
//                  newPatches, approvedPatches, newScans, events: [...] }],
//     currentScore, projectedScore, totals: {...}
//   }
//
// `projectedScore` simulates approving every currently-pending patch
// (sandboxPassed → true, status → approved) and recomputes the score —
// i.e. "what posture would we have if we approved every pending patch today".

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Types ────────────────────────────────────────────────────────────────
interface TimelineEvent {
  type: "scan" | "finding" | "patch" | "approval" | "audit";
  description: string;
  author?: string;
  commitHash?: string;
  severity?: string;
}

interface TimelineDay {
  date: string; // YYYY-MM-DD
  timestamp: number; // ms since epoch (start of day, UTC)
  postureScore: number;
  newFindings: number;
  resolvedFindings: number;
  newPatches: number;
  approvedPatches: number;
  newScans: number;
  events: TimelineEvent[];
}

interface PostureTimelineResponse {
  timeline: TimelineDay[];
  currentScore: number;
  projectedScore: number;
  totalFindings: number;
  totalPatches: number;
  pendingPatches: number;
  approvedPatches: number;
}

interface PatchRow {
  id: string;
  title: string;
  severity: string;
  status: string;
  sandboxPassed: boolean;
  adversarialRounds: number;
  adversarialWon: boolean;
  createdAt: Date;
  approvedAt: Date | null;
}

// ── Posture-score formula (mirrors /api/posture-score) ──────────────────────
// Pure function so we can replay it against historical snapshots + future
// projection. 100 baseline → penalize pending critical/high → bonus for
// sandbox pass, adversarial wins, and approvals.
function computePostureScore(patches: PatchRow[]): number {
  const total = patches.length;
  const pending = patches.filter((p) => p.status === "pending");
  const approved = patches.filter((p) => p.status === "approved");
  const pendingCritical = pending.filter((p) => p.severity === "critical").length;
  const pendingHigh = pending.filter((p) => p.severity === "high").length;
  const sandboxPassed = patches.filter((p) => p.sandboxPassed).length;
  const advRounds = patches.filter((p) => p.adversarialRounds > 0).length;
  const advWon = patches.filter((p) => p.adversarialWon).length;

  let score = 100;
  score -= Math.min(pendingCritical * 15, 45);
  score -= Math.min(pendingHigh * 8, 24);
  if (total === 0) score -= 10;
  if (total > 0) score += Math.round((sandboxPassed / total) * 10);
  if (advRounds > 0) score += Math.round((advWon / advRounds) * 10);
  if (total > 0) score += Math.round((approved.length / total) * 5);
  return Math.max(0, Math.min(100, score));
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function startOfDayUTC(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

// Mine a commit hash + author from an audit log row's `details` text. The
// audit log is free-form, so we look for a 7-40 char hex string that looks
// like a git SHA. If found, surface it as commit attribution on the event.
const COMMIT_RE = /\b([0-9a-f]{7,40})\b/i;
function extractCommitHash(details: string | null | undefined): string | undefined {
  if (!details) return undefined;
  const m = details.match(COMMIT_RE);
  return m?.[1] ?? undefined;
}

// ── Route handler ──────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const daysParam = parseInt(url.searchParams.get("days") ?? "30", 10);
    const days = Math.max(1, Math.min(90, Number.isFinite(daysParam) ? daysParam : 30));

    // Today (UTC midnight) and the start of the window.
    const todayStart = startOfDayUTC(new Date());
    const windowStart = new Date(todayStart);
    windowStart.setUTCDate(windowStart.getUTCDate() - (days - 1));

    // We need to compute posture for every day in [windowStart, todayStart].
    // Posture is a function of ALL patches/findings that existed up to that
    // day — so fetch the full history (capped) once and filter per-day.
    const dayBeforeWindow = new Date(windowStart.getTime() - 24 * 3600 * 1000);

    const [scans, findings, patches, auditLogs] = await Promise.all([
      db.scan.findMany({
        where: { startedAt: { gte: dayBeforeWindow } },
        select: {
          id: true,
          status: true,
          stageLabel: true,
          startedAt: true,
          codebase: { select: { name: true } },
        },
        orderBy: { startedAt: "asc" },
        take: 1000,
      }),
      db.finding.findMany({
        where: { createdAt: { gte: dayBeforeWindow } },
        select: {
          id: true,
          title: true,
          severity: true,
          category: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: 2000,
      }),
      // Full patch history up to today (posture formula needs the whole set).
      db.patch.findMany({
        where: { createdAt: { lte: todayStart } },
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
          sandboxPassed: true,
          adversarialRounds: true,
          adversarialWon: true,
          createdAt: true,
          approvedAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: 5000,
      }),
      db.auditLog.findMany({
        where: { createdAt: { gte: dayBeforeWindow } },
        select: {
          id: true,
          action: true,
          entity: true,
          actor: true,
          details: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
        take: 2000,
      }),
    ]);

    // Build per-day buckets.
    const daysArr: TimelineDay[] = [];
    for (let i = 0; i < days; i++) {
      const dayStart = new Date(windowStart.getTime() + i * 86400_000);
      const dayEnd = new Date(dayStart.getTime() + 86400_000);
      const dayEndMs = dayEnd.getTime();
      const dayStartMs = dayStart.getTime();

      // Patch snapshot AS OF end-of-this-day: createdAt <= dayEnd, and
      // status is "approved" only if approvedAt <= dayEnd.
      const patchesAsOf: PatchRow[] = [];
      for (const p of patches) {
        if (p.createdAt.getTime() > dayEndMs) break; // patches are sorted asc
        const isApproved =
          p.approvedAt !== null && p.approvedAt.getTime() <= dayEndMs;
        patchesAsOf.push({
          ...p,
          status: isApproved ? "approved" : "pending",
        });
      }
      const scoreAsOf = computePostureScore(patchesAsOf);

      // New things on THIS day specifically (createdAt ∈ [dayStart, dayEnd)).
      const dayFindings = findings.filter(
        (f) => f.createdAt.getTime() >= dayStartMs && f.createdAt.getTime() < dayEndMs,
      );
      const dayPatchesCreated = patches.filter(
        (p) => p.createdAt.getTime() >= dayStartMs && p.createdAt.getTime() < dayEndMs,
      );
      const dayPatchesApproved = patches.filter(
        (p) =>
          p.approvedAt !== null &&
          p.approvedAt.getTime() >= dayStartMs &&
          p.approvedAt.getTime() < dayEndMs,
      );
      const dayScans = scans.filter(
        (s) => s.startedAt.getTime() >= dayStartMs && s.startedAt.getTime() < dayEndMs,
      );
      const dayAudit = auditLogs.filter(
        (a) => a.createdAt.getTime() >= dayStartMs && a.createdAt.getTime() < dayEndMs,
      );

      // ── Build events for this day (newest first) ──────────────────────────
      const events: TimelineEvent[] = [];

      for (const s of dayScans) {
        events.push({
          type: "scan",
          description: `Scan ${s.status} on ${s.codebase?.name ?? "codebase"}${s.stageLabel ? ` · ${s.stageLabel}` : ""}`,
        });
      }
      for (const f of dayFindings) {
        events.push({
          type: "finding",
          description: `${f.title || "Untitled finding"} in ${f.category || "unknown"}`,
          severity: f.severity,
        });
      }
      for (const p of dayPatchesCreated) {
        events.push({
          type: "patch",
          description: `Patch generated: ${p.title || "Untitled"} (${p.severity})`,
          severity: p.severity,
        });
      }
      for (const p of dayPatchesApproved) {
        events.push({
          type: "approval",
          description: `Patch approved: ${p.title || "Untitled"}`,
          severity: p.severity,
        });
      }
      for (const a of dayAudit) {
        // Skip noisy scan/patch audit rows we've already represented above;
        // surface only actions that look like approvals, commits, or admin
        // activity so the event log stays readable.
        const action = (a.action || "").toLowerCase();
        if (
          !action.includes("commit") &&
          !action.includes("approve") &&
          !action.includes("reject") &&
          !action.includes("deploy") &&
          !action.includes("rollback") &&
          !action.includes("login") &&
          !action.includes("admin")
        ) {
          continue;
        }
        events.push({
          type: "audit",
          description: `${a.action}${a.entity ? ` · ${a.entity}` : ""}${a.details ? ` — ${a.details.slice(0, 120)}` : ""}`,
          author: a.actor && a.actor !== "system" ? a.actor : undefined,
          commitHash: extractCommitHash(a.details),
        });
      }

      // Newest first within the day.
      events.reverse();

      daysArr.push({
        date: toISODate(dayStart),
        timestamp: dayStartMs,
        postureScore: scoreAsOf,
        newFindings: dayFindings.length,
        resolvedFindings: dayPatchesApproved.length,
        newPatches: dayPatchesCreated.length,
        approvedPatches: dayPatchesApproved.length,
        newScans: dayScans.length,
        events,
      });
    }

    // ── Current + projected scores ────────────────────────────────────────
    const currentPatches: PatchRow[] = patches.map((p) => ({
      ...p,
      status:
        p.approvedAt !== null && p.approvedAt.getTime() <= Date.now()
          ? "approved"
          : p.status,
    }));
    const currentScore = computePostureScore(currentPatches);

    // Projection: assume all pending patches get approved (sandboxPassed=true,
    // status=approved, adversarialWon stays as-is).
    const projectedPatches: PatchRow[] = currentPatches.map((p) =>
      p.status === "pending"
        ? { ...p, status: "approved", sandboxPassed: true }
        : p,
    );
    const projectedScore = computePostureScore(projectedPatches);

    const pendingPatches = currentPatches.filter((p) => p.status === "pending").length;
    const approvedPatchesCount = currentPatches.filter((p) => p.status === "approved").length;

    const response: PostureTimelineResponse = {
      timeline: daysArr,
      currentScore,
      projectedScore,
      totalFindings: findings.length,
      totalPatches: patches.length,
      pendingPatches,
      approvedPatches: approvedPatchesCount,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error("[posture-timeline] error:", err);
    return NextResponse.json(
      {
        error:
          "Posture timeline build failed. " +
          (err instanceof Error ? err.message : "Unknown error."),
      },
      { status: 500 },
    );
  }
}
