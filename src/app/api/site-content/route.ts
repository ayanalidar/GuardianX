import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";
import { getAuthenticatedUser } from "@/lib/ownership";

export const dynamic = "force-dynamic";

// GET /api/site-content — public, returns all content as key-value object
// Optional: ?category=homepage to filter
export async function GET(req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get("category");

  let query = supabase.from("SiteContent").select("key, value, category");
  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({});
  }

  const content: Record<string, string> = {};
  for (const row of data || []) {
    const r = row as Record<string, unknown>;
    content[r.key as string] = r.value as string;
  }

  return NextResponse.json(content);
}

// PUT /api/site-content — admin only, updates multiple content keys
// Body: { items: { key1: "value1", key2: "value2", ... } }
export async function PUT(req: Request) {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const items = body.items as Record<string, string>;

  if (!items || typeof items !== "object") {
    return NextResponse.json({ error: "items object required" }, { status: 400 });
  }

  let updated = 0;
  let failed = 0;

  for (const [key, value] of Object.entries(items)) {
    const { error } = await supabase
      .from("SiteContent")
      .upsert({
        key,
        value: String(value),
        category: inferCategory(key),
        updatedAt: new Date().toISOString(),
      }, { onConflict: "key" });

    if (error) {
      console.error(`[site-content] upsert failed for ${key}:`, error.message);
      failed++;
    } else {
      updated++;
    }
  }

  return NextResponse.json({
    ok: true,
    updated,
    failed,
    message: `${updated} item(s) updated${failed > 0 ? `, ${failed} failed` : ""}`,
  });
}

function inferCategory(key: string): string {
  if (key.startsWith("hero_") || key.startsWith("stats_")) return "homepage";
  if (key.startsWith("pricing_")) return "pricing";
  if (key.startsWith("contact_")) return "contact";
  if (key.startsWith("social_")) return "social";
  if (key.startsWith("footer_")) return "footer";
  return "general";
}
