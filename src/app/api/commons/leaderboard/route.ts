import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/commons/leaderboard — top 50 community contributors by earnings
// and findings-found count. Public.
//
// The leaderboard is computed by aggregating CommunityRule rows per
// authorId. Because Prisma's `groupBy` doesn't always play nicely with
// every storage backend, we do the aggregation in JS after fetching the
// top 200 rules (ranked by earnings + findingsCount).
//
// Response shape:
//   {
//     leaderboard: Array<{
//       authorId: string,
//       authorName: string,
//       authorEmail: string,
//       ruleCount: number,
//       totalFindings: number,
//       totalEarnings: number,        // paise
//       totalUpvotes: number,
//     }>,
//     totalRules: number,
//     totalFindings: number,
//     totalEarnings: number,
//   }
export async function GET() {
  try {
    const rules = await db.communityRule.findMany({
      where: { isActive: true },
      take: 500,
      orderBy: { earnings: "desc" },
    });

    const byAuthor = new Map<
      string,
      {
        authorId: string;
        authorName: string;
        authorEmail: string;
        ruleCount: number;
        totalFindings: number;
        totalEarnings: number;
        totalUpvotes: number;
      }
    >();

    let totalFindings = 0;
    let totalEarnings = 0;

    for (const r of rules) {
      totalFindings += r.findingsCount;
      totalEarnings += r.earnings;

      const existing = byAuthor.get(r.authorId);
      if (existing) {
        existing.ruleCount += 1;
        existing.totalFindings += r.findingsCount;
        existing.totalEarnings += r.earnings;
        existing.totalUpvotes += r.upvotes;
        // Keep the most recent author name/email in case they updated it.
        if (r.authorName) existing.authorName = r.authorName;
        if (r.authorEmail) existing.authorEmail = r.authorEmail;
      } else {
        byAuthor.set(r.authorId, {
          authorId: r.authorId,
          authorName: r.authorName || "anonymous",
          authorEmail: r.authorEmail || "",
          ruleCount: 1,
          totalFindings: r.findingsCount,
          totalEarnings: r.earnings,
          totalUpvotes: r.upvotes,
        });
      }
    }

    const leaderboard = Array.from(byAuthor.values())
      .sort((a, b) => b.totalEarnings - a.totalEarnings || b.totalFindings - a.totalFindings)
      .slice(0, 50);

    return NextResponse.json({
      leaderboard,
      totalRules: rules.length,
      totalFindings,
      totalEarnings,
    });
  } catch (err) {
    console.error("[commons/leaderboard] error:", err);
    return NextResponse.json(
      { error: "Failed to load leaderboard." },
      { status: 500 }
    );
  }
}
