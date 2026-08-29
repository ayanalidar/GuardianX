import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/billing/status — current plan + usage for the caller
// Returns a {plan, status, usage, limits, stripeEnabled} object.
export async function GET(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Auth required" }, { status: 401 });

  const stripeEnabled =
    !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PRICE_PRO;

  // Plan limits matrix — mirrored by the pricing cards in <BillingPanel>.
  const PLAN_LIMITS: Record<string, { clientsMax: number; scansMax: number; label: string }> = {
    free: { clientsMax: 3, scansMax: 10, label: "Free" },
    pro: { clientsMax: 25, scansMax: 250, label: "Pro" },
    enterprise: { clientsMax: 9999, scansMax: 9999, label: "Enterprise" },
  };

  try {
    const sub = await db.subscription.findUnique({
      where: { userId: user.userId },
    });

    const plan = (sub?.plan as string) || "free";
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    // Live usage: count the user's clients + scans. Clients are global
    // (the schema has no ownerId on Client), so for viewers we attribute
    // clients/scans created in audit logs by this user's email; for admins
    // we attribute all clients/scans.
    let clientsUsed = 0;
    let scansUsed = 0;
    try {
      clientsUsed = (sub?.clientsUsed as number) ?? 0;
      scansUsed = (sub?.scansUsed as number) ?? 0;
      // Refresh from real tables when possible (best-effort — fall back to cached).
      if (user.role === "admin") {
        const [clientCount, scanCount] = await Promise.all([
          db.client.count({}),
          db.scan.count({}),
        ]);
        clientsUsed = clientCount;
        scansUsed = scanCount;
      } else {
        // Count AuditLog rows for "create" actions attributed to this user.
        const created = await db.auditLog.findMany({
          where: { actor: user.email, action: { contains: "create" } },
          take: 500,
        });
        clientsUsed = created.filter((l: Record<string, unknown>) =>
          String(l.entity || "").toLowerCase().includes("client")
        ).length;
        scansUsed = created.filter((l: Record<string, unknown>) =>
          String(l.entity || "").toLowerCase().includes("scan")
        ).length;
      }
    } catch {
      /* keep cached values */
    }

    return NextResponse.json({
      stripeEnabled,
      plan,
      status: (sub?.status as string) || "active",
      label: limits.label,
      limits: { clientsMax: limits.clientsMax, scansMax: limits.scansMax },
      usage: {
        clientsUsed,
        scansUsed,
        clientsPercent:
          limits.clientsMax > 0
            ? Math.min(100, Math.round((clientsUsed / limits.clientsMax) * 100))
            : 0,
        scansPercent:
          limits.scansMax > 0
            ? Math.min(100, Math.round((scansUsed / limits.scansMax) * 100))
            : 0,
      },
      currentPeriodEnd: sub?.currentPeriodEnd
        ? (sub.currentPeriodEnd as Date).toISOString()
        : null,
      cancelAtPeriodEnd: (sub?.cancelAtPeriodEnd as boolean) ?? false,
      stripeCustomerId: sub?.stripeCustomerId ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load billing status" },
      { status: 500 }
    );
  }
}
