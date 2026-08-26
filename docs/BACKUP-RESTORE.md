# GuardianX — Backup & Restore Runbook

**Task ID:** #17-backup-restore
**Audience:** GuardianX operators / DevOps / on-call engineers
**Scope:** Supabase (PostgreSQL) database, env config, application code

This runbook covers every supported way to back up GuardianX data, restore it after a failure, and walk through the four canonical disaster-recovery scenarios. **Read it before you need it** — the worst time to learn `pg_restore` is during an outage.

---

## Table of contents

1. [What to back up](#1-what-to-back-up)
2. [Backup methods](#2-backup-methods)
   - 2.1 [Supabase dashboard backup (managed)](#21-supabase-dashboard-backup-managed)
   - 2.2 [Manual SQL dump via `pg_dump`](#22-manual-sql-dump-via-pg_dump)
   - 2.3 [Per-table CSV / JSON export via REST API](#23-per-table-csv--json-export-via-rest-api)
   - 2.4 [Environment file backup](#24-environment-file-backup)
3. [Backup frequency & retention](#3-backup-frequency--retention)
4. [Restore methods](#4-restore-methods)
   - 4.1 [Full restore from Supabase backup](#41-full-restore-from-supabase-backup)
   - 4.2 [Restore from SQL dump](#42-restore-from-sql-dump)
   - 4.3 [Selective / per-table restore](#43-selective--per-table-restore)
   - 4.4 [Post-restore steps](#44-post-restore-steps)
5. [Disaster recovery scenarios](#5-disaster-recovery-scenarios)
6. [Verification checklist](#6-verification-checklist)
7. [Appendix: env vars + file layout](#7-appendix-env-vars--file-layout)

---

## 1. What to back up

GuardianX persists **all** state in a single Supabase/Postgres database. There is no on-disk file storage that matters (uploaded evidence is hashed + recorded as a `storagePath` string in the `Evidence` table; the bytes themselves are customer-managed). The complete set of tables to back up is:

| # | Table | Purpose |
|---|-------|---------|
| 1 | `User` | Accounts (incl. password hash, 2FA secret, `tokenVersion`) |
| 2 | `Client` | Top-level engagement entity |
| 3 | `Codebase` | Source code submitted for SAST scanning |
| 4 | `Scan` | Codebase scan runs |
| 5 | `Patch` | AI-generated patches + adversarial results |
| 6 | `PipelineEvent` | Per-scan pipeline event log |
| 7 | `ChatMessage` | Patch co-pilot chat threads |
| 8 | `Credential` | Encrypted third-party credentials (AES-GCM ciphertext) |
| 9 | `CredentialAudit` | Access audit trail for credentials |
| 10 | `Target` | Live web targets for red-agent testing |
| 11 | `Engagement` | DAST/red-agent engagement runs |
| 12 | `Finding` | DAST findings |
| 13 | `RedAgentEvent` | Per-engagement event log |
| 14 | `Attestation` | Cryptographic patch attestations (hash chain) |
| 15 | `Canary` | Canary tokens injected into targets |
| 16 | `ApiAccessLog` | Per-target API access logs |
| 17 | `HoneypotHit` | Honeypot endpoint hit log |
| 18 | `WebhookConfig` | Outbound webhook integrations |
| 19 | `ScheduledScan` | Cron-style scheduled scans |
| 20 | `AlertRule` | Alert rules + channels |
| 21 | `AuditLog` | Global audit log (sensitive-action trail) |
| 22 | `Organization` | Multi-tenant organizations |
| 23 | `TeamMember` | Org membership |
| 24 | `AttackChain` | Linked-finding attack chains |
| 25 | `Integration` | Third-party integrations (Slack, Jira, …) |
| 26 | `FuzzResult` | Fuzzer result summaries |
| 27 | `Incident` | DFIR incident records |
| 28 | `IncidentEvent` | DFIR incident timeline events |
| 29 | `IOC` | Indicators of compromise |
| 30 | `Evidence` | Incident evidence (sha256, chain of custody) |
| 31 | `Playbook` | IR playbooks |
| 32 | `PasswordReset` | One-time password-reset tokens |
| 33 | `EmailVerification` | One-time email-verification tokens |
| 34 | `LoginHistory` | Per-user login attempt history (RLS-protected) |
| 35 | `EmailLog` | Outbound email delivery log (sent/failed) |

In addition to the **data**, you also need:

- **Schema**: defined in `prisma/schema.prisma` and materialised in SQL by `src/app/api/db-init/route.ts` (and the files under `supabase/migrations/`).
- **Application code**: lives in GitHub. Make sure you can reclone.
- **Environment file**: `.env` / `.env.local` — see [§2.4](#24-environment-file-backup).

> **Note on LoginHistory RLS:** `LoginHistory` is the only table with RLS enabled (defense-in-depth for the case where the anon key ever leaks to the client). When restoring via `pg_restore` or SQL dump, RLS policies are restored automatically. When restoring via the Supabase dashboard "restore to project" flow, RLS is also preserved.

---

## 2. Backup methods

GuardianX supports three independent, redundant backup paths. **Use at least two of them** — a single backup is a single point of failure.

### 2.1 Supabase dashboard backup (managed)

Supabase Pro and above take automatic daily snapshots of your Postgres cluster and retain them for 7 days (Pro) / 30 days (Team / Enterprise). You can also trigger a manual backup at any time.

**To trigger a manual backup:**

1. Log in to <https://supabase.com/dashboard>.
2. Select your GuardianX project (e.g. `ekjsieovspkuqdjhxwct`).
3. In the left sidebar, click **Database** → **Backups**.
4. Click the **Backups** tab (not "PITR" unless you have it enabled).
5. Click **Create new backup** (or "Take a snapshot" on some UI versions).
6. Give it a label like `guardianx-pre-schema-change-YYYYMMDD`.
7. Wait for the status to flip to **Completed**. The snapshot now appears in the list and can be restored from in one click.

**To enable / verify the daily schedule:**

- Pro plan and above: daily automatic backups are on by default. Verify under Database → Backups → "Backups" that the most recent automated snapshot is < 24 h old.
- Free plan: **no automatic backups**. Upgrade to Pro, or run the manual `pg_dump` / REST-export below on a cron.

**PITR (Point-In-Time Recovery):**

- Available on Team plan and above.
- Lets you restore to any second within the retention window.
- Enable under Database → Backups → "PITR".
- This is the gold standard for "someone ran a bad `DELETE` 10 minutes ago".

### 2.2 Manual SQL dump via `pg_dump`

Use this when you want a portable, file-based backup that doesn't depend on Supabase's managed snapshot system.

**Prerequisites:**

- The Supabase **database password** (set when the project was created; resettable under Project Settings → Database → Database password).
- Your Supabase **Project Ref** — visible in the dashboard URL: `https://supabase.com/dashboard/project/<PROJECT_REF>`.
- `pg_dump` installed locally (`brew install postgresql`, `apt install postgresql-client`, etc.). **The `pg_dump` major version must match (or be newer than) the Postgres version Supabase is running** — check Database → Infrastructure in the dashboard. As of writing, Supabase runs Postgres 15.

**Command — full custom-format dump:**

```bash
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  -F c \
  -f guardianx-backup-$(date +%Y%m%d).dump
```

- `-F c` → custom format (compressed, supports parallel + selective restore via `pg_restore`).
- The connection URL points at the **direct connection** (`db.[ref].supabase.co:5432`), **not** the connection pooler.

> **⚠️ Connection pooler caveat.** Supabase's connection pooler (`aws-0-[region].pooler.supabase.com:6543`) uses PgBouncer in *transaction* mode, which breaks `pg_dump`'s session-level state. **You MUST use the direct connection URL above**, *not* the pooler URL, or `pg_dump` will fail with `prepared statement "S_1" does not exist` or similar. The direct host is shown under Project Settings → Database → "Connection string" → "URI" (the one with port `5432`, not `6543`).

**Alternative — plain SQL dump (human-readable, restore via `psql`):**

```bash
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  --no-owner --no-privileges \
  -f guardianx-backup-$(date +%Y%m%d).sql
```

**Alternative — Supabase SQL Editor (no `pg_dump` install required):**

If you don't have `pg_dump` locally or the direct port is firewalled, you can run a schema+data export from the dashboard:

1. Supabase Dashboard → SQL Editor → New Query.
2. Run the following to get a textual SQL dump:

   ```sql
   -- Tables + schema (DDL)
   SELECT pg_get_tabledef(format('%I', table_schema), format('%I', table_name), true)
   FROM information_schema.tables
   WHERE table_schema = 'public';
   ```

   (Supabase exposes `pg_get_tabledef` as a helper. If unavailable, fall back to the standard `\d` output or use `pg_dump`.)

3. For data, run `COPY (SELECT * FROM "User") TO STDOUT WITH CSV HEADER;` per table and save each output.

This is more tedious than `pg_dump` and **loses constraints/indexes if you only do the `COPY` step**. Prefer `pg_dump` whenever possible.

**Compress + encrypt the dump (recommended for off-site storage):**

```bash
gpg --symmetric --cipher-algo AES256 \
  --output guardianx-backup-$(date +%Y%m%d).dump.gpg \
  guardianx-backup-$(date +%Y%m%d).dump
```

Store the `.gpg` passphrase in your password manager separately from the backup file.

### 2.3 Per-table CSV / JSON export via REST API

This is the **lightest-weight** option — no `pg_dump`, no Supabase dashboard access, no direct DB connection. It uses the Supabase REST API (PostgREST) with the service-role key, so it works from any environment that has network access to your project URL.

The `scripts/backup-export.ts` script in this repo:

- Reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment.
- Creates a timestamped subdirectory under `backups/` (e.g. `backups/2024-06-15_14-30-22/`).
- For each table in the canonical list (35 tables, see [§1](#1-what-to-back-up)), fetches **all** rows (paginated 1000 at a time) and writes them to `<table>.json` inside the timestamped dir.
- Prints a summary of table → row count at the end.
- Skips tables that don't exist yet (with a warning) so a fresh install doesn't crash the script.

**Run it:**

```bash
bun run backup
# or directly:
bun run scripts/backup-export.ts
```

**Output layout:**

```
backups/
└── 2024-06-15_14-30-22/
    ├── User.json
    ├── Client.json
    ├── Codebase.json
    ├── ...
    ├── EmailLog.json
    └── _manifest.json     # table → row count, run timestamp, env URL
```

**Limitations of the REST export:**

- **Schema is not included.** This is data-only. To restore, you must first run `prisma db push` or POST `/api/db-init` to recreate the schema, then re-insert the rows. Use this in combination with `pg_dump --schema-only` for a full self-serve backup.
- **RLS-protected tables (`LoginHistory`)** are still readable with the service-role key (which bypasses RLS) — so the export is complete.
- **Large tables** (e.g. `ApiAccessLog`, `PipelineEvent` after months of use) can be slow. The script paginates 1000 rows per request and prints progress per page.
- **No foreign-key ordering** is enforced. When restoring from JSON, insert parents before children (e.g. `Client` → `Codebase` → `Scan` → `Patch` → `ChatMessage`).

### 2.4 Environment file backup

The `.env` file (or `.env.local`, `.env.production`) contains:

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — DB access
- `DATABASE_URL` — Prisma connection string (used only by `prisma db push` / `prisma migrate`)
- `JWT_SECRET` — signs all session JWTs. **If this leaks, an attacker can forge any user. If you lose it without a backup, every existing session becomes invalid.**
- SMTP credentials (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) — needed for password-reset, email-verification, and daily-digest emails
- Any third-party API keys (OpenAI, Slack, GitHub, etc.)

**How to back up:**

1. **Encrypt it:**

   ```bash
   gpg --symmetric --cipher-algo AES256 \
     --output guardianx-env-$(date +%Y%m%d).env.gpg \
     .env
   ```

2. **Store the encrypted file** in your team password manager (1Password, Bitwarden) or an S3 bucket with strict IAM. Keep the passphrase **separate** from the file.

3. **Rotate the backup** whenever env vars change (e.g. after rotating the `SUPABASE_SERVICE_ROLE_KEY`).

> **🚨 NEVER commit `.env` to git.** The repo's `.gitignore` already excludes `.env`, `.env.local`, `.env.production`, and `.env*.local`. If you ever accidentally commit one, rotate **all** secrets in it immediately and force-push the file out of history (`git filter-repo --invert-paths --path .env`).

---

## 3. Backup frequency & retention

| Method | Frequency | Retention | Storage |
|--------|-----------|-----------|---------|
| Supabase automated snapshot | Daily (Pro+) | 7 d (Pro) / 30 d (Team/Ent) | Supabase-managed |
| Supabase manual snapshot | Before every schema migration / deploy | Until manually deleted | Supabase-managed |
| `pg_dump` (custom format) | Daily via cron | 30 days rolling | Off-site (S3, Backblaze) |
| `pg_dump` (long-term archive) | End of each engagement cycle | 1 year (compliance) | Cold storage (Glacier) |
| `bun run backup` (REST export) | Daily via cron + on-demand | 30 days rolling | Repo-local `backups/` dir |
| `.env` encrypted backup | Whenever env changes | Indefinite | Password manager |

**Recommended minimum schedule:**

- **Daily automated** (cron job):

  ```bash
  0 2 * * * cd /home/z/my-project && \
    bun run backup >> /var/log/guardianx-backup.log 2>&1 && \
    pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
      -F c -f /backups/pg/guardianx-$(date +\%Y\%m\%d).dump
  ```

- **Manual before any schema change**: always take a Supabase snapshot + run `bun run backup` before touching `prisma/schema.prisma` or running `bun run db:push`. Label the snapshot `pre-schema-change-YYYYMMDD`.

---

## 4. Restore methods

### 4.1 Full restore from Supabase backup

Use this when the entire database was lost or corrupted and you have a Supabase-managed snapshot.

1. Supabase Dashboard → your project → **Database** → **Backups**.
2. Find the snapshot you want to restore from (check the timestamp + label).
3. Click the **⋯** menu next to it → **Restore**.
4. Choose **Restore to project** (in-place) or **Restore to new project** (recommended — keeps the original alive as a fallback).
5. Confirm. The restore takes 5–30 minutes depending on DB size.
6. Once complete, the dashboard shows "Restored" and the project is now running on the snapshot's data.

> **In-place restore overwrites the current DB.** If anything has been written since the snapshot, it's gone. Prefer "Restore to new project", point your app at the new project URL, and decommission the old one once verified.

### 4.2 Restore from SQL dump

Use this when you have a `.dump` (custom format) or `.sql` (plain) file from `pg_dump`.

**From custom-format `.dump`:**

```bash
# Option A — wipe + recreate (DESTRUCTIVE — drops existing data first)
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  guardianx-backup-YYYYMMDD.dump

# Option B — restore into a fresh project (recommended)
# 1. Create a new empty Supabase project from the dashboard.
# 2. Run pg_restore against the new project's direct connection URL.
pg_restore --no-owner --no-privileges \
  -d "postgresql://postgres:[PASSWORD]@db.[NEW_PROJECT_REF].supabase.co:5432/postgres" \
  guardianx-backup-YYYYMMDD.dump
```

- `--clean --if-exists` makes `pg_restore` drop existing objects before recreating them. **Only use Option A if you're sure the current DB is junk.**
- `--no-owner --no-privileges` avoids errors when the restoring role doesn't match the dumped role (common when moving between Supabase projects).

**From plain `.sql`:**

```bash
psql "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  -f guardianx-backup-YYYYMMDD.sql
```

> **Connection pooler caveat (again).** `pg_restore` and `psql` both fail against Supabase's transaction-mode pooler. Always use the direct connection (`db.[ref].supabase.co:5432`).

> **RLS note.** Restoring a dump that includes `LoginHistory`'s `ENABLE ROW LEVEL SECURITY` + policies will re-create them correctly. No special handling needed.

### 4.3 Selective / per-table restore

Use this when only one or two tables were damaged (e.g. someone ran `DELETE FROM "AuditLog"`).

**From a custom-format `.dump` (uses `pg_restore -t`):**

```bash
pg_restore --no-owner --no-privileges \
  -t "AuditLog" \
  -d "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" \
  guardianx-backup-YYYYMMDD.dump
```

- `-t "AuditLog"` restores only that table (case-sensitive, quotes required because Supabase created tables with quoted identifiers).
- To restore multiple tables, repeat `-t` for each, or use `-t 'table1' -t 'table2'`.
- **The target table must not already exist** (or use `--clean --if-exists` to drop first).

**From the REST-export JSON (`scripts/backup-export.ts` output):**

There's no built-in restore-from-JSON script yet (data-only restore is manual). The pattern:

1. Make sure the schema exists (run `bun run db:push` or POST `/api/db-init`).
2. Truncate the target table:

   ```bash
   curl -X POST "$SUPABASE_URL/rest/v1/rpc/exec_sql" \
     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Content-Type: application/json" \
     -d '{"sql_text":"TRUNCATE TABLE \"AuditLog\";"}'
   ```

3. Write a small Node/Bun script that reads `backups/<timestamp>/AuditLog.json` and bulk-inserts via `supabase.from("AuditLog").insert(rows)`. Paginate at 500 rows per insert to stay under Supabase's per-request size limit.

**From a Supabase snapshot:**

Supabase's dashboard restore is all-or-nothing. For selective restore from a snapshot, use the "Restore to new project" option, then `pg_dump -t` the table you need from the temporary project, and `pg_restore -t` it back into the live project.

### 4.4 Post-restore steps

After any restore — Supabase snapshot, `pg_restore`, or JSON re-insert — **always** run the following sequence to make sure the app's expectations are met:

1. **Sync the Prisma schema** (idempotent — safe to run on a populated DB):

   ```bash
   bun run db:push
   # or, if you need to also reseed demo codebases:
   bun run db:init
   ```

   This guarantees the live schema matches `prisma/schema.prisma` (e.g. if a migration added a column that the snapshot didn't have, or vice versa).

2. **Ensure all tables + indexes exist** via the db-init endpoint:

   ```bash
   curl -X POST https://[your-app]/api/db-init
   ```

   This is idempotent — it uses `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS` and will report any missing tables. It also seeds 3 demo codebases only if the `Codebase` table is empty (so it won't pollute a real restore). Expected response:

   ```json
   {
     "ok": true,
     "initialized": true,
     "stats": { "users": 12, "codebases": 8 },
     "details": ["✓ User table already exists", "✓ Codebases already seeded", ...]
   }
   ```

3. **Verify critical table counts** match what you expect:

   ```bash
   # User count
   curl -s "$SUPABASE_URL/rest/v1/User?select=id" \
     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Prefer: count=exact" \
     -H "Range: 0-0" \
     -D - -o /dev/null | grep -i content-range
   # → content-range: 0-0/12   (12 users total)

   # Client count
   curl -s "$SUPABASE_URL/rest/v1/Client?select=id" \
     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
     -H "Prefer: count=exact" \
     -H "Range: 0-0" \
     -D - -o /dev/null | grep -i content-range
   ```

   Compare against the most recent `backups/<latest>/_manifest.json` row counts.

4. **Check SMTP settings** are intact: log in to GuardianX → Settings → Email (SMTP) → confirm host, port, user, and from-address are populated. Click **Send Test Email** — you should receive a message at the configured `SMTP_FROM`/test recipient. If SMTP creds were in `.env` and `.env` wasn't restored, the form will appear empty even though DB rows are fine — repopulate from your password-manager backup.

5. **Test login** with a known account (preferably a non-admin viewer account, to avoid burning the admin 2FA secret on the test). Confirm:
   - Login succeeds.
   - 2FA prompt appears if the account has 2FA enabled (and the TOTP code from your authenticator app works).
   - The dashboard loads without errors (no 500s in the network tab).

6. **Spot-check audit log**: log in as admin → Settings → Audit Log → confirm recent entries are present (these come from the `AuditLog` table, which should have been restored).

---

## 5. Disaster recovery scenarios

### Scenario 1: DB lost, code safe

*The Supabase project is gone (deleted, region down, billing lapsed) but your application code and `.env` are intact on the server.*

1. **Create a new Supabase project** at <https://supabase.com/dashboard> (same region as before, to keep latency sane).
2. **Update `.env`** with the new `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Keep the old `JWT_SECRET` (it doesn't change between projects).
3. **Restore the data** from your most recent backup:
   - **Preferred**: `pg_restore` the latest `.dump` file into the new project (see [§4.2](#42-restore-from-sql-dump)).
   - **Fallback**: use the Supabase dashboard to "Restore to new project" from the most recent snapshot of the old project (only works if the old project still appears in your org, even if degraded).
   - **Last resort**: rebuild from `backups/<latest>/*.json` by re-inserting rows after schema init.
4. **Run `bun run db:push`** to sync the Prisma schema.
5. **POST `/api/db-init`** to ensure all tables + indexes exist.
6. **Verify** per the checklist in [§6](#6-verification-checklist).

### Scenario 2: Code lost, DB safe

*The server / Vercel project / repo got wiped, but the Supabase DB is healthy.*

1. **Reclone the code** from GitHub:

   ```bash
   git clone https://github.com/<org>/guardianx.git
   cd guardianx
   bun install
   ```

   If GitHub is also gone, restore from any local clone or a mirror (GitLab, Bitbucket).

2. **Restore `.env`** from your encrypted password-manager backup:

   ```bash
   gpg --decrypt guardianx-env-YYYYMMDD.env.gpg > .env
   chmod 600 .env
   ```

   Verify `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, and SMTP vars are all present.

3. **Run `bun run db:push`** to make sure the Prisma client is in sync with the (unchanged) DB schema.

4. **POST `/api/db-init`** to confirm all tables + indexes are still there (it will report "already exists" for everything — that's the expected output).

5. **Verify** per [§6](#6-verification-checklist).

### Scenario 3: Both lost

*Total loss — DB and code are both gone.*

1. **Reclone the code** (Scenario 2, step 1).
2. **Create a new Supabase project** (Scenario 1, step 1).
3. **Restore `.env`** from the password-manager backup, then update `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to point at the new project (Scenario 1, step 2).
4. **Restore the data** from the most recent `.dump` file into the new project (Scenario 1, step 3).
5. **Run `bun run db:push`**.
6. **POST `/api/db-init`**.
7. **Verify** per [§6](#6-verification-checklist).
8. **Rotate all secrets**: `JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` (project key under Settings → API), SMTP password, and any third-party API keys. The previous secrets may have leaked alongside the code loss — assume the worst.

### Scenario 4: Admin locked out

*No DB or code loss — the sole admin lost their 2FA device (or had their account compromised) and can't log in.*

Follow the break-glass recovery procedure documented in **[`docs/BREAK-GLASS-RECOVERY.md`](./BREAK-GLASS-RECOVERY.md)**. The short version:

- Use a server-side script (runnable only with the `SUPABASE_SERVICE_ROLE_KEY`) to disable 2FA on the affected User row or promote a second account to admin.
- All such operations are logged in the `AuditLog` table with `actor: "system-break-glass"`.

---

## 6. Verification checklist

Run this checklist **after every restore**, no matter how small. Sign off each item with initials + timestamp.

- [ ] **User count matches** — `curl` `User?select=id` with `Prefer: count=exact` and confirm the total equals the most recent `_manifest.json` entry.
- [ ] **Client count matches** — same check against `Client`.
- [ ] **Can log in with test account** — non-admin viewer account, password you know.
- [ ] **2FA still works** (if test account has 2FA) — TOTP code from authenticator app accepted.
- [ ] **SMTP test email sends successfully** — Settings → Email → Send Test Email → check inbox.
- [ ] **Dashboard loads without errors** — open `/`, switch through every major tab (Dashboard, Clients, Pipelines, SIEM, DFIR, Settings). Watch browser console + network tab for 5xx.
- [ ] **Recent audit log entries present** — Settings → Audit Log → confirm entries within the last hour (the restore itself should produce one if you POSTed `/api/db-init`).
- [ ] **DB-init endpoint returns `ok: true`** — `curl -X POST https://[app]/api/db-init` returns 200 with `initialized: true`.
- [ ] **Backups directory exists and is non-empty** — `ls backups/` shows the timestamped subdir; `_manifest.json` is present.
- [ ] **`.env` is present and parseable** — `bun run scripts/check-env.ts` (or `set -a; source .env; env | grep SUPABASE`) succeeds.

---

## 7. Appendix: env vars + file layout

### Required environment variables

| Var | Purpose | Where to get it |
|-----|---------|-----------------|
| `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) | Project URL | Supabase Dashboard → Project Settings → API → "Project URL" |
| `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY`) | Server-side DB access (bypasses RLS) | Project Settings → API → "service_role secret" |
| `DATABASE_URL` | Prisma connection string (for `prisma db push` / `migrate`) | Project Settings → Database → Connection string → "URI" (direct, port 5432) |
| `JWT_SECRET` | Signs session JWTs | Self-generated (e.g. `openssl rand -base64 32`). **Must be stable across restarts.** |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Outbound email | Your SMTP provider (Hostinger, SendGrid, etc.) |
| `NEXT_PUBLIC_APP_URL` | App's public base URL | Your deployment URL |

### File layout after a backup run

```
my-project/
├── .env                                  # ⚠️ NEVER commit
├── backups/                              # created by `bun run backup`
│   ├── 2024-06-15_02-00-00/
│   │   ├── _manifest.json
│   │   ├── User.json
│   │   ├── Client.json
│   │   └── … (35 tables)
│   └── 2024-06-16_02-00-00/
│       └── …
├── docs/
│   └── BACKUP-RESTORE.md                 # this file
├── scripts/
│   └── backup-export.ts                  # REST-API backup script
└── supabase/migrations/                  # canonical schema SQL (also in src/app/api/db-init/route.ts)
```

### Off-site storage layout (recommended)

```
s3://guardianx-backups/
├── pg/
│   ├── 2024-06-15.dump.gpg
│   ├── 2024-06-16.dump.gpg
│   └── …
├── rest/
│   ├── 2024-06-15.tar.gz.gpg             # tarball of backups/<timestamp>/
│   └── …
└── env/
    └── guardianx-env-YYYYMMDD.env.gpg
```

Use bucket lifecycle rules to move objects > 30 days to Glacier and delete > 365 days.

---

**Document owner:** GuardianX platform team
**Last updated:** 2024 (Task #17-backup-restore)
**Review cadence:** quarterly, or after any major schema migration
