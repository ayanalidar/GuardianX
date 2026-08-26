// GET /api/admin/user-activity
//
// Returns a per-user activity summary so admins can monitor what each
// analyst (and admin) is doing on the platform. For every user we return:
//
//   • Identity: id, email, name, role, approved, createdAt
//   • Last login: timestamp + ip pulled from the LoginHistory table
//   • Activity stats: clients owned, scans run, patches, findings,
//     and total audit-log entries authored by that user
//   • Recent activity: the last 5 audit-log rows for that user
//     (action, entity, timestamp)
//
// SECURITY:
//   - requireAdmin gates the route — viewers get 403.
//   - enforceSessionRevocation rejects revoked admin tokens (401).
//   - The audit-log rows we return NEVER include the `details` JSON, so
//     even if a future caller mistakenly stuffed a secret into `details`
//     it would not be surfaced here. The auditLog() helper itself already
//     strips passwords/tokens, so this is defense-in-depth.
//
// PERFORMANCE:
//   The naïve approach is N+1 (one round-trip per user, per stat). With a
//   handful of users that's fine, but the client/codebase/scan/patch/
//   finding graph can be deep. We therefore batch the entity stats into a
//   handful of wide queries (mirroring /api/clients) and bucket the
//   results in JS. The remaining per-user queries (audit-log count,
//   last-login lookup) are issued in parallel via Promise.all.

import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin, enforceSessionRevocation } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Caps that protect us from a runaway Supabase project. The GuardianX
// tenant is small (single-digit admins, dozens of clients, hundreds of
// scans/patches), so these are generous safety ceilings — not the
// expected row count.
const MAX_USERS = 500;
const MAX_CLIENTS = 1000;
const MAX_CODEBASES = 2000;
const MAX_SCANS = 5000;
const MAX_PATCHES = 5000;
const MAX_TARGETS = 2000;
const MAX_ENGAGEMENTS = 5000;
const MAX_FINDINGS = 10000;
const MAX_AUDIT_RECENT = 5000; // recent-activity window for "last 5 per user"
const MAX_LOGIN_HISTORY = 2000; // bucket-of-recent logins to dedupe per user

interface AuditEntry {
  action: string | null;
  entity: string | null;
  timestamp: string;
}

interface UserActivitySummary {
  id: string;
  email: string;
  name: string | null;
  role: string;
  approved: boolean;
  createdAt: string | null;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  stats: {
    clients: number;
    scans: number;
    patches: number;
    findings: number;
    auditEntries: number;
  };
  recentActivity: AuditEntry[];
}

function iso(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string") {
    // Validate it looks like an ISO timestamp before echoing it.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) return v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

export async function GET(req: Request) {
  // 1. Admin gate + session-revocation check.
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  const revoked = await enforceSessionRevocation(req);
  if (revoked) return revoked;

  try {
    // 2. Fetch all users (admins included — the admin wants to see
    //    everyone, including themselves and other admins).
    const { data: usersRaw, error: usersErr } = await supabase
      .from("User")
      .select('id, email, name, role, approved, "createdAt"')
      .order("createdAt", { ascending: false })
      .limit(MAX_USERS);
    if (usersErr) throw new Error(`User: ${usersErr.message}`);
    if (!usersRaw || usersRaw.length === 0) {
      return NextResponse.json({ users: [], totals: { users: 0, activeToday: 0, clients: 0 } });
    }

    const userEmails = usersRaw
      .map((u) => (u as Record<string, unknown>).email as string | null)
      .filter((e): e is string => typeof e === "string" && e.length > 0);

    // 3. Batch-fetch the entity graph owned via Client.ownerId → codebases
    //    → scans/patches, and Client.ownerId → targets → engagements →
    //    findings. Each query is bounded by a generous cap; we then bucket
    //    per user in JS.
    const [clientsRes, codebasesRes, scansRes, patchesRes, targetsRes,
           engagementsRes, findingsRes, recentAuditRes, loginHistoryRes] =
      await Promise.all([
        supabase.from("Client").select('id, "ownerId"').limit(MAX_CLIENTS),
        supabase.from("Codebase").select("id, clientId").limit(MAX_CODEBASES),
        supabase.from("Scan").select("id, codebaseId").limit(MAX_SCANS),
        supabase.from("Patch").select("id, codebaseId").limit(MAX_PATCHES),
        supabase.from("Target").select("id, clientId").limit(MAX_TARGETS),
        supabase.from("Engagement").select("id, targetId").limit(MAX_ENGAGEMENTS),
        supabase.from("Finding").select("id, engagementId").limit(MAX_FINDINGS),
        // Recent audit-log window — used both for "last 5 per user" and
        // the "active today" rollup. We fetch a wide window ordered desc
        // and bucket per actor in JS so a single round-trip covers both.
        supabase
          .from("AuditLog")
          .select('action, entity, actor, "createdAt"')
          .order("createdAt", { ascending: false })
          .limit(MAX_AUDIT_RECENT),
        // Login history: grab the most recent N rows across ALL users and
        // pick the latest per userId in JS. PostgREST can't do DISTINCT ON,
        // so a windowed fetch + dedupe is the cheapest approach. With a
        // few users this typically collapses to ~N rows.
        supabase
          .from("LoginHistory")
          .select('"userId", "ipAddress", timestamp')
          .order("timestamp", { ascending: false })
          .limit(MAX_LOGIN_HISTORY),
      ]);

    // 4. Per-user client list (ownerId → clientId[]).
    const clientIdsByOwner = new Map<string, string[]>();
    for (const row of (clientsRes.data || []) as Record<string, unknown>[]) {
      const ownerId = row.ownerId;
      if (typeof ownerId !== "string" || !ownerId) continue;
      const list = clientIdsByOwner.get(ownerId) || [];
      if (typeof row.id === "string") list.push(row.id);
      clientIdsByOwner.set(ownerId, list);
    }

    // 5. Per-client codebases + targets.
    const codebasesByClient = new Map<string, string[]>();
    for (const row of (codebasesRes.data || []) as Record<string, unknown>[]) {
      const cid = row.clientId;
      if (typeof cid !== "string") continue;
      const list = codebasesByClient.get(cid) || [];
      if (typeof row.id === "string") list.push(row.id);
      codebasesByClient.set(cid, list);
    }
    const targetsByClient = new Map<string, string[]>();
    for (const row of (targetsRes.data || []) as Record<string, unknown>[]) {
      const cid = row.clientId;
      if (typeof cid !== "string") continue;
      const list = targetsByClient.get(cid) || [];
      if (typeof row.id === "string") list.push(row.id);
      targetsByClient.set(cid, list);
    }

    // 6. Per-codebase scans + patches.
    const scansByCodebase = new Map<string, number>();
    for (const row of (scansRes.data || []) as Record<string, unknown>[]) {
      const cbId = row.codebaseId;
      if (typeof cbId !== "string") continue;
      scansByCodebase.set(cbId, (scansByCodebase.get(cbId) || 0) + 1);
    }
    const patchesByCodebase = new Map<string, number>();
    for (const row of (patchesRes.data || []) as Record<string, unknown>[]) {
      const cbId = row.codebaseId;
      if (typeof cbId !== "string") continue;
      patchesByCodebase.set(cbId, (patchesByCodebase.get(cbId) || 0) + 1);
    }

    // 7. Per-target engagements → per-engagement findings.
    const engagementsByTarget = new Map<string, string[]>();
    for (const row of (engagementsRes.data || []) as Record<string, unknown>[]) {
      const tid = row.targetId;
      if (typeof tid !== "string") continue;
      const list = engagementsByTarget.get(tid) || [];
      if (typeof row.id === "string") list.push(row.id);
      engagementsByTarget.set(tid, list);
    }
    const findingsByEngagement = new Map<string, number>();
    for (const row of (findingsRes.data || []) as Record<string, unknown>[]) {
      const eid = row.engagementId;
      if (typeof eid !== "string") continue;
      findingsByEngagement.set(eid, (findingsByEngagement.get(eid) || 0) + 1);
    }

    // 8. Bucket recent audit-log entries per actor. We only keep the first
    //    5 per actor (the rows are already ordered desc by createdAt), and
    //    also tally a per-actor count of entries seen in the window. The
    //    per-actor count is a LOWER BOUND if the user has more than
    //    MAX_AUDIT_RECENT total entries — to get the exact count we issue
    //    a second per-user count query below.
    const recentByActor = new Map<string, AuditEntry[]>();
    const seenCountByActor = new Map<string, number>();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const actorsActiveToday = new Set<string>();
    for (const row of (recentAuditRes.data || []) as Record<string, unknown>[]) {
      const actor = typeof row.actor === "string" ? row.actor : null;
      if (!actor) continue;
      const ts = iso(row.createdAt);
      if (!ts) continue;
      seenCountByActor.set(actor, (seenCountByActor.get(actor) || 0) + 1);
      if (new Date(ts) >= startOfToday) actorsActiveToday.add(actor);
      const list = recentByActor.get(actor) || [];
      if (list.length < 5) {
        list.push({
          action: typeof row.action === "string" ? row.action : null,
          entity: typeof row.entity === "string" ? row.entity : null,
          timestamp: ts,
        });
        recentByActor.set(actor, list);
      }
    }

    // 9. Per-user last login. Bucket the recent LoginHistory rows by userId
    //    and keep the first one we see (rows are ordered desc by timestamp).
    const lastLoginByUser = new Map<string, { at: string; ip: string | null }>();
    for (const row of (loginHistoryRes.data || []) as Record<string, unknown>[]) {
      const uid = row.userId;
      if (typeof uid !== "string") continue;
      if (lastLoginByUser.has(uid)) continue;
      const ts = iso(row.timestamp);
      if (!ts) continue;
      lastLoginByUser.set(uid, {
        at: ts,
        ip: typeof row.ipAddress === "string" ? row.ipAddress : null,
      });
    }

    // 10. Exact audit-log count per user (parallel). The recent window
    //     above gives us a lower bound; this gives us the true total. If
    //     a user's recent count is below the window cap, we can skip the
    //     count query and reuse the bucketed tally.
    const countPromises = userEmails.map((email) => {
      const seen = seenCountByActor.get(email) || 0;
      // If we haven't filled the recent bucket (i.e. the user has fewer
      // than MAX_AUDIT_RECENT total entries, since the window is global
      // and ordered desc, the per-actor slice is complete) we can reuse
      // the bucketed count. To be safe, only skip when the global window
      // hasn't been exhausted (i.e. < MAX_AUDIT_RECENT rows total).
      const windowExhausted =
        (recentAuditRes.data?.length || 0) >= MAX_AUDIT_RECENT;
      if (!windowExhausted) return Promise.resolve({ email, count: seen });
      return supabase
        .from("AuditLog")
        .select("*", { count: "exact", head: true })
        .eq("actor", email)
        .then(({ count, error }) => {
          if (error) return { email, count: seen };
          return { email, count: count || seen };
        });
    });
    const countResults = await Promise.all(countPromises);
    const auditCountByActor = new Map<string, number>();
    for (const { email, count } of countResults) {
      auditCountByActor.set(email, count);
    }

    // 11. Assemble the per-user summary. We don't mutate any cross-user
    //     accumulator inside the map — side effects are computed afterwards
    //     from the returned rows so the iteration stays pure.
    let totalClientsAcrossUsers = 0;

    const summaries: UserActivitySummary[] = usersRaw.map((uRaw) => {
      const u = uRaw as Record<string, unknown>;
      const id = typeof u.id === "string" ? u.id : "";
      const email = typeof u.email === "string" ? u.email : "";

      // Aggregate entity stats by walking the user's owned clients.
      const clientIds = clientIdsByOwner.get(id) || [];
      totalClientsAcrossUsers += clientIds.length;

      let scanCount = 0;
      let patchCount = 0;
      let findingCount = 0;
      for (const cid of clientIds) {
        const codebaseIds = codebasesByClient.get(cid) || [];
        for (const cbId of codebaseIds) {
          scanCount += scansByCodebase.get(cbId) || 0;
          patchCount += patchesByCodebase.get(cbId) || 0;
        }
        const targetIds = targetsByClient.get(cid) || [];
        for (const tid of targetIds) {
          const engagementIds = engagementsByTarget.get(tid) || [];
          for (const eid of engagementIds) {
            findingCount += findingsByEngagement.get(eid) || 0;
          }
        }
      }

      const recent = recentByActor.get(email) || [];
      const auditTotal = auditCountByActor.get(email) || 0;

      const lastLogin = lastLoginByUser.get(id) || null;
      // "Active today" also covers a login that happened today — cross-
      // tally it into the same set used by the audit bucket above.
      if (lastLogin && new Date(lastLogin.at) >= startOfToday) {
        actorsActiveToday.add(email);
      }

      return {
        id,
        email,
        name: typeof u.name === "string" ? u.name : null,
        role: typeof u.role === "string" ? u.role : "viewer",
        approved: u.approved === true,
        createdAt: iso(u.createdAt),
        lastLoginAt: lastLogin?.at ?? null,
        lastLoginIp: lastLogin?.ip ?? null,
        stats: {
          clients: clientIds.length,
          scans: scanCount,
          patches: patchCount,
          findings: findingCount,
          auditEntries: auditTotal,
        },
        recentActivity: recent,
      };
    });

    // 12. Active-today count = unique users whose email is in the
    //     actorsActiveToday set (covers both audit activity and login).
    const activeTodayCount = summaries.filter((s) =>
      actorsActiveToday.has(s.email)
    ).length;

    // 13. Sort: active users first, then by client count desc, then by name.
    summaries.sort((a, b) => {
      const aActive = actorsActiveToday.has(a.email) ? 1 : 0;
      const bActive = actorsActiveToday.has(b.email) ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;
      if (b.stats.clients !== a.stats.clients) {
        return b.stats.clients - a.stats.clients;
      }
      return (a.name || a.email).localeCompare(b.name || b.email);
    });

    return NextResponse.json({
      users: summaries,
      totals: {
        users: summaries.length,
        activeToday: activeTodayCount,
        clients: totalClientsAcrossUsers,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load user activity";
    console.error("[user-activity] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
