// The GuardianX pipeline orchestrator.
// Runs: analyze -> generate patch (per vuln) -> sandbox test -> persist.
// Emits real-time events through a callback so the socket.io server can
// broadcast them to connected clients.

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import {
  analyzeCodebase,
  generatePatch,
  generateExploit,
  generateBypass,
  generateImprovedPatch,
  type DetectedVulnerability,
} from "./ai";
import { runSandbox, runExploit } from "./sandbox";
import { unifiedDiff } from "./diff";

export interface PipelineEvent {
  scanId: string;
  stage: string;
  message: string;
  level: "info" | "success" | "warning" | "error";
  meta?: Record<string, unknown>;
  ts: string;
}

type Emit = (e: PipelineEvent) => void;

// One round of the adversarial red-team/blue-team loop.
interface AdversarialRound {
  round: number;
  attackerTechnique: string;
  attackerReasoning: string;
  bypassFound: boolean;
  bypassResult: {
    success: boolean;
    detail: string;
    logs: string;
  } | null;
  defender: {
    technique: string;
    reasoning: string;
    patchedCode: string;
  } | null;
  defenseVerification: {
    originalBlocked: boolean;
    bypassBlocked: boolean;
    originalLogs: string | null;
    bypassLogs: string;
  } | null;
  outcome:
    | "attacker-conceded"
    | "bypass-unconfirmed"
    | "defender-won-round"
    | "defender-partial";
}

// Collision-proof patch id: sequential-ish number + random suffix so concurrent
// scans can never clash on the unique `patchId` constraint.
async function nextPatchId(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.patch.count();
  const num = String(count + 1).padStart(4, "0");
  const suffix = randomBytes(2).toString("hex");
  return `SP-${year}-${num}-${suffix}`;
}

export async function runScan(
  codebaseId: string,
  scanId: string,
  emit: Emit
): Promise<{ scanId: string; patchCount: number }> {
  const codebase = await db.codebase.findUnique({ where: { id: codebaseId } });
  if (!codebase) throw new Error("Codebase not found");

  const scan = { id: scanId };

  const emitAndStore = async (e: Omit<PipelineEvent, "ts" | "scanId">) => {
    const full: PipelineEvent = { ...e, scanId: scan.id, ts: new Date().toISOString() };
    emit(full);
    await db.pipelineEvent.create({
      data: {
        scanId: scan.id,
        stage: full.stage,
        message: full.message,
        level: full.level,
        meta: full.meta ? JSON.stringify(full.meta) : null,
      },
    });
  };

  try {
    // ── Stage 1: analyze ────────────────────────────────────────────────
    await db.scan.update({
      where: { id: scan.id },
      data: { status: "analyzing", stageLabel: "Analyzing code with AI…" },
    });
    await emitAndStore({
      stage: "analyzing",
      message: `Loaded codebase "${codebase.name}" (${codebase.sourceCode.split("\n").length} lines)`,
      level: "info",
    });
    await emitAndStore({
      stage: "analyzing",
      message: "AI security model is scanning for vulnerabilities…",
      level: "info",
    });

    const scanResult = await analyzeCodebase(
      codebase.name,
      codebase.sourceCode,
      2 // cap findings so the full exploit+adversarial pipeline stays responsive
    );

    if (scanResult.vulnerabilities.length === 0) {
      await emitAndStore({
        stage: "completed",
        message: "No vulnerabilities detected by the AI model.",
        level: "success",
      });
      await db.scan.update({
        where: { id: scan.id },
        data: { status: "completed", stageLabel: "No vulnerabilities found", completedAt: new Date() },
      });
      return { scanId: scan.id, patchCount: 0 };
    }

    await emitAndStore({
      stage: "analyzing",
      message: `Detected ${scanResult.vulnerabilities.length} vulnerability(ies): ${scanResult.vulnerabilities
        .map((v) => `${v.severity.toUpperCase()} · ${v.title}`)
        .join(" | ")}`,
      level: "warning",
      meta: { count: scanResult.vulnerabilities.length },
    });

    // ── Stage 2 + 3: generate patch + sandbox per vuln ──────────────────
    await db.scan.update({
      where: { id: scan.id },
      data: { status: "patching", stageLabel: "Generating AI patches…" },
    });

    let created = 0;
    for (const vuln of scanResult.vulnerabilities) {
      const patchId = await nextPatchId();

      await emitAndStore({
        stage: "patching",
        message: `Generating patch for "${vuln.title}"…`,
        level: "info",
        meta: { patchId, severity: vuln.severity },
      });

      const generated = await generatePatch(
        codebase.name,
        codebase.sourceCode,
        vuln
      );

      // ── Stage A: Generate PoC exploit ───────────────────────────────────
      await db.scan.update({
        where: { id: scan.id },
        data: { status: "sandboxing", stageLabel: `${patchId}: forging PoC exploit…` },
      });
      await emitAndStore({
        stage: "sandboxing",
        message: `${patchId}: red team forging proof-of-concept exploit…`,
        level: "info",
        meta: { patchId, phase: "exploit-gen" },
      });

      const exploit = await generateExploit(codebase.name, codebase.sourceCode, vuln);

      // Run exploit against ORIGINAL → should SUCCEED (proves vuln is real)
      await emitAndStore({
        stage: "sandboxing",
        message: `${patchId}: running exploit against original (vulnerable) code…`,
        level: "info",
        meta: { patchId, phase: "exploit-vs-original" },
      });
      const exploitOriginal = exploit.exploitCode
        ? await runExploit(exploit.exploitCode, codebase.sourceCode, codebase.name, {
            label: "exploit vs ORIGINAL",
          })
        : null;

      await emitAndStore({
        stage: "sandboxing",
        message: exploitOriginal?.success
          ? `${patchId}: 🔴 EXPLOIT SUCCEEDED against original — ${exploitOriginal.detail}`
          : `${patchId}: exploit did not confirm against original (${exploitOriginal?.detail ?? "no exploit"})`,
        level: exploitOriginal?.success ? "error" : "warning",
        meta: { patchId, exploitConfirmed: exploitOriginal?.success ?? false },
      });

      // Run exploit against PATCHED → should be BLOCKED (proves fix works)
      await emitAndStore({
        stage: "sandboxing",
        message: `${patchId}: running same exploit against patched code…`,
        level: "info",
        meta: { patchId, phase: "exploit-vs-patched" },
      });
      const exploitPatched = exploit.exploitCode
        ? await runExploit(exploit.exploitCode, generated.patchedCode, codebase.name, {
            label: "exploit vs PATCHED",
          })
        : null;

      await emitAndStore({
        stage: "sandboxing",
        message: exploitPatched?.success
          ? `${patchId}: 🔴 EXPLOIT STILL SUCCEEDS against patch — fix is incomplete!`
          : `${patchId}: 🟢 exploit BLOCKED by patch — ${exploitPatched?.detail ?? "n/a"}`,
        level: exploitPatched?.success ? "error" : "success",
        meta: { patchId, patchBlocksExploit: !exploitPatched?.success },
      });

      // ── Stage B: Functionality sandbox (existing) ──────────────────────
      await db.scan.update({
        where: { id: scan.id },
        data: { status: "sandboxing", stageLabel: `${patchId}: running functionality tests…` },
      });
      await emitAndStore({
        stage: "sandboxing",
        message: `${patchId}: running functionality tests in sandbox…`,
        level: "info",
        meta: { patchId, phase: "func-tests" },
      });
      const sandbox = await runSandbox(generated.testCode, {
        patchedCode: generated.patchedCode,
        patchedFilename: codebase.name,
      });
      await emitAndStore({
        stage: "sandboxing",
        message: sandbox.passed
          ? `${patchId}: functionality tests PASSED (exit 0)`
          : `${patchId}: functionality tests FAILED (exit ${sandbox.exitCode})`,
        level: sandbox.passed ? "success" : "error",
        meta: { patchId, exitCode: sandbox.exitCode },
      });

      // ── Stage C: Adversarial red-team / blue-team loop ─────────────────
      await db.scan.update({
        where: { id: scan.id },
        data: { status: "sandboxing", stageLabel: `${patchId}: adversarial arena…` },
      });
      await emitAndStore({
        stage: "sandboxing",
        message: `${patchId}: ⚔️  entering adversarial arena — attacker vs defender…`,
        level: "info",
        meta: { patchId, phase: "adversarial-start" },
      });

      let currentPatched = generated.patchedCode;
      let adversarialWon = !exploitPatched?.success; // already blocks the original exploit
      const transcript: AdversarialRound[] = [];
      const previousAttempts: { technique: string; outcome: string }[] = [];
      const MAX_ROUNDS = 2;

      for (let round = 1; round <= MAX_ROUNDS; round++) {
        await emitAndStore({
          stage: "sandboxing",
          message: `${patchId}: ⚔️ round ${round}/${MAX_ROUNDS} — attacker probing for a bypass…`,
          level: "info",
          meta: { patchId, phase: "adversarial-round", round },
        });

        const attack = await generateBypass(
          codebase.name,
          currentPatched,
          vuln,
          exploit.exploitCode,
          previousAttempts
        );

        if (!attack.bypassFound || !attack.bypassCode) {
          await emitAndStore({
            stage: "sandboxing",
            message: `${patchId}: 🟢 round ${round} — attacker concedes: "${attack.reasoning.slice(0, 120)}"`,
            level: "success",
            meta: { patchId, round, outcome: "attacker-conceded" },
          });
          transcript.push({
            round,
            attackerTechnique: attack.technique,
            attackerReasoning: attack.reasoning,
            bypassFound: false,
            bypassResult: null,
            defender: null,
            defenseVerification: null,
            outcome: "attacker-conceded",
          });
          adversarialWon = true;
          break;
        }

        // Verify the bypass actually works against the current patch
        const bypassResult = await runExploit(
          attack.bypassCode,
          currentPatched,
          codebase.name,
          { label: `round ${round} bypass` }
        );
        await emitAndStore({
          stage: "sandboxing",
          message: bypassResult.success
            ? `${patchId}: 🔴 round ${round} — attacker bypass SUCCEEDED: ${attack.technique} — ${bypassResult.detail}`
            : `${patchId}: round ${round} — attacker claimed bypass but it was BLOCKED (${bypassResult.detail})`,
          level: bypassResult.success ? "error" : "warning",
          meta: { patchId, round, outcome: bypassResult.success ? "bypass-confirmed" : "bypass-failed" },
        });

        if (!bypassResult.success) {
          // Attacker claimed a bypass but it didn't actually work — count as concede for this round
          previousAttempts.push({
            technique: attack.technique,
            outcome: "bypass did not confirm",
          });
          transcript.push({
            round,
            attackerTechnique: attack.technique,
            attackerReasoning: attack.reasoning,
            bypassFound: true,
            bypassResult: {
              success: false,
              detail: bypassResult.detail,
              logs: bypassResult.logs,
            },
            defender: null,
            defenseVerification: null,
            outcome: "bypass-unconfirmed",
          });
          // Continue to next round — attacker may try again
          continue;
        }

        // Bypass confirmed — defender must iterate
        await emitAndStore({
          stage: "sandboxing",
          message: `${patchId}: 🛡️  round ${round} — defender iterating patch to block "${attack.technique}"…`,
          level: "info",
          meta: { patchId, round, phase: "defender-iterate" },
        });

        const defense = await generateImprovedPatch(
          codebase.name,
          codebase.sourceCode,
          currentPatched,
          vuln,
          attack.bypassCode,
          attack.technique
        );

        // Verify the improved patch: original exploit blocked + bypass blocked
        const reOriginal = exploit.exploitCode
          ? await runExploit(exploit.exploitCode, defense.patchedCode, codebase.name, {
              label: `round ${round} re-verify original`,
            })
          : null;
        const reBypass = await runExploit(attack.bypassCode, defense.patchedCode, codebase.name, {
          label: `round ${round} re-verify bypass`,
        });
        const originalBlocked = !reOriginal?.success;
        const bypassBlocked = !reBypass.success;

        await emitAndStore({
          stage: "sandboxing",
          message:
            originalBlocked && bypassBlocked
              ? `${patchId}: 🟢 round ${round} — defender's new patch blocks both original + bypass`
              : `${patchId}: ⚠️ round ${round} — defender patch incomplete (original blocked: ${originalBlocked}, bypass blocked: ${bypassBlocked})`,
          level: originalBlocked && bypassBlocked ? "success" : "warning",
          meta: { patchId, round, originalBlocked, bypassBlocked },
        });

        transcript.push({
          round,
          attackerTechnique: attack.technique,
          attackerReasoning: attack.reasoning,
          bypassFound: true,
          bypassResult: {
            success: true,
            detail: bypassResult.detail,
            logs: bypassResult.logs,
          },
          defender: {
            technique: defense.technique,
            reasoning: defense.reasoning,
            patchedCode: defense.patchedCode,
          },
          defenseVerification: {
            originalBlocked,
            bypassBlocked,
            originalLogs: reOriginal?.logs ?? null,
            bypassLogs: reBypass.logs,
          },
          outcome: originalBlocked && bypassBlocked ? "defender-won-round" : "defender-partial",
        });

        previousAttempts.push({
          technique: attack.technique,
          outcome: originalBlocked && bypassBlocked ? "blocked by defender" : "partially blocked",
        });

        currentPatched = defense.patchedCode;
        adversarialWon = originalBlocked && bypassBlocked;

        // If defender won this round AND it was the bypass round, the loop
        // continues to let the attacker try once more (unless we hit MAX_ROUNDS).
      }

      await emitAndStore({
        stage: "sandboxing",
        message: adversarialWon
          ? `${patchId}: 🏆 adversarial arena complete — defender wins after ${transcript.length} round(s)`
          : `${patchId}: ⚠️ adversarial arena ended without a clear defender win after ${transcript.length} round(s)`,
        level: adversarialWon ? "success" : "warning",
        meta: { patchId, phase: "adversarial-end", rounds: transcript.length, adversarialWon },
      });

      // Compute a REAL diff from original -> FINAL patched (after adversarial loop)
      const realDiff = unifiedDiff(codebase.sourceCode, currentPatched, codebase.name);

      await db.patch.create({
        data: {
          patchId,
          codebaseId: codebase.id,
          scanId: scan.id,
          title: vuln.title,
          severity: vuln.severity,
          cve: vuln.cve,
          affectedFile: vuln.affectedFile,
          aiExplanation: vuln.explanation,
          aiReasoning: vuln.reasoning,
          confidence: vuln.confidence,
          originalCode: codebase.sourceCode,
          patchedCode: currentPatched,
          diffPayload: realDiff,
          testCode: generated.testCode,
          sandboxLogs: sandbox.logs,
          sandboxPassed: sandbox.passed,
          exploitCode: exploit.exploitCode || null,
          exploitOriginalResult: exploitOriginal
            ? JSON.stringify({
                success: exploitOriginal.success,
                blocked: exploitOriginal.blocked,
                detail: exploitOriginal.detail,
                logs: exploitOriginal.logs,
                durationMs: exploitOriginal.durationMs,
              })
            : null,
          exploitPatchedResult: exploitPatched
            ? JSON.stringify({
                success: exploitPatched.success,
                blocked: exploitPatched.blocked,
                detail: exploitPatched.detail,
                logs: exploitPatched.logs,
                durationMs: exploitPatched.durationMs,
              })
            : null,
          adversarialRounds: transcript.length,
          adversarialWon,
          adversarialTranscript: JSON.stringify(transcript),
          status: "pending",
        },
      });
      created++;

      await emitAndStore({
        stage: "reviewing",
        message: `Patch ${patchId} queued for review (adversarial: ${adversarialWon ? "defender won" : "inconclusive"}, ${transcript.length} rounds).`,
        level: "success",
        meta: { patchId, severity: vuln.severity, passed: sandbox.passed, adversarialWon, rounds: transcript.length },
      });
    }

    await db.scan.update({
      where: { id: scan.id },
      data: {
        status: "completed",
        stageLabel: `${created} patch(es) ready for review`,
        completedAt: new Date(),
      },
    });
    await emitAndStore({
      stage: "completed",
      message: `Scan complete — ${created} patch(es) ready for review.`,
      level: "success",
      meta: { patchCount: created },
    });

    return { scanId: scan.id, patchCount: created };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.scan.update({
      where: { id: scan.id },
      data: { status: "failed", stageLabel: `Failed: ${msg}`, completedAt: new Date() },
    });
    await emitAndStore({
      stage: "failed",
      message: `Pipeline failed: ${msg}`,
      level: "error",
      meta: { error: msg },
    });
    throw err;
  }
}
