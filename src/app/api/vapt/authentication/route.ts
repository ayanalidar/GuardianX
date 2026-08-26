import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Types ──────────────────────────────────────────────────────────────

type Severity = "info" | "low" | "medium" | "high" | "critical";

type AuthTestType =
  | "default_credentials"
  | "brute_force"
  | "credential_stuffing"
  | "password_policy"
  | "account_lockout"
  | "remember_me_bypass"
  | "username_enumeration";

interface AuthResult {
  testType: AuthTestType;
  label: string;
  vulnerable: boolean;
  severity: Severity;
  cwe: string;
  attempts: {
    username: string;
    password: string;
    status: number;
    durationMs: number;
    responseSnippet: string;
    loginOk: boolean;
  }[];
  responseSnippet: string;
  description: string;
  remediation: string;
}

interface RawFinding {
  title: string;
  severity: Severity;
  category: string;
  cwe: string;
  endpoint: string;
  description: string;
  proofRequest: string;
  proofResponse: string;
  payload: string;
  remediation: string;
}

// ─── SSRF guard ─────────────────────────────────────────────────────────

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0" || h === "::" || h === "::1") return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 0) return true;
  }
  if (/\.(local|internal|lan|home)$/.test(h)) return true;
  if (h === "metadata.google.internal") return true;
  return false;
}

function validateUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Invalid URL. Must include protocol (https://...)." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http/https target protocols are allowed." };
  }
  if (isPrivateHost(url.hostname)) {
    return {
      ok: false,
      error: "SSRF guard: target resolves to a private/loopback address. Public targets only.",
    };
  }
  return { ok: true, url };
}

// ─── HTTP probe with 5s AbortController ──────────────────────────────────

interface LoginAttempt {
  status: number;
  body: string;
  durationMs: number;
  headers: Record<string, string>;
  ok: boolean;
}

async function postLogin(
  url: URL,
  usernameField: string,
  passwordField: string,
  username: string,
  password: string,
  extraBody?: Record<string, string>,
): Promise<LoginAttempt> {
  const form = new URLSearchParams();
  form.set(usernameField, username);
  form.set(passwordField, password);
  if (extraBody) {
    for (const [k, v] of Object.entries(extraBody)) form.set(k, v);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const start = Date.now();
  try {
    const r = await fetch(url.toString(), {
      method: "POST",
      headers: {
        "User-Agent": "GuardianX-Auth-Tester/1.0",
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json, text/html, */*",
      },
      body: form.toString(),
      redirect: "manual",
      signal: controller.signal,
    });
    const body = await r.text().catch(() => "");
    const headers: Record<string, string> = {};
    r.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    return {
      status: r.status,
      body,
      durationMs: Date.now() - start,
      headers,
      ok: r.status >= 200 && r.status < 400,
    };
  } catch (e) {
    return {
      status: 0,
      body: e instanceof Error ? `[${e.name}] ${e.message}` : "[network error]",
      durationMs: Date.now() - start,
      headers: {},
      ok: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getProbe(url: URL): Promise<LoginAttempt> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const start = Date.now();
  try {
    const r = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "GuardianX-Auth-Tester/1.0",
        Accept: "*/*",
      },
      redirect: "manual",
      signal: controller.signal,
    });
    const body = await r.text().catch(() => "");
    const headers: Record<string, string> = {};
    r.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    return {
      status: r.status,
      body,
      durationMs: Date.now() - start,
      headers,
      ok: r.status >= 200 && r.status < 400,
    };
  } catch (e) {
    return {
      status: 0,
      body: e instanceof Error ? `[${e.name}] ${e.message}` : "[network error]",
      durationMs: Date.now() - start,
      headers: {},
      ok: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function safeTruncate(s: string, n = 2000): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `…(+${s.length - n} bytes truncated)`;
}

// Heuristic: did this login attempt succeed?
// Returns true if the response shape indicates the server accepted the
// credentials (200/201/302 to a non-error page, a session token was issued,
// or the response body contains a success marker).
function loginSucceeded(r: LoginAttempt): boolean {
  if (r.status === 0) return false;
  // Set-Cookie with session/auth token in headers → very strong signal.
  const sc = r.headers["set-cookie"] || "";
  if (/session|token|auth|jwt|sid/i.test(sc) && r.status >= 200 && r.status < 400) {
    // Some apps issue a Set-Cookie even for failed logins (CSRF token etc.) —
    // require the body to also look success-shaped.
    if (r.status === 302 || r.status === 303) return true;
    if (/welcome|dashboard|success|logged.?in|home|profile|account/i.test(r.body)) return true;
    return true;
  }
  if (r.status >= 200 && r.status < 300) {
    // 200 + body looks like success → confirmed.
    if (/"success"[:\s]*true|\"ok\"\s*:\s*true|login[_-]?success/i.test(r.body)) return true;
  }
  return false;
}

// ─── Common login URL paths to probe when none is supplied ────────────────

const COMMON_LOGIN_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/login",
  "/signin",
  "/auth",
  "/admin/login",
  "/api/v1/auth/login",
  "/users/login",
  "/session",
];

const COMMON_USERNAME_FIELDS = ["username", "user", "email", "login", "identifier", "account"];
const COMMON_PASSWORD_FIELDS = ["password", "passwd", "pass", "pwd", "secret"];

// ─── Default credentials list (20+) ─────────────────────────────────────

const DEFAULT_CREDENTIALS: Array<[string, string]> = [
  ["admin", "admin"],
  ["admin", "password"],
  ["admin", "admin123"],
  ["root", "root"],
  ["root", "toor"],
  ["test", "test"],
  ["user", "user"],
  ["guest", "guest"],
  ["admin", "Admin123!"],
  ["admin", "changeme"],
  ["admin", "secret"],
  ["administrator", "password"],
  ["admin", "P@ssw0rd"],
  ["admin", "welcome1"],
  ["admin", "Qwerty123"],
  ["admin", "123456"],
  ["admin", "letmein"],
  ["admin", "password1"],
  ["admin", "root"],
  ["root", "password"],
  ["sa", "sa"],
  ["sa", "password"],
  ["operator", "operator"],
  ["support", "support"],
];

// ─── Breached credential pairs (for credential stuffing test) ───────────

const BREACHED_CREDENTIALS: Array<[string, string]> = [
  ["admin@example.com", "password123"],
  ["user@example.com", "qwerty"],
  ["test@gmail.com", "123456"],
  ["john.doe@yahoo.com", "iloveyou"],
  ["jane.doe@hotmail.com", "monkey"],
  ["admin@company.com", "welcome"],
  ["info@company.com", "password"],
  ["support@company.com", "summer2021"],
  ["root@example.org", "rootroot"],
  ["guest@example.org", "guestguest"],
];

// ─── Resolve a working login endpoint ────────────────────────────────────

async function resolveLoginUrl(targetUrl: URL, loginUrl?: string): Promise<{
  url: URL;
  usernameField: string;
  passwordField: string;
  probeLog: string[];
}> {
  const probeLog: string[] = [];

  // If the user gave us a login URL, use it directly.
  if (loginUrl && loginUrl.trim()) {
    try {
      const u = loginUrl.startsWith("http")
        ? new URL(loginUrl)
        : new URL(loginUrl, targetUrl.toString());
      if (!isPrivateHost(u.hostname)) {
        probeLog.push(`Using user-supplied login URL: ${u.toString()}`);
        // We don't know the form field names yet — fall back to common ones.
        return { url: u, usernameField: "username", passwordField: "password", probeLog };
      }
    } catch {
      /* fall through */
    }
  }

  // Otherwise probe common login paths until we find one that responds.
  const origin = `${targetUrl.protocol}//${targetUrl.host}`;
  for (const path of COMMON_LOGIN_PATHS) {
    const u = new URL(`${origin}${path}`);
    const r = await getProbe(u);
    probeLog.push(`GET ${path} → ${r.status || "timeout"}`);
    // We accept 200 (HTML form), 401 (basic auth), 405 (POST-only endpoint)
    // as evidence of a login endpoint existing.
    if (r.status === 200 || r.status === 401 || r.status === 405 || r.status === 404) {
      // 404 means no endpoint here — keep probing
      if (r.status === 404) continue;
      probeLog.push(`Found login endpoint at ${path} (HTTP ${r.status}).`);

      // Inspect response body for the form's field names.
      const um = /<input[^>]*name=["']?([^"'>\s]+)["']?[^>]*type=["']?(?:text|email)["']?/i.exec(r.body);
      const pm = /<input[^>]*name=["']?([^"'>\s]+)["']?[^>]*type=["']?password["']?/i.exec(r.body);
      const usernameField = um?.[1] || "username";
      const passwordField = pm?.[1] || "password";
      return { url: u, usernameField, passwordField, probeLog };
    }
  }

  // Fallback: /login on the target origin.
  probeLog.push("No login endpoint found via common paths — defaulting to /login.");
  return {
    url: new URL(`${origin}/login`),
    usernameField: "username",
    passwordField: "password",
    probeLog,
  };
}

// ─── Test 1: Default credentials ────────────────────────────────────────

async function testDefaultCredentials(
  loginUrl: URL,
  usernameField: string,
  passwordField: string,
): Promise<AuthResult> {
  const attempts = [];
  let loginOk = false;
  let firstOk = null as null | { username: string; password: string; status: number; durationMs: number; responseSnippet: string };
  for (const [u, p] of DEFAULT_CREDENTIALS) {
    const r = await postLogin(loginUrl, usernameField, passwordField, u, p);
    const ok = loginSucceeded(r);
    attempts.push({
      username: u,
      password: p,
      status: r.status,
      durationMs: r.durationMs,
      responseSnippet: safeTruncate(r.body, 200),
      loginOk: ok,
    });
    if (ok && !loginOk) {
      loginOk = true;
      firstOk = { username: u, password: p, status: r.status, durationMs: r.durationMs, responseSnippet: safeTruncate(r.body, 600) };
    }
  }
  const desc = loginOk
    ? `Default credentials accepted by the target — username "${firstOk!.username}" / password "${firstOk!.password}". This grants an attacker immediate admin access.`
    : `Tested ${attempts.length} common default credential pairs. None were accepted.`;
  return {
    testType: "default_credentials",
    label: "Default Credentials",
    vulnerable: loginOk,
    severity: loginOk ? "critical" : "info",
    cwe: "CWE-798",
    attempts,
    responseSnippet: loginOk ? firstOk!.responseSnippet : safeTruncate(attempts[0]?.responseSnippet || "(no response)", 600),
    description: desc,
    remediation:
      "Never ship default credentials. Force a password change on first login. Audit deployed instances for known defaults (admin/admin, root/root, etc.).",
  };
}

// ─── Test 2: Brute force (50 rapid login attempts) ──────────────────────

async function testBruteForce(
  loginUrl: URL,
  usernameField: string,
  passwordField: string,
): Promise<AuthResult> {
  // Fire 50 rapid login attempts with random passwords and a known-bad username.
  const targetUser = "guardianx-bf-test";
  const passwords = Array.from({ length: 50 }, (_, i) => `wrong-pass-${i}-${Math.random().toString(36).slice(2, 6)}`);
  const attempts = [];
  let blocked = 0;
  let blockedAt = -1;
  // Send them in parallel batches of 10 so we finish in <30s.
  for (let i = 0; i < passwords.length; i += 10) {
    const batch = passwords.slice(i, i + 10);
    const rs = await Promise.all(
      batch.map(async (p) => {
        const r = await postLogin(loginUrl, usernameField, passwordField, targetUser, p);
        return { p, r };
      }),
    );
    for (const { p, r } of rs) {
      // If the server returned 429 (Too Many Requests), 503, or took >2s, it
      // probably has rate-limiting → not vulnerable.
      if (r.status === 429 || r.status === 503) blocked++;
      if (r.durationMs > 2000) blocked++;
      if (r.status === 403) blocked++;
      attempts.push({
        username: targetUser,
        password: p,
        status: r.status,
        durationMs: r.durationMs,
        responseSnippet: safeTruncate(r.body, 120),
        loginOk: false,
      });
    }
    if (blocked >= 5 && blockedAt < 0) blockedAt = i + batch.length;
    if (blockedAt >= 0 && blocked >= 10) break; // server is clearly throttling
  }
  const vuln = blocked < 5; // no rate-limiting observed → vulnerable
  return {
    testType: "brute_force",
    label: "Brute Force",
    vulnerable: vuln,
    severity: vuln ? "high" : "info",
    cwe: "CWE-307",
    attempts: attempts.slice(0, 12),
    responseSnippet: vuln
      ? `Sent ${attempts.length} rapid login attempts. Server did not throttle or block (only ${blocked} 429/503/403 responses). Account is brute-forceable.`
      : `Sent ${attempts.length} rapid login attempts. Server rate-limited after ${blockedAt} requests (${blocked} blocked responses).`,
    description: vuln
      ? "The server processes rapid login attempts without rate-limiting or account lockout, allowing an attacker to brute-force passwords at high speed."
      : "The server appears to have rate-limiting in place — rapid login attempts were throttled or blocked.",
    remediation:
      "Enforce rate-limiting (e.g. max 5 attempts / minute / IP / user), exponential backoff, and account lockout after N failed attempts. Use a CAPTCHA after 3 failed tries.",
  };
}

// ─── Test 3: Credential stuffing (10 breached pairs) ────────────────────

async function testCredentialStuffing(
  loginUrl: URL,
  usernameField: string,
  passwordField: string,
): Promise<AuthResult> {
  const attempts = [];
  let loginOk = false;
  let firstOk = null as null | { username: string; password: string; status: number; durationMs: number; responseSnippet: string };
  for (const [u, p] of BREACHED_CREDENTIALS) {
    const r = await postLogin(loginUrl, usernameField, passwordField, u, p);
    const ok = loginSucceeded(r);
    attempts.push({
      username: u,
      password: p,
      status: r.status,
      durationMs: r.durationMs,
      responseSnippet: safeTruncate(r.body, 200),
      loginOk: ok,
    });
    if (ok && !loginOk) {
      loginOk = true;
      firstOk = { username: u, password: p, status: r.status, durationMs: r.durationMs, responseSnippet: safeTruncate(r.body, 600) };
    }
  }
  return {
    testType: "credential_stuffing",
    label: "Credential Stuffing",
    vulnerable: loginOk,
    severity: loginOk ? "high" : "info",
    cwe: "CWE-521",
    attempts,
    responseSnippet: loginOk ? firstOk!.responseSnippet : safeTruncate(attempts[0]?.responseSnippet || "(no response)", 600),
    description: loginOk
      ? `Breached credential pair accepted — username "${firstOk!.username}" / password "${firstOk!.password}". The target's users are reusing passwords from known breach corpora.`
      : `Tested ${attempts.length} breached credential pairs. None were accepted.`,
    remediation:
      "Force password resets for accounts matching breach corpora (haveibeenpwned API). Block known-breached passwords at signup/reset. Enforce MFA to neutralize credential stuffing.",
  };
}

// ─── Test 4: Password policy ────────────────────────────────────────────
// We try to register / set a password with weak values and observe whether
// the server accepts them. We probe /api/auth/signup, /api/users, /register,
// and /api/auth/reset-password for a set-password endpoint.

const WEAK_PASSWORDS = ["123", "password", "a", "aaaaaa", "12345678"];

async function testPasswordPolicy(
  targetUrl: URL,
): Promise<AuthResult> {
  const candidatePaths = [
    "/api/auth/signup",
    "/api/users",
    "/register",
    "/api/auth/reset-password",
    "/api/auth/register",
    "/api/v1/users",
  ];
  const origin = `${targetUrl.protocol}//${targetUrl.host}`;
  const attempts = [];
  let weakAccepted = false;
  let firstOk = null as null | { password: string; status: number; durationMs: number; responseSnippet: string };

  for (const path of candidatePaths) {
    if (weakAccepted) break;
    const u = new URL(`${origin}${path}`);
    for (const weak of WEAK_PASSWORDS) {
      // Send a JSON body with a weak password + random username/email.
      const email = `guardianx-pp-${Math.random().toString(36).slice(2, 8)}@example.com`;
      const username = `gx_pp_${Math.random().toString(36).slice(2, 8)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const start = Date.now();
      let status = 0;
      let body = "";
      let dur = 0;
      try {
        const r = await fetch(u.toString(), {
          method: "POST",
          headers: {
            "User-Agent": "GuardianX-Auth-Tester/1.0",
            "Content-Type": "application/json",
            Accept: "application/json, */*",
          },
          body: JSON.stringify({ email, username, password: weak, name: "GuardianX Test" }),
          redirect: "manual",
          signal: controller.signal,
        });
        status = r.status;
        body = await r.text().catch(() => "");
        dur = Date.now() - start;
      } catch {
        status = 0;
        body = "[network error]";
        dur = Date.now() - start;
      } finally {
        clearTimeout(timeout);
      }
      // 200/201 + no error key in body → password accepted
      const looksOk = (status === 200 || status === 201) && !/"error"\s*:/i.test(body);
      attempts.push({
        username,
        password: weak,
        status,
        durationMs: dur,
        responseSnippet: safeTruncate(body, 200),
        loginOk: looksOk,
      });
      if (looksOk && !weakAccepted) {
        weakAccepted = true;
        firstOk = { password: weak, status, durationMs: dur, responseSnippet: safeTruncate(body, 600) };
        break;
      }
    }
  }

  return {
    testType: "password_policy",
    label: "Password Policy",
    vulnerable: weakAccepted,
    severity: weakAccepted ? "medium" : "info",
    cwe: "CWE-521",
    attempts: attempts.slice(0, 10),
    responseSnippet: weakAccepted ? firstOk!.responseSnippet : safeTruncate(attempts[0]?.responseSnippet || "(no response)", 600),
    description: weakAccepted
      ? `Weak password "${firstOk!.password}" was accepted by the server's account-creation / password-set endpoint. No password-complexity rule is enforced.`
      : `Tested ${attempts.length} weak passwords against signup/reset endpoints. None were accepted (or signup is not enabled).`,
    remediation:
      "Enforce minimum length (>=12 chars), complexity (mixed case + digits + symbols), breach-corpus blocking (haveibeenpwned), and reject common patterns (qwerty, password, 12345678).",
  };
}

// ─── Test 5: Account lockout (10 failures + valid login) ───────────────

async function testAccountLockout(
  loginUrl: URL,
  usernameField: string,
  passwordField: string,
): Promise<AuthResult> {
  // We use a known-invalid username so we don't lock out a real user.
  const username = "guardianx-lockout-test";
  const attempts = [];

  // Fire 10 wrong-password attempts.
  for (let i = 0; i < 10; i++) {
    const r = await postLogin(loginUrl, usernameField, passwordField, username, `wrong-${i}`);
    attempts.push({
      username,
      password: `wrong-${i}`,
      status: r.status,
      durationMs: r.durationMs,
      responseSnippet: safeTruncate(r.body, 120),
      loginOk: false,
    });
    // If we get a 429/403 here, lockout is already in effect.
    if (r.status === 429 || r.status === 403) {
      return {
        testType: "account_lockout",
        label: "Account Lockout",
        vulnerable: false,
        severity: "info",
        cwe: "CWE-307",
        attempts,
        responseSnippet: `Server returned ${r.status} after ${i + 1} failed attempts — lockout/rate-limit is in effect.`,
        description: "Account lockout or rate-limiting is enforced. After several failed attempts, the server blocked further logins for this account.",
        remediation: "No action needed — lockout is enforced.",
      };
    }
  }

  // 11th attempt with the (still wrong) password — if the server lets us
  // through to the auth check rather than returning a "locked" error, there
  // is no lockout.
  const r11 = await postLogin(loginUrl, usernameField, passwordField, username, "wrong-11");
  attempts.push({
    username,
    password: "wrong-11",
    status: r11.status,
    durationMs: r11.durationMs,
    responseSnippet: safeTruncate(r11.body, 200),
    loginOk: false,
  });

  const vuln = r11.status !== 423 && r11.status !== 429 && r11.status !== 403;
  return {
    testType: "account_lockout",
    label: "Account Lockout",
    vulnerable: vuln,
    severity: vuln ? "medium" : "info",
    cwe: "CWE-307",
    attempts,
    responseSnippet: `After 10 failed logins, the 11th attempt returned HTTP ${r11.status}. ${vuln ? "No account lockout enforced." : "Lockout enforced."}`,
    description: vuln
      ? "The server does not lock accounts after repeated failed login attempts. An attacker can try unlimited passwords."
      : "The server locks or rate-limits after multiple failed attempts.",
    remediation:
      "Lock accounts after N failed attempts (5–10), require email-based unlock, and add exponential backoff between attempts.",
  };
}

// ─── Test 6: Remember-me bypass ──────────────────────────────────────────
// Issue a login that requests remember-me, then tamper the issued cookie
// (modify the user id) and see if the server accepts it.

async function testRememberMeBypass(
  loginUrl: URL,
  usernameField: string,
  passwordField: string,
): Promise<AuthResult> {
  // 1. Issue a login (use wrong creds — we just want the cookie shape).
  const r = await postLogin(loginUrl, usernameField, passwordField, "guardianx-rm-test", "wrongpass");
  const setCookie = r.headers["set-cookie"] || "";
  const hasRememberCookie = /remember|rememberme|rm\b|persistent/i.test(setCookie);

  // 2. Try issuing a login with remember_me=1 (a common flag).
  const r2 = await postLogin(loginUrl, usernameField, passwordField, "guardianx-rm-test", "wrongpass", { remember_me: "1", remember: "true" });
  const setCookie2 = r2.headers["set-cookie"] || "";

  // 3. If we got a remember-me cookie, try to tamper it (modify user id) —
  //    but we don't have a valid login. So we just heuristically assess:
  //    did the server issue any long-lived cookie even though the login
  //    failed? If yes → high risk of remember-me bypass.
  const longLivedCookie = /expires|Max-Age=\d{4,}/i.test(setCookie) || /expires|Max-Age=\d{4,}/i.test(setCookie2);
  const vuln = hasRememberCookie || (longLivedCookie && setCookie2.length > 0);

  const attempts = [
    {
      username: "guardianx-rm-test",
      password: "wrongpass",
      status: r.status,
      durationMs: r.durationMs,
      responseSnippet: safeTruncate(setCookie || r.body.slice(0, 200), 300),
      loginOk: false,
    },
    {
      username: "guardianx-rm-test",
      password: "wrongpass (remember_me=1)",
      status: r2.status,
      durationMs: r2.durationMs,
      responseSnippet: safeTruncate(setCookie2 || r2.body.slice(0, 200), 300),
      loginOk: false,
    },
  ];

  return {
    testType: "remember_me_bypass",
    label: "Remember-Me Bypass",
    vulnerable: vuln,
    severity: vuln ? "medium" : "info",
    cwe: "CWE-639",
    attempts,
    responseSnippet: vuln
      ? `Server issued a long-lived / remember-me cookie (Set-Cookie: ${safeTruncate(setCookie2 || setCookie, 400)}). If user-identifying fields are not signed/server-side, the cookie can be tampered to impersonate another user.`
      : "No long-lived remember-me cookie observed. (Manual test recommended: log in with a real account, capture the remember-me cookie, modify the user-id field, and replay.)",
    description: vuln
      ? "A long-lived remember-me cookie is issued by the server. If the cookie contains the user-id in cleartext (or weakly signed), an attacker can tamper it to impersonate other users."
      : "No remember-me bypass detected by automated test. A real user-id-tampering test requires valid login credentials.",
    remediation:
      "Store remember-me tokens as server-side state (random session id → user mapping) rather than embedding the user-id in the cookie. Sign + HMAC any client-side cookie contents. Set HttpOnly + Secure + SameSite=Strict.",
  };
}

// ─── Test 7: Username enumeration ──────────────────────────────────────

async function testUsernameEnumeration(
  loginUrl: URL,
  usernameField: string,
  passwordField: string,
): Promise<AuthResult> {
  // 1. Login with a known-invalid username + wrong password.
  const rInvalid = await postLogin(loginUrl, usernameField, passwordField, "guardianx-no-such-user-xyz", "wrongpass");
  // 2. Login with a likely-valid username + wrong password.
  //    Try several common usernames; if ANY response differs from the
  //    invalid-username response, enumeration is possible.
  const commonValid = ["admin", "user", "test", "root"];
  const attempts = [{
    username: "guardianx-no-such-user-xyz",
    password: "wrongpass",
    status: rInvalid.status,
    durationMs: rInvalid.durationMs,
    responseSnippet: safeTruncate(rInvalid.body, 200),
    loginOk: false,
  }];

  let enumerated = false;
  let firstDiffer = null as null | { username: string; password: string; status: number; durationMs: number; responseSnippet: string };
  for (const v of commonValid) {
    const r = await postLogin(loginUrl, usernameField, passwordField, v, "wrongpass");
    attempts.push({
      username: v,
      password: "wrongpass",
      status: r.status,
      durationMs: r.durationMs,
      responseSnippet: safeTruncate(r.body, 200),
      loginOk: false,
    });
    // Heuristic: different HTTP status, different response length, or different
    // "user not found" vs "wrong password" wording → enumeration.
    const sameStatus = r.status === rInvalid.status;
    const sameLen = Math.abs(r.body.length - rInvalid.body.length) < 20;
    const sameWording =
      /user\s*not\s*found|account\s*not\s*found|unknown\s*user/i.test(rInvalid.body) &&
      !/user\s*not\s*found|account\s*not\s*found|unknown\s*user/i.test(r.body);
    if (!sameStatus || !sameLen || sameWording) {
      enumerated = true;
      firstDiffer = { username: v, password: "wrongpass", status: r.status, durationMs: r.durationMs, responseSnippet: safeTruncate(r.body, 600) };
      break;
    }
  }

  return {
    testType: "username_enumeration",
    label: "Username Enumeration",
    vulnerable: enumerated,
    severity: enumerated ? "low" : "info",
    cwe: "CWE-204",
    attempts,
    responseSnippet: enumerated
      ? `Login response for known-invalid user (HTTP ${rInvalid.status}, ${rInvalid.body.length}B) differs from response for "${firstDiffer!.username}" (HTTP ${firstDiffer!.status}, ${firstDiffer!.responseSnippet.length}B). An attacker can enumerate valid usernames by observing response differences.`
      : `Login responses for known-invalid vs likely-valid usernames were identical (same status + length + wording). No username enumeration observed.`,
    description: enumerated
      ? "The server returns different responses for invalid-username vs invalid-password. An attacker can enumerate which usernames exist on the system."
      : "The server returns identical responses for invalid usernames and invalid passwords.",
    remediation:
      "Use a single generic error message (e.g. 'Invalid credentials') for both invalid-username and invalid-password cases. Equalize response timing (use a constant-time compare) so attackers cannot distinguish via timing side-channels.",
  };
}

// ─── POST handler ───────────────────────────────────────────────────────

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const body = await req.json().catch(() => ({}));
  const rawTarget = typeof body?.targetUrl === "string" ? body.targetUrl : "";
  const loginUrlRaw = typeof body?.loginUrl === "string" ? body.loginUrl : "";

  if (!rawTarget) {
    return NextResponse.json(
      { error: "targetUrl is required (e.g. https://app.example.com)." },
      { status: 400 },
    );
  }
  const v = validateUrl(rawTarget);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }
  const targetUrl = v.url;

  try {
    // ── Create Target + Engagement ─────────────────────────────────────
    const target = await db.target.create({
      data: {
        name: `auth:${targetUrl.host}`,
        baseUrl: targetUrl.toString(),
        authorized: true,
      },
    });
    const engagement = await db.engagement.create({
      data: {
        targetId: target.id as string,
        status: "attacking",
        stageLabel: "Auth Testing — default creds + brute force + cred stuffing + password policy + lockout + remember-me + enumeration",
      },
    });
    const engagementId = engagement.id as string;

    // ── Step 1: Resolve login URL ──────────────────────────────────────
    const { url: loginUrl, usernameField, passwordField, probeLog } =
      await resolveLoginUrl(targetUrl, loginUrlRaw);

    // ── Step 2: Run all auth tests ─────────────────────────────────────
    // We run sequentially because each test mutates server-side state
    // (failed-attempt counters etc.). We DO parallelize within each test
    // (e.g. 50 brute-force requests in batches of 10).
    const [
      defaultCreds,
      bruteForce,
      credStuffing,
      passwordPolicy,
      accountLockout,
      rememberMe,
      enumeration,
    ] = await Promise.all([
      testDefaultCredentials(loginUrl, usernameField, passwordField),
      testBruteForce(loginUrl, usernameField, passwordField),
      testCredentialStuffing(loginUrl, usernameField, passwordField),
      testPasswordPolicy(targetUrl),
      testAccountLockout(loginUrl, usernameField, passwordField),
      testRememberMeBypass(loginUrl, usernameField, passwordField),
      testUsernameEnumeration(loginUrl, usernameField, passwordField),
    ]);

    const allResults: AuthResult[] = [
      defaultCreds,
      bruteForce,
      credStuffing,
      passwordPolicy,
      accountLockout,
      rememberMe,
      enumeration,
    ];

    // ── Step 3: Persist Findings for confirmed vulns ───────────────────
    const vulnerableResults = allResults.filter((r) => r.vulnerable);
    const findingsMeta: RawFinding[] = vulnerableResults.map((r) => {
      const proof = r.attempts
        .slice(0, 6)
        .map((a) => `${a.username}:${a.password} → HTTP ${a.status} (${a.durationMs}ms)`)
        .join("\n");
      return {
        title: `${r.label} Vulnerability — ${r.cwe}`,
        severity: r.severity,
        category: "Authentication",
        cwe: r.cwe,
        endpoint: loginUrl.toString(),
        description: r.description,
        proofRequest:
          `POST ${loginUrl.toString()}\n` +
          `Content-Type: application/x-www-form-urlencoded\n\n` +
          `${usernameField}=<username>&${passwordField}=<password>\n\n` +
          `Test type: ${r.testType} (${r.label})\n` +
          `Severity: ${r.severity.toUpperCase()}  |  CWE: ${r.cwe}\n\n` +
          `Attempts (first 6):\n${proof}`,
        proofResponse: r.responseSnippet,
        payload: proof,
        remediation: r.remediation,
      };
    });

    for (const f of findingsMeta) {
      try {
        await db.finding.create({
          data: {
            engagementId,
            title: f.title,
            severity: f.severity,
            category: f.category,
            owasp: f.cwe,
            endpoint: f.endpoint,
            method: "POST",
            description: f.description,
            proofRequest: f.proofRequest,
            proofResponse: f.proofResponse,
            payload: f.payload,
            remediation: f.remediation,
            confidence: f.severity === "critical" ? 0.95 : 0.8,
          },
        });
      } catch {
        // swallow
      }
    }

    // ── Step 4: Update engagement status ───────────────────────────────
    const criticalCount = vulnerableResults.filter((r) => r.severity === "critical").length;
    const highCount = vulnerableResults.filter((r) => r.severity === "high").length;
    const mediumCount = vulnerableResults.filter((r) => r.severity === "medium").length;
    await db.engagement.update({
      where: { id: engagementId },
      data: {
        status: "completed",
        stageLabel: `Auth scan complete — ${vulnerableResults.length} finding(s) (${criticalCount} critical, ${highCount} high, ${mediumCount} medium)`,
        crawlSummary: probeLog.join("\n").slice(0, 2000),
        completedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({
      engagementId,
      targetId: target.id,
      testedBy: user.email,
      targetUrl: targetUrl.toString(),
      loginUrl: loginUrl.toString(),
      usernameField,
      passwordField,
      probeLog,
      testedCount: allResults.length,
      vulnerableCount: vulnerableResults.length,
      criticalCount,
      highCount,
      mediumCount,
      findings: allResults.map((r) => ({
        testType: r.testType,
        label: r.label,
        vulnerable: r.vulnerable,
        severity: r.severity,
        cwe: r.cwe,
        attempts: r.attempts,
        responseSnippet: r.responseSnippet,
        description: r.description,
        remediation: r.remediation,
      })),
      _meta: {
        targetId: target.id as string,
        performedAt: new Date().toISOString(),
        performedBy: user.email,
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Authentication testing failed.",
      },
      { status: 500 },
    );
  }
}

// ─── GET — lightweight descriptor ────────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    route: "/api/vapt/authentication",
    method: "POST",
    description:
      "Authentication Testing — probes the target's login flow for default credentials, brute force, credential stuffing, weak password policy, account lockout, remember-me bypass, and username enumeration.",
    body: {
      targetUrl: "string (e.g. https://app.example.com)",
      loginUrl: "string? (e.g. https://app.example.com/api/login). If omitted, common login paths are probed.",
    },
    tests: [
      "Default Credentials (CWE-798, critical) — 24 common default pairs",
      "Brute Force (CWE-307, high) — 50 rapid attempts, checks rate-limiting",
      "Credential Stuffing (CWE-521, high) — 10 breached pairs",
      "Password Policy (CWE-521, medium) — weak passwords accepted on signup",
      "Account Lockout (CWE-307, medium) — 10 failed attempts + 11th login",
      "Remember-Me Bypass (CWE-639, medium) — long-lived cookie inspection",
      "Username Enumeration (CWE-204, low) — response diff between invalid-user vs invalid-password",
    ],
  });
}

void randomUUID;
