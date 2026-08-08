// HTTP crawler + attack executor for RedAgent.
// Crawls the target's home page to discover endpoints (links + forms), then
// executes crafted attack requests and captures the full response.

import { request } from "node:https";
import { request as httpRequest } from "node:http";
import type { CrawledEndpoint, CrawlSummary } from "./redagent-ai";
import type { CraftedAttack } from "./redagent-ai";

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
}

const CRAWL_TIMEOUT_MS = 8000;

/** Fetch a URL and return the response. */
export function fetchUrl(
  url: string,
  opts: { method?: "GET" | "POST"; body?: string; headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<HttpResponse> {
  return new Promise((resolve) => {
    const u = new URL(url);
    const isHttps = u.protocol === "https:";
    const lib = isHttps ? request : httpRequest;
    const method = opts.method ?? "GET";
    const headers = { ...opts.headers };
    if (opts.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }
    const timeoutMs = opts.timeoutMs ?? CRAWL_TIMEOUT_MS;

    const start = Date.now();
    const req = lib(
      {
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers,
      },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c.toString()));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string>,
            body,
            durationMs: Date.now() - start,
          });
        });
      }
    );
    req.on("error", (err) => {
      resolve({
        status: 0,
        headers: {},
        body: `[fetch error] ${err.message}`,
        durationMs: Date.now() - start,
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("timeout"));
    });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

/**
 * Crawl the target's home page + one level of links to discover endpoints.
 * Extracts forms (method + action + inputs) and links (with query params).
 */
export async function crawlTarget(baseUrl: string, authHeader?: string | null): Promise<CrawlSummary> {
  const base = baseUrl.replace(/\/$/, "");
  const seen = new Set<string>();
  const endpoints: CrawledEndpoint[] = [];

  const headers: Record<string, string> = {};
  if (authHeader) headers["Authorization"] = authHeader;

  const crawlPage = async (pageUrl: string, depth: number): Promise<void> => {
    if (depth > 1) return; // only crawl home + 1 level deep
    const key = pageUrl;
    if (seen.has(key)) return;
    seen.add(key);

    const res = await fetchUrl(pageUrl, { headers, timeoutMs: CRAWL_TIMEOUT_MS });
    if (res.status === 0 || res.body.length === 0) return;
    const html = res.body;

    // Extract <a href="..."> links
    const linkRe = /href=["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null) {
      const href = m[1];
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("javascript:")) continue;
      let abs: string;
      try {
        abs = new URL(href, base).toString();
      } catch {
        continue;
      }
      const u = new URL(abs);
      if (u.origin !== new URL(base).origin) continue; // same-origin only
      const path = u.pathname;
      const params = [...u.searchParams.keys()];
      // dedupe by path+method
      const sig = `GET:${path}`;
      if (!seen.has(sig) && !path.startsWith("/api/")) {
        seen.add(sig);
        endpoints.push({ method: "GET", path, params, hasBody: false });
      }
      // recurse one level
      if (depth === 0) void crawlPage(abs, 1);
    }

    // Extract <form method action> + <input name>
    const formRe = /<form[^>]*method=["']?(\w+)?["']?[^>]*action=["']([^"']+)["'][^>]*>([\s\S]*?)<\/form>/gi;
    while ((m = formRe.exec(html)) !== null) {
      const method = (m[1] || "GET").toUpperCase() === "POST" ? "POST" : "GET";
      const action = m[2];
      let abs: string;
      try {
        abs = new URL(action, base).toString();
      } catch {
        continue;
      }
      const path = new URL(abs).pathname;
      const inputRe = /<input[^>]*name=["']([^"']+)["']/gi;
      const params: string[] = [];
      let im: RegExpExecArray | null;
      const inner = m[3];
      while ((im = inputRe.exec(inner)) !== null) {
        params.push(im[1]);
      }
      const sig = `${method}:${path}`;
      if (!seen.has(sig)) {
        seen.add(sig);
        endpoints.push({ method, path, params, hasBody: method === "POST" });
      }
    }

    // Always include the home page itself if it has params
    if (depth === 0) {
      const sig = "GET:/";
      if (!seen.has(sig)) {
        seen.add(sig);
        endpoints.unshift({ method: "GET", path: "/", params: [], hasBody: false });
      }
    }
  };

  await crawlPage(base, 0);

  // Dedupe endpoints
  const unique: CrawledEndpoint[] = [];
  const seenSig = new Set<string>();
  for (const e of endpoints) {
    const sig = `${e.method}:${e.path}:${e.params.join(",")}`;
    if (seenSig.has(sig)) continue;
    seenSig.add(sig);
    unique.push(e);
  }

  return {
    baseUrl: base,
    endpoints: unique.slice(0, 20),
    notes: `Crawled ${seen.size} page(s), found ${unique.length} unique endpoints.`,
  };
}

/** Execute a crafted attack request and return the response. */
export async function executeAttack(
  attack: CraftedAttack,
  authHeader?: string | null
): Promise<HttpResponse> {
  const headers: Record<string, string> = { ...attack.headers };
  if (authHeader) headers["Authorization"] = authHeader;
  return fetchUrl(attack.url, {
    method: attack.method,
    body: attack.body,
    headers,
    timeoutMs: 10000,
  });
}

/** Format an attack + response into a human-readable proof string. */
export function formatProof(
  attack: CraftedAttack,
  response: HttpResponse
): { request: string; response: string } {
  const reqLines = [
    `${attack.method} ${new URL(attack.url).pathname + new URL(attack.url).search} HTTP/1.1`,
    `Host: ${new URL(attack.url).host}`,
  ];
  if (attack.body) {
    reqLines.push(`Content-Type: ${attack.headers["Content-Type"] ?? "application/x-www-form-urlencoded"}`);
    reqLines.push(`Content-Length: ${attack.body.length}`);
  }
  reqLines.push("");
  if (attack.body) reqLines.push(attack.body);

  const respLines = [
    `HTTP/1.1 ${response.status}`,
    ...Object.entries(response.headers)
      .slice(0, 8)
      .map(([k, v]) => `${k}: ${v}`),
    "",
    response.body.slice(0, 800),
  ];

  return {
    request: reqLines.join("\n"),
    response: respLines.join("\n"),
  };
}
