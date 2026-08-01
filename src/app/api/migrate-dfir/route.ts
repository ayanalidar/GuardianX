import { NextResponse } from "next/server";
import { execSql } from "@/lib/db";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// POST /api/migrate-dfir — creates DFIR tables (Incident, IncidentEvent, IOC, Evidence, Playbook)
// Public endpoint (no auth) for one-time migration. Safe to call multiple times (uses IF NOT EXISTS).
export async function POST() {
  try {
    const sqlPath = path.join(process.cwd(), "supabase", "migrations", "0006_dfir_tables.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    await execSql(sql);

    // Verify tables exist
    const verifySql = `
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name IN ('Incident','IncidentEvent','IOC','Evidence','Playbook')
    `;
    const result = await execSql(verifySql);

    return NextResponse.json({
      ok: true,
      message: "DFIR tables created successfully",
      tables: result,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : JSON.stringify(err);
    return NextResponse.json(
      { ok: false, error, raw: String(err) },
      { status: 500 }
    );
  }
}
