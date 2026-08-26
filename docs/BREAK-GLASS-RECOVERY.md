# Break-Glass Admin Recovery Runbook

This runbook explains how to recover access to a GuardianX admin account when
the normal password-reset flow is unavailable (e.g. the only admin has lost
their password **and** can no longer receive email).

Break-glass recovery bypasses email-based verification entirely. Instead, it
relies on a pre-shared secret (`BREAK_GLASS_KEY`) that an operator types
directly into the recovery CLI. The recovery is always logged to the
`AuditLog` table so it leaves a tamper-evident trail.

---

## When to use this

Use break-glass recovery **only** when all of the following are true:

1. The target user is an **admin** (the script refuses to reset non-admin
   accounts).
2. The admin cannot log in (forgotten password, expired sessions, etc.).
3. The normal email-based "forgot password" flow is **also** unavailable
   (admin lost mailbox access, mail server is down, etc.).
4. You are a trusted operator with access to the `BREAK_GLASS_KEY` and to a
   shell on a machine that can reach Supabase.

If any of those conditions is not met, prefer the standard
`/api/auth/forgot-password` flow instead.

---

## Prerequisites

The `BREAK_GLASS_KEY` environment variable must be set in the environment
where the script runs. If it is unset, the script aborts immediately with:

```
[FATAL] BREAK_GLASS_KEY is not set in the environment.
```

- The key must be a strong, random, high-entropy string.
- It is read from the environment, never from a file the script owns.
- It must be present on any machine that needs to perform recovery (typically
  a hardened jumpbox / operator laptop).

The same machine also needs:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

These are the same variables the application already uses; if the app runs
there, recovery can too.

---

## Generating a new key

Generate a 256-bit key with OpenSSL:

```bash
openssl rand -hex 32
```

This produces a 64-character hex string. Store it in your secrets manager
(1Password, Vault, AWS Secrets Manager, etc.) and configure it as
`BREAK_GLASS_KEY` on the recovery host(s).

**Never** commit the key to git. The `.env.example` file documents the
variable but the value is intentionally empty.

---

## Running the recovery

### Option A — fully interactive (recommended)

```bash
bun run breakglass
```

You will be prompted for:

1. Admin email (visible).
2. New password (masked — typed twice, must match).
3. Break-glass key (masked).

### Option B — flags, but key prompted

```bash
bun run breakglass -- --email admin@example.com
```

You will be prompted for the new password and the break-glass key.

### Option C — fully non-interactive (CI / scripted)

```bash
bun run breakglass -- \
  --email admin@example.com \
  --password 'NewStr0ng!Pass' \
  --key "$BREAK_GLASS_KEY"
```

> ⚠️ Supplying `--password` on the command line exposes it in your shell
> history and in `ps` output. Prefer the interactive prompt whenever
> possible. The `--key` flag is similarly sensitive; prefer reading from an
> environment variable (`--key "$BREAK_GLASS_KEY"`) over literal values.

You can also run the script directly:

```bash
bun run scripts/breakglass-admin-reset.ts --email admin@example.com
```

---

## What the script does

1. Verifies `BREAK_GLASS_KEY` is set; aborts if not.
2. Looks up the user by email in the `User` table.
3. Refuses to continue unless the user's `role === "admin"`.
4. Hashes the new password with bcrypt at **12 rounds** (matching
   `src/lib/auth.ts`).
5. Updates the user's `password` column.
6. **Increments `tokenVersion`** on the user row. Every JWT issued before
   this point now fails the `verifyTokenVersion` check, immediately
   revoking all of the admin's prior sessions — including any JWT an
   attacker may have stolen before you noticed the lockout.
7. Writes an `AuditLog` row:
   - `action`: `"user.breakglass_reset"`
   - `entity`: `"user"`
   - `actor`: `"breakglass-script"`
   - `details`: `{ email, userId, timestamp, tokenVersionBefore, tokenVersionAfter }`

The script **never** prints the supplied key, the new password, or the bcrypt
hash. The key comparison uses `crypto.timingSafeEqual` to resist timing
attacks.

On success you'll see:

```
Admin password reset successfully. The admin can now log in with the new password.
```

---

## Security considerations

- **Treat the key like a root credential.** Anyone who possesses
  `BREAK_GLASS_KEY` and the Supabase service-role key can reset any admin's
  password.
- **Rotate after use.** After every recovery, generate a new key, update
  `BREAK_GLASS_KEY` on every host that holds it, and update the secret in
  your secrets manager.
- **Limit distribution.** Share the key only with operators who are
  authorized to perform recovery, and only via your secrets manager (not
  email, Slack, or DM).
- **Review the audit log.** After a recovery, the security team should
  verify the `user.breakglass_reset` row in `AuditLog` matches an
  authorized change window. Unexpected entries indicate a compromised key —
  rotate immediately and investigate.
- **Do not commit `.env`.** The `.env.example` file documents the variable
  but production values must never enter version control.
- **The script is CLI-only.** It is not importable by the application and
  is excluded from the Next.js build. It runs only when explicitly invoked.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `[FATAL] BREAK_GLASS_KEY is not set` | Env var missing on the host | Export `BREAK_GLASS_KEY` before running, or run on a host where it's already configured. |
| `Invalid break-glass key` | Wrong key supplied | Confirm the key in your secrets manager matches the value on the host. |
| `[FATAL] No user found with email "…"` | Email typo, or user never existed | Verify the admin's exact email in the `User` table. |
| `[FATAL] User "…" has role "…", not "admin"` | Target is not an admin | Break-glass recovery is admin-only. Promote the user first via a different admin, or pick the correct admin email. |
| `[FATAL] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set` | DB env vars missing | Source the same `.env` the app uses before running the script. |
| `[WARN] … AuditLog write failed` | AuditLog insert failed (e.g. RLS / network) | The reset still succeeded; manually record the event in your incident register. |
