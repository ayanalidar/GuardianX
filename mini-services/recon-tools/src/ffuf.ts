// FFuF wrapper — runs ffuf against a URL with a wordlist, parses the JSON
// output (`-o json -of json`) into structured results.
//
// SECURITY: URL is validated as http(s)://. Header names/values are
// validated. Extensions are validated against a safe charset. All values
// are passed as separate args to Bun.spawn (no shell interpolation).

import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isSafeToken,
  isValidHeaderName,
  isValidHeaderValue,
  isValidUrl,
  runWithTimeout,
  type FfufInput,
  type FfufResult,
  type FfufResultItem,
} from "./types.js";

const TIMEOUT_MS = 60_000;
const DEFAULT_WORDLIST = "/usr/share/wordlists/dirb/common.txt";
const DEFAULT_EXTENSIONS = [".php", ".html", ".js", ".json", ".xml", ".txt", ".bak", ".old", ".git", ".env"];

export function validateFfufInput(input: FfufInput): void {
  const url = (input.url ?? "").trim();
  if (!isValidUrl(url)) {
    throw new Error(`Invalid url: ${url}`);
  }
  const wordlist = input.wordlist?.trim() || DEFAULT_WORDLIST;
  if (!isSafeToken(wordlist, 1024)) {
    throw new Error(`Invalid wordlist path: ${wordlist}`);
  }
  const method = (input.method ?? "GET").toUpperCase();
  if (!/^[A-Z]+$/.test(method) || method.length > 16) {
    throw new Error(`Invalid method: ${method}`);
  }
  const extensions = (input.extensions ?? DEFAULT_EXTENSIONS).filter((e) => /^[A-Za-z0-9.\-_]+$/.test(e) && e.length <= 32);
  if (extensions.length === 0) {
    throw new Error("Invalid extensions (must match [A-Za-z0-9.\\-_]+, ≤32 chars)");
  }
  if (input.headers) {
    for (const [name, value] of Object.entries(input.headers)) {
      if (!isValidHeaderName(name)) {
        throw new Error(`Invalid header name: ${name}`);
      }
      if (!isValidHeaderValue(value)) {
        throw new Error(`Invalid header value for ${name}`);
      }
    }
  }
}

export async function runFfuf(input: FfufInput): Promise<FfufResult> {
  validateFfufInput(input);

  const url = (input.url ?? "").trim();
  const wordlist = input.wordlist?.trim() || DEFAULT_WORDLIST;
  const method = (input.method ?? "GET").toUpperCase();
  const extensions = (input.extensions ?? DEFAULT_EXTENSIONS).filter((e) => /^[A-Za-z0-9.\-_]+$/.test(e) && e.length <= 32);
  const headerArgs: string[] = [];
  if (input.headers) {
    for (const [name, value] of Object.entries(input.headers)) {
      headerArgs.push("-H", `${name}: ${value}`);
    }
  }

  const dir = await mkdtemp(join(tmpdir(), "guardianx-ffuf-"));
  try {
    const outPath = join(dir, "results.json");
    const args: string[] = [
      "ffuf",
      "-u",
      url,
      "-w",
      wordlist,
      "-X",
      method,
      "-e",
      extensions.join(","),
      "-mc",
      "all", // match all status codes — caller filters
      "-of",
      "json",
      "-o",
      outPath,
      "-ac", // auto-calibration (filters false positives like custom 404 pages)
      "-t",
      "20", // 20 concurrent threads
      "-timeout",
      "5",
      ...headerArgs,
    ];

    const { exitCode, stdout, stderr, timedOut, durationMs } = await runWithTimeout({
      args,
      timeoutMs: TIMEOUT_MS,
      cwd: dir,
    });

    let results: FfufResultItem[] = [];
    let totalRequests = 0;
    try {
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw);
      // ffuf JSON shape: { results: [...], ... }
      const arr = Array.isArray(parsed?.results) ? parsed.results : Array.isArray(parsed) ? parsed : [];
      results = arr.map((r: any) => ({
        url: r.url ?? r.input?.FUZZ ?? "",
        input: r.input?.FUZZ ?? r.input ?? "",
        status: parseInt(r.status ?? 0, 10),
        length: parseInt(r.length ?? 0, 10),
        words: parseInt(r.words ?? 0, 10),
        lines: parseInt(r.lines ?? 0, 10),
        contentType: r["content-type"] ?? r.contentType,
        duration: r.duration ? parseInt(r.duration, 10) : undefined,
      }));
      totalRequests = parseInt(parsed?.config?.["total_requests"] ?? parsed?.total_requests ?? results.length, 10);
    } catch {
      // Output file might not exist (e.g. ffuf errored out)
      results = [];
    }

    if (exitCode !== 0 && !timedOut && results.length === 0) {
      throw new Error(`ffuf exited ${exitCode}: ${stderr || stdout || "(no output)"}`);
    }

    return {
      results,
      totalRequests,
      duration: durationMs,
      timedOut,
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function mockFfuf(input: FfufInput): FfufResult {
  return {
    results: [
      {
        url: `${input.url}admin`,
        input: "admin",
        status: 200,
        length: 1024,
        words: 128,
        lines: 32,
        contentType: "text/html",
      },
      {
        url: `${input.url}login`,
        input: "login",
        status: 200,
        length: 512,
        words: 64,
        lines: 16,
        contentType: "text/html",
      },
      {
        url: `${input.url}.env`,
        input: ".env",
        status: 200,
        length: 256,
        words: 8,
        lines: 8,
        contentType: "text/plain",
      },
    ],
    totalRequests: 4612,
    duration: 0,
  };
}
