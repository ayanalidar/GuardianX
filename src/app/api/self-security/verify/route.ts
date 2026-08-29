// POST /api/zk-proof/verify — PUBLIC, verifies a holographic watermark
import { NextResponse } from "next/server";
import { verifyWatermark } from "@/lib/holographic-watermark";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { watermark } = await req.json().catch(() => ({}));
  if (!watermark || typeof watermark !== "string") {
    return NextResponse.json({ valid: false, error: "watermark required" }, { status: 400 });
  }

  const result = verifyWatermark(watermark);
  return NextResponse.json(result);
}
