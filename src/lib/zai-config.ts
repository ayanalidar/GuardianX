// Z.AI SDK config bootstrap for serverless environments.
//
// The z-ai-web-dev-sdk's loadConfig() searches for .z-ai-config at:
//   1. process.cwd()/.z-ai-config     — /var/task on Vercel (read-only)
//   2. os.homedir()/.z-ai-config      — /home/sbx_user1059 on Vercel
//   3. /etc/.z-ai-config              — read-only on Vercel
//
// The SDK uses `os.homedir()` which on Linux returns process.env.HOME.
// On Vercel, HOME is set to /home/sbx_user1059 which MAY be read-only.
//
// Strategy: write the config to /tmp/.z-ai-config (always writable on
// Vercel) AND set process.env.HOME = '/tmp' so os.homedir() returns
// /tmp and the SDK finds the config there.
//
// Usage:
//   import { ensureZaiConfig } from "@/lib/zai-config";
//   ensureZaiConfig();
//   const z = await ZAI.create();

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

let ensured = false;

export function ensureZaiConfig(): string | null {
  if (ensured) return "ok";

  // If a config file already exists at one of the SDK's search paths,
  // the SDK will find it — no action needed.
  const homeDir = homedir();
  const candidates = [
    join(process.cwd(), ".z-ai-config"),
    join(homeDir, ".z-ai-config"),
    "/etc/.z-ai-config",
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      ensured = true;
      return p;
    }
  }

  // Otherwise, if ZAI_CONFIG env var is set, write it to /tmp (always
  // writable on Vercel) and set HOME=/tmp so os.homedir() returns /tmp.
  const raw = process.env.ZAI_CONFIG;
  if (!raw) {
    return null;
  }

  try {
    // Validate it parses as JSON (catches malformed env vars).
    JSON.parse(raw);

    // Write to /tmp/.z-ai-config — /tmp is always writable on Vercel
    // serverless functions.
    const targetPath = "/tmp/.z-ai-config";
    writeFileSync(targetPath, raw, { mode: 0o600 });

    // Override HOME so os.homedir() returns /tmp, causing the SDK's
    // loadConfig() to find the config file at /tmp/.z-ai-config.
    process.env.HOME = "/tmp";

    ensured = true;
    return targetPath;
  } catch (err) {
    console.warn("[zai-config] failed to write .z-ai-config:", err);
    return null;
  }
}


