import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/runtime-monitor, live runtime health: which functions are
// vulnerable (pending patches) vs healed (approved patches deployed to runtime).
// Simulates a runtime instrumentation layer that monitors function calls
// and can hot-swap vulnerable functions with patched versions.
export async function GET() {
  const patches = await db.patch.findMany({
    where: { status: { in: ["pending", "approved"] } },
    include: { codebase: { select: { name: true } } },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
  });

  const functions = patches.map((p) => ({
    patch_id: p.patchId,
    title: p.title,
    severity: p.severity,
    codebase: p.codebase.name,
    affected_file: p.affectedFile,
    runtime_status: p.status === "approved" ? "healed" : "vulnerable",
    sandbox_passed: p.sandboxPassed,
    exploit_proven: !!p.exploitCode,
    // Simulated runtime metrics
    attack_attempts: p.status === "pending" ? Math.floor(Math.random() * 50) + 10 : 0,
    blocked_attacks: p.status === "approved" ? Math.floor(Math.random() * 100) + 50 : 0,
    last_incident: p.status === "pending" ? new Date(Date.now() - Math.random() * 3600000).toISOString() : null,
  }));

  const vulnerable = functions.filter((f) => f.runtime_status === "vulnerable");
  const healed = functions.filter((f) => f.runtime_status === "healed");
  const totalAttackAttempts = vulnerable.reduce((s, f) => s + f.attack_attempts, 0);
  const totalBlocked = healed.reduce((s, f) => s + f.blocked_attacks, 0);

  return NextResponse.json({
    runtime_health: vulnerable.length === 0 ? "secure" : vulnerable.length > 2 ? "critical" : "at-risk",
    monitored_functions: functions.length,
    vulnerable_functions: vulnerable.length,
    healed_functions: healed.length,
    total_attack_attempts: totalAttackAttempts,
    total_attacks_blocked: totalBlocked,
    auto_heal_enabled: true,
    functions,
  });
}
