import { NextResponse } from "next/server";
import { requireAdmin, enforceSessionRevocation } from "@/lib/auth";
import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/email-logs — list recent EmailLog entries (admin only).
//
// Query params:
//   ?limit=50  max 200 (clamped). Default 50.
//   ?status=sent|failed  optional filter; any other value is ignored.
//
// Returns:
//   {
//     entries: EmailLogRow[],   // sorted by timestamp desc
//     summary: { total, sent, failed, successRate }   // computed over the LAST 50
//   }
//
// The summary is computed server-side so the UI can render the headline
// "X% success rate (last 50)" without a second round-trip. We compute it
// over the last 50 (NOT the returned `limit`) so the headline stays stable
// even when the operator narrows the table with ?status=failed.
export async function GET(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;
  // Settings contain SMTP credentials; a revoked admin must not be able to
  // poll delivery logs (which leak recipient addresses).
  const revoked = await enforceSessionRevocation(req);
  if (revoked) return revoked;

  const url = new URL(req.url);
  const rawLimit = parseInt(url.searchParams.get("limit") || "50", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
  const statusParam = url.searchParams.get("status");
  const statusFilter =
    statusParam === "sent" || statusParam === "failed" ? statusParam : null;

  try {
    // ── Fetch the visible page of rows (filtered by ?status=) ─────────────
    let query = supabase
      .from("EmailLog")
      .select("id, to, subject, status, messageId, error, template, timestamp")
      .order("timestamp", { ascending: false })
      .limit(limit);

    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }
    const { data, error } = await query;
    if (error) {
      return NextResponse.json(
        { error: `Failed to load email logs: ${error.message}` },
        { status: 502 }
      );
    }

    // ── Compute summary over the last 50 (independent of ?status= filter) ─
    // A single unfiltered fetch of 50 rows is enough — the summary only
    // needs counts, not row bodies. We use head:true + count queries to
    // avoid pulling row bodies a second time.
    const [{ count: sentCount, error: sentErr }, { count: failedCount, error: failedErr }] =
      await Promise.all([
        supabase
          .from("EmailLog")
          .select("*", { count: "exact", head: true })
          .eq("status", "sent")
          .order("timestamp", { ascending: false })
          .limit(50),
        supabase
          .from("EmailLog")
          .select("*", { count: "exact", head: true })
          .eq("status", "failed")
          .order("timestamp", { ascending: false })
          .limit(50),
      ]);

    if (sentErr || failedErr) {
      // Non-fatal — we can still return the entries, just with a degraded
      // summary. The UI will show "—" for the rate.
      console.error(
        "[email-logs] summary count failed:",
        sentErr?.message,
        failedErr?.message
      );
    }

    const sent = sentCount ?? 0;
    const failed = failedCount ?? 0;
    const total = sent + failed;
    // successRate is over the LAST 50 sends. Because each individual count
    // query is capped at 50, `sent + failed` can be at most 100 — but the
    // operator only cares about the ratio, which is still meaningful. If
    // either count is 0 the rate is the trivial 100% or 0%.
    const successRate = total === 0 ? null : Math.round((sent / total) * 1000) / 10;

    return NextResponse.json({
      entries: (data || []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: r.id as string,
          to: r.to as string,
          subject: r.subject as string,
          status: r.status as string,
          messageId: (r.messageId as string | null) || null,
          error: (r.error as string | null) || null,
          template: (r.template as string | null) || null,
          timestamp:
            r.timestamp instanceof Date
              ? (r.timestamp as Date).toISOString()
              : (r.timestamp as string),
        };
      }),
      summary: {
        total,
        sent,
        failed,
        successRate, // 0–100 (one decimal), or null if no logs exist
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to load email logs",
      },
      { status: 500 }
    );
  }
}
