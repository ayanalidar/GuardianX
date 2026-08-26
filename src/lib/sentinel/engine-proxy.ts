// GuardianX Engine proxy helper, used by Vercel API routes to call the
// Railway sentinel-engine service for heavy compute (SAST, DAST, exploit,
// PDF generation, scraping) that can't run on Vercel serverless.

const ENGINE_URL = process.env.ENGINE_URL || process.env.NEXT_PUBLIC_ENGINE_URL || "http://localhost:3003";
const ENGINE_KEY = process.env.ENGINE_INTERNAL_KEY || "";

export function engineUrl(path: string): string {
  return `${ENGINE_URL}${path}`;
}

export function engineHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(ENGINE_KEY ? { "X-Engine-Key": ENGINE_KEY } : {}),
  };
}

/**
 * Fire-and-forget call to the engine. Returns immediately, the engine
 * runs the heavy work in the background and streams results via socket.io
 * + writes to Supabase. Use for SAST/DAST pipeline starts.
 */
export function engineFireAndForget(path: string, body: unknown): void {
  fetch(engineUrl(path), {
    method: "POST",
    headers: engineHeaders(),
    body: JSON.stringify(body),
  }).catch((err) => {
    console.error(`[engine] fire-and-forget to ${path} failed:`, err?.message ?? err);
  });
}

/**
 * Awaited call to the engine. Use for synchronous operations (exploit,
 * PDF, scraper) that return a result within Vercel's function timeout.
 */
export async function engineCall<T = unknown>(path: string, body: unknown): Promise<{
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  headers: Headers;
}> {
  try {
    const res = await fetch(engineUrl(path), {
      method: "POST",
      headers: engineHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(55_000), // 55s, under Vercel's 60s limit
    });
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/pdf")) {
      const buffer = await res.arrayBuffer();
      return {
        ok: res.ok,
        status: res.status,
        data: buffer as unknown as T,
        error: null,
        headers: res.headers,
      };
    }
    const text = await res.text();
    let data: T | null = null;
    try { data = text ? JSON.parse(text) as T : null; } catch { data = text as unknown as T; }
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? null : (typeof data === "object" && data && "error" in data ? String((data as Record<string, unknown>).error) : `Engine returned ${res.status}`),
      headers: res.headers,
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      data: null,
      error: err instanceof Error ? err.message : "Engine unreachable",
      headers: new Headers(),
    };
  }
}

export { ENGINE_URL };
