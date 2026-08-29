import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface MailRow {
  id: string;
  to: string;
  subject: string;
  status: string;
  error: string | null;
  createdAt: string;
}

// GET /api/admin/email-delivery — admin-only email delivery monitor.
// Reads the MailLog table if it exists, otherwise returns an empty list
// with a "table_missing" flag so the panel can show a helpful note.
export async function GET(req: Request) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const { data, error } = await supabase
      .from("MailLog")
      .select('id, "to", subject, status, error, "createdAt"')
      .order("createdAt", { ascending: false })
      .limit(100);

    if (error) {
      // Table most likely doesn't exist — return a friendly payload.
      return NextResponse.json({
        tableMissing: true,
        entries: [],
        summary: { sent: 0, failed: 0, pending: 0, total: 0 },
      });
    }

    const rows = (data || []) as unknown as MailRow[];
    const summary = {
      sent: rows.filter((r) => r.status === "sent").length,
      failed: rows.filter((r) => r.status === "failed").length,
      pending: rows.filter((r) => r.status === "pending" || r.status === "queued").length,
      total: rows.length,
    };

    return NextResponse.json({
      tableMissing: false,
      entries: rows.map((r) => ({
        id: r.id,
        to: r.to,
        subject: r.subject,
        status: r.status,
        error: r.error,
        timestamp: r.createdAt,
      })),
      summary,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load email log" },
      { status: 500 }
    );
  }
}
