// AES-256-GCM encryption for credential secrets at rest.
// The master key lives in SENTINEL_ENC_KEY (env, gitignored) and NEVER enters
// the database. Each credential gets its own random 12-byte IV per encryption.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_ENV = "SENTINEL_ENC_KEY";

function getKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(
      "SENTINEL_ENC_KEY is not set. Generate one with: openssl rand -base64 32"
    );
  }
  // The key is stored base64-encoded; decode to a 32-byte Buffer.
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `SENTINEL_ENC_KEY must decode to 32 bytes (got ${buf.length}). ` +
        "Generate with: openssl rand -base64 32"
    );
  }
  return buf;
}

export interface EncryptedSecret {
  cipher: string; // base64 ciphertext
  iv: string; // base64 12-byte nonce
  tag: string; // base64 16-byte auth tag
}

/** Encrypt a plaintext secret string with AES-256-GCM. */
export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    cipher: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/** Decrypt an encrypted secret back to plaintext (in-memory only). */
export function decryptSecret(enc: EncryptedSecret): string {
  const key = getKey();
  const iv = Buffer.from(enc.iv, "base64");
  const tag = Buffer.from(enc.tag, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([
    decipher.update(Buffer.from(enc.cipher, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}

/**
 * Build an authenticated clone URL for a repo, embedding the decrypted token.
 * The token is NEVER logged, this URL is used only for the git clone child
 * process and discarded immediately after.
 */
export function buildAuthedCloneUrl(
  repoUrl: string,
  kind: string,
  token: string,
  username?: string | null
): string {
  // Normalize: accept both https://host/owner/repo and host/owner/repo(.git)
  let url = repoUrl.trim();
  if (!/^https?:\/\//.test(url)) {
    url = "https://" + url;
  }
  const u = new URL(url);
  const host = u.host;

  let authUser: string;
  switch (kind) {
    case "github":
      authUser = "x-access-token";
      break;
    case "gitlab":
      authUser = "oauth2";
      break;
    case "git":
    default:
      authUser = username || "oauth2";
      break;
  }

  // Embed token in userinfo. URL handles encoding.
  u.username = authUser;
  u.password = token;
  void host;
  return u.toString();
}
