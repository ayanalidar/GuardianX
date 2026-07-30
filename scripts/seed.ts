import { db } from "@/lib/db";

// Real, runnable JavaScript samples containing genuine vulnerabilities.
// The GuardianX engine will scan these, generate patches, and run real
// sandbox tests against the patched code.
const codebases = [
  {
    name: "auth-service.js",
    language: "javascript",
    description:
      "Login & session module with SQL injection and weak password hashing.",
    sourceCode: [
      "// auth-service.js — vulnerable authentication module",
      "const db = require('./db');",
      "const crypto = require('crypto');",
      "",
      "// Authenticate a user by email + password.",
      "async function login(email, password) {",
      "  const query = \"SELECT * FROM users WHERE email = '\" + email + \"' AND password = '\" + password + \"'\";",
      "  const rows = await db.rawQuery(query);",
      "  if (rows.length > 0) {",
      "    return { ok: true, user: rows[0] };",
      "  }",
      "  return { ok: false };",
      "}",
      "",
      "// Hash a password for storage using a fast, reversible algorithm.",
      "function hashPassword(password) {",
      "  return crypto.createHash('md5').update(password).digest('hex');",
      "}",
      "",
      "// Look up a user record by id, building the query from input.",
      "async function getUser(id) {",
      "  const rows = await db.rawQuery('SELECT * FROM users WHERE id = ' + id);",
      "  return rows[0] ?? null;",
      "}",
      "",
      "module.exports = { login, hashPassword, getUser };",
      "",
    ].join("\n"),
  },
  {
    name: "file-server.js",
    language: "javascript",
    description:
      "File download handler vulnerable to path traversal; uses eval for templates.",
    sourceCode: [
      "// file-server.js — vulnerable file serving module",
      "const fs = require('fs');",
      "const path = require('path');",
      "",
      "const UPLOAD_DIR = '/var/app/uploads';",
      "",
      "// Serve a file by name from the uploads directory.",
      "function downloadFile(filename, res) {",
      "  const filePath = path.join(UPLOAD_DIR, filename);",
      "  const data = fs.readFileSync(filePath);",
      "  res.setHeader('Content-Type', 'application/octet-stream');",
      "  res.end(data);",
      "}",
      "",
      "// Render a user-supplied template string into HTML via eval.",
      "function renderTemplate(template, context) {",
      "  const html = eval('`' + template + '`');",
      "  return html;",
      "}",
      "",
      "// Delete a file by name.",
      "function deleteFile(filename) {",
      "  const filePath = path.join(UPLOAD_DIR, filename);",
      "  fs.unlinkSync(filePath);",
      "}",
      "",
      "module.exports = { downloadFile, renderTemplate, deleteFile };",
      "",
    ].join("\n"),
  },
  {
    name: "user-api.js",
    language: "javascript",
    description:
      "REST API with NoSQL-style query injection, plaintext passwords, and verbose errors.",
    sourceCode: [
      "// user-api.js — vulnerable user REST API",
      "const express = require('express');",
      "const app = express();",
      "app.use(express.json());",
      "",
      "const users = []; // in-memory store",
      "",
      "// Register a new user.",
      "app.post('/register', (req, res) => {",
      "  const { name, email, password } = req.body;",
      "  // Store raw password — no hashing.",
      "  users.push({ name, email, password, role: 'user' });",
      "  res.json({ ok: true });",
      "});",
      "",
      "// Login — builds a filter directly from the request body.",
      "app.post('/login', (req, res) => {",
      "  const query = req.body;",
      "  const found = users.filter((u) => {",
      "    return Object.keys(query).every((k) => u[k] === query[k]);",
      "  });",
      "  if (found.length) {",
      "    res.json({ ok: true, token: 'tok_' + found[0].email });",
      "  } else {",
      "    res.status(401).json({ ok: false, error: 'Internal DB error on collection users: ' + JSON.stringify(query) });",
      "  }",
      "});",
      "",
      "// Admin endpoint with no auth check.",
      "app.get('/admin/users', (req, res) => {",
      "  res.json(users);",
      "});",
      "",
      "app.listen(3000);",
      "",
    ].join("\n"),
  },
];

async function main() {
  console.log("Clearing existing data…");
  await db.chatMessage.deleteMany();
  await db.pipelineEvent.deleteMany();
  await db.patch.deleteMany();
  await db.scan.deleteMany();
  await db.codebase.deleteMany();

  for (const cb of codebases) {
    await db.codebase.create({ data: cb });
  }
  console.log(`✓ Seeded ${codebases.length} vulnerable codebases`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
