// Agent X — Activation Briefing
// ─────────────────────────────────────────────────────────────────────────
// GET /api/agent-x/briefing
//
// Auth required. Called when the user activates Agent X (clicks the
// activation button). Returns a structured briefing the frontend can
// speak aloud (TTS) + render visually:
//   - Personalized time-of-day greeting using the user's name
//   - Last-login acknowledgment ("Welcome back — it's been N days")
//   - Posture score + grade
//   - Pending tasks (patches, findings, scans) sorted by urgency
//   - Proactive suggestions for next actions
//   - Recent activity (last 3 things the user did)
//
// Time-of-day is computed in the user's timezone (default Asia/Calcutta —
// the user is in India). The greeting tone adapts: morning is welcoming,
// night ("Working late") acknowledges the late hour.

import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  getTimeOfDay,
  greetingPrefix,
  severityRank,
  type TimeOfDay,
  type TabInfo,
  TABS,
} from "@/lib/agent-x/knowledge";
import { gatherPlatformState, relativeTime, daysSince, type PlatformState } from "@/lib/agent-x/state";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Response shape ──────────────────────────────────────────────────────

interface PendingTask {
  type: "patch" | "finding" | "scan";
  id: string;
  title: string;
  severity: string;
  age: string;
}

interface BriefingResponse {
  greeting: string;
  timeOfDay: TimeOfDay;
  lastLogin: string | null;
  postureScore: number;
  postureGrade: string;
  pendingTasks: PendingTask[];
  criticalCount: number;
  suggestions: string[];
  recentActivity: string[];
  activeScans: number;
}

// ─── GET handler ─────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const { userId, name, email } = auth.user;

  const state = await gatherPlatformState(userId);
  const tod = getTimeOfDay("Asia/Calcutta");

  const greeting = buildGreeting(state, name || email.split("@")[0], tod);
  const pendingTasks = buildPendingTasks(state);
  const suggestions = buildProactiveSuggestions(state);
  const recentActivity = buildRecentActivity(state);

  const response: BriefingResponse = {
    greeting,
    timeOfDay: tod,
    lastLogin: state.lastLoginAt ? relativeTime(state.lastLoginAt) : null,
    postureScore: state.postureScore,
    postureGrade: state.postureGrade,
    pendingTasks,
    criticalCount: state.pendingCriticalCount + state.criticalFindingCount,
    suggestions,
    recentActivity,
    activeScans: state.activeScanCount,
  };

  return NextResponse.json(response);
}

// ─── Greeting builder ────────────────────────────────────────────────────
//
// The greeting includes:
//   1. Time-of-day prefix ("Good morning, Ayan." / "Working late, Ayan.")
//   2. "Welcome back" + N days since last visit (if > 24h ago)
//   3. Pending task count + most urgent task title (if any)
//   4. Posture score comment (attention if < 70, praise if >= 90)

function buildGreeting(state: PlatformState, name: string, tod: TimeOfDay): string {
  const firstName = (name || "there").split(" ")[0];
  const parts: string[] = [`${greetingPrefix(tod)}, ${firstName}.`];

  // Last-visit acknowledgement.
  if (state.lastLoginAt) {
    const days = daysSince(state.lastLoginAt);
    if (days >= 1) {
      parts.push(days === 1 ? "Welcome back — it's been a day since your last visit." : `Welcome back — it's been ${days} days since your last visit.`);
    } else {
      parts.push("Welcome back.");
    }
  } else {
    parts.push("Welcome to GuardianX.");
  }

  // Pending tasks.
  const totalUrgent = state.pendingCriticalCount + state.criticalFindingCount;
  if (totalUrgent > 0) {
    const topTask = state.topPatch
      ? `"${state.topPatch.title}" in ${state.topPatch.codebaseName}`
      : state.topFinding
        ? `${state.topFinding.title} on ${state.topFinding.targetName}`
        : "an unspecified critical issue";
    parts.push(`You have ${totalUrgent} urgent ${totalUrgent === 1 ? "task" : "tasks"} waiting. The most urgent is ${topTask}.`);
  } else if (state.pendingPatchCount > 0) {
    parts.push(`You have ${state.pendingPatchCount} pending ${state.pendingPatchCount === 1 ? "patch" : "patches"} waiting for review.`);
  }

  // Posture comment.
  if (state.postureScore < 70) {
    parts.push(`Your security posture needs attention — current score is ${state.postureScore}/100 (grade ${state.postureGrade}).`);
  } else if (state.postureScore >= 90) {
    parts.push(`Your security posture is excellent — score ${state.postureScore}/100 (grade ${state.postureGrade}).`);
  } else {
    parts.push(`Security posture is currently ${state.postureScore}/100 (grade ${state.postureGrade}).`);
  }

  return parts.join(" ");
}

// ─── Pending tasks (patches → findings → scans, sorted by severity) ───────

function buildPendingTasks(state: PlatformState): PendingTask[] {
  const tasks: PendingTask[] = [];

  // Top 5 pending patches.
  for (const p of state.pendingPatches.slice(0, 5)) {
    tasks.push({
      type: "patch",
      id: p.patchId,
      title: p.title,
      severity: p.severity,
      age: relativeTime(p.createdAt),
    });
  }

  // Top 3 critical findings (from DAST).
  const criticalFindings = state.recentFindings
    .filter((f) => f.severity === "critical")
    .slice(0, 3);
  for (const f of criticalFindings) {
    tasks.push({
      type: "finding",
      id: f.id,
      title: f.title,
      severity: f.severity,
      age: relativeTime(f.createdAt),
    });
  }

  // Currently running scans (in-flight tasks).
  for (const s of state.recentScans.slice(0, 3)) {
    if (s.status === "queued" || s.status === "analyzing" || s.status === "patching" || s.status === "sandboxing" || s.status === "running") {
      tasks.push({
        type: "scan",
        id: s.id,
        title: `${s.codebaseName} scan — ${s.stageLabel ?? s.status}`,
        severity: "info",
        age: relativeTime(s.startedAt),
      });
    }
  }

  // Sort by severity (critical first, then by age).
  tasks.sort((a, b) => {
    const r = severityRank(a.severity) - severityRank(b.severity);
    if (r !== 0) return r;
    // Older tasks first within the same severity.
    return a.age.localeCompare(b.age);
  });

  return tasks.slice(0, 8);
}

// ─── Proactive suggestions (3 next-actions) ───────────────────────────────

function buildProactiveSuggestions(state: PlatformState): string[] {
  const recs: string[] = [];

  if (state.pendingCriticalCount > 0 && state.topPatch) {
    recs.push(`Approve the ${state.pendingCriticalCount === 1 ? "" : state.pendingCriticalCount + " "}critical ${state.pendingCriticalCount === 1 ? "patch" : "patches"} pending — start with ${state.topPatch.patchId}.`);
  } else if (state.pendingPatchCount > 0 && state.topPatch) {
    recs.push(`Review ${state.pendingPatchCount} pending ${state.pendingPatchCount === 1 ? "patch" : "patches"} — top is ${state.topPatch.patchId}.`);
  }

  if (state.codebaseWithMostFindings) {
    recs.push(`Run a fresh scan on ${state.codebaseWithMostFindings.name} — it has the most findings (${state.codebaseWithMostFindings.findingCount}).`);
  } else if (state.codebaseCount === 0) {
    recs.push("Add your first codebase to start scanning for vulnerabilities.");
  } else {
    recs.push(`Run a scan on one of your ${state.codebaseCount} codebases to surface new findings.`);
  }

  if (state.criticalFindingCount > 0 && state.topFinding) {
    recs.push(`Review the ${state.criticalFindingCount} critical ${state.criticalFindingCount === 1 ? "finding" : "findings"} from DAST — top is "${state.topFinding.title}" on ${state.topFinding.targetName}.`);
  } else if (state.postureScore >= 90) {
    recs.push("Posture is strong — consider running a DAST engagement against an authorized target to test runtime defenses.");
  } else if (state.postureScore < 70) {
    recs.push("Posture score needs a boost — closing 2-3 critical patches should push you above 75.");
  }

  if (recs.length === 0) {
    recs.push("Everything looks clean. Try opening the War Room for a fullscreen briefing, or add a new codebase.");
  }

  return recs.slice(0, 3);
}

// ─── Recent activity (last 3 user actions from the audit log) ─────────────

function buildRecentActivity(state: PlatformState): string[] {
  if (state.recentActivity.length === 0) return [];

  return state.recentActivity.slice(0, 3).map((entry) => {
    const when = relativeTime(entry.timestamp);
    const entity = entry.entity ? ` on ${entry.entity}` : "";
    const detail = entry.details ? ` (${entry.details.slice(0, 80)})` : "";
    return `${entry.action}${entity} — ${when}${detail}`;
  });
}

// Exported for the context route's tab descriptions.
export { TABS, type TabInfo };
