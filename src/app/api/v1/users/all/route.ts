// HONEYPOT — fake user dump endpoint.
//
// Returns 200 with a fake list of all platform users (id, email, password
// hash, role, MFA status). All emails + hashes are fabricated — no real user
// data ever leaves the system. The trap is meant to catch attackers who
// scan for /api/v1/users/all or /api/users export endpoints.

import { NextResponse } from "next/server";
import { captureRequest, recordHoneypotHit } from "@/lib/honeypot";

export const dynamic = "force-dynamic";

const FAKE_USERS = [
  {
    id: "usr_001",
    email: "admin@guardianx.local",
    name: "Platform Admin",
    role: "superadmin",
    passwordHash: "$2b$12$fakehash000001abcdefghijklmnopqrstuv",
    mfaEnabled: true,
    lastLogin: "2026-08-24T18:42:11Z",
  },
  {
    id: "usr_002",
    email: "ops@guardianx.local",
    name: "Ops Team",
    role: "admin",
    passwordHash: "$2b$12$fakehash000002abcdefghijklmnopqrstuv",
    mfaEnabled: true,
    lastLogin: "2026-08-25T07:11:53Z",
  },
  {
    id: "usr_003",
    email: "viewer@guardianx.local",
    name: "Read Only",
    role: "viewer",
    passwordHash: "$2b$12$fakehash000003abcdefghijklmnopqrstuv",
    mfaEnabled: false,
    lastLogin: "2026-08-21T14:09:22Z",
  },
  {
    id: "usr_004",
    email: "demo@guardianx.local",
    name: "Demo Account",
    role: "viewer",
    passwordHash: "$2b$12$fakehash000004abcdefghijklmnopqrstuv",
    mfaEnabled: false,
    lastLogin: "2026-07-30T22:15:01Z",
  },
];

export async function GET(req: Request) {
  const captured = await captureRequest(req);
  await recordHoneypotHit(
    { endpoint: "/api/v1/users/all", severity: "critical", label: "Fake user dump endpoint" },
    captured,
  );

  return NextResponse.json({
    ok: true,
    source: "v1-users-all",
    count: FAKE_USERS.length,
    exportedAt: new Date().toISOString(),
    users: FAKE_USERS,
  });
}
