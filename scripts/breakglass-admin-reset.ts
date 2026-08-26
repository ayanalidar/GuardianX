#!/usr/bin/env bun
// GuardianX — Break-glass admin password reset.
//
// Run: bun run scripts/breakglass-admin-reset.ts --email admin@example.com
//   or: bun run breakglass -- --email admin@example.com --password NewP@ssw0rd
//
// This is a CLI-only tool. It is NOT imported by any application code and
// must remain a standalone entry point. It:
//   1. Verifies the BREAK_GLASS_KEY env var is configured (otherwise aborts).
//   2. Prompts the operator for the break-glass key (or accepts --key).
//   3. Compares the supplied key to process.env.BREAK_GLASS_KEY using a
//      constant-time comparison (crypto.timingSafeEqual) to mitigate timing
//      attacks against the secret.
//   4. If the key matches: looks up the target user by email, verifies the
//      user has role=admin, hashes the new password with bcrypt (12 rounds,
//      matching src/lib/auth.ts), updates the row, and bumps tokenVersion
//      so all of the admin's previously-issued JWTs are immediately revoked.
//   5. Writes an AuditLog row recording the action (actor: "breakglass-script").
//
// Security notes:
//   - The script never prints the key, the new password, or the bcrypt hash.
//   - Constant-time comparison guards against timing leaks even when run on
//     a shared host.
//   - tokenVersion++ ensures any pre-existing session the admin (or an
//     attacker who grabbed an old JWT) had is killed instantly.
//   - The AuditLog row preserves a tamper-evident trail of the recovery.

import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

// ── Arg parsing ─────────────────────────────────────────────────────────────
// Minimal --flag value parser. We don't pull in a CLI framework to keep this
// script dependency-light and avoid any chance of side-effectful imports
// from the app shell.
function parseArgs(argv: string[]): {
  email?: string;
  password?: string;
  key?: string;
  help: boolean;
} {
  const out: { email?: string; password?: string; key?: string; help: boolean } = {
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--email":
        out.email = argv[++i];
        break;
      case "--password":
        out.password = argv[++i];
        break;
      case "--key":
        out.key = argv[++i];
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        if (a?.startsWith("--email=")) out.email = a.slice("--email=".length);
        else if (a?.startsWith("--password=")) out.password = a.slice("--password=".length);
        else if (a?.startsWith("--key=")) out.key = a.slice("--key=".length);
        break;
    }
  }
  return out;
}

const HELP = `GuardianX break-glass admin password reset.

Usage:
  bun run scripts/breakglass-admin-reset.ts --email <admin-email> [--password <new-password>] [--key <break-glass-key>]
  bun run breakglass -- --email <admin-email>

If --password is omitted, you will be prompted interactively (input hidden).
If --key is omitted, you will be prompted interactively (input hidden).

Required environment variables:
  BREAK_GLASS_KEY             Pre-shared key. Must match the value supplied via --key or the prompt.
  SUPABASE_URL                Supabase project URL.
  SUPABASE_SERVICE_ROLE_KEY   Supabase service-role key (server-side, full DB access).

Options:
  -h, --help    Show this help.
`;

// ── Constant-time string comparison ─────────────────────────────────────────
// crypto.timingSafeEqual throws if the Buffer lengths differ, which itself
// leaks length information. We neutralize that by always running a
// same-length comparison (aBuf vs aBuf) when the lengths mismatch, then
// returning false. Total wall-clock time is therefore independent of how
// many leading characters of the secret an attacker has guessed.
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    // Burn the same amount of time as a real comparison would.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

// ── Interactive prompt (echo suppressed for secrets) ────────────────────────
async function promptHidden(question: string): Promise<string> {
  // Suppress echo by writing each char ourselves and intercepting input.
  // readline.write + a muted tty is the standard recipe; we toggle the
  // output writer per keypress to avoid leaking the secret to the terminal
  // scrollback or a screen-recording tool.
  const rl = createInterface({ input: stdin, output: stdout });
  return new Promise<string>((resolve) => {
    // Cast via `unknown` because Node's TTYReadline typings don't surface
    // setRawMode on the generic ReadStream type, even though it exists at
    // runtime on any TTY stdin.
    const stdinRef = stdin as unknown as {
      isTTY?: boolean;
      setRawMode?: (mode: boolean) => void;
      on: (event: string, listener: (data: Buffer) => void) => void;
      removeListener: (event: string, listener: (data: Buffer) => void) => void;
    };
    const isTTY = !!stdinRef.isTTY;
    let input = "";
    process.stdout.write(question);

    const onData = (data: Buffer) => {
      const str = data.toString("utf8");
      for (const ch of str) {
        // Enter / carriage return
        if (ch === "\r" || ch === "\n") {
          process.stdout.write("\n");
          cleanup();
          resolve(input);
          return;
        }
        // Ctrl-C
        if (ch === "\u0003") {
          process.stdout.write("\n");
          cleanup();
          resolve("");
          process.exit(130);
          return;
        }
        // Backspace / delete
        if (ch === "\u007f" || ch === "\b") {
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        input += ch;
        // Mask with a star so the operator can see keystrokes register
        // without revealing the secret.
        if (isTTY) process.stdout.write("*");
      }
    };

    const cleanup = () => {
      stdinRef.removeListener("data", onData);
      if (stdinRef.setRawMode) {
        stdinRef.setRawMode(false);
      }
      rl.close();
    };

    if (isTTY && stdinRef.setRawMode) {
      stdinRef.setRawMode(true);
    }
    stdinRef.on("data", onData);
  });
}

async function promptVisible(question: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }

  // 1. Verify BREAK_GLASS_KEY is configured in the environment.
  const expectedKey = process.env.BREAK_GLASS_KEY;
  if (!expectedKey || expectedKey.length === 0) {
    console.error(
      "[FATAL] BREAK_GLASS_KEY is not set in the environment.\n" +
        "Break-glass recovery is disabled until an operator sets BREAK_GLASS_KEY\n" +
        "(see docs/BREAK-GLASS-RECOVERY.md)."
    );
    return 1;
  }

  // 2. Resolve email + new password + key (prompt if missing).
  const email = args.email ?? (await promptVisible("Admin email: "));
  if (!email) {
    console.error("[FATAL] No email supplied. Use --email <admin-email>.");
    return 1;
  }

  let newPassword = args.password;
  if (!newPassword) {
    newPassword = await promptHidden("New password (input hidden): ");
    if (!newPassword) {
      console.error("[FATAL] No password supplied.");
      return 1;
    }
    const confirm = await promptHidden("Confirm new password: ");
    if (confirm !== newPassword) {
      console.error("[FATAL] Passwords do not match. Aborting.");
      return 1;
    }
  }

  // Enforce a minimum length to prevent the operator from setting an empty
  // or trivial password under stress. This intentionally mirrors the
  // application's own minimum.
  if (newPassword.length < 8) {
    console.error(
      "[FATAL] New password must be at least 8 characters. Aborting to prevent a weak admin password."
    );
    return 1;
  }

  let suppliedKey = args.key;
  if (!suppliedKey) {
    suppliedKey = await promptHidden("Break-glass key (input hidden): ");
  }
  if (!suppliedKey) {
    console.error("[FATAL] No break-glass key supplied.");
    return 1;
  }

  // 3. Constant-time comparison against the configured key.
  if (!safeEqual(suppliedKey, expectedKey)) {
    console.error("Invalid break-glass key.");
    return 1;
  }

  // From here on the operator has authenticated as break-glass. Scrub the
  // supplied key from memory as best we can (JS doesn't give true control
  // over GC, but reassigning + length mismatch makes reuse harder).
  suppliedKey = "";

  // 4. Connect to Supabase using the same env vars the app uses.
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "[FATAL] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment."
    );
    return 1;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 5. Look up the user by email. We select only the columns we need — never
  //    pull the password hash into this process; we're overwriting it, not
  //    comparing against it.
  const { data: user, error: lookupError } = await supabase
    .from("User")
    .select("id, email, name, role, tokenVersion")
    .eq("email", email)
    .maybeSingle();

  if (lookupError) {
    console.error(`[FATAL] DB lookup failed: ${lookupError.message}`);
    return 1;
  }
  if (!user) {
    console.error(`[FATAL] No user found with email "${email}".`);
    return 1;
  }
  if (user.role !== "admin") {
    console.error(
      `[FATAL] User "${email}" has role "${user.role}", not "admin". ` +
        "Break-glass reset is only permitted for admin accounts."
    );
    return 1;
  }

  // 6. Hash the new password with bcrypt (12 rounds — same as src/lib/auth.ts).
  console.log(`Hashing new password for ${email} (bcrypt 12 rounds)…`);
  const passwordHash = await bcrypt.hash(newPassword, 12);

  // 7. Update password + bump tokenVersion to revoke all prior sessions.
  //    tokenVersion is a per-user counter embedded in issued JWTs; bumping
  //    it makes any outstanding JWT fail verifyTokenVersion() on its next
  //    sensitive-API call, forcing re-authentication.
  const currentTokenVersion =
    typeof user.tokenVersion === "number" ? user.tokenVersion : 0;
  const nextTokenVersion = currentTokenVersion + 1;

  const { error: updateError } = await supabase
    .from("User")
    .update({
      password: passwordHash,
      tokenVersion: nextTokenVersion,
    })
    .eq("id", user.id);

  if (updateError) {
    console.error(`[FATAL] Password update failed: ${updateError.message}`);
    return 1;
  }

  // 8. Audit-log the action. Use the same AuditLog shape as src/lib/audit.ts
  //    so it shows up alongside other security events in the platform UI.
  //    NEVER include the password, hash, or key in the audit row.
  const { error: auditError } = await supabase.from("AuditLog").insert({
    id: randomUUID(),
    action: "user.breakglass_reset",
    entity: "user",
    actor: "breakglass-script",
    details: JSON.stringify({
      email: user.email,
      userId: user.id,
      timestamp: new Date().toISOString(),
      tokenVersionBefore: currentTokenVersion,
      tokenVersionAfter: nextTokenVersion,
    }),
  });

  if (auditError) {
    // The reset already succeeded — a failed audit write must NOT roll that
    // back or mask the success message. Surface the warning so the operator
    // can manually log the event in their incident register.
    console.error(
      `[WARN] Password was reset, but AuditLog write failed: ${auditError.message}\n` +
        "Record this event manually in your incident register."
    );
  }

  // 9. Success.
  console.log(
    "Admin password reset successfully. The admin can now log in with the new password."
  );
  return 0;
}

// CLI entry point. `process.exit` ensures the Supabase keep-alive sockets
// don't keep the process alive after we're done.
main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(
      "[FATAL] Unexpected error:",
      err instanceof Error ? err.stack || err.message : err
    );
    process.exit(1);
  });
