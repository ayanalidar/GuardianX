// Deliberately vulnerable target app for RedAgent to attack.
// Built with raw Node http (no deps). Runs on port 3004.
// Intentional vulnerabilities:
//   - SQL Injection (simulated) in /login
//   - Reflected XSS in /search
//   - IDOR in /api/user/{id}
//   - Path traversal in /file?name=
//   - Open redirect in /redirect?url=
//   - Verbose error leaking internals in /api/login
//   - Security misconfig: missing headers, CORS *, .env leak
//
// ONLY run this locally. It exists so RedAgent has a safe, legal target.

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const PORT = 3004;
const UPLOAD_DIR = "/tmp/vuln-target-uploads";

// fake "database"
const users = [
  { id: 1, email: "admin@example.com", password: "admin123", role: "admin", ssn: "111-22-3333" },
  { id: 2, email: "user@example.com", password: "user123", role: "user", ssn: "444-55-6666" },
  { id: 3, email: "alice@example.com", password: "alice123", role: "user", ssn: "777-88-9999" },
];
const comments: { id: number; author: string; body: string }[] = [
  { id: 1, author: "admin", body: "Welcome to the site!" },
];

function send(res: ServerResponse, status: number, body: string, headers: Record<string, string> = {}) {
  // intentionally missing security headers (HSTS, CSP, X-Frame-Options)
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*", // intentionally permissive CORS
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "*",
    ...headers,
  });
  res.end(body);
}

function htmlDoc(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body><h1>${title}</h1>${body}<hr><a href="/">Home</a></body></html>`;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? "GET";

  if (method === "OPTIONS") return send(res, 204, "");

  // ── Home / crawl entrypoint ───────────────────────────────────────────
  if (path === "/" && method === "GET") {
    return send(
      res,
      200,
      htmlDoc(
        "VulnShop — Home",
        `
        <p>Welcome to VulnShop, a deliberately vulnerable demo app.</p>
        <ul>
          <li><a href="/login">Login</a></li>
          <li><a href="/search?q=test">Search</a></li>
          <li><a href="/api/user/1">API: user profile</a></li>
          <li><a href="/file?name=README.txt">File viewer</a></li>
          <li><a href="/redirect?url=https://example.com">Redirect</a></li>
          <li><a href="/comments">Comments</a></li>
          <li><a href="/.env">.env (oops)</a></li>
        </ul>`
      )
    );
  }

  // ── SQL Injection (simulated): /login ─────────────────────────────────
  if (path === "/login" && method === "GET") {
    return send(
      res,
      200,
      htmlDoc(
        "Login",
        `<form method="POST" action="/api/login">
          <input name="email" placeholder="email"><br>
          <input name="password" type="password" placeholder="password"><br>
          <button>Login</button>
        </form>`
      )
    );
  }

  // ── API login: SQLi + verbose error leak ──────────────────────────────
  if (path === "/api/login" && method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const email = params.get("email") ?? "";
      const password = params.get("password") ?? "";
      // VULN: simulated SQLi — if the email contains ' OR '1'='1 it matches everyone
      if (email.includes("'") || /or\s+['"]?1['"]?\s*=\s*['"]?1/i.test(email)) {
        const u = users[0]; // returns admin
        return send(
          res,
          200,
          JSON.stringify({
            ok: true,
            user: { id: u.id, email: u.email, role: u.role },
            token: "tok_" + u.email,
            _debug: { query: `SELECT * FROM users WHERE email='${email}' AND password='${password}'` },
          }),
          { "Content-Type": "application/json" }
        );
      }
      // VULN: verbose error leaks the SQL query + table structure
      const u = users.find((x) => x.email === email && x.password === password);
      if (!u) {
        return send(
          res,
          401,
          JSON.stringify({
            ok: false,
            error: `Authentication failed. SQL: SELECT * FROM users WHERE email='${email}' AND password='***' (table users has columns: id, email, password, role, ssn)`,
          }),
          { "Content-Type": "application/json" }
        );
      }
      return send(
        res,
        200,
        JSON.stringify({ ok: true, user: { id: u.id, email: u.email, role: u.role }, token: "tok_" + u.email }),
        { "Content-Type": "application/json" }
      );
    });
    return;
  }

  // ── Reflected XSS: /search?q= ─────────────────────────────────────────
  if (path === "/search" && method === "GET") {
    const q = url.searchParams.get("q") ?? "";
    // VULN: raw interpolation into HTML
    return send(
      res,
      200,
      htmlDoc("Search", `<form><input name="q" value="${q}"><button>Search</button></form><p>You searched for: ${q}</p><p>No results found.</p>`)
    );
  }

  // ── IDOR: /api/user/{id} ──────────────────────────────────────────────
  if (path.startsWith("/api/user/") && method === "GET") {
    const id = parseInt(path.split("/").pop() ?? "0", 10);
    // VULN: no auth check — any user can read any other user including SSN
    const u = users.find((x) => x.id === id);
    if (!u) return send(res, 404, JSON.stringify({ error: "not found" }), { "Content-Type": "application/json" });
    return send(
      res,
      200,
      JSON.stringify({ id: u.id, email: u.email, role: u.role, ssn: u.ssn }), // leaks SSN
      { "Content-Type": "application/json" }
    );
  }

  // ── Path traversal: /file?name= ───────────────────────────────────────
  if (path === "/file" && method === "GET") {
    const name = url.searchParams.get("name") ?? "";
    // VULN: no sanitization, allows ../
    const filePath = join(UPLOAD_DIR, name);
    try {
      const resolved = resolve(filePath);
      if (!existsSync(resolved)) return send(res, 404, htmlDoc("File", `<p>File not found: ${name}</p>`));
      const data = readFileSync(resolved, "utf8");
      return send(res, 200, htmlDoc("File", `<pre>${data}</pre>`));
    } catch (err) {
      return send(res, 500, htmlDoc("Error", `<p>${(err as Error).message}</p>`));
    }
  }

  // ── Open redirect: /redirect?url= ─────────────────────────────────────
  if (path === "/redirect" && method === "GET") {
    const target = url.searchParams.get("url") ?? "/";
    // VULN: no allowlist — redirects anywhere
    res.writeHead(302, { Location: target });
    return res.end();
  }

  // ── Comments: stored XSS via POST ─────────────────────────────────────
  if (path === "/comments" && method === "GET") {
    const list = comments
      .map((c) => `<div><b>${c.author}:</b> ${c.body}</div>`)
      .join("");
    return send(
      res,
      200,
      htmlDoc(
        "Comments",
        `${list}<form method="POST" action="/api/comment"><input name="author" placeholder="name"><input name="body" placeholder="comment"><button>Post</button></form>`
      )
    );
  }
  if (path === "/api/comment" && method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      // VULN: stored XSS — no escaping on render
      comments.push({
        id: comments.length + 1,
        author: params.get("author") ?? "anon",
        body: params.get("body") ?? "",
      });
      return send(res, 302, "", { Location: "/comments" });
    });
    return;
  }

  // ── Sensitive file leak: /.env ────────────────────────────────────────
  if (path === "/.env") {
    // VULN: serves a fake env file with secrets
    return send(
      res,
      200,
      "DB_PASSWORD=s3cret-prod-password-2024\nJWT_SECRET=supersecret-jwt-key\nSTRIPE_API_KEY=sk_live_4eC39HqLyjWDarjtT1zdp7dc\nAWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY\n",
      { "Content-Type": "text/plain" }
    );
  }

  // ── /admin (no auth) ──────────────────────────────────────────────────
  if (path === "/admin") {
    return send(
      res,
      200,
      htmlDoc("Admin Panel", `<p>Welcome, administrator. <a href="/api/user/1">View all users</a></p><p>DB host: db-prod.internal, port 5432, user root</p>`)
    );
  }

  send(res, 404, htmlDoc("404", `<p>Not found: ${path}</p>`));
});

server.listen(PORT, () => {
  console.log(`[vuln-target] deliberately vulnerable app on http://localhost:${PORT}`);
  console.log(`[vuln-target] DO NOT expose publicly. For RedAgent testing only.`);
});
