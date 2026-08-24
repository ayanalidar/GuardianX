import { NextResponse } from "next/server";
import { getUserFromRequest } from "@/lib/auth";
import {
  onScanComplete,
  onFindingFound,
  onPatchApproved,
  onUserPreference,
} from "@/lib/memory-vault/memory-writer";

export const dynamic = "force-dynamic";

// POST /api/memory/ingest
// Internal endpoint called by the sentinel-engine (or any trusted caller)
// to record a memory when an event happens off-band from the web app:
//   - engine finishes a scan and writes findings → POST { type: "scan_complete", userId, scan, findings, patches }
//   - engine discovers a new finding           → POST { type: "finding_found", userId, finding }
//   - cron job approves a patch                → POST { type: "patch_approved", userId, patch }
//   - any other system observes a preference   → POST { type: "user_preference", userId, key, value }
//
// Auth: the caller must present a valid GuardianX JWT (engine uses a
// service account). This keeps the writers usable from anywhere without
// re-implementing per-event auth.
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { type } = body as { type?: string };

  switch (type) {
    case "scan_complete": {
      const { scan, findings = [], patches = [] } = body as {
        scan: { id: string; codebaseName?: string; status?: string };
        findings: Array<{ title?: string; severity?: string; category?: string }>;
        patches: Array<{ title?: string; severity?: string; status?: string }>;
      };
      onScanComplete(user.userId, scan, findings, patches);
      return NextResponse.json({ ok: true, type });
    }
    case "finding_found": {
      const { finding } = body as {
        finding: {
          id?: string; title?: string; severity?: string; category?: string;
          endpoint?: string; method?: string; owasp?: string;
        };
      };
      onFindingFound(user.userId, finding);
      return NextResponse.json({ ok: true, type });
    }
    case "patch_approved": {
      const { patch } = body as {
        patch: {
          id?: string; patchId?: string; title?: string; severity?: string;
          affectedFile?: string; status?: string; approvedAt?: string;
        };
      };
      onPatchApproved(user.userId, patch);
      return NextResponse.json({ ok: true, type });
    }
    case "user_preference": {
      const { key, value } = body as { key: string; value: string };
      if (!key || !value) {
        return NextResponse.json({ error: "key and value required" }, { status: 400 });
      }
      onUserPreference(user.userId, key, value);
      return NextResponse.json({ ok: true, type });
    }
    default:
      return NextResponse.json(
        { error: `Unknown type. Expected one of: scan_complete, finding_found, patch_approved, user_preference` },
        { status: 400 },
      );
  }
}
