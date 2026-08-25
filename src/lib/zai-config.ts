// Z.AI SDK config bootstrap for serverless environments.
//
// The z-ai-web-dev-sdk looks for a `.z-ai-config` JSON file at one of:
//   - process.cwd()/.z-ai-config
//   - homedir()/.z-ai-config
//   - /etc/.z-ai-config
//
// On Vercel serverless functions:
//   - process.cwd() is /var/task (read-only deployment bundle)
//   - homedir() is /home/sbx_user1059 (WRITABLE — this is where we write)
//   - /etc/ is read-only
//
// So we write the config to homedir()/.z-ai-config from the ZAI_CONFIG
// env var. The SDK finds it there on the next ZAI.create() call.
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
  const homeDir = homedir() || "/tmp";
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

  // Otherwise, if ZAI_CONFIG env var is set, write it to homedir()
  // (which is writable on Vercel) so the SDK can find it.
  const raw = process.env.ZAI_CONFIG;
  if (!raw) {
    return null;
  }

  try {
    // Validate it parses as JSON (catches malformed env vars).
    JSON.parse(raw);
    const targetDir = homeDir;
    mkdirSync(targetDir, { recursive: true });
    const targetPath = join(targetDir, ".z-ai-config");
    writeFileSync(targetPath, raw, { mode: 0o600 });
    ensured = true;
    return targetPath;
  } catch (err) {
    console.warn("[zai-config] failed to write .z-ai-config:", err);
    return null;
  }
}

