// Z.AI SDK config bootstrap for serverless environments.
//
// The z-ai-web-dev-sdk looks for a `.z-ai-config` JSON file at one of:
//   - process.cwd()/.z-ai-config
//   - homedir()/.z-ai-config
//   - /etc/.z-ai-config
//
// None of those paths are writable on Vercel. So when the ZAI_CONFIG env
// var is set (we add it on the Vercel project), this helper writes the
// contents to a temp file and points the SDK at it by setting the
// appropriate env var. The SDK only reads the file once on `ZAI.create()`,
// so we call this lazily before the first create() call.
//
// Usage:
//   import { ensureZaiConfig } from "@/lib/zai-config";
//   ensureZaiConfig();
//   const z = await ZAI.create();

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

let ensured = false;
const CONFIG_PATH = join(tmpdir(), ".z-ai-config");

export function ensureZaiConfig(): string | null {
  if (ensured) return CONFIG_PATH;

  // If a config file already exists at one of the search paths, do nothing.
  const candidates = [
    join(process.cwd(), ".z-ai-config"),
    join(homedir() ?? "/tmp", ".z-ai-config"),
    "/etc/.z-ai-config",
    CONFIG_PATH,
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      ensured = true;
      return p;
    }
  }

  // Otherwise, if ZAI_CONFIG env var is set, write it to a temp file.
  const raw = process.env.ZAI_CONFIG;
  if (!raw) {
    return null;
  }

  try {
    // Validate it parses as JSON (catches malformed env vars).
    JSON.parse(raw);
    mkdirSync(tmpdir(), { recursive: true });
    writeFileSync(CONFIG_PATH, raw, { mode: 0o600 });
    ensured = true;
    return CONFIG_PATH;
  } catch (err) {
    console.warn("[zai-config] ZAI_CONFIG env var is not valid JSON:", err);
    return null;
  }
}
