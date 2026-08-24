import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/user/export-data, DPDPA § 10 (Right to Access Information)
//
// Returns ALL data GuardianX holds about the currently-authenticated user
// as a downloadable JSON document. This fulfils the Data Principal's right
// to obtain a copy of their personal data, the purposes of processing, and
// the identities of any recipients to whom the data has been disclosed.
//
// Output:
//   - profile: the User record (password hash redacted)
//   - clients: clients registered with the user's contactEmail
//   - codebases: all codebases linked to those clients
//   - scans: all scans run against those codebases
//   - patches: all patches generated for those codebases
//   - findings: all findings discovered in engagements on the user's targets
//   - attestations: SHA-256 patch attestation chain
//   - audit_logs: any audit-log entries where the user is the actor
//   - login_history: derived from audit_logs where action starts with "auth."
//                     (GuardianX does not currently maintain a dedicated
//                     login-history table; the audit log is the source of truth)
//
// Response Content-Disposition is set to attachment so browsers download
// the JSON file rather than rendering it inline.

interface ExportShape {
  exported_at: string;
  exported_by: string;
  dpdpa_section: string;
  profile: Record<string, unknown> | null;
  clients: Record<string, unknown>[];
  codebases: Record<string, unknown>[];
  scans: Record<string, unknown>[];
  patches: Record<string, unknown>[];
  findings: Record<string, unknown>[];
  engagements: Record<string, unknown>[];
  targets: Record<string, unknown>[];
  attestations: Record<string, unknown>[];
  audit_logs: Record<string, unknown>[];
  login_history: Record<string, unknown>[];
  summary: Record<string, number>;
}

export async function GET(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;

  const userId = auth.user.userId;
  const userEmail = auth.user.email;

  try {
    const exportedAt = new Date().toISOString();
    const exportData: ExportShape = {
      exported_at: exportedAt,
      exported_by: userEmail,
      dpdpa_section: "DPDPA § 10 — Right to Access Information",
      profile: null,
      clients: [],
      codebases: [],
      scans: [],
      patches: [],
      findings: [],
      engagements: [],
      targets: [],
      attestations: [],
      audit_logs: [],
      login_history: [],
      summary: {},
    };

    // ── 1. Profile ────────────────────────────────────────────────────────
    const { data: profile, error: profileErr } = await supabase
      .from("User")
      .select("id, email, name, role, avatar, approved, twofaEnabled, createdAt, updatedAt, tokenVersion")
      .eq("id", userId)
      .maybeSingle();

    if (profileErr) throw new Error(profileErr.message);
    // Redact password hash (we never expose it, even on export).
    exportData.profile = profile
      ? {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: profile.role,
          avatar: profile.avatar,
          approved: profile.approved,
          twofa_enabled: profile.twofaEnabled,
          created_at: profile.createdAt,
          updated_at: profile.updatedAt,
          // Excluded by design: password, twofaSecret, backupCodes
        }
      : null;

    // ── 2. Clients (matched by contactEmail — the user-ownership link) ──
    const { data: clients, error: clientsErr } = await supabase
      .from("Client")
      .select("*")
      .eq("contactEmail", userEmail);

    if (clientsErr) throw new Error(clientsErr.message);
    const clientIds = (clients || []).map((c: Record<string, unknown>) => c.id as string);
    exportData.clients = (clients || []) as Record<string, unknown>[];

    // ── 3. Codebases linked to those clients ──────────────────────────────
    let codebaseIds: string[] = [];
    if (clientIds.length > 0) {
      const { data: codebases, error: cbErr } = await supabase
        .from("Codebase")
        .select("id, name, language, description, clientId, createdAt, updatedAt")
        .in("clientId", clientIds);
      if (cbErr) throw new Error(cbErr.message);
      exportData.codebases = (codebases || []) as Record<string, unknown>[];
      codebaseIds = (codebases || []).map((c: Record<string, unknown>) => c.id as string);
    }

    // ── 4. Scans linked to those codebases ────────────────────────────────
    let scanIds: string[] = [];
    if (codebaseIds.length > 0) {
      const { data: scans, error: scanErr } = await supabase
        .from("Scan")
        .select("id, codebaseId, status, stageLabel, startedAt, completedAt")
        .in("codebaseId", codebaseIds);
      if (scanErr) throw new Error(scanErr.message);
      exportData.scans = (scans || []).map((s: Record<string, unknown>) => ({
        ...s,
        // Normalize dates for downstream JSON consumers
        startedAt: s.startedAt,
        completedAt: s.completedAt,
      })) as Record<string, unknown>[];
      scanIds = (scans || []).map((s: Record<string, unknown>) => s.id as string);
    }

    // ── 5. Patches linked to those codebases ─────────────────────────────
    if (codebaseIds.length > 0) {
      const { data: patches, error: patchErr } = await supabase
        .from("Patch")
        .select("id, patchId, codebaseId, scanId, title, severity, cve, affectedFile, aiExplanation, status, sandboxPassed, adversarialWon, confidence, createdAt, approvedAt")
        .in("codebaseId", codebaseIds);
      if (patchErr) throw new Error(patchErr.message);
      exportData.patches = (patches || []) as Record<string, unknown>[];
    }

    // ── 6. Targets linked to those clients ───────────────────────────────
    let targetIds: string[] = [];
    if (clientIds.length > 0) {
      const { data: targets, error: tErr } = await supabase
        .from("Target")
        .select("id, name, baseUrl, authorized, clientId, createdAt")
        .in("clientId", clientIds);
      if (tErr) throw new Error(tErr.message);
      exportData.targets = (targets || []) as Record<string, unknown>[];
      targetIds = (targets || []).map((t: Record<string, unknown>) => t.id as string);
    }

    // ── 7. Engagements + Findings linked to those targets ────────────────
    let engagementIds: string[] = [];
    if (targetIds.length > 0) {
      const { data: engs, error: engErr } = await supabase
        .from("Engagement")
        .select("id, targetId, status, stageLabel, crawlSummary, startedAt, completedAt")
        .in("targetId", targetIds);
      if (engErr) throw new Error(engErr.message);
      exportData.engagements = (engs || []) as Record<string, unknown>[];
      engagementIds = (engs || []).map((e: Record<string, unknown>) => e.id as string);
    }

    if (engagementIds.length > 0) {
      const { data: findings, error: fErr } = await supabase
        .from("Finding")
        .select("id, engagementId, title, severity, category, owasp, endpoint, method, description, confidence, createdAt")
        .in("engagementId", engagementIds);
      if (fErr) throw new Error(fErr.message);
      exportData.findings = (findings || []) as Record<string, unknown>[];
    }

    // ── 8. Attestations linked to those patches ──────────────────────────
    if (codebaseIds.length > 0) {
      // Attestations reference patches via patchId (the *string* patch ID,
      // not the row id) — we resolve via join through the Patch table.
      const { data: patchIdsRows } = await supabase
        .from("Patch")
        .select("patchId")
        .in("codebaseId", codebaseIds);
      const patchIdStrings = (patchIdsRows || []).map(
        (p: Record<string, unknown>) => p.patchId as string
      );
      if (patchIdStrings.length > 0) {
        const { data: atts, error: attErr } = await supabase
          .from("Attestation")
          .select("patchId, prevHash, hash, createdAt")
          .in("patchId", patchIdStrings);
        if (attErr) throw new Error(attErr.message);
        exportData.attestations = (atts || []) as Record<string, unknown>[];
      }
    }

    // ── 9. Audit logs + login history (filtered by actor = user's email) ─
    const { data: logs, error: logErr } = await supabase
      .from("AuditLog")
      .select("id, action, entity, actor, details, createdAt")
      .eq("actor", userEmail)
      .order("createdAt", { ascending: false })
      .limit(1000);
    if (logErr) throw new Error(logErr.message);
    exportData.audit_logs = (logs || []) as Record<string, unknown>[];

    // Login history: subset of audit logs whose action relates to auth events.
    exportData.login_history = (logs || []).filter((l: Record<string, unknown>) => {
      const action = (l.action as string) || "";
      return (
        action.startsWith("auth.") ||
        action.startsWith("user.") ||
        action.includes("login") ||
        action.includes("logout") ||
        action.includes("session")
      );
    }) as Record<string, unknown>[];

    // ── 10. Summary ──────────────────────────────────────────────────────
    exportData.summary = {
      clients: exportData.clients.length,
      codebases: exportData.codebases.length,
      scans: exportData.scans.length,
      patches: exportData.patches.length,
      findings: exportData.findings.length,
      engagements: exportData.engagements.length,
      targets: exportData.targets.length,
      attestations: exportData.attestations.length,
      audit_logs: exportData.audit_logs.length,
      login_history: exportData.login_history.length,
    };

    // ── 11. Return as downloadable JSON ──────────────────────────────────
    const filename = `guardianx-data-export-${userId}-${Date.now()}.json`;
    const json = JSON.stringify(exportData, null, 2);

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    console.error("[export-data] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to export user data" },
      { status: 500 }
    );
  }
}
