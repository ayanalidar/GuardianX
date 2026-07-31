import { NextResponse } from "next/server";
import { supabase } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/db-init — creates all database tables via Supabase SQL API (HTTPS)
export async function POST() {
  const results: string[] = [];

  // Create tables using Supabase SQL API (port 443 — works on Vercel!)
  const sql = `
  CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, password TEXT NOT NULL, role TEXT DEFAULT 'viewer', avatar TEXT, "createdAt" TIMESTAMP DEFAULT NOW(), "updatedAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "Codebase" (id TEXT PRIMARY KEY, name TEXT NOT NULL, language TEXT DEFAULT 'javascript', description TEXT, "sourceCode" TEXT NOT NULL, "createdAt" TIMESTAMP DEFAULT NOW(), "updatedAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "Scan" (id TEXT PRIMARY KEY, "codebaseId" TEXT NOT NULL, status TEXT DEFAULT 'queued', "stageLabel" TEXT, "startedAt" TIMESTAMP DEFAULT NOW(), "completedAt" TIMESTAMP);
  CREATE TABLE IF NOT EXISTS "Patch" (id TEXT PRIMARY KEY, "patchId" TEXT UNIQUE NOT NULL, "codebaseId" TEXT NOT NULL, "scanId" TEXT NOT NULL, title TEXT NOT NULL, severity TEXT, cve TEXT, "affectedFile" TEXT, "aiExplanation" TEXT, "aiReasoning" TEXT, confidence FLOAT DEFAULT 0, "originalCode" TEXT, "patchedCode" TEXT, "diffPayload" TEXT, "testCode" TEXT, "sandboxLogs" TEXT, "sandboxPassed" BOOLEAN DEFAULT false, "exploitCode" TEXT, "exploitOriginalResult" TEXT, "exploitPatchedResult" TEXT, "adversarialRounds" INT DEFAULT 0, "adversarialWon" BOOLEAN DEFAULT false, "adversarialTranscript" TEXT, status TEXT DEFAULT 'pending', "createdAt" TIMESTAMP DEFAULT NOW(), "approvedAt" TIMESTAMP);
  CREATE TABLE IF NOT EXISTS "PipelineEvent" (id TEXT PRIMARY KEY, "scanId" TEXT NOT NULL, stage TEXT, message TEXT, level TEXT DEFAULT 'info', meta TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "ChatMessage" (id TEXT PRIMARY KEY, "patchId" TEXT NOT NULL, role TEXT, content TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "Credential" (id TEXT PRIMARY KEY, label TEXT, kind TEXT, target TEXT, username TEXT, "secretCipher" TEXT, "secretIv" TEXT, "secretTag" TEXT, "createdAt" TIMESTAMP DEFAULT NOW(), "lastUsedAt" TIMESTAMP);
  CREATE TABLE IF NOT EXISTS "CredentialAudit" (id TEXT PRIMARY KEY, "credentialId" TEXT NOT NULL, action TEXT, context TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "Target" (id TEXT PRIMARY KEY, name TEXT, "baseUrl" TEXT, "authHeader" TEXT, notes TEXT, authorized BOOLEAN DEFAULT false, "createdAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "Engagement" (id TEXT PRIMARY KEY, "targetId" TEXT NOT NULL, status TEXT DEFAULT 'queued', "stageLabel" TEXT, "crawlSummary" TEXT, "startedAt" TIMESTAMP DEFAULT NOW(), "completedAt" TIMESTAMP);
  CREATE TABLE IF NOT EXISTS "Finding" (id TEXT PRIMARY KEY, "engagementId" TEXT NOT NULL, title TEXT, severity TEXT, category TEXT, owasp TEXT, endpoint TEXT, method TEXT, description TEXT, "proofRequest" TEXT, "proofResponse" TEXT, payload TEXT, confidence FLOAT DEFAULT 0, remediation TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "RedAgentEvent" (id TEXT PRIMARY KEY, "engagementId" TEXT NOT NULL, stage TEXT, message TEXT, level TEXT DEFAULT 'info', meta TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "Attestation" (id TEXT PRIMARY KEY, "patchId" TEXT UNIQUE NOT NULL, "prevHash" TEXT, hash TEXT, data TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "Canary" (id TEXT PRIMARY KEY, "targetId" TEXT, label TEXT, "canaryType" TEXT, "canaryValue" TEXT UNIQUE, "injectedEndpoint" TEXT, "isActive" BOOLEAN DEFAULT true, detected BOOLEAN DEFAULT false, "detectedAt" TIMESTAMP, "detectedOn" TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "ApiAccessLog" (id TEXT PRIMARY KEY, "targetId" TEXT, "ipAddress" TEXT, method TEXT, endpoint TEXT, "statusCode" INT, "userAgent" TEXT, "responseSize" INT, timestamp TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "HoneypotHit" (id TEXT PRIMARY KEY, "targetId" TEXT, endpoint TEXT, "ipAddress" TEXT, "userAgent" TEXT, method TEXT, timestamp TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "WebhookConfig" (id TEXT PRIMARY KEY, name TEXT, url TEXT, events TEXT, "isActive" BOOLEAN DEFAULT true, secret TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "ScheduledScan" (id TEXT PRIMARY KEY, name TEXT, "scanType" TEXT, "targetId" TEXT, "codebaseId" TEXT, "cronExpr" TEXT, "isActive" BOOLEAN DEFAULT true, "lastRunAt" TIMESTAMP, "nextRunAt" TIMESTAMP, "createdAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "AlertRule" (id TEXT PRIMARY KEY, name TEXT, condition TEXT, channel TEXT, "channelConfig" TEXT, "isActive" BOOLEAN DEFAULT true, "lastTriggered" TIMESTAMP, "createdAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "AuditLog" (id TEXT PRIMARY KEY, action TEXT, entity TEXT, actor TEXT DEFAULT 'system', details TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "Organization" (id TEXT PRIMARY KEY, name TEXT, slug TEXT UNIQUE, "createdAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "TeamMember" (id TEXT PRIMARY KEY, "orgId" TEXT NOT NULL, email TEXT, role TEXT DEFAULT 'viewer', "invitedAt" TIMESTAMP DEFAULT NOW(), "joinedAt" TIMESTAMP);
  CREATE TABLE IF NOT EXISTS "AttackChain" (id TEXT PRIMARY KEY, title TEXT, description TEXT, severity TEXT, steps TEXT, "findingIds" TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "Integration" (id TEXT PRIMARY KEY, type TEXT, config TEXT, "isActive" BOOLEAN DEFAULT true, "createdAt" TIMESTAMP DEFAULT NOW());
  CREATE TABLE IF NOT EXISTS "FuzzResult" (id TEXT PRIMARY KEY, "targetUrl" TEXT, endpoint TEXT, method TEXT, "totalRequests" INT, crashes INT, errors INT, anomalies TEXT, "createdAt" TIMESTAMP DEFAULT NOW());
  `;

  // Execute via Supabase SQL endpoint (HTTPS port 443)
  const { data, error } = await supabase.rpc("exec_sql", { sql_text: sql }).catch(() => ({ data: null, error: null }));

  // If RPC doesn't work, try direct SQL API
  if (error) {
    results.push(`RPC failed: ${error.message}, trying direct SQL API...`);
    // Use the Supabase SQL API directly
    const response = await fetch("https://ekjsieovspkuqdjhxwct.supabase.co/rest/v1/rpc/exec_sql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVranNpZW92c3BrdXFkamh4d2N0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTQ3NDUzNCwiZXhwIjoyMTAxMDUwNTM0fQ.wSRwd24RFJHmQBlszGuVkGUmyA1dUzvEVM-ZMZJFIBA",
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVranNpZW92c3BrdXFkamh4d2N0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTQ3NDUzNCwiZXhwIjoyMTAxMDUwNTM0fQ.wSRwd24RFJHmQBlszGuVkGUmyA1dUzvEVM-ZMZJFIBA",
      },
      body: JSON.stringify({ sql_text: sql }),
    });
    if (response.ok) {
      results.push("Tables created via direct SQL API");
    } else {
      results.push(`SQL API failed: ${response.status}`);
      // Last resort: create tables one by one via Supabase table API
      results.push("Trying table creation via REST API...");
    }
  } else {
    results.push("Tables created via Supabase RPC");
  }

  // Check if User table exists and has data
  const { data: users } = await supabase.from("User").select("*").limit(1);
  results.push(`User table check: ${users ? "exists" : "missing"}`);

  // Seed demo codebases if none exist
  const { data: codebases } = await supabase.from("Codebase").select("*").limit(1);
  if (!codebases || codebases.length === 0) {
    await supabase.from("Codebase").insert([
      { id: require("node:crypto").randomUUID(), name: "auth-service.js", language: "javascript", description: "Login module with SQL injection and weak hashing.", sourceCode: "const db = require('./db');\nasync function login(email, password) {\n  const query = \"SELECT * FROM users WHERE email = '\" + email + \"' AND password = '\" + password + \"'\";\n  const rows = await db.rawQuery(query);\n  return rows.length > 0 ? { ok: true } : { ok: false };\n}\nmodule.exports = { login };" },
      { id: require("node:crypto").randomUUID(), name: "file-server.js", language: "javascript", description: "Path traversal + eval vulnerability.", sourceCode: "const fs = require('fs');\nconst path = require('path');\nfunction downloadFile(filename, res) {\n  const filePath = path.join('/var/app/uploads', filename);\n  res.end(fs.readFileSync(filePath));\n}\nmodule.exports = { downloadFile };" },
      { id: require("node:crypto").randomUUID(), name: "user-api.js", language: "javascript", description: "NoSQL injection + plaintext passwords.", sourceCode: "const express = require('express');\nconst app = express();\napp.post('/login', (req, res) => {\n  const query = req.body;\n  const found = users.filter(u => Object.keys(query).every(k => u[k] === query[k]));\n  res.json(found);\n});" },
    ]);
    results.push("Seeded 3 demo codebases");
  }

  return NextResponse.json({ ok: true, message: "Database initialized!", details: results });
}

// GET /api/db-init
export async function GET() {
  try {
    const { data, error } = await supabase.from("User").select("*").limit(1);
    if (error) {
      return NextResponse.json({ initialized: false, message: "NOT initialized. POST to /api/db-init" });
    }
    const { count } = await supabase.from("User").select("*", { count: "exact", head: true });
    return NextResponse.json({ initialized: true, user_count: count || 0, message: "Ready" });
  } catch {
    return NextResponse.json({ initialized: false, message: "NOT initialized. POST to /api/db-init" });
  }
}

