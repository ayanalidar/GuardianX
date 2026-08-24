import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import ZAI from "z-ai-web-dev-sdk";
import { getUserFromRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

let zaiPromise: Promise<ZAI> | null = null;
async function sdk() {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

// POST /api/canaries/check, search the web for any canary values appearing externally.
// If a canary value is found on a site that isn't the target, it's confirmed exfiltration.
export async function POST(req: Request) {
  const user = getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const canaries = await db.canary.findMany({ where: { isActive: true, detected: false } });

  if (canaries.length === 0) {
    return NextResponse.json({ checked: 0, detected: 0, message: "No active canaries to check." });
  }

  const z = await sdk();
  let detectedCount = 0;

  for (const canary of canaries) {
    try {
      const results = await z.functions.invoke("web_search", {
        query: `"${canary.canaryValue}"`,
        num: 5,
      }) as Array<{ url: string; name: string; snippet: string; host_name: string }>;

      // Check if any result is NOT from localhost (the target itself)
      const externalHits = (results || []).filter(
        (r) => !r.url.includes("localhost") && !r.url.includes("127.0.0.1") && r.url.startsWith("http")
      );

      if (externalHits.length > 0) {
        const hit = externalHits[0];
        await db.canary.update({
          where: { id: canary.id },
          data: {
            detected: true,
            detectedAt: new Date(),
            detectedOn: hit.url,
          },
        });
        detectedCount++;
      }
    } catch { /* skip */ }
  }

  return NextResponse.json({
    checked: canaries.length,
    detected: detectedCount,
    message: detectedCount > 0
      ? `⚠ DATA EXFILTRATION DETECTED! ${detectedCount} canary value(s) found on external websites. Your data has been scraped.`
      : "No canary values found externally. Your data has not been scraped (yet).",
    checked_at: new Date().toISOString(),
  });
}
