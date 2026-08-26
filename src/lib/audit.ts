// GuardianX audit-logging helper.
//
// Wraps the AuditLog insert in a try/catch so a failure to write the audit
// row NEVER masks the successful operation that triggered it. Every sensitive
// mutation in the platform (client/scan/patch/credential/user/settings) calls
// this AFTER the primary DB write succeeds.
//
// Schema (prisma/schema.prisma):
//   model AuditLog {
//     id        String   @id @default(cuid())
//     action    String           // dotted string e.g. "client.deleted"
//     entity    String?          // table name e.g. "client"
//     actor     String   @default("system")  // user email
//     details   String?          // JSON string
//     createdAt DateTime @default(now())
//   }

import { randomUUID } from "@/lib/crypto";
import { supabase } from "@/lib/db";

/**
 * Insert a row into the AuditLog table. Failures are logged to console but
 * never re-thrown — the caller's primary operation has already succeeded and
 * the API response must reflect that.
 *
 * @param action  Dotted action string, e.g. "client.deleted".
 * @param entity  Table name the action targets, e.g. "client".
 * @param actor   The current user's email (or "anonymous" / "system" if no
 *                session is available).
 * @param details Plain object serialized to JSON. NEVER include secrets,
 *                passwords, tokens, or cipher material here.
 */
export async function auditLog(
  action: string,
  entity: string,
  actor: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase.from("AuditLog").insert({
      id: randomUUID(),
      action,
      entity,
      actor: actor || "anonymous",
      details: JSON.stringify(details),
    });
    if (error) {
      // PostgREST returns errors via `error`, not via throw — surface them.
      console.error(
        `[audit] ${action} failed (supabase):`,
        error.message || error
      );
    }
  } catch (err) {
    console.error(
      `[audit] ${action} failed:`,
      err instanceof Error ? err.message : err
    );
  }
}
