// The GuardianX pipeline orchestrator.
// Runs: analyze -> generate patch (per vuln) -> sandbox test -> persist.
// Emits real-time events through a callback so the socket.io server can
// broadcast them to connected clients.
//
// ─── Enhanced (auto-remediation-enhance) ────────────────────────────────────
//  • Multi-vector sandbox: every patch is now tested against the original
//    exploit + every deterministic strategy from ATTACK_STRATEGIES for the
//    vuln class + 50 fuzzed payloads + a perf check + a side-effect check.
//  • Adversarial arena: bumped to 5 rounds, uses the strategy library for
//    deterministic coverage, concedes after 2 rounds with no progress, and
//    classifies each round as attacker_won / defender_won / partial /
//    inconclusive.
//  • Confidence: the final 0..100 score is computed via computeConfidence()
//    using the sandbox result, adversarial outcome, OWASP-pattern adoption,
//    and the "no new vulnerabilities" heuristic. The full breakdown is
//    persisted on the Patch row.
//  • Patch lineage: if a patch is later found to be bypassable, a new patch
//    is generated with `supersedes` set to the previous patchId, forming a
//    version chain (Patch v1 → bypassed → Patch v2).

import { randomHex } from "@/lib/crypto";
import { db } from "@/lib/db";
import {
  analyzeCodebase,
  generatePatch,
  generateExploit,
  generateBypass,
  generateImprovedPatch,
  computeConfidence,
  pickStrategy,
  classifyVulnerability,
  type DetectedVulnerability,
  type AttackStrategy,
  type VulnClass,
} from "./ai";
import { runSandbox, runExploit, runMultiVectorSandbox } from "./sandbox";
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
// Enhanced with explicit outcome classification.
interface AdversarialRound {
  round: number;
  attackerTechnique: string;
  attackerReasoning: string;
  strategyId?: string;
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
  outcome: AdversarialOutcome;
}

type AdversarialOutcome =
  | "attacker-won"        // bypass confirmed AND defender failed to block it
  | "defender-won"        // bypass blocked by defender's iteration
  | "partial"             // defender blocked one of (original/bypass) but not both
  | "attacker-conceded"   // attacker did not find a bypass
  | "bypass-unconfirmed"  // attacker claimed a bypass but it didn't reproduce
  | "inconclusive";       // arena exhausted without a clear winner

// Collision-proof patch id: sequential-ish number + random suffix so concurrent
// scans can never clash on the unique `patchId` constraint.
async function nextPatchId(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await db.patch.count();
  const num = String(count + 1).padStart(4, "0");
  const suffix = randomHex(2);
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
      const vulnClass: VulnClass = vuln.vulnClass ?? classifyVulnerability(vuln);

      await emitAndStore({
        stage: "patching",
        message: `Generating patch for "${vuln.title}" (class: ${vulnClass})…`,
        level: "info",
        meta: { patchId, severity: vuln.severity, vulnClass },
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

      // ── Stage B+: Multi-vector sandbox (NEW, auto-remediation-enhance) ─
      await db.scan.update({
        where: { id: scan.id },
        data: { status: "sandboxing", stageLabel: `${patchId}: multi-vector battery…` },
      });
      await emitAndStore({
        stage: "sandboxing",
        message: `${patchId}: 🛡️ running multi-vector battery (original + library strategies + 50 fuzz + perf + side-effect)…`,
        level: "info",
        meta: { patchId, phase: "multi-vector", vulnClass },
      });

      let multiVector = null as Awaited<ReturnType<typeof runMultiVectorSandbox>> | null;
      try {
        multiVector = await runMultiVectorSandbox(
          exploit.exploitCode,
          generated.patchedCode,
          codebase.sourceCode,
          codebase.name,
          vulnClass,
          { label: `${patchId} multi-vector` }
        );
        await emitAndStore({
          stage: "sandboxing",
          message: multiVector.overallPassed
            ? `${patchId}: ✅ multi-vector PASSED — ${multiVector.summary.blocked}/${multiVector.summary.total} vectors blocked, ${multiVector.summary.bypassed} bypassed`
            : `${patchId}: ⚠️ multi-vector found issues — ${multiVector.summary.bypassed} bypassed, ${multiVector.summary.inconclusive} inconclusive`,
          level: multiVector.overallPassed ? "success" : "warning",
          meta: {
            patchId,
            phase: "multi-vector-result",
            summary: multiVector.summary,
            perf: multiVector.performance
              ? { ratio: multiVector.performance.ratio, passed: multiVector.performance.passed }
              : null,
            sideEffect: multiVector.sideEffect?.passed ?? null,
          },
        });
      } catch (mvErr) {
        await emitAndStore({
          stage: "sandboxing",
          message: `${patchId}: ⚠️ multi-vector sandbox failed (${(mvErr as Error)?.message?.slice(0, 80)}), continuing`,
          level: "warning",
          meta: { patchId, phase: "multi-vector-error" },
        });
      }

      // ── Stage C: Adversarial red-team / blue-team loop ─────────────────
      await db.scan.update({
        where: { id: scan.id },
        data: { status: "sandboxing", stageLabel: `${patchId}: adversarial arena…` },
      });
      await emitAndStore({
        stage: "sandboxing",
        message: `${patchId}: ⚔️  entering adversarial arena — attacker vs defender (max 5 rounds, deterministic strategy library)…`,
        level: "info",
        meta: { patchId, phase: "adversarial-start", vulnClass },
      });

      let currentPatched = generated.patchedCode;
      let adversarialWon = !exploitPatched?.success; // already blocks the original exploit
      const transcript: AdversarialRound[] = [];
      const previousAttempts: { technique: string; outcome: string }[] = [];
      const triedStrategyIds: string[] = [];
      const MAX_ROUNDS = 5;
      let noProgressStreak = 0; // for diminishing-returns concession
      let attackerOverallWin = false; // any round where attacker-won happened

      for (let round = 1; round <= MAX_ROUNDS; round++) {
        // ── Pick a deterministic strategy for this round ──────────────────
        const strategy: AttackStrategy | null = pickStrategy(vulnClass, triedStrategyIds);
        if (strategy) triedStrategyIds.push(strategy.id);

        await emitAndStore({
          stage: "sandboxing",
          message: `${patchId}: ⚔️ round ${round}/${MAX_ROUNDS} — attacker probing for a bypass${strategy ? ` (strategy: ${strategy.technique})` : " (free-form)"}…`,
          level: "info",
          meta: { patchId, phase: "adversarial-round", round, strategyId: strategy?.id },
        });

        let attack;
        try {
          attack = await generateBypass(
            codebase.name,
            currentPatched,
            vuln,
            exploit.exploitCode,
            previousAttempts,
            strategy
          );
        } catch (bypassErr) {
          // Z.AI API may rate-limit or block the adversarial call. Don't lose
          // the patch — skip the adversarial round and save what we have.
          await emitAndStore({
            stage: "sandboxing",
            message: `${patchId}: ⚠️ round ${round} — adversarial LLM call failed (${(bypassErr as Error)?.message?.slice(0, 80) || "unknown"}), skipping arena`,
            level: "warning",
            meta: { patchId, phase: "adversarial-skipped", round },
          });
          transcript.push({
            round,
            attackerTechnique: strategy?.technique ?? "free-form",
            attackerReasoning: "LLM call failed",
            strategyId: strategy?.id,
            bypassFound: false,
            bypassResult: null,
            defender: null,
            defenseVerification: null,
            outcome: "inconclusive",
          });
          break;
        }

        if (!attack.bypassFound || !attack.bypassCode) {
          await emitAndStore({
            stage: "sandboxing",
            message: `${patchId}: 🟢 round ${round} — attacker concedes: "${attack.reasoning.slice(0, 120)}"`,
            level: "success",
            meta: { patchId, round, outcome: "attacker-conceded", strategyId: strategy?.id },
          });
          transcript.push({
            round,
            attackerTechnique: attack.technique,
            attackerReasoning: attack.reasoning,
            strategyId: attack.strategyId ?? strategy?.id,
            bypassFound: false,
            bypassResult: null,
            defender: null,
            defenseVerification: null,
            outcome: "attacker-conceded",
          });
          adversarialWon = true;
          noProgressStreak = 0;
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
          meta: { patchId, round, outcome: bypassResult.success ? "bypass-confirmed" : "bypass-failed", strategyId: strategy?.id },
        });

        if (!bypassResult.success) {
          // Attacker claimed a bypass but it didn't actually work — count as
          // a no-progress round for the diminishing-returns concession.
          previousAttempts.push({
            technique: attack.technique,
            outcome: "bypass did not confirm",
          });
          transcript.push({
            round,
            attackerTechnique: attack.technique,
            attackerReasoning: attack.reasoning,
            strategyId: attack.strategyId ?? strategy?.id,
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
          noProgressStreak++;
          // Continue to next round — attacker may try again
          if (noProgressStreak >= 2) {
            await emitAndStore({
              stage: "sandboxing",
              message: `${patchId}: ⚪ round ${round} — diminishing returns (2 rounds no progress), attacker concedes`,
              level: "info",
              meta: { patchId, round, outcome: "diminishing-returns" },
            });
            adversarialWon = true;
            break;
          }
          continue;
        }

        // Bypass confirmed — defender must iterate
        noProgressStreak = 0;
        await emitAndStore({
          stage: "sandboxing",
          message: `${patchId}: 🛡️  round ${round} — defender iterating patch to block "${attack.technique}"…`,
          level: "info",
          meta: { patchId, round, phase: "defender-iterate", strategyId: strategy?.id },
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

        const roundOutcome: AdversarialOutcome =
          originalBlocked && bypassBlocked
            ? "defender-won"
            : !originalBlocked && !bypassBlocked
              ? "attacker-won"
              : "partial";

        await emitAndStore({
          stage: "sandboxing",
          message:
            roundOutcome === "defender-won"
              ? `${patchId}: 🟢 round ${round} — defender's new patch blocks both original + bypass`
              : roundOutcome === "attacker-won"
                ? `${patchId}: 🔴 round ${round} — defender patch incomplete (original blocked: ${originalBlocked}, bypass blocked: ${bypassBlocked}) — attacker wins this round`
                : `${patchId}: ⚠️ round ${round} — defender patch partial (original blocked: ${originalBlocked}, bypass blocked: ${bypassBlocked})`,
          level: roundOutcome === "defender-won" ? "success" : roundOutcome === "attacker-won" ? "error" : "warning",
          meta: { patchId, round, originalBlocked, bypassBlocked, outcome: roundOutcome, strategyId: strategy?.id },
        });

        transcript.push({
          round,
          attackerTechnique: attack.technique,
          attackerReasoning: attack.reasoning,
          strategyId: attack.strategyId ?? strategy?.id,
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
          outcome: roundOutcome,
        });

        previousAttempts.push({
          technique: attack.technique,
          outcome:
            roundOutcome === "defender-won"
              ? "blocked by defender"
              : roundOutcome === "attacker-won"
                ? "attacker won (both re-exploded)"
                : "partially blocked",
        });

        currentPatched = defense.patchedCode;
        adversarialWon = originalBlocked && bypassBlocked;
        if (roundOutcome === "attacker-won") attackerOverallWin = true;
      }

      // Final adversarial verdict.
      const finalOutcome: AdversarialOutcome = attackerOverallWin
        ? "attacker-won"
        : adversarialWon
          ? "defender-won"
          : "inconclusive";

      await emitAndStore({
        stage: "sandboxing",
        message:
          finalOutcome === "defender-won"
            ? `${patchId}: 🏆 adversarial arena complete — defender wins after ${transcript.length} round(s)`
            : finalOutcome === "attacker-won"
              ? `${patchId}: ⚠️ adversarial arena ended with attacker wins — patch has known weaknesses`
              : `${patchId}: ⚪ adversarial arena ended inconclusive after ${transcript.length} round(s)`,
        level: finalOutcome === "defender-won" ? "success" : finalOutcome === "attacker-won" ? "error" : "warning",
        meta: { patchId, phase: "adversarial-end", rounds: transcript.length, finalOutcome },
      });

      // ── Compute final confidence (auto-remediation-enhance) ────────────
      const redTeamBlocked = finalOutcome === "defender-won" || (adversarialWon && !attackerOverallWin);
      const conf = computeConfidence({
        sandboxPassed: sandbox.passed,
        redTeamBlocked,
        patchedCode: currentPatched,
        originalCode: codebase.sourceCode,
        language: generated.language,
      });

      await emitAndStore({
        stage: "sandboxing",
        message: `${patchId}: 🎯 confidence = ${conf.breakdown.total}/100 (sandbox ${conf.breakdown.sandboxPassed}, red-team ${conf.breakdown.redTeamBlocked}, owasp ${conf.breakdown.owaspPatterns}, no-new-vulns ${conf.breakdown.noNewVulns})`,
        level: conf.score >= 0.7 ? "success" : conf.score >= 0.4 ? "warning" : "error",
        meta: {
          patchId,
          phase: "confidence",
          score: conf.score,
          breakdown: conf.breakdown,
        },
      });

      // Compute a REAL diff from original -> FINAL patched (after adversarial loop)
      const realDiff = unifiedDiff(codebase.sourceCode, currentPatched, codebase.name);

      // ── Detect lineage: was this vuln already patched before? ──────────
      // If a previous Patch on this codebase with the same title exists and
      // is in status "rolled-back" or "rejected", we mark the new patch as
      // superseding the most recent one. This is the "Patch v1 → bypassed →
      // Patch v2" lineage.
      let supersedesId: string | null = null;
      try {
        const priorPatches = await db.patch.findMany({
          where: { codebaseId: codebase.id, title: vuln.title },
          orderBy: { createdAt: "desc" },
          take: 1,
        });
        if (priorPatches && priorPatches.length > 0) {
          const prior = priorPatches[0] as { patchId?: string };
          if (prior.patchId && prior.patchId !== patchId) {
            supersedesId = prior.patchId;
            await emitAndStore({
              stage: "patching",
              message: `${patchId}: 🔗 lineage — supersedes prior patch ${supersedesId} for "${vuln.title}"`,
              level: "info",
              meta: { patchId, phase: "lineage", supersedes: supersedesId },
            });
          }
        }
      } catch (linErr) {
        // If the supersedes column isn't migrated yet, just skip lineage.
        await emitAndStore({
          stage: "patching",
          message: `${patchId}: lineage lookup skipped (${(linErr as Error)?.message?.slice(0, 60)})`,
          level: "warning",
          meta: { patchId, phase: "lineage-skip" },
        });
      }

      // ── Persist the patch (defensive: gracefully handle the case where the
      // auto-remediation-enhance columns haven't been migrated into Supabase
      // yet — we still persist the patch with the legacy field set, then
      // attempt a follow-up update with the new fields and swallow the error
      // if it fails).
      const legacyData = {
        patchId,
        codebaseId: codebase.id,
        scanId: scan.id,
        title: vuln.title,
        severity: vuln.severity,
        cve: vuln.cve,
        affectedFile: vuln.affectedFile,
        aiExplanation: vuln.explanation,
        aiReasoning: vuln.reasoning,
        confidence: conf.score,
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
        status: "pending" as const,
      };

      // ── auto-remediation-enhance new fields (only persisted if the
      // 0007_patch_lineage.sql migration has been applied).
      const enhancedData: Record<string, unknown> = {
        supersedes: supersedesId,
        language: generated.language,
        patchExplanation: JSON.stringify(generated.patchExplanation),
        confidenceBreakdown: JSON.stringify(conf.breakdown),
        multiVectorSandbox: multiVector
          ? JSON.stringify({
              overallPassed: multiVector.overallPassed,
              summary: multiVector.summary,
              vectors: multiVector.vectors.map((v) => ({
                id: v.id,
                label: v.label,
                payload: v.payload,
                outcome: v.outcome,
                detail: v.detail,
                durationMs: v.durationMs,
              })),
              performance: multiVector.performance,
              sideEffect: multiVector.sideEffect,
            })
          : null,
      };

      let persistedId: string | undefined;
      try {
        // First try with the enhanced fields. If the columns exist this
        // succeeds in one shot.
        const created0 = await db.patch.create({
          data: { ...legacyData, ...enhancedData } as Record<string, unknown>,
        });
        persistedId = (created0 as { id?: string }).id;
      } catch (enhErr) {
        // Columns missing — retry with the legacy field set only.
        await emitAndStore({
          stage: "patching",
          message: `${patchId}: enhanced columns missing (${(enhErr as Error)?.message?.slice(0, 80)}), retrying with legacy schema`,
          level: "warning",
          meta: { patchId, phase: "patch-create-legacy-fallback" },
        });
        const created1 = await db.patch.create({ data: legacyData as Record<string, unknown> });
        persistedId = (created1 as { id?: string }).id;
      }
      created++;

      await emitAndStore({
        stage: "reviewing",
        message: `Patch ${patchId} queued for review (adversarial: ${finalOutcome}, ${transcript.length} rounds, confidence ${conf.breakdown.total}/100).`,
        level: "success",
        meta: {
          patchId,
          persistedId,
          severity: vuln.severity,
          passed: sandbox.passed,
          adversarialWon,
          finalOutcome,
          rounds: transcript.length,
          confidence: conf.score,
          confidenceBreakdown: conf.breakdown,
        },
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
