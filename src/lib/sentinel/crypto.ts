// AES-256-GCM encryption for credential secrets at rest.
//
// The master key lives in SENTINEL_ENC_KEY (env, gitignored) and NEVER enters
// the database. Each credential gets its own random 12-byte IV per encryption.
//
// Edge-safe: backed by the Web Crypto API (`globalThis.crypto.subtle`) so it
// runs unchanged on the Node.js runtime, the Edge runtime (Cloudflare Pages
// / Vercel Edge), and the browser. The functions are async because Web
// Crypto's `subtle.encrypt` / `subtle.decrypt` are async-only — callers
// must `await` the result. The on-disk format (separate `cipher` and `tag`
// base64 fields) is preserved verbatim, so ciphertexts encrypted by the
// previous Buffer-based implementation decrypt without re-issuance.

import { randomBytes } from "@/lib/crypto";

const KEY_ENV = "SENTINEL_ENC_KEY";
const TAG_LENGTH_BYTES = 16; // AES-GCM standard tag length (128 bits)

function getKey(): Uint8Array {
  const raw = process.env[KEY_ENV];
  if (!raw) {
    throw new Error(
      "SENTINEL_ENC_KEY is not set. Generate one with: openssl rand -base64 32"
    );
  }
  // The key is stored base64-encoded; decode to a 32-byte Uint8Array.
  const buf = base64ToBytes(raw);
  if (buf.length !== 32) {
    throw new Error(
      `SENTINEL_ENC_KEY must decode to 32 bytes (got ${buf.length}). ` +
        "Generate with: openssl rand -base64 32"
    );
  }
  return buf;
}

export interface EncryptedSecret {
  cipher: string; // base64 ciphertext (no tag)
  iv: string; // base64 12-byte nonce
  tag: string; // base64 16-byte auth tag
}

/** Encrypt a plaintext secret string with AES-256-GCM. */
export async function encryptSecret(plaintext: string): Promise<EncryptedSecret> {
  const key = getKey();
  const iv = randomBytes(12);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  // Web Crypto AES-GCM returns ciphertext || tag (tag at the end).
  // We split them so the on-disk format stays compatible with the legacy
  // implementation (which stored them separately).
  const encrypted = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv, tagLength: TAG_LENGTH_BYTES * 8 },
    cryptoKey,
    new TextEncoder().encode(plaintext)
  );
  const encryptedBytes = new Uint8Array(encrypted);
  const cipherBytes = encryptedBytes.slice(0, encryptedBytes.length - TAG_LENGTH_BYTES);
  const tagBytes = encryptedBytes.slice(encryptedBytes.length - TAG_LENGTH_BYTES);
  return {
    cipher: bytesToBase64(cipherBytes),
    iv: bytesToBase64(iv),
    tag: bytesToBase64(tagBytes),
  };
}

/** Decrypt an encrypted secret back to plaintext (in-memory only). */
export async function decryptSecret(enc: EncryptedSecret): Promise<string> {
  const key = getKey();
  const iv = base64ToBytes(enc.iv);
  const tag = base64ToBytes(enc.tag);
  const cipher = base64ToBytes(enc.cipher);
  // Web Crypto expects ciphertext || tag concatenated.
  const cipherWithTag = new Uint8Array(cipher.length + tag.length);
  cipherWithTag.set(cipher, 0);
  cipherWithTag.set(tag, cipher.length);
  const cryptoKey = await globalThis.crypto.subtle.importKey(
    "raw",
    key,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const decrypted = await globalThis.crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: TAG_LENGTH_BYTES * 8 },
    cryptoKey,
    cipherWithTag
  );
  return new TextDecoder().decode(decrypted);
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

// ── Web Crypto base64 helpers ───────────────────────────────────────────
//
// `Buffer.from(x, "base64")` and `Buffer.toString("base64")` are available
// on the Node.js runtime, but NOT on the pure Edge runtime (Cloudflare
// Workers / Pages without nodejs_compat). These helpers use `atob` / `btoa`
// (available everywhere — browsers, Node 16+, Edge) so the file is
// portable across every runtime GuardianX ships on.

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}
