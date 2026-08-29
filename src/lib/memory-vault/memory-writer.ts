// AI Memory Vault — event-driven writers.
//
// These helpers convert platform events (scan complete, finding found,
// patch approved, user chat message) into concise structured memories.
// Each writes at most one row per call, content capped at MAX_MEMORY_CHARS.
//
// They are called from:
//   - /api/scans/route.ts            after a scan finishes
//   - /api/findings/route.ts         when a finding is created
//   - /api/patches/[id]/approve/route.ts  when a patch is approved
//   - /api/guardian-chat/route.ts    on every user message + assistant reply
//
// All writers are fire-and-forget-safe: a thrown DB error is caught and
// swallowed (logged) so a memory failure never blocks the user-facing
// flow. Memories are best-effort context, not a transactional record.

import { storeMemory, MAX_MEMORY_CONTENT } from "./memory-store";

function truncate(s: string, max = MAX_MEMORY_CONTENT): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/** Wrap an async writer so it never throws and never blocks. */
function safe(fn: () => Promise<unknown>): void {
  Promise.resolve(fn()).catch((err) => {
    console.warn("[memory-vault] write failed:", err instanceof Error ? err.message : err);
  });
}

interface ScanFinding {
  title?: string;
  severity?: string;
  category?: string;
}

interface ScanPatch {
  title?: string;
  severity?: string;
  status?: string;
}

interface ScanSummary {
  id: string;
  codebaseName?: string;
  status?: string;
  startedAt?: string | Date;
  completedAt?: string | Date;
}

/**
 * Write a memory summarizing a completed scan: how many findings, how
 * many patches generated, severity breakdown. Tagged with the codebase
 * name and scan id so the assistant can cross-reference later.
 */
export function onScanComplete(
  userId: string,
  scan: ScanSummary,
  findings: ScanFinding[] = [],
  patches: ScanPatch[] = [],
): void {
  safe(async () => {
    const critical = findings.filter((f) => f.severity === "critical").length;
    const high = findings.filter((f) => f.severity === "high").length;
    const pending = patches.filter((p) => p.status === "pending").length;
    const codebase = scan.codebaseName || "codebase";
    const content = truncate(
      `Scan of ${codebase} completed with ${findings.length} findings ` +
        `(${critical} critical, ${high} high) and ${patches.length} patches generated ` +
        `(${pending} still pending). Status: ${scan.status || "complete"}.`,
    );
    await storeMemory(userId, {
      category: "scan_result",
      title: `Scanned ${codebase}: ${findings.length} findings`,
      content,
      tags: [
        "scan",
        codebase,
        scan.id,
        critical > 0 ? "critical" : "",
        "findings:" + findings.length,
      ].filter(Boolean),
    });
  });
}

interface FindingRecord {
  id?: string;
  title?: string;
  severity?: string;
  category?: string;
  endpoint?: string;
  method?: string;
  owasp?: string;
}

/**
 * Write a memory of a single finding. Tagged `status:open` so the
 * context builder surfaces it as an "Active Threat" until patched.
 */
export function onFindingFound(
  userId: string,
  finding: FindingRecord,
): void {
  safe(async () => {
    const title = finding.title || "Unknown finding";
    const sev = finding.severity || "unknown";
    const ep = finding.endpoint ? ` at ${finding.method || "GET"} ${finding.endpoint}` : "";
    const cat = finding.category ? ` [${finding.category}]` : "";
    const content = truncate(
      `${sev.toUpperCase()} finding${cat}: ${title}${ep}` +
        (finding.owasp ? ` (OWASP ${finding.owasp})` : ""),
    );
    await storeMemory(userId, {
      category: "finding",
      title: `${sev.toUpperCase()} — ${title}`,
      content,
      tags: [
        "finding",
        sev,
        finding.category || "",
        finding.owasp || "",
        "status:open",
        finding.id || "",
      ].filter(Boolean),
    });
  });
}

interface PatchRecord {
  id?: string;
  patchId?: string;
  title?: string;
  severity?: string;
  affectedFile?: string;
  status?: string;
  approvedAt?: string | Date | null;
}

/**
 * Write a memory when a patch is approved. The matching open finding is
 * implicitly "resolved" by the context builder because this memory is
 * tagged `status:patched` and the finding's `status:open` tag falls out
 * of the recent window.
 */
export function onPatchApproved(
  userId: string,
  patch: PatchRecord,
): void {
  safe(async () => {
    const title = patch.title || "Patch";
    const file = patch.affectedFile ? ` in ${patch.affectedFile}` : "";
    const content = truncate(
      `Patch approved${file}: ${title} (${patch.severity || "n/a"} severity).` +
        (patch.patchId ? ` Patch ID: ${patch.patchId}` : ""),
    );
    await storeMemory(userId, {
      category: "patch",
      title: `Patched ${title}`,
      content,
      tags: [
        "patch",
        "approved",
        "status:patched",
        patch.severity || "",
        patch.patchId || "",
      ].filter(Boolean),
    });
  });
}

/**
 * Write a memory of a user chat message. The chat route also writes the
 * assistant's reply as a separate `conversation` memory tagged
 * `role:assistant` — the context builder only surfaces the user-side
 * memories to keep the prompt compact.
 */
export function onUserMessage(
  userId: string,
  message: string,
): void {
  safe(async () => {
    const content = truncate(message.trim(), 400);
    if (!content) return;
    await storeMemory(userId, {
      category: "conversation",
      title: `User asked: ${content.slice(0, 80)}`,
      content,
      tags: ["chat", "role:user"],
    });
  });
}

/**
 * Write a memory of the assistant's reply. Tagged `role:assistant` so
 * the context builder can filter it out of the surfaced "Recent
 * Conversation" section (it only shows the user's side).
 */
export function onAssistantReply(
  userId: string,
  reply: string,
): void {
  safe(async () => {
    const content = truncate(reply.trim(), 400);
    if (!content) return;
    await storeMemory(userId, {
      category: "conversation",
      title: `Guardian replied: ${content.slice(0, 80)}`,
      content,
      tags: ["chat", "role:assistant"],
    });
  });
}

/**
 * Write a user preference. Called when the assistant detects a stated
 * preference in chat ("I always use parameterized queries") or when the
 * user changes a setting in the UI.
 */
export function onUserPreference(
  userId: string,
  key: string,
  value: string,
): void {
  safe(async () => {
    const content = truncate(`User prefers: ${key} = ${value}`, 300);
    await storeMemory(userId, {
      category: "user_preference",
      title: `Prefers ${key}: ${value.slice(0, 80)}`,
      content,
      tags: ["preference", key],
    });
  });
}
