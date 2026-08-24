import { NextResponse } from "next/server";
import { db, supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  approved: boolean;
  createdAt: string;
  twofaEnabled?: boolean;
}

interface AuditRow {
  id: string;
  action: string;
  entity: string | null;
  actor: string;
  details: string | null;
  createdAt: string;
}

// GET /api/admin/user-activity — admin-only activity monitor.
// Returns { summary, users[] } where each user has its last login +
// last activity + their 5 most-recent audit entries.
export async function GET(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const includeAudit = url.searchParams.get("audit") !== "0";

  try {
    // ── Fetch all users (raw supabase — we want a denormalized projection) ──
    const { data: usersRaw, error: usersErr } = await supabase
      .from("User")
      .select('id, email, name, role, approved, "createdAt", "twofaEnabled"')
      .order("createdAt", { ascending: false });
    if (usersErr) throw new Error(usersErr.message);
    const users = (usersRaw || []) as unknown as UserRow[];

    // ── Pull a wide audit-log slice so we can fan it out per user ──
    let auditByActor: Record<string, AuditRow[]> = {};
    let lastActivityByActor: Record<string, string> = {};
    let lastLoginByActor: Record<string, string> = {};
    if (includeAudit) {
      const { data: auditRaw } = await supabase
        .from("AuditLog")
        .select('id, action, entity, actor, details, "createdAt"')
        .order("createdAt", { ascending: false })
        .limit(2000);
      const audit = (auditRaw || []) as unknown as AuditRow[];

      // Bucket audit rows by actor (email-shaped actor matches the user email).
      for (const row of audit) {
        const actor = (row.actor || "").toLowerCase();
        if (!actor || actor === "system") continue;
        (auditByActor[actor] ||= []).push(row);
        if (!lastActivityByActor[actor]) {
          lastActivityByActor[actor] = row.createdAt;
        }
        if (!lastLoginByActor[actor] && /login|auth/i.test(row.action)) {
          lastLoginByActor[actor] = row.createdAt;
        }
      }
    }

    // ── Per-user client count ──
    // Client has no ownerId column, so we approximate via the audit log:
    // "client.create" events attributed to the user's email.
    const clientCountByActor: Record<string, number> = {};
    for (const [actor, rows] of Object.entries(auditByActor)) {
      clientCountByActor[actor] = rows.filter((r) =>
        /create/i.test(r.action) && /client/i.test(r.entity || "")
      ).length;
    }

    // ── Total clients + scans for the summary tiles ──
    const [totalClients, totalScans] = await Promise.all([
      db.client.count({}),
      db.scan.count({}),
    ]);

    // ── "Active today" = users whose lastActivity is within the last 24h ──
    const now = Date.now();
    let activeToday = 0;
    for (const u of users) {
      const last = lastActivityByActor[u.email.toLowerCase()];
      if (last && now - new Date(last).getTime() < 24 * 60 * 60 * 1000) {
        activeToday++;
      }
    }

    const payload = users.map((u) => {
      const key = u.email.toLowerCase();
      const audit = (auditByActor[key] || []).slice(0, 5).map((r) => ({
        id: r.id,
        action: r.action,
        entity: r.entity,
        details: r.details ? safeParse(r.details) : null,
        timestamp: r.createdAt,
      }));
      return {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        approved: u.approved,
        twofaEnabled: u.twofaEnabled === true,
        clients: clientCountByActor[key] || 0,
        lastLogin: lastLoginByActor[key] || null,
        lastActivity: lastActivityByActor[key] || null,
        audit,
      };
    });

    return NextResponse.json({
      summary: {
        totalUsers: users.length,
        activeToday,
        totalClients,
        totalScans,
        admins: users.filter((u) => u.role === "admin").length,
        twoFactorEnabled: users.filter((u) => u.twofaEnabled === true).length,
      },
      users: payload,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load user activity" },
      { status: 500 }
    );
  }
}

function safeParse(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}
