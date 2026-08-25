// GET /api/public-scan/recent?limit=20
//
// Public endpoint (NO auth — recent scans are shown on the homepage
// cinematic card next to the ScanWidget, so it must be readable by
// anonymous visitors).
//
// Returns the most recent completed scans, exposing only the URL + score
// + counts (privacy: email, findings JSON, and IP are excluded).
//
// Caching: 30s module-level cache so a homepage refresh doesn't hammer the
// DB. The cache holds the last response payload + a timestamp; in-process
// state on Vercel Serverless Functions is reused across warm invocations
// of the same Lambda instance, so the cache hits the common case (multiple
// homepage views from different visitors within 30s).
//
// The `revalidate = 30` constant below is a hint to the Next.js router to
// also revalidate at the framework level if anyone ever wraps this in a
// page. The `dynamic = "force-dynamic"` keeps the route from being
// statically rendered at build time.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const revalidate = 30;

interface RecentScanRow {
  id: string;
  url: string;
  score: number | null;
  findingsCount: number;
  criticalCount: number;
  createdAt: Date;
}

interface CachedPayload {
  scans: RecentScanRow[];
  total: number;
  cachedAt: number;
}

const CACHE_MS = 30_000;
let cache: CachedPayload | null = null;

const MAX_LIMIT = 100; // hard ceiling — prevents ?limit=10000000 attacks
const DEFAULT_LIMIT = 20;

export async function GET(req: Request) {
  // ── Parse `limit` query param ──────────────────────────────────────────
  const url = new URL(req.url);
  const rawLimit = url.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== null) {
    const parsed = Number.parseInt(rawLimit, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(MAX_LIMIT, parsed);
    }
  }

  // ── Cache check ─────────────────────────────────────────────────────────
  // The cache is keyed by the limit too — different homepage components may
  // request different limits, and we don't want a low-limit cache hit to
  // starve a high-limit request from fresh data. Simple approach: cache the
  // DEFAULT_LIMIT response; any other limit bypasses the cache.
  if (limit === DEFAULT_LIMIT && cache && Date.now() - cache.cachedAt < CACHE_MS) {
    return NextResponse.json({
      scans: cache.scans,
      total: cache.total,
      cachedAt: new Date(cache.cachedAt).toISOString(),
    });
  }

  try {
    // ── Fetch the latest `limit` completed scans + total count ────────────
    // Privacy: SELECT only the fields the homepage card needs (URL + score
    // + counts + createdAt). Never SELECT email / ipAddress / findings JSON.
    const [scans, total] = await Promise.all([
      db.websiteScan.findMany({
        where: { status: "completed" },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          url: true,
          score: true,
          findingsCount: true,
          criticalCount: true,
          createdAt: true,
        },
      }),
      db.websiteScan.count({ where: { status: "completed" } }),
    ]);

    const payload: CachedPayload = {
      scans,
      total,
      cachedAt: Date.now(),
    };

    if (limit === DEFAULT_LIMIT) {
      cache = payload;
    }

    return NextResponse.json({
      scans: payload.scans,
      total: payload.total,
      cachedAt: new Date(payload.cachedAt).toISOString(),
    });
  } catch (err) {
    console.error("[public-scan/recent] error:", err);
    return NextResponse.json(
      {
        error: "Failed to fetch recent scans.",
        scans: [],
        total: 0,
      },
      { status: 500 },
    );
  }
}
