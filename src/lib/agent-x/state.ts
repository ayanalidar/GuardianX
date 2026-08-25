// Agent X — Platform state aggregator
// ─────────────────────────────────────────────────────────────────────────
// Shared helper used by /api/agent-x/chat and /api/agent-x/briefing to gather
// platform state in a single parallel DB sweep. Returns real, typed data —
// no mock values, no "I don't have access to that" replies.
//
// All queries run with Promise.all so the whole sweep completes in one
// round trip (Neon pgbouncer pool is fast). Falls back to safe empty
// values per-section if any single query fails so a flaky DB never
// poisons the whole reply.

import { db } from "@/lib/db";
import { severityRank, postureGrade } from "./knowledge";

// ─── Types ───────────────────────────────────────────────────────────────

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: string;
  twofaEnabled: boolean;
  createdAt: Date;
}

export interface PendingPatch {
  id: string;
  patchId: string;
  title: string;
  severity: string;
  affectedFile: string;
  cve: string | null;
  sandboxPassed: boolean;
  confidence: number;
  codebaseId: string;
  codebaseName: string;
  createdAt: Date;
}

export interface RecentFinding {
  id: string;
  title: string;
  severity: string;
  category: string;
  endpoint: string;
  owasp: string | null;
  createdAt: Date;
  targetName: string;
  engagementId: string;
}

export interface RecentScan {
  id: string;
  status: string;
  stageLabel: string | null;
  startedAt: Date;
  completedAt: Date | null;
  codebaseName: string;
}

export interface PlatformState {
  user: UserInfo | null;
  pendingPatches: PendingPatch[];
  pendingPatchCount: number;
  pendingCriticalCount: number;
  pendingHighCount: number;
  recentFindings: RecentFinding[];
  criticalFindingCount: number;
  recentScans: RecentScan[];
  activeScanCount: number;
  clientCount: number;
  codebaseCount: number;
  postureScore: number;
  postureGrade: string;
  topPatch: PendingPatch | null;
  topFinding: RecentFinding | null;
  codebaseWithMostFindings: { id: string; name: string; findingCount: number } | null;
  recentActivity: { action: string; entity: string | null; actor: string; details: string | null; timestamp: Date }[];
  lastLoginAt: Date | null;
}

// ─── Posture score (inlined mirror of /api/posture-score) ────────────────

interface CodebaseWithPatches {
  id: string;
  name: string;
  patches: Array<{
    severity: string;
    status: string;
    sandboxPassed: boolean;
    adversarialWon: boolean;
    adversarialRounds: number;
  }>;
}

export function computePostureScore(codebases: CodebaseWithPatches[]): { score: number; grade: string } {
  if (codebases.length === 0) return { score: 100, grade: postureGrade(100) };

  const scores = codebases.map((cb) => {
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

  const overall = Math.round(scores.reduce((s, x) => s + x, 0) / scores.length);
  return { score: overall, grade: postureGrade(overall) };
}

// ─── Main aggregator ────────────────────────────────────────────────────

export async function gatherPlatformState(userId: string): Promise<PlatformState> {
  // Phase 1: gather everything in parallel.
  const [userRow, patches, findings, scans, clients, codebases, auditLogs] = await Promise.all([
    // User
    db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, twofaEnabled: true, createdAt: true },
    }).catch(() => null),

    // Pending patches (top by severity, then by recency) + their codebase names
    db.patch.findMany({
      where: { status: "pending" },
      include: { codebase: { select: { id: true, name: true } } },
      orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
      take: 25,
    }).catch(() => []),

    // Recent findings + their target name (via engagement → target)
    db.finding.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { engagement: { include: { target: { select: { name: true } } } } },
    }).catch(() => []),

    // Recent scans + codebase names
    db.scan.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
      include: { codebase: { select: { name: true } } },
    }).catch(() => []),

    // Client count
    db.client.count().catch(() => 0),

    // Codebases with patches (for posture + finding-count aggregation)
    db.codebase.findMany({
      include: {
        patches: { select: { severity: true, status: true, sandboxPassed: true, adversarialWon: true, adversarialRounds: true } },
      },
    }).catch(() => []),

    // Audit log (last 50 — used to compute recent activity + last login)
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    }).catch(() => []),
  ]);

  // ── User info ──────────────────────────────────────────────────────────
  const user: UserInfo | null = userRow
    ? {
        id: (userRow as { id: string }).id,
        email: (userRow as { email: string }).email,
        name: (userRow as { name: string }).name,
        role: (userRow as { role: string }).role,
        twofaEnabled: (userRow as { twofaEnabled: boolean }).twofaEnabled,
        createdAt: (userRow as { createdAt: Date }).createdAt,
      }
    : null;

  // ── Pending patches (sorted, top 3 by severity) ─────────────────────────
  const pendingPatches: PendingPatch[] = (patches as Array<{
    id: string;
    patchId: string;
    title: string;
    severity: string;
    affectedFile: string;
    cve: string | null;
    sandboxPassed: boolean;
    confidence: number;
    codebaseId: string;
    codebase: { id: string; name: string };
    createdAt: Date;
  }>).map((p) => ({
    id: p.id,
    patchId: p.patchId,
    title: p.title,
    severity: p.severity,
    affectedFile: p.affectedFile,
    cve: p.cve,
    sandboxPassed: p.sandboxPassed,
    confidence: p.confidence,
    codebaseId: p.codebaseId,
    codebaseName: p.codebase?.name ?? "unknown",
    createdAt: p.createdAt,
  }));
  pendingPatches.sort((a, b) => {
    const r = severityRank(a.severity) - severityRank(b.severity);
    if (r !== 0) return r;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  const pendingCriticalCount = pendingPatches.filter((p) => p.severity === "critical").length;
  const pendingHighCount = pendingPatches.filter((p) => p.severity === "high").length;
  const topPatch = pendingPatches[0] ?? null;

  // ── Recent findings ─────────────────────────────────────────────────────
  const recentFindings: RecentFinding[] = (findings as Array<{
    id: string;
    title: string;
    severity: string;
    category: string;
    endpoint: string;
    owasp: string | null;
    createdAt: Date;
    engagement: { target: { name: string } | null } | null;
  }>).map((f) => ({
    id: f.id,
    title: f.title,
    severity: f.severity,
    category: f.category,
    endpoint: f.endpoint,
    owasp: f.owasp,
    createdAt: f.createdAt,
    targetName: f.engagement?.target?.name ?? "unknown target",
    engagementId: (f.engagement as { id?: string } | null)?.id ?? "",
  }));

  const criticalFindingCount = recentFindings.filter((f) => f.severity === "critical").length;
  const topFinding = [...recentFindings].sort((a, b) => {
    const r = severityRank(a.severity) - severityRank(b.severity);
    if (r !== 0) return r;
    return b.createdAt.getTime() - a.createdAt.getTime();
  })[0] ?? null;

  // ── Recent scans + active scan count ─────────────────────────────────────
  const recentScans: RecentScan[] = (scans as Array<{
    id: string;
    status: string;
    stageLabel: string | null;
    startedAt: Date;
    completedAt: Date | null;
    codebase: { name: string };
  }>).map((s) => ({
    id: s.id,
    status: s.status,
    stageLabel: s.stageLabel,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    codebaseName: s.codebase?.name ?? "unknown",
  }));
  const activeScanCount = recentScans.filter(
    (s) => s.status === "queued" || s.status === "analyzing" || s.status === "patching" || s.status === "sandboxing" || s.status === "running",
  ).length;

  // ── Posture score (inlined formula) ──────────────────────────────────────
  const codebasesWithPatches: CodebaseWithPatches[] = (codebases as Array<{
    id: string;
    name: string;
    patches: Array<{ severity: string; status: string; sandboxPassed: boolean; adversarialWon: boolean; adversarialRounds: number }>;
  }>).map((cb) => ({
    id: cb.id,
    name: cb.name,
    patches: cb.patches || [],
  }));
  const { score: postureScore, grade: postureGradeStr } = computePostureScore(codebasesWithPatches);

  // ── Codebase with most findings (for "suggest next" intent) ─────────────
  // We approximate "findings per codebase" by counting patches per codebase
  // (each finding typically generates one patch). This is good enough for
  // a suggestion — the user will see real findings when they drill in.
  const codebaseFindingCounts = codebasesWithPatches.map((cb) => ({
    id: cb.id,
    name: cb.name,
    findingCount: cb.patches.length,
  }));
  codebaseFindingCounts.sort((a, b) => b.findingCount - a.findingCount);
  const codebaseWithMostFindings = codebaseFindingCounts[0] && codebaseFindingCounts[0].findingCount > 0
    ? codebaseFindingCounts[0]
    : null;

  // ── Recent activity (last 3 non-login actions by this user) ─────────────
  const userEmail = user?.email ?? "";
  const recentActivity = (auditLogs as Array<{
    id: string;
    action: string;
    entity: string | null;
    actor: string;
    details: string | null;
    createdAt: Date;
  }>)
    .filter((log) => log.actor === userEmail || log.actor === userId)
    .slice(0, 5)
    .map((log) => ({
      action: log.action,
      entity: log.entity,
      actor: log.actor,
      details: log.details,
      timestamp: log.createdAt,
    }));

  // Last login time (most recent login event in audit log for this user).
  const lastLoginRow = (auditLogs as Array<{
    action: string;
    actor: string;
    createdAt: Date;
  }>).find((log) => log.action === "login" && (log.actor === userEmail || log.actor === userId));
  const lastLoginAt = lastLoginRow?.createdAt ?? null;

  return {
    user,
    pendingPatches,
    pendingPatchCount: pendingPatches.length,
    pendingCriticalCount,
    pendingHighCount,
    recentFindings,
    criticalFindingCount,
    recentScans,
    activeScanCount,
    clientCount: clients,
    codebaseCount: codebasesWithPatches.length,
    postureScore,
    postureGrade: postureGradeStr,
    topPatch,
    topFinding,
    codebaseWithMostFindings,
    recentActivity,
    lastLoginAt,
  };
}

// ─── Helpers for relative time ────────────────────────────────────────────

export function relativeTime(date: Date | null): string {
  if (!date) return "never";
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 0) return "just now";
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toISOString().slice(0, 10);
}

export function daysSince(date: Date | null): number {
  if (!date) return 0;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000);
}
