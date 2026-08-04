// Deliberately vulnerable target app for GuardianX testing.
// Port 3005. Now with Data Exfiltration Defense features:
//   - Canary data injection in API responses
//   - API access logging (every request recorded)
//   - Honeypot endpoint traps
//
// ONLY run this locally.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { request as httpRequest } from "node:http";

const PORT = 3007;
const UPLOAD_DIR = "/tmp/vuln-target-uploads";
const GUARDIANX_API = "http://localhost:3000/api"; // GuardianX backend for logging

// Log every API access to GuardianX
async function logAccess(req: IncomingMessage, statusCode: number, responseSize: number) {
  const ip = req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown";
  const ua = req.headers["user-agent"] || "unknown";
  const method = req.method || "GET";
  const endpoint = req.url || "/";
  try {
    const body = JSON.stringify({ ipAddress: ip, method, endpoint, statusCode, userAgent: ua, responseSize });
    const req = httpRequest(`${GUARDIANX_API}/data-flow/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    });
    req.write(body);
    req.end();
  } catch { /* fire-and-forget */ }
}

// Log honeypot hit
async function logHoneypot(req: IncomingMessage, endpoint: string) {
  const ip = req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "unknown";
  const ua = req.headers["user-agent"] || "unknown";
  const method = req.method || "GET";
  try {
    const body = JSON.stringify({ endpoint, ipAddress: ip, userAgent: ua, method });
    const req = httpRequest(`${GUARDIANX_API}/data-flow/honeypot`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    });
    req.write(body);
    req.end();
  } catch { /* fire-and-forget */ }
}

// Canary data — fake records injected into responses
const CANARY_USERS = [
  { id: 901, email: "canary_user_001@guardianx-trap.in", password: "canary_trap_001", role: "user", ssn: "999-01-0001" },
  { id: 902, email: "canary_user_002@guardianx-trap.in", password: "canary_trap_002", role: "user", ssn: "999-01-0002" },
  { id: 903, email: "canary_user_003@guardianx-trap.in", password: "canary_trap_003", role: "user", ssn: "999-01-0003" },
];
const CANARY_KEY = "gx_canary_sk_test_4f8a9b2c1d7e3f6a";

// Fake "database"
const users = [
  { id: 1, email: "admin@example.com", password: "admin123", role: "admin", ssn: "111-22-3333" },
  { id: 2, email: "user@example.com", password: "user123", role: "user", ssn: "444-55-6666" },
  { id: 3, email: "alice@example.com", password: "alice123", role: "user", ssn: "777-88-9999" },
  // Canary users injected (invisible to normal use, detectable if scraped)
  ...CANARY_USERS,
];
const comments: { id: number; author: string; body: string }[] = [
  { id: 1, author: "admin", body: "Welcome to the site!" },
];

function send(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    ...headers,
  });
  res.end(body);
  return body.length;
}

function htmlDoc(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body><h1>${title}</h1>${body}<hr><a href="/">Home</a></body></html>`;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (method === "OPTIONS") { send(res, 204, ""); return; }

  // ── Honeypot endpoints (trap for scrapers/attackers) ──────────────────
  const HONEYPOT_PATHS = [
    "/api/export-all", "/api/v2/users/bulk", "/api/admin/dump",
    "/api/v1/export/database", "/.hidden/admin", "/api/backup",
    "/api/users/export", "/api/internal/data",
  ];
  if (HONEYPOT_PATHS.includes(path)) {
    logHoneypot(req, path);
    // Return realistic-looking data to entice the scraper
    const fakeData = JSON.stringify({
      status: "ok",
      data: [
        { id: 1, email: "admin@example.com", password: "admin123", ssn: "111-22-3333" },
        { id: 2, email: "user@example.com", password: "user123", ssn: "444-55-6666" },
        // Canary data in honeypot too
        { id: 901, email: "canary_user_001@guardianx-trap.in", api_key: CANARY_KEY },
      ],
      count: 3,
      exported_at: new Date().toISOString(),
    });
    const size = send(res, 200, fakeData, { "Content-Type": "application/json" });
    logAccess(req, 200, size);
    return;
  }

  // ── Home ──────────────────────────────────────────────────────────────
  if (path === "/" && method === "GET") {
    const size = send(res, 200, htmlDoc("VulnShop — Home", `
      <p>Welcome to VulnShop.</p>
      <ul>
        <li><a href="/login">Login</a></li>
        <li><a href="/search?q=test">Search</a></li>
        <li><a href="/api/user/1">API: user profile</a></li>
        <li><a href="/file?name=README.txt">File viewer</a></li>
        <li><a href="/redirect?url=https://example.com">Redirect</a></li>
        <li><a href="/comments">Comments</a></li>
        <li><a href="/.env">.env (oops)</a></li>
      </ul>`));
    logAccess(req, 200, size);
    return;
  }

  // ── SQL Injection: /login ─────────────────────────────────────────────
  if (path === "/login" && method === "GET") {
    const size = send(res, 200, htmlDoc("Login", `<form method="POST" action="/api/login"><input name="email" placeholder="email"><br><input name="password" type="password"><br><button>Login</button></form>`));
    logAccess(req, 200, size);
    return;
  }

  // ── API login: SQLi + verbose error ───────────────────────────────────
  if (path === "/api/login" && method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const email = params.get("email") ?? "";
      const password = params.get("password") ?? "";
      if (email.includes("'") || /or\s+['"]?1['"]?\s*=\s*['"]?1/i.test(email)) {
        const u = users[0];
        const resp = JSON.stringify({ ok: true, user: { id: u.id, email: u.email, role: u.role }, token: "tok_" + u.email, _debug: { query: `SELECT * FROM users WHERE email='${email}' AND password='${password}'` } });
        const size = send(res, 200, resp, { "Content-Type": "application/json" });
        logAccess(req, 200, size);
        return;
      }
      const u = users.find((x) => x.email === email && x.password === password);
      if (!u) {
        const resp = JSON.stringify({ ok: false, error: `Auth failed. SQL: SELECT * FROM users WHERE email='${email}' AND password='***' (columns: id, email, password, role, ssn)` });
        const size = send(res, 401, resp, { "Content-Type": "application/json" });
        logAccess(req, 401, size);
        return;
      }
      const resp = JSON.stringify({ ok: true, user: { id: u.id, email: u.email, role: u.role }, token: "tok_" + u.email });
      const size = send(res, 200, resp, { "Content-Type": "application/json" });
      logAccess(req, 200, size);
    });
    return;
  }

  // ── XSS: /search ──────────────────────────────────────────────────────
  if (path === "/search" && method === "GET") {
    const q = url.searchParams.get("q") ?? "";
    const size = send(res, 200, htmlDoc("Search", `<form><input name="q" value="${q}"><button>Search</button></form><p>You searched for: ${q}</p>`));
    logAccess(req, 200, size);
    return;
  }

  // ── IDOR: /api/user/{id} — includes canary users ──────────────────────
  if (path.startsWith("/api/user/") && method === "GET") {
    const id = parseInt(path.split("/").pop() ?? "0", 10);
    const u = users.find((x) => x.id === id);
    if (!u) { const s = send(res, 404, JSON.stringify({ error: "not found" }), { "Content-Type": "application/json" }); logAccess(req, 404, s); return; }
    const resp = JSON.stringify({ id: u.id, email: u.email, role: u.role, ssn: u.ssn });
    const size = send(res, 200, resp, { "Content-Type": "application/json" });
    logAccess(req, 200, size);
    return;
  }

  // ── Path traversal ────────────────────────────────────────────────────
  if (path === "/file" && method === "GET") {
    const name = url.searchParams.get("name") ?? "";
    const filePath = join(UPLOAD_DIR, name);
    try {
      const resolved = resolve(filePath);
      if (!existsSync(resolved)) { const s = send(res, 404, htmlDoc("File", `<p>Not found: ${name}</p>`)); logAccess(req, 404, s); return; }
      const data = readFileSync(resolved, "utf8");
      const size = send(res, 200, htmlDoc("File", `<pre>${data}</pre>`));
      logAccess(req, 200, size);
    } catch (err) {
      const s = send(res, 500, htmlDoc("Error", `<p>${(err as Error).message}</p>`));
      logAccess(req, 500, s);
    }
    return;
  }

  // ── Open redirect ─────────────────────────────────────────────────────
  if (path === "/redirect" && method === "GET") {
    const target = url.searchParams.get("url") ?? "/";
    res.writeHead(302, { Location: target }); res.end();
    logAccess(req, 302, 0);
    return;
  }

  // ── Comments ──────────────────────────────────────────────────────────
  if (path === "/comments" && method === "GET") {
    const list = comments.map((c) => `<div><b>${c.author}:</b> ${c.body}</div>`).join("");
    const size = send(res, 200, htmlDoc("Comments", `${list}<form method="POST" action="/api/comment"><input name="author" placeholder="name"><input name="body" placeholder="comment"><button>Post</button></form>`));
    logAccess(req, 200, size);
    return;
  }
  if (path === "/api/comment" && method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      comments.push({ id: comments.length + 1, author: params.get("author") ?? "anon", body: params.get("body") ?? "" });
      res.writeHead(302, { Location: "/comments" }); res.end();
      logAccess(req, 302, 0);
    });
    return;
  }

  // ── .env leak ─────────────────────────────────────────────────────────
  if (path === "/.env") {
    const data = `DB_PASSWORD=s3cret-prod-password-2024\nJWT_SECRET=supersecret-jwt-key\nSTRIPE_API_KEY=sk_live_4eC39HqLyjWDarjtT1zdp7dc\nAWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\nGX_CANARY_KEY=${CANARY_KEY}\n`;
    const size = send(res, 200, data, { "Content-Type": "text/plain" });
    logAccess(req, 200, size);
    return;
  }

  // ── Admin ─────────────────────────────────────────────────────────────
  if (path === "/admin") {
    const size = send(res, 200, htmlDoc("Admin Panel", `<p>Welcome, administrator.</p><p>DB host: db-prod.internal</p>`));
    logAccess(req, 200, size);
    return;
  }

  const s = send(res, 404, htmlDoc("404", `<p>Not found: ${path}</p>`));
  logAccess(req, 404, s);
});

server.listen(PORT, () => {
  console.log(`[vuln-target] on http://localhost:${PORT} with Data Exfiltration Defense active`);
});
