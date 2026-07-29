import { db } from "@/lib/db";

async function main() {
  // Clear existing patches
  await db.patch.deleteMany({});

  const patches = [
    {
      patchId: "SP-2024-0142",
      title: "SQL Injection in user authentication query",
      severity: "critical",
      cve: "CVE-2024-29177",
      affectedFile: "src/auth/login.ts",
      aiExplanation:
        "The login endpoint concatenates user-supplied input directly into a SQL query, allowing authentication bypass via crafted payloads. The proposed patch parameterizes the query using prepared statements and adds input length validation.",
      diffPayload: `--- a/src/auth/login.ts
+++ b/src/auth/login.ts
@@ -12,11 +12,14 @@ export async function login(email: string, password: string) {
-  const query = \`SELECT * FROM users WHERE email='\${email}' AND password='\${password}'\`;
-  const result = await db.raw(query);
+  if (!email || !password || email.length > 254) {
+    throw new Error("Invalid credentials");
+  }
+  const result = await db.query(
+    "SELECT id, email, password_hash FROM users WHERE email = ?",
+    [email]
+  );
-  if (result.rows.length > 0) {
-    return { token: sign(result.rows[0].id) };
+  if (result.rows.length === 1) {
+    const user = result.rows[0];
+    if (await bcrypt.compare(password, user.password_hash)) {
+      return { token: sign(user.id) };
+    }
   }
+  throw new Error("Invalid credentials");
 }`,
      sandboxLogs: `[14:22:01] Sandbox container started (node:20-alpine)
[14:22:01] Mounting source volume...
[14:22:02] Installing dependencies (npm ci)
[14:22:08] Running test suite: auth.test.ts
[14:22:12]   ✓ rejects empty email (3ms)
[14:22:12]   ✓ rejects malformed email (2ms)
[14:22:13]   ✓ authenticates valid user (15ms)
[14:22:13]   ✓ rejects invalid password (8ms)
[14:22:14]   ✓ blocks SQL injection payload ' OR '1'='1 (4ms)
[14:22:14]   ✓ blocks SQL injection payload admin'-- (3ms)
[14:22:15] All 6 tests passed
[14:22:15] Static analysis: 0 vulnerabilities
[14:22:15] Sandbox exit code: 0
[14:22:15] ✓ VERDICT: SAFE TO APPLY`,
      sandboxPassed: true,
      status: "pending",
    },
    {
      patchId: "SP-2024-0141",
      title: "Path traversal vulnerability in file download handler",
      severity: "critical",
      cve: "CVE-2024-28891",
      affectedFile: "src/api/download.ts",
      aiExplanation:
        "The download endpoint accepts a filename parameter and resolves it relative to the upload directory without sanitization. An attacker could use ../ sequences to read arbitrary files from the server. The patch validates the resolved path stays within the allowed directory using path.resolve() and a containment check.",
      diffPayload: `--- a/src/api/download.ts
+++ b/src/api/download.ts
@@ -8,9 +8,16 @@ import path from "path";
 export async function downloadFile(req, res) {
-  const filePath = path.join(UPLOAD_DIR, req.query.filename);
-  return res.sendFile(filePath);
+  const requested = req.query.filename;
+  if (typeof requested !== "string" || requested.includes("\\0")) {
+    return res.status(400).send("Invalid filename");
+  }
+  const resolved = path.resolve(UPLOAD_DIR, requested);
+  if (!resolved.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) {
+    return res.status(403).send("Access denied");
+  }
+  return res.sendFile(resolved);
 }`,
      sandboxLogs: `[14:18:42] Sandbox container started (node:20-alpine)
[14:18:43] Running test suite: download.test.ts
[14:18:47]   ✓ serves valid file (22ms)
[14:18:47]   ✓ returns 400 for null filename (2ms)
[14:18:48]   ✓ blocks ../etc/passwd (3ms)
[14:18:48]   ✓ blocks absolute path /etc/shadow (4ms)
[14:18:48]   ✓ blocks encoded %2e%2e%2f (3ms)
[14:18:49] All 5 tests passed
[14:18:49] Static analysis: 0 vulnerabilities
[14:18:49] Sandbox exit code: 0
[14:18:49] ✓ VERDICT: SAFE TO APPLY`,
      sandboxPassed: true,
      status: "pending",
    },
    {
      patchId: "SP-2024-0140",
      title: "XSS vulnerability in user profile bio rendering",
      severity: "high",
      cve: "CVE-2024-28734",
      affectedFile: "src/components/ProfileBio.tsx",
      aiExplanation:
        "The ProfileBio component renders user-supplied bio content using dangerouslySetInnerHTML, enabling stored XSS attacks. The patch replaces unsafe HTML rendering with a sanitized text renderer that escapes HTML entities, and adds an allowlist-based sanitizer for any permitted formatting tags.",
      diffPayload: `--- a/src/components/ProfileBio.tsx
+++ b/src/components/ProfileBio.tsx
@@ -5,8 +5,12 @@ import DOMPurify from "dompurify";
 export function ProfileBio({ bio }: { bio: string }) {
   return (
-    <div
-      dangerouslySetInnerHTML={{ __html: bio }}
-      className="prose dark:prose-invert"
-    />
+    <div className="prose dark:prose-invert">
+      <p>{DOMPurify.sanitize(bio, { ALLOWED_TAGS: ["b", "i", "em", "strong", "br"] })}</p>
+    </div>
   );
 }`,
      sandboxLogs: `[14:10:15] Sandbox container started (node:20-alpine)
[14:10:16] Running test suite: ProfileBio.test.tsx
[14:10:19]   ✓ renders plain text (8ms)
[14:10:20]   ✓ escapes <script> tags (5ms)
[14:10:20]   ✓ allows bold/italic formatting (4ms)
[14:10:21]   ✓ strips event handlers onclick= (3ms)
[14:10:21]   ✓ strips javascript: URLs (2ms)
[14:10:21] All 5 tests passed
[14:10:21] Static analysis: 0 vulnerabilities
[14:10:21] Sandbox exit code: 0
[14:10:21] ✓ VERDICT: SAFE TO APPLY`,
      sandboxPassed: true,
      status: "pending",
    },
    {
      patchId: "SP-2024-0139",
      title: "Insecure deserialization in session restore endpoint",
      severity: "high",
      cve: "CVE-2024-27632",
      affectedFile: "src/api/session.ts",
      aiExplanation:
        "The session restore endpoint uses JSON.parse on a base64-decoded cookie value without validation, allowing prototype pollution. The patch adds schema validation with zod, blocks __proto__ keys, and uses a safe reviver function during parsing.",
      diffPayload: `--- a/src/api/session.ts
+++ b/src/api/session.ts
@@ -6,10 +6,18 @@ import { z } from "zod";
+const SessionSchema = z.object({
+  userId: z.string().uuid(),
+  issuedAt: z.number().int().positive(),
+}).strict();
+
 export function restoreSession(cookie: string) {
-  const decoded = Buffer.from(cookie, "base64").toString("utf8");
-  return JSON.parse(decoded);
+  const decoded = Buffer.from(cookie, "base64").toString("utf8");
+  const parsed = JSON.parse(decoded, (key, value) =>
+    key === "__proto__" ? undefined : value
+  );
+  return SessionSchema.parse(parsed);
 }`,
      sandboxLogs: `[14:02:33] Sandbox container started (node:20-alpine)
[14:02:34] Running test suite: session.test.ts
[14:02:37]   ✓ restores valid session (11ms)
[14:02:38]   ✓ rejects malformed JSON (3ms)
[14:02:38]   ✓ rejects __proto__ pollution attempt (4ms)
[14:02:39]   ✓ rejects missing userId (2ms)
[14:02:39]   ✓ rejects extra fields (strict mode) (3ms)
[14:02:39] All 5 tests passed
[14:02:39] Static analysis: 0 vulnerabilities
[14:02:39] Sandbox exit code: 0
[14:02:39] ✓ VERDICT: SAFE TO APPLY`,
      sandboxPassed: true,
      status: "pending",
    },
    {
      patchId: "SP-2024-0138",
      title: "Missing rate limiting on password reset endpoint",
      severity: "high",
      affectedFile: "src/api/reset-password.ts",
      aiExplanation:
        "The password reset endpoint has no rate limiting, allowing attackers to enumerate valid email addresses and send bulk reset emails. The patch adds a sliding-window rate limiter (5 requests per 15 minutes per IP/email) using an in-memory store, with a recommended upgrade to Redis for production multi-instance deployments.",
      diffPayload: `--- a/src/api/reset-password.ts
+++ b/src/api/reset-password.ts
@@ -3,6 +3,24 @@ import rateLimit from "express-rate-limit";
+const resetLimiter = rateLimit({
+  windowMs: 15 * 60 * 1000, // 15 minutes
+  max: 5,
+  standardHeaders: true,
+  legacyHeaders: false,
+  keyGenerator: (req) => \`\${req.ip}:\${req.body?.email ?? ""}\`,
+  message: { error: "Too many reset attempts. Try again later." },
+});
+
 export async function resetPassword(req, res) {
+  await new Promise((resolve, reject) => {
+    resetLimiter(req, res, (err) => err ? reject(err) : resolve(null));
+  });
   const { email } = req.body;
   // ...existing logic
 }`,
      sandboxLogs: `[13:55:08] Sandbox container started (node:20-alpine)
[13:55:09] Running test suite: reset-password.test.ts
[13:55:12]   ✓ sends reset email for valid user (45ms)
[13:55:13]   ✓ returns generic message for unknown email (38ms)
[13:55:13]   ✓ blocks 6th request within window (3ms)
[13:55:14]   ✓ allows request after window expires (15ms)
[13:55:14]   ✓ rate limits per IP+email combination (4ms)
[13:55:14] All 5 tests passed
[13:55:14] Static analysis: 0 vulnerabilities
[13:55:14] Sandbox exit code: 0
[13:55:14] ✓ VERDICT: SAFE TO APPLY`,
      sandboxPassed: true,
      status: "pending",
    },
  ];

  for (const patch of patches) {
    await db.patch.create({ data: patch });
  }

  console.log(`✓ Seeded ${patches.length} patches`);
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
