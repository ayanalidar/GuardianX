import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { writeFile, mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/audit-scraper — run the Python audit scraper engine.
// Body: JSON matching the ScraperConfig schema.
// Returns: the structured audit result payload.
export async function POST(req: Request) {
  const config = await req.json().catch(() => ({}));

  if (!config.target_url) {
    return NextResponse.json({ error: "target_url required" }, { status: 400 });
  }

  let dir: string | null = null;
  try {
    dir = await mkdtemp(join(tmpdir(), "guardianx-scraper-"));
    const inputPath = join(dir, "config.json");
    const outputPath = join(dir, "result.json");
    await writeFile(inputPath, JSON.stringify(config), "utf8");

    const scriptPath = join(process.cwd(), "mini-services", "audit-scraper", "run.py");

    const exitCode = await new Promise<number>((resolve) => {
      const child = spawn("python3", [scriptPath, inputPath], {
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("close", (code) => {
        if (code !== 0) console.error("[audit-scraper] stderr:", stderr);
        // Write stdout to output file
        writeFile(outputPath, stdout, "utf8").catch(() => null);
        resolve(code ?? -1);
      });
      child.on("error", () => resolve(-1));
    });

    if (exitCode !== 0) {
      // Try to read whatever output we got
      try {
        const output = await readFile(outputPath, "utf8");
        if (output.trim()) {
          return NextResponse.json(JSON.parse(output));
        }
      } catch { /* no output */ }
      return NextResponse.json(
        { error: `scraper failed (exit ${exitCode})` },
        { status: 500 }
      );
    }

    const output = await readFile(outputPath, "utf8");
    const result = JSON.parse(output);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => null);
  }
}

// GET /api/audit-scraper — return the schema example
export async function GET() {
  return NextResponse.json({
    description: "GuardianX Audit Scraper Engine — dual-mode web scraping for authorized audit tasks.",
    schema: {
      target_url: "string (required) — URL to scrape",
      execution_mode: "'lightweight' | 'browser' (default: lightweight)",
      rate_limit_delay_ms: "int (default: 1000) — delay between requests",
      timeout_ms: "int (default: 30000) — request timeout",
      max_retries: "int (default: 3) — retry attempts on transient failures",
      headers: "dict — custom HTTP headers",
      target_selectors: [{
        field_name: "string — logical name for extracted field",
        selector: "string — CSS or XPath selector",
        selector_type: "'css' | 'xpath' (default: css)",
        attribute: "string? — HTML attribute to extract (e.g. href)",
        multiple: "bool (default: false) — extract all matches as list",
        required: "bool (default: true) — error if not found",
        default: "any? — fallback value if not found",
      }],
      sanitization_rules: [{
        key: "string — rule name or built-in pattern (email, phone, ssn, api_key, jwt, aws_key, private_key, ipv4)",
        pattern: "string? — custom regex (overrides built-in)",
        replacement: "string (default: [REDACTED])",
        applies_to: "string[]? — field names this rule applies to",
      }],
    },
    example: {
      target_url: "http://localhost:3004",
      execution_mode: "lightweight",
      target_selectors: [
        { field_name: "title", selector: "h1", selector_type: "css", required: true },
        { field_name: "links", selector: "a", selector_type: "css", attribute: "href", multiple: true },
      ],
      sanitization_rules: [
        { key: "email", replacement: "[EMAIL_REDACTED]" },
        { key: "api_key", replacement: "[REDACTED]" },
      ],
    },
  });
}
