// Web Crypto API compatibility layer for GuardianX.
//
// Drop-in replacements for the subset of `node:crypto` functions used
// throughout the codebase. All functions are backed by the global Web
// Crypto API (`globalThis.crypto`), which is available natively on the
// Edge Runtime (Cloudflare Pages / Vercel Edge) and in Node.js 16+.
//
// SYNC functions (randomUUID / randomBytes / randomHex / timingSafeEqual)
// are intentionally synchronous — they wrap `crypto.getRandomValues` and
// constant-time byte comparison, neither of which require promises.
//
// ASYNC functions (sha256hex / hmacSha256hex / hmacSha256base64) wrap
// `crypto.subtle` which is async-only. Callers MUST `await` the result.
// If you find yourself inside a sync function, make it async.

/**
 * Sync random UUID v4. Drop-in for `crypto.randomUUID()` from node:crypto.
 */
export function randomUUID(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Sync random bytes. Returns a `Uint8Array` (NOT a `Buffer`), so it
 * works unchanged on the Edge Runtime.
 *
 * Note: callers that previously did `randomBytes(n).toString("hex")`
 * must switch to `randomHex(n)` — `Uint8Array.prototype.toString` does
 * not produce hex output.
 */
export function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

/**
 * Sync random hex string of `n` bytes (2*n hex chars, lowercase).
 * Drop-in for `randomBytes(n).toString("hex")` from node:crypto.
 */
export function randomHex(n: number): string {
  const bytes = randomBytes(n);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

type HashInput = string | Uint8Array | ArrayBuffer | Buffer;

function toBytes(data: HashInput): Uint8Array {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  if (data instanceof Uint8Array) {
    // Buffer (Node) is a Uint8Array subclass — same code path.
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  // Fallback for any other TypedArray / Buffer-like.
  // @ts-expect-error - runtime duck-typing for legacy Buffer input
  if (data && typeof data.length === "number") {
    return new Uint8Array(data);
  }
  throw new TypeError("Unsupported data type for crypto hash");
}

function bufferToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  // `btoa` is available in browsers, Node 16+, and the Edge Runtime.
  return btoa(bin);
}

/**
 * ASYNC SHA-256 hex digest. Drop-in replacement for
 * `createHash("sha256").update(data).digest("hex")`.
 *
 * Accepts string | Uint8Array | ArrayBuffer | Buffer. Returns lowercase
 * hex (identical format to node:crypto's digest("hex")).
 *
 * CRITICAL: this function is async. If the calling function is sync,
 * you MUST make it async (or use a different approach).
 */
export async function sha256hex(data: HashInput): Promise<string> {
  const bytes = toBytes(data);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return bufferToHex(digest);
}

/**
 * ASYNC SHA-1 hex digest. Drop-in replacement for
 * `createHash("sha1").update(data).digest("hex")`.
 *
 * SHA-1 is cryptographically broken for collision resistance but still
 * fine for non-adversarial uses like dedup keys / content fingerprinting
 * (which is the only place GuardianX uses it). Web Crypto still ships
 * SHA-1 in `subtle.digest`.
 *
 * CRITICAL: async. Same caveat as `sha256hex`.
 */
export async function sha1hex(data: HashInput): Promise<string> {
  const bytes = toBytes(data);
  const digest = await globalThis.crypto.subtle.digest("SHA-1", bytes);
  return bufferToHex(digest);
}

async function importHmacKey(key: HashInput): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "raw",
    toBytes(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

/**
 * ASYNC HMAC-SHA-256 hex digest. Drop-in replacement for
 * `createHmac("sha256", key).update(data).digest("hex")`.
 *
 * CRITICAL: async. Same caveat as `sha256hex`.
 */
export async function hmacSha256hex(
  key: HashInput,
  data: HashInput
): Promise<string> {
  const cryptoKey = await importHmacKey(key);
  const sig = await globalThis.crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    toBytes(data)
  );
  return bufferToHex(sig);
}

/**
 * ASYNC HMAC-SHA-256 base64 digest. Drop-in replacement for
 * `createHmac("sha256", key).update(data).digest("base64")`.
 *
 * CRITICAL: async. Same caveat as `sha256hex`.
 */
export async function hmacSha256base64(
  key: HashInput,
  data: HashInput
): Promise<string> {
  const cryptoKey = await importHmacKey(key);
  const sig = await globalThis.crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    toBytes(data)
  );
  return bufferToBase64(sig);
}

/**
 * Sync constant-time equality. Drop-in for `crypto.timingSafeEqual(a, b)`.
 *
 * Accepts string | Uint8Array | Buffer. Returns `false` on length
 * mismatch (does NOT throw, unlike node:crypto — GuardianX callers all
 * pre-check length, so this is safer and avoids accidental DoS-by-throw
 * on adversarial inputs).
 */
export function timingSafeEqual(
  a: string | Uint8Array | Buffer,
  b: string | Uint8Array | Buffer
): boolean {
  const aBytes =
    typeof a === "string" ? new TextEncoder().encode(a) : new Uint8Array(a as Uint8Array);
  const bBytes =
    typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b as Uint8Array);
  if (aBytes.length !== bBytes.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}
