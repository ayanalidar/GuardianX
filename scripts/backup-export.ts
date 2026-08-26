/**
 * GuardianX — per-table JSON backup via Supabase REST API.
 *
 * Task: #17-backup-restore
 *
 * What this does
 * --------------
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from the environment, walks
 * the canonical list of 35 GuardianX tables, fetches every row (paginated
 * 1000 at a time via the PostgREST range header), and writes each table to
 * `backups/<YYYY-MM-DD_HH-MM-SS>/<Table>.json`. A `_manifest.json` file is
 * written alongside with the per-table row counts + run metadata.
 *
 * Why REST and not pg_dump?
 * -------------------------
 * `pg_dump` requires the direct Postgres connection (not the Supabase pooler)
 * and a local `pg_dump` install matching the server's major version. The
 * REST API works from anywhere with HTTPS + the service-role key — including
 * CI runners, serverless functions, and operators' laptops without Postgres
 * tooling installed. Use this as a portable, file-based complement to
 * Supabase's managed snapshots; see docs/BACKUP-RESTORE.md for the full
 * strategy.
 *
 * Limitations
 * -----------
 * - Data only — schema is NOT included. To restore, first run
 *   `bun run db:push` (or POST /api/db-init) to recreate the schema, then
 *   re-insert rows from the JSON files.
 * - No FK ordering is enforced on restore; insert parents before children.
 * - RLS-protected tables (LoginHistory) are still readable because the
 *   service_role key bypasses RLS.
 *
 * Usage
 * -----
 *   bun run backup
 *   # or directly:
 *   bun run scripts/backup-export.ts
 *
 * Exit codes
 * ----------
 *   0  all tables exported (or skipped-as-missing with warnings)
 *   1  env vars missing, or no tables could be exported at all
 *   2  unexpected error mid-run (partial backup left on disk)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// ── Canonical table list (must match prisma/schema.prisma + db-init) ─────────
// Order: parents before children, so a future restore-from-JSON helper can
// iterate the manifest top-to-bottom without tripping FK constraints.
const TABLES: string[] = [
  // Auth / users
  "User",
  "PasswordReset",
  "EmailVerification",
  "LoginHistory",
  // Orgs
  "Organization",
  "TeamMember",
  // Clients + codebases
  "Client",
  "Codebase",
  "Scan",
  "PipelineEvent",
  "Patch",
  "ChatMessage",
  "Attestation",
  // Credentials
  "Credential",
  "CredentialAudit",
  // Targets + engagements
  "Target",
  "Engagement",
  "Finding",
  "RedAgentEvent",
  // Deception + access logs
  "Canary",
  "ApiAccessLog",
  "HoneypotHit",
  // Integrations + automation
  "WebhookConfig",
  "ScheduledScan",
  "AlertRule",
  "Integration",
  "AttackChain",
  "FuzzResult",
  // Audit
  "AuditLog",
  // DFIR
  "Incident",
  "IncidentEvent",
  "IOC",
  "Evidence",
  "Playbook",
  // Email
  "EmailLog",
];

// ── Page size for pagination (PostgREST max is 1000) ─────────────────────────
const PAGE_SIZE = 1000;

// ── Helpers ─────────────────────────────────────────────────────────────────

function timestamp(): string {
  // YYYY-MM-DD_HH-MM-SS in local time. Intentionally not UTC so the dir name
  // sorts intuitively for the operator running it. UTC offset is recorded in
  // the manifest for traceability.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
  );
}

function fmtCount(n: number): string {
  return n.toLocaleString("en-US").padStart(8, " ");
}

interface TableResult {
  table: string;
  rowCount: number;
  pages: number;
  bytes: number;
  status: "ok" | "skipped" | "error";
  message?: string;
}

/**
 * Fetch all rows for a single table, paginating 1000 at a time via the
 * PostgREST `Range` header (Supabase JS client exposes this as `.range(from, to)`).
 *
 * Returns the full row array. Throws on any non-recoverable error. A missing
 * table (PostgREST returns 404 / "relation does not exist") is treated as a
 * soft-skip and returns `null` so the caller can warn + continue.
 */
async function fetchAllRows(
  supabase: SupabaseClient,
  table: string
): Promise<{ rows: unknown[] | null; error?: string }> {
  const allRows: unknown[] = [];
  let page = 0;

  // First page — also detects "table doesn't exist" via schema error.
  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await supabase
      .from(table)
      .select("*", { count: "exact" })
      .range(from, to);

    if (error) {
      // PostgREST returns code "PGRST205" / "42P01" when the relation doesn't
      // exist. Match on either the code or the message text for resilience
      // across Supabase versions.
      const msg = error.message || "";
      const code = (error as { code?: string }).code || "";
      const isMissing =
        code === "PGRST205" ||
        code === "42P01" ||
        /relation .* does not exist/i.test(msg) ||
        /schema .* does not exist/i.test(msg) ||
        /Could not find the table/i.test(msg);

      if (isMissing && page === 0) {
        // Soft-skip: table doesn't exist yet (fresh install, or DFIR not
        // migrated). Not an error — warn and move on.
        return { rows: null, error: `table missing: ${msg}` };
      }
      // Any other error, or an error on a non-first page, is a real failure.
      return { rows: null, error: `${code || "ERR"}: ${msg}` };
    }

    if (!data || data.length === 0) {
      // Empty page — done. (count may still be non-null if the table has 0
      // rows total; that's fine, we just return what we have.)
      break;
    }

    allRows.push(...data);

    // If we got fewer than PAGE_SIZE rows, this was the last page.
    if (data.length < PAGE_SIZE) break;

    // Safety valve: if `count` is provided and we've already fetched it all,
    // stop. Prevents an infinite loop if a table has exactly N*PAGE_SIZE rows
    // and PostgREST returns an empty final page that we'd otherwise re-request.
    if (typeof count === "number" && allRows.length >= count) break;

    page += 1;

    // Hard cap: 10k pages = 10M rows. If a single GuardianX table ever exceeds
    // this, you want to know about it explicitly rather than have the backup
    // script quietly spin for hours.
    if (page > 10_000) {
      return {
        rows: null,
        error: `row cap exceeded (>10M rows) — aborting ${table}`,
      };
    }
  }

  return { rows: allRows };
}

async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<number> {
  const startedAt = new Date();
  const ts = timestamp();

  // ── 1. Validate env ──────────────────────────────────────────────────────
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "[FATAL] Missing env vars. Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY before running."
    );
    console.error("  Example:");
    console.error("    SUPABASE_URL=https://xxx.supabase.co \\");
    console.error("    SUPABASE_SERVICE_ROLE_KEY=ey... \\");
    console.error("    bun run backup");
    return 1;
  }

  // ── 2. Set up Supabase client (own instance — do NOT import @/lib/db, which
  //         pulls in the Next.js runtime and would break a bare `bun run`) ───
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 3. Prepare output dir ────────────────────────────────────────────────
  const repoRoot = resolve(import.meta.dir, "..");
  const backupRoot = join(repoRoot, "backups");
  const outDir = join(backupRoot, ts);
  await ensureDir(outDir);

  console.log("━".repeat(72));
  console.log("GuardianX backup-export");
  console.log("━".repeat(72));
  console.log(`  Endpoint   : ${supabaseUrl}`);
  console.log(`  Output dir : ${outDir}`);
  console.log(`  Tables     : ${TABLES.length} planned`);
  console.log(`  Started    : ${startedAt.toISOString()}`);
  console.log("━".repeat(72));

  // ── 4. Walk every table ──────────────────────────────────────────────────
  const results: TableResult[] = [];
  let okCount = 0;
  let skipCount = 0;
  let errCount = 0;
  let totalRows = 0;
  let totalBytes = 0;

  for (const table of TABLES) {
    process.stdout.write(`  → ${table.padEnd(20)} `);
    const t0 = Date.now();

    try {
      const { rows, error } = await fetchAllRows(supabase, table);

      if (rows === null) {
        // Soft-skip (missing) or hard error.
        const isMissing = error?.startsWith("table missing:");
        const status: TableResult["status"] = isMissing ? "skipped" : "error";
        results.push({
          table,
          rowCount: 0,
          pages: 0,
          bytes: 0,
          status,
          message: error,
        });
        if (isMissing) {
          skipCount += 1;
          console.log("SKIP   (table does not exist yet)");
        } else {
          errCount += 1;
          console.log(`ERROR  ${error}`);
        }
        continue;
      }

      // Write the JSON file. Pretty-printed for git-diff friendliness on small
      // tables; for large tables the size overhead is negligible compared to
      // the data itself and is worth the debuggability.
      const json = JSON.stringify(rows, null, 2);
      const bytes = Buffer.byteLength(json, "utf8");
      const filePath = join(outDir, `${table}.json`);
      await writeFile(filePath, json, "utf8");

      const pages = Math.ceil(rows.length / PAGE_SIZE);
      const elapsed = Date.now() - t0;
      results.push({
        table,
        rowCount: rows.length,
        pages,
        bytes,
        status: "ok",
      });
      okCount += 1;
      totalRows += rows.length;
      totalBytes += bytes;
      console.log(
        `OK     ${fmtCount(rows.length)} rows  ` +
          `${(bytes / 1024).toFixed(1).padStart(8, " ")} KB  ` +
          `${pages} page(s)  ${elapsed}ms`
      );
    } catch (err) {
      // Defensive: fetchAllRows already catches supabase errors, but a
      // filesystem write error or other unexpected throw shouldn't kill the
      // whole run.
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        table,
        rowCount: 0,
        pages: 0,
        bytes: 0,
        status: "error",
        message: msg,
      });
      errCount += 1;
      console.log(`ERROR  ${msg}`);
    }
  }

  // ── 5. Write manifest ────────────────────────────────────────────────────
  const finishedAt = new Date();
  const manifest = {
    schemaVersion: 1,
    tool: "scripts/backup-export.ts",
    taskId: "#17-backup-restore",
    supabaseUrl,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    outputDir: outDir,
    pagination: { pageSize: PAGE_SIZE },
    summary: {
      tablesPlanned: TABLES.length,
      tablesOk: okCount,
      tablesSkipped: skipCount,
      tablesErrored: errCount,
      totalRows,
      totalBytes,
      totalKb: Math.round(totalBytes / 1024),
    },
    tables: results.map((r) => ({
      table: r.table,
      rowCount: r.rowCount,
      pages: r.pages,
      bytes: r.bytes,
      status: r.status,
      ...(r.message ? { message: r.message } : {}),
    })),
  };

  const manifestPath = join(outDir, "_manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  // ── 6. Final summary ─────────────────────────────────────────────────────
  console.log("━".repeat(72));
  console.log("  SUMMARY");
  console.log("━".repeat(72));
  console.log(`  Tables OK        : ${okCount}`);
  console.log(`  Tables skipped   : ${skipCount}  (do not exist yet)`);
  console.log(`  Tables errored   : ${errCount}`);
  console.log(`  Total rows       : ${totalRows.toLocaleString("en-US")}`);
  console.log(`  Total size       : ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Manifest         : ${manifestPath}`);
  console.log(`  Duration         : ${finishedAt.getTime() - startedAt.getTime()} ms`);
  console.log("━".repeat(72));

  if (errCount > 0) {
    console.log("");
    console.log("  ⚠  Some tables failed. See _manifest.json for details.");
    console.log("     The successful tables are still saved on disk.");
  }
  if (okCount === 0) {
    console.error("");
    console.error("  ✖  No tables could be exported. Check SUPABASE_URL + key, and");
    console.error("     confirm the database has been initialised (POST /api/db-init).");
    return 1;
  }

  // Exit 0 if everything is OK or only soft-skipped. Exit 2 if any hard errors.
  return errCount > 0 ? 2 : 0;
}

// Bun + Node both support top-level await in ESM. Wrap in main() so we can
// return a meaningful exit code.
main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[FATAL] Unexpected error:", err);
    process.exit(2);
  });
