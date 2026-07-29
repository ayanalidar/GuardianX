// The SentinelPatch pipeline orchestrator.
// Runs: analyze -> generate patch (per vuln) -> sandbox test -> persist.
// Emits real-time events through a callback so the socket.io server can
// broadcast them to connected clients.

import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import {
  analyzeCodebase,
  generatePatch,
  type DetectedVulnerability,
} from "./ai";
import { runSandbox } from "./sandbox";
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
      codebase.sourceCode
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

      // Compute a REAL diff from original -> patched (don't trust LLM diff).
      const realDiff =
        generated.diff && generated.diff.includes("@@")
          ? generated.diff
          : unifiedDiff(codebase.sourceCode, generated.patchedCode, codebase.name);

      await db.scan.update({
        where: { id: scan.id },
        data: { status: "sandboxing", stageLabel: `Testing patch ${patchId} in sandbox…` },
      });

      await emitAndStore({
        stage: "sandboxing",
        message: `Running real test execution in isolated sandbox for ${patchId}…`,
        level: "info",
        meta: { patchId },
      });

      const sandbox = await runSandbox(generated.testCode, {
        patchedCode: generated.patchedCode,
        patchedFilename: codebase.name,
      });

      await emitAndStore({
        stage: "sandboxing",
        message: sandbox.passed
          ? `Sandbox PASSED for ${patchId} (exit 0, ${sandbox.durationMs}ms)`
          : `Sandbox FAILED for ${patchId} (exit ${sandbox.exitCode})`,
        level: sandbox.passed ? "success" : "error",
        meta: {
          patchId,
          exitCode: sandbox.exitCode,
          durationMs: sandbox.durationMs,
          timedOut: sandbox.timedOut,
        },
      });

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
          patchedCode: generated.patchedCode,
          diffPayload: realDiff,
          testCode: generated.testCode,
          sandboxLogs: sandbox.logs,
          sandboxPassed: sandbox.passed,
          status: "pending",
        },
      });
      created++;

      await emitAndStore({
        stage: "reviewing",
        message: `Patch ${patchId} queued for human review.`,
        level: "success",
        meta: { patchId, severity: vuln.severity, passed: sandbox.passed },
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
