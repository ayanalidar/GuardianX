// AI Memory Vault — context builder.
//
// `buildContextForChat(userId)` is called from /api/guardian-chat/route.ts
// (and /api/memory/context) before the AI sends a reply. It pulls recent
// scan memories, active findings, user preferences, and recent
// conversations, then shapes them into a compact markdown block the
// assistant can ground its answer on.
//
// Output example:
//
//   ## Recent Activity
//   - Scanned CyberShield's API: 3 critical findings
//   - Patched SQL Injection in login.js
//   - User prefers parameterized queries
//
//   ## Active Threats
//   - XSS in /search (unpatched)
//   - Path traversal in /file (unpatched)

import { getMemories, type MemoryEntry } from "./memory-store";

function fmtRelative(date: Date): string {
  const ms = Date.now() - new Date(date).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toISOString().slice(0, 10);
}

function tagString(m: MemoryEntry): string {
  return m.tags.length > 0 ? ` [${m.tags.join(", ")}]` : "";
}

function summarize(m: MemoryEntry): string {
  const when = fmtRelative(m.createdAt);
  return `- ${m.title}${tagString(m)} — ${m.content} (${when})`;
}

/**
 * Build the markdown-formatted context block the Guardian AI sees at the
 * top of its system prompt. Returns an empty string if no memories exist
 * yet (new user, fresh install) so the prompt stays clean.
 */
export async function buildContextForChat(userId: string): Promise<string> {
  if (!userId) return "";

  const [scans, findings, patches, prefs, convos] = await Promise.all([
    getMemories(userId, "scan_result", 5),
    getMemories(userId, "finding", 10),
    getMemories(userId, "patch", 8),
    getMemories(userId, "user_preference", 5),
    getMemories(userId, "conversation", 6),
  ]);

  if (scans.length === 0 && findings.length === 0 && patches.length === 0 &&
      prefs.length === 0 && convos.length === 0) {
    return "";
  }

  const sections: string[] = [];

  // ── Recent Activity ──────────────────────────────────────────────────
  const activity: string[] = [];
  for (const s of scans) activity.push(summarize(s));
  for (const p of patches.slice(0, 5)) activity.push(summarize(p));
  if (activity.length > 0) {
    sections.push("## Recent Activity\n" + activity.join("\n"));
  }

  // ── Active Threats (findings without a corresponding approved patch) ──
  // The memory-writer tags each finding memory with `status:open` until a
  // matching patch is approved, so we surface only those.
  const openFindings = findings.filter(
    (f) => f.tags.includes("status:open") || !f.tags.includes("status:patched"),
  );
  if (openFindings.length > 0) {
    sections.push("## Active Threats\n" + openFindings.map(summarize).join("\n"));
  }

  // ── User Preferences ──────────────────────────────────────────────────
  if (prefs.length > 0) {
    sections.push("## User Preferences\n" + prefs.map(summarize).join("\n"));
  }

  // ── Recent Conversation ───────────────────────────────────────────────
  // Compact: just the user's last few asks, not the assistant replies.
  const userConvos = convos.filter((c) => c.tags.includes("role:user"));
  if (userConvos.length > 0) {
    sections.push(
      "## Recent Conversation\n" +
        userConvos
          .map((m) => `- "${m.content.slice(0, 180)}" (${fmtRelative(m.createdAt)})`)
          .join("\n"),
    );
  }

  return sections.join("\n\n");
}
