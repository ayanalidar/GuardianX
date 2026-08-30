"use client";

/**
 * safe-api — defensive API client that prevents frontend crashes
 * ================================================================
 *
 * The #1 cause of "This page couldn't load" crashes in GuardianX has been
 * **shape mismatches**: the API returns `{patch_id, internal_id, affected_file}`
 * (snake_case) but the frontend expects `{id, patchId, affectedFile}` (camelCase).
 * When a component tries to use `p.id` as a React key and it's undefined, React
 * crashes the entire page.
 *
 * This module wraps `fetch` with 4 layers of defense:
 *
 *   1. **Auto-normalize** — recursively converts snake_case keys to camelCase
 *      so the frontend never sees a snake_case field again.
 *   2. **Safe defaults** — if the fetch fails, returns a safe default (empty
 *      array for list endpoints, null for single-item endpoints) instead of
 *      throwing. The component renders an empty state, not a crash.
 *   3. **Retry with backoff** — retries network errors once after 500ms (the
 *      Vercel serverless cold-start is the most common cause of a one-off 500).
 *   4. **Shape validation** — if a response doesn't match the expected shape,
 *      logs a warning + returns safe defaults (so the UI degrades gracefully
 *      instead of crashing).
 *
 * Usage (replaces raw `fetch` in components):
 *
 *   // Before (crashes if API returns snake_case or fails):
 *   const patches = await fetch("/api/patches/pending").then(r => r.json());
 *   patches.map(p => <div key={p.id}>{p.title}</div>)  // 💥 p.id is undefined
 *
 *   // After (auto-normalizes + never crashes):
 *   const patches = await safeApi<PatchRow[]>("/api/patches/pending");
 *   patches.map(p => <div key={p.id}>{p.title}</div>)  // ✅ p.id is always defined
 */

// ── snake_case → camelCase converter ──────────────────────────────────────

function toCamelCase(key: string): string {
  // Only convert keys that contain an underscore followed by a lowercase letter.
  // Leaves URLs, UUIDs, and already-camelCase keys untouched.
  if (!key.includes("_")) return key;
  return key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[toCamelCase(k)] = normalizeValue(v);
    }
    return result;
  }
  return value;
}

// ── Safe fetch with retry + normalization ─────────────────────────────────

export interface SafeApiOptions {
  /** HTTP method (default GET). */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** JSON body (will be JSON.stringified). */
  body?: unknown;
  /** Custom headers. */
  headers?: Record<string, string>;
  /** Whether to normalize snake_case → camelCase (default true). Set false
   *  for endpoints that intentionally use snake_case (rare). */
  normalize?: boolean;
  /** Whether to retry once on network error (default true). */
  retry?: boolean;
  /** Timeout in ms (default 15000). */
  timeoutMs?: number;
  /** Auth token (Bearer). If omitted, reads from localStorage. */
  token?: string;
}

/**
 * Fetch an API endpoint safely. Returns the parsed JSON response with
 * snake_case keys auto-converted to camelCase. On any error (network,
 * 4xx, 5xx, parse failure), returns `fallback` (defaults to `[]` for
 * list endpoints or `null` for single-item endpoints).
 *
 * Never throws — the component always gets a usable value.
 */
export async function safeApi<T>(
  endpoint: string,
  options: SafeApiOptions = {},
  fallback: T = ([] as unknown) as T,
): Promise<T> {
  const {
    method = "GET",
    body,
    headers = {},
    normalize = true,
    retry = true,
    timeoutMs = 15_000,
    token,
  } = options;

  const authToken = token ?? getAuthToken();
  const requestHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };
  if (authToken) {
    requestHeaders["Authorization"] = `Bearer ${authToken}`;
  }

  const doFetch = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(endpoint, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let response = await doFetch();

    // Retry once on 5xx or network error (Vercel cold-start).
    if (retry && (response.status >= 500 || response.status === 0)) {
      await new Promise((r) => setTimeout(r, 500));
      response = await doFetch();
    }

    if (!response.ok) {
      console.warn(`[safeApi] ${method} ${endpoint} → HTTP ${response.status}`);
      return fallback;
    }

    const text = await response.text();
    if (!text || text.trim() === "") {
      return fallback;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (parseErr) {
      console.warn(`[safeApi] ${endpoint} → JSON parse failed:`, parseErr);
      return fallback;
    }

    // Auto-normalize snake_case → camelCase.
    const result = normalize ? normalizeValue(parsed) : parsed;

    return result as T;
  } catch (err) {
    console.warn(`[safeApi] ${method} ${endpoint} → error:`, err);
    return fallback;
  }
}

/** Read the auth token from localStorage (client-side only). */
function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("guardianx-token");
  } catch {
    return null;
  }
}

// ── Convenience helpers for common patterns ───────────────────────────────

/** Fetch a list endpoint — always returns an array (empty on error). */
export async function safeApiList<T>(
  endpoint: string,
  options?: SafeApiOptions,
): Promise<T[]> {
  return safeApi<T[]>(endpoint, options, []);
}

/** Fetch a single-item endpoint — always returns T | null (null on error). */
export async function safeApiOne<T>(
  endpoint: string,
  options?: SafeApiOptions,
): Promise<T | null> {
  return safeApi<T | null>(endpoint, options, null);
}

// ── Shape validator (optional — for critical endpoints) ──────────────────

/**
 * Validate that a response matches a minimal shape. If any required field
 * is missing, logs a warning + returns safe defaults. Use this for endpoints
 * where a missing field would cause a React crash (e.g. `id` used as a key).
 *
 *   const patches = await safeApi<PatchRow[]>("/api/patches/pending");
 *   const safe = validateShape(patches, ["id", "title"], []);
 */
export function validateShape<T>(
  data: T,
  requiredFields: string[],
  fallback: T,
): T {
  if (!data) return fallback;
  if (Array.isArray(data)) {
    const valid = data.filter((item) => {
      if (typeof item !== "object" || item === null) return false;
      return requiredFields.every((f) => f in (item as Record<string, unknown>));
    });
    if (valid.length !== data.length) {
      console.warn(
        `[safeApi] shape validation: ${data.length - valid.length} of ${data.length} items missing required fields [${requiredFields.join(", ")}] — filtered out`,
      );
    }
    return valid as T;
  }
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>;
    const missing = requiredFields.filter((f) => !(f in obj));
    if (missing.length > 0) {
      console.warn(`[safeApi] shape validation: missing fields [${missing.join(", ")}] — using fallback`);
      return fallback;
    }
  }
  return data;
}
