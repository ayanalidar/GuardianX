// Real sandbox executor. Writes the AI-generated test file to a temp directory
// and runs it with `bun` in an isolated child process with a hard timeout.
// Returns the REAL stdout/stderr/exit code — no mock logs.

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface SandboxResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  passed: boolean;
  logs: string;
}

export async function runSandbox(
  testCode: string,
  opts: { timeoutMs?: number; patchedCode?: string; patchedFilename?: string } = {}
): Promise<SandboxResult> {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  let dir: string | null = null;

  try {
    dir = await mkdtemp(join(tmpdir(), "sentinel-sandbox-"));
    const testFile = join(dir, "test.js");
    await writeFile(testFile, testCode, "utf8");

    // Also write the patched source so tests that require('./<file>') resolve.
    if (opts.patchedCode && opts.patchedFilename) {
      const safeName = opts.patchedFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
      await writeFile(join(dir, safeName), opts.patchedCode, "utf8");
    }

    const start = Date.now();
    const result = await new Promise<{
      exitCode: number | null;
      stdout: string;
      stderr: string;
      timedOut: boolean;
    }>((resolve) => {
      const child = spawn("bun", ["run", testFile], {
        cwd: dir!,
        env: {
          // Minimal, sanitized env — no network vars, no secrets leak.
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: dir!,
          NODE_ENV: "test",
        },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 0, // we manage the timeout ourselves
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      child.stdout.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr.on("data", (d) => {
        stderr += d.toString();
      });

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code, stdout, stderr, timedOut });
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        stderr += `\n[sandbox] spawn error: ${err.message}\n`;
        resolve({ exitCode: -1, stdout, stderr, timedOut });
      });
    });

    const durationMs = Date.now() - start;
    const exitCode = result.exitCode;
    const passed = !result.timedOut && exitCode === 0;

    const logs = formatLogs({
      testFile,
      ...result,
      durationMs,
      passed,
    });

    return {
      exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
      timedOut: result.timedOut,
      passed,
      logs,
    };
  } catch (err) {
    const durationMs = 0;
    const msg = err instanceof Error ? err.message : String(err);
    return {
      exitCode: -1,
      stdout: "",
      stderr: msg,
      durationMs,
      timedOut: false,
      passed: false,
      logs: `[sandbox] failed to execute: ${msg}\n`,
    };
  } finally {
    if (dir) {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

function formatLogs(args: {
  testFile: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  passed: boolean;
}): string {
  const ts = () => new Date().toISOString().slice(11, 19);
  const lines: string[] = [];
  lines.push(`[${ts()}] SentinelPatch sandbox runtime (bun)`);
  lines.push(`[${ts()}] Working dir: isolated temp directory`);
  lines.push(`[${ts()}] Test file: ${args.testFile}`);
  lines.push(`[${ts()}] Timeout: 12000ms`);
  lines.push(`[${ts()}] Executing: bun run test.js`);
  lines.push(`[${ts()}] --- stdout ---`);
  if (args.stdout.trim()) {
    for (const line of args.stdout.split("\n")) lines.push(`[${ts()}] ${line}`);
  } else {
    lines.push(`[${ts()}] (no stdout)`);
  }
  if (args.stderr.trim()) {
    lines.push(`[${ts()}] --- stderr ---`);
    for (const line of args.stderr.split("\n")) lines.push(`[${ts()}] ${line}`);
  }
  lines.push(`[${ts()}] --- result ---`);
  lines.push(`[${ts()}] Exit code: ${args.exitCode}`);
  lines.push(`[${ts()}] Duration: ${args.durationMs}ms`);
  if (args.timedOut) {
    lines.push(`[${ts()}] ⚠ TIMED OUT after 12000ms`);
  }
  if (args.passed) {
    lines.push(`[${ts()}] ✓ VERDICT: SAFE TO APPLY — all tests passed`);
  } else {
    lines.push(`[${ts()}] ✗ VERDICT: NEEDS REVIEW — tests did not pass`);
  }
  return lines.join("\n");
}

// ── Exploit runner ────────────────────────────────────────────────────────
// Runs a PoC exploit against a target source file (original OR patched) in an
// isolated temp dir. Parses EXPLOIT_SUCCESS / EXPLOIT_BLOCKED markers.

export interface ExploitResult {
  success: boolean; // true = vuln was exploited (EXPLOIT_SUCCESS)
  blocked: boolean; // true = patch blocked it (EXPLOIT_BLOCKED)
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  detail: string; // the text after the marker
  logs: string;
}

export async function runExploit(
  exploitCode: string,
  targetCode: string,
  targetFilename: string,
  opts: { timeoutMs?: number; label?: string } = {}
): Promise<ExploitResult> {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const label = opts.label ?? "exploit";
  let dir: string | null = null;

  try {
    dir = await mkdtemp(join(tmpdir(), "sentinel-exploit-"));
    const exploitFile = join(dir, "exploit.js");
    const safeName = targetFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
    await writeFile(exploitFile, exploitCode, "utf8");
    await writeFile(join(dir, safeName), targetCode, "utf8");

    const start = Date.now();
    const result = await new Promise<{
      exitCode: number | null;
      stdout: string;
      stderr: string;
      timedOut: boolean;
    }>((resolve) => {
      const child = spawn("bun", ["run", exploitFile], {
        cwd: dir!,
        env: {
          PATH: process.env.PATH ?? "/usr/bin:/bin",
          HOME: dir!,
          NODE_ENV: "test",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));

      const timer = setTimeout(() => {
        timedOut = true;
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code, stdout, stderr, timedOut });
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        stderr += `\n[exploit] spawn error: ${err.message}\n`;
        resolve({ exitCode: -1, stdout, stderr, timedOut });
      });
    });

    const durationMs = Date.now() - start;
    const combined = result.stdout + "\n" + result.stderr;
    const successMatch = combined.match(/EXPLOIT_SUCCESS:\s*(.+)/i);
    const blockedMatch = combined.match(/EXPLOIT_BLOCKED:\s*(.+)/i);
    const errorMatch = combined.match(/EXPLOIT_ERROR:\s*(.+)/i);

    const success = !!successMatch && !result.timedOut;
    const blocked = !!blockedMatch;
    const detail =
      successMatch?.[1]?.trim() ??
      blockedMatch?.[1]?.trim() ??
      errorMatch?.[1]?.trim() ??
      (result.timedOut ? "timed out" : "no marker emitted");

    return {
      success,
      blocked,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs,
      timedOut: result.timedOut,
      detail,
      logs: formatExploitLogs({
        label,
        targetFile: safeName,
        ...result,
        durationMs,
        success,
        blocked,
        detail,
      }),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      blocked: false,
      exitCode: -1,
      stdout: "",
      stderr: msg,
      durationMs: 0,
      timedOut: false,
      detail: `runner error: ${msg}`,
      logs: `[exploit] failed to execute: ${msg}\n`,
    };
  } finally {
    if (dir) {
      try {
        await rm(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

function formatExploitLogs(args: {
  label: string;
  targetFile: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  success: boolean;
  blocked: boolean;
  detail: string;
}): string {
  const ts = () => new Date().toISOString().slice(11, 19);
  const lines: string[] = [];
  lines.push(`[${ts()}] SentinelPatch exploit runner — ${args.label}`);
  lines.push(`[${ts()}] Target: ${args.targetFile}`);
  lines.push(`[${ts()}] Timeout: 12000ms`);
  lines.push(`[${ts()}] --- stdout ---`);
  if (args.stdout.trim()) {
    for (const line of args.stdout.split("\n")) lines.push(`[${ts()}] ${line}`);
  } else {
    lines.push(`[${ts()}] (no stdout)`);
  }
  if (args.stderr.trim()) {
    lines.push(`[${ts()}] --- stderr ---`);
    for (const line of args.stderr.split("\n")) lines.push(`[${ts()}] ${line}`);
  }
  lines.push(`[${ts()}] --- verdict ---`);
  lines.push(`[${ts()}] Exit code: ${args.exitCode}`);
  lines.push(`[${ts()}] Duration: ${args.durationMs}ms`);
  if (args.timedOut) lines.push(`[${ts()}] ⚠ TIMED OUT`);
  if (args.success) {
    lines.push(`[${ts()}] 🔴 EXPLOIT SUCCEEDED — ${args.detail}`);
  } else if (args.blocked) {
    lines.push(`[${ts()}] 🟢 EXPLOIT BLOCKED — ${args.detail}`);
  } else {
    lines.push(`[${ts()}] ⚠ EXPLOIT INCONCLUSIVE — ${args.detail}`);
  }
  return lines.join("\n");
}
