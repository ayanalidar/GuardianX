import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { fetchUrl } from "@/lib/sentinel/engine/http-attacker";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Types ──────────────────────────────────────────────────────────────

interface GraphQLTestResult {
  name: string;
  category:
    | "Introspection"
    | "Query Depth"
    | "Batching"
    | "Field Suggestions"
    | "Alias"
    | "Mutation"
    | "Subscription";
  severity: "info" | "low" | "medium" | "high" | "critical";
  cwe: string;
  vulnerable: boolean;
  proofRequest: string;
  proofResponse: string;
  remediation: string;
}

interface RawFinding {
  title: string;
  severity: string;
  category: string;
  cwe: string;
  description: string;
  proofRequest: string;
  proofResponse: string;
  remediation: string;
  endpoint: string;
}

// ─── SSRF Guard ─────────────────────────────────────────────────────────

function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost") return true;
  if (h === "::1" || h === "::ffff:127.0.0.1") return true;
  if (h === "0.0.0.0") return true;
  // IPv4 dotted quad
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  // .local / .internal / .lan TLDs
  if (/\.(local|internal|lan|home|localhost)$/.test(h)) return true;
  return false;
}

function validateGraphqlUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "Invalid URL. Must include protocol (https://...)." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http/https protocols are allowed." };
  }
  if (isPrivateHost(url.hostname)) {
    return {
      ok: false,
      error:
        "SSRF guard: target resolves to a private/loopback address. Public endpoints only.",
    };
  }
  return { ok: true, url };
}

// ─── GraphQL probe helper ──────────────────────────────────────────────

async function gql(
  endpoint: string,
  payload: unknown,
  timeoutMs = 6000
): Promise<{ status: number; body: string; durationMs: number; ok: boolean }> {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  try {
    const r = await fetchUrl(endpoint, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      timeoutMs,
    });
    return {
      status: r.status,
      body: r.body,
      durationMs: r.durationMs,
      ok: r.status >= 200 && r.status < 300,
    };
  } catch {
    return { status: 0, body: "[network error]", durationMs: 0, ok: false };
  }
}

function safeTruncate(s: string, n = 4000): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + `…(+${s.length - n} bytes truncated)`;
}

function isGraphqlError(body: string): boolean {
  // Heuristic: GraphQL errors come back as { "errors": [{ "message": ... }] }
  return /"errors"\s*:\s*\[/.test(body);
}

// ─── Test implementations ───────────────────────────────────────────────

async function testIntrospection(endpoint: string): Promise<GraphQLTestResult[]> {
  const results: GraphQLTestResult[] = [];

  // Test A: __schema query
  const queryA = "{__schema{types{name}}}";
  const rA = await gql(endpoint, { query: queryA });
  const vulnA = rA.ok && /"__schema"\s*:/.test(rA.body) && /"types"\s*:/.test(rA.body);
  results.push({
    name: "Introspection: __schema query exposed",
    category: "Introspection",
    severity: "medium",
    cwe: "CWE-200",
    vulnerable: vulnA,
    proofRequest: `POST ${endpoint}\nContent-Type: application/json\n\n${JSON.stringify({ query: queryA })}`,
    proofResponse: `HTTP ${rA.status} (${rA.durationMs}ms)\n${safeTruncate(rA.body)}`,
    remediation:
      "Disable introspection in production. Apollo: set `introspection: false`. Express-GraphQL: `graphiql: false, introspection: false`.",
  });

  // Test B: __type(name:"User") exposes fields
  const queryB = '{__type(name:"User"){fields{name}}}';
  const rB = await gql(endpoint, { query: queryB });
  const vulnB = rB.ok && /"fields"\s*:\s*\[/.test(rB.body) && !isGraphqlError(rB.body);
  results.push({
    name: "Introspection: __type exposes field names",
    category: "Introspection",
    severity: "medium",
    cwe: "CWE-200",
    vulnerable: vulnB,
    proofRequest: `POST ${endpoint}\nContent-Type: application/json\n\n${JSON.stringify({ query: queryB })}`,
    proofResponse: `HTTP ${rB.status} (${rB.durationMs}ms)\n${safeTruncate(rB.body)}`,
    remediation:
      "Disable introspection in production OR restrict __type lookups behind authentication.",
  });

  return results;
}

/** Build a deeply nested query like {user{posts{author{posts{...}}}}} of depth N. */
function buildDepthQuery(depth: number): string {
  // Alternate `user` and `posts` fields, ending with `id` so the query is valid.
  const fields = ["user", "posts", "author", "posts", "user", "posts", "author", "posts"];
  let q = "{";
  for (let i = 0; i < depth; i++) {
    q += `${fields[i % fields.length]}{`;
  }
  q += "id";
  q += "}".repeat(depth);
  q += "}";
  return q;
}

async function testQueryDepth(endpoint: string): Promise<GraphQLTestResult[]> {
  const depths = [5, 10, 15, 20];
  let maxDepthAccepted = 0;
  let lastResponse = "";
  let lastQuery = "";
  let lastStatus = 0;
  let lastDuration = 0;

  for (const d of depths) {
    const query = buildDepthQuery(d);
    const r = await gql(endpoint, { query }, 8000);
    // If server returned a non-error response (or an error that is NOT about depth/limit),
    // treat it as accepted.
    const isDepthLimited =
      /depth/i.test(r.body) && /(limit|exceed|maximum|max)/i.test(r.body);
    if (r.ok && !isGraphqlError(r.body)) {
      maxDepthAccepted = d;
    } else if (r.ok && isGraphqlError(r.body) && !isDepthLimited) {
      // The error is about something else (e.g. "Cannot query field 'posts'"),
      // which means the parser still ACCEPTED the depth.
      maxDepthAccepted = d;
    }
    lastResponse = r.body;
    lastQuery = query;
    lastStatus = r.status;
    lastDuration = r.durationMs;
    // If the server is clearly depth-limited, stop pushing deeper.
    if (isDepthLimited) break;
  }

  const vulnerable = maxDepthAccepted >= 10;
  return [
    {
      name: `Query Depth: server accepted nested depth of ${maxDepthAccepted}`,
      category: "Query Depth",
      severity: "high",
      cwe: "CWE-674",
      vulnerable,
      proofRequest: `POST ${endpoint}\nContent-Type: application/json\n\n${JSON.stringify({ query: lastQuery })}`,
      proofResponse: `Max accepted depth: ${maxDepthAccepted} (tested depths: ${depths.join(", ")})\nHTTP ${lastStatus} (${lastDuration}ms)\n${safeTruncate(lastResponse)}`,
      remediation:
        "Enable depth limiting. Apollo: graphql-depth-limit package (`import depthLimit from 'graphql-depth-limit'; validationRules: [depthLimit(7)]`). Hard-cap at 7-10 levels.",
    },
  ];
}

async function testBatching(endpoint: string): Promise<GraphQLTestResult[]> {
  // Try 100 identical queries first.
  const q = { query: "{user{id}}" };
  const batch100 = JSON.stringify(Array.from({ length: 100 }, () => q));
  const r100 = await gql(endpoint, batch100, 10000);

  let vulnerable = false;
  let proof = `POST ${endpoint}\nContent-Type: application/json\n\n[100x] ${JSON.stringify(q)}`;
  let resp = `HTTP ${r100.status} (${r100.durationMs}ms)\n${safeTruncate(r100.body)}`;
  let note = "100-query batch";

  // If 100 succeeded, try 1000 (only if first one was OK-ish)
  if (r100.ok || r100.status === 200) {
    vulnerable = true;
    const batch1000 = JSON.stringify(Array.from({ length: 1000 }, () => q));
    const r1000 = await gql(endpoint, batch1000, 12000);
    if (r1000.ok || r1000.status === 200) {
      proof = `POST ${endpoint}\nContent-Type: application/json\n\n[1000x] ${JSON.stringify(q)}`;
      resp = `HTTP ${r1000.status} (${r1000.durationMs}ms)\n${safeTruncate(r1000.body)}`;
      note = "1000-query batch (100 also succeeded)";
      vulnerable = true;
    } else {
      note = "100-query batch succeeded, 1000-query batch rejected";
    }
  }

  return [
    {
      name: `Batching Abuse: ${note}`,
      category: "Batching",
      severity: "medium",
      cwe: "CWE-770",
      vulnerable,
      proofRequest: proof,
      proofResponse: resp,
      remediation:
        "Disable query batching OR cap batch size. Apollo Server: `allowOnlyBareQueries` + `validateBatchComplexity`. Express-graphql: `batch: false`. Limit max batch to 5-10.",
    },
  ];
}

async function testFieldSuggestions(endpoint: string): Promise<GraphQLTestResult[]> {
  // Plural when it should be singular
  const query = "{users{id}}";
  const r = await gql(endpoint, { query });
  const vulnerable =
    isGraphqlError(r.body) && /did you mean/i.test(r.body);

  return [
    {
      name: "Field Suggestions: error leaks 'Did you mean ...'",
      category: "Field Suggestions",
      severity: "low",
      cwe: "CWE-209",
      vulnerable,
      proofRequest: `POST ${endpoint}\nContent-Type: application/json\n\n${JSON.stringify({ query })}`,
      proofResponse: `HTTP ${r.status} (${r.durationMs}ms)\n${safeTruncate(r.body)}`,
      remediation:
        "Disable suggestion messages. Apollo: `formatError` override + `validationRules`. graphql-js: pass a custom `DidYouMean` suppressor. In production, return generic errors only.",
    },
  ];
}

async function testAliasAbuse(endpoint: string): Promise<GraphQLTestResult[]> {
  // 100 aliases in one query: { a1:user{id} a2:user{id} ... a100:user{id} }
  const parts: string[] = [];
  for (let i = 1; i <= 100; i++) parts.push(`a${i}:user{id}`);
  const query = `{${parts.join(" ")}}`;
  const r = await gql(endpoint, { query }, 8000);

  const vulnerable = r.ok && !isGraphqlError(r.body);

  return [
    {
      name: "Alias Abuse: server processed 100 aliases in one query",
      category: "Alias",
      severity: "medium",
      cwe: "CWE-770",
      vulnerable,
      proofRequest: `POST ${endpoint}\nContent-Type: application/json\n\n${JSON.stringify({ query })}`,
      proofResponse: `HTTP ${r.status} (${r.durationMs}ms)\n${safeTruncate(r.body)}`,
      remediation:
        "Limit the number of aliases per query. Apollo: `CostAnalyzer` / `graphql-cost-analysis` package. Cap aliases to ~10.",
    },
  ];
}

async function testMutations(endpoint: string): Promise<GraphQLTestResult[]> {
  const mutations = [
    {
      name: "Unauthenticated Mutation: createUser",
      query: "mutation{createUser(input:{}){id}}",
    },
    {
      name: "Unauthenticated Mutation: deleteUser",
      query: "mutation{deleteUser(id:1){id}}",
    },
  ];
  const results: GraphQLTestResult[] = [];
  for (const m of mutations) {
    const r = await gql(endpoint, { query: m.query });
    // Vulnerable if the response is NOT a GraphQL error AND not a "Cannot query field" error
    // (i.e. the mutation was accepted/executed). Truly critical if it returns data (no errors array).
    const notFoundErr = /Cannot query field|Cannot find|Unknown field/i.test(r.body);
    const authErr = /not authorized|unauthorized|forbidden|must be authenticated|requires? auth/i.test(
      r.body
    );
    const vulnerable = r.ok && !isGraphqlError(r.body);
    const authVulnerable = r.ok && isGraphqlError(r.body) && !authErr && !notFoundErr;
    results.push({
      name: m.name,
      category: "Mutation",
      severity: "critical",
      cwe: "CWE-862",
      vulnerable: vulnerable || authVulnerable,
      proofRequest: `POST ${endpoint}\nContent-Type: application/json\n\n${JSON.stringify({ query: m.query })}`,
      proofResponse: `HTTP ${r.status} (${r.durationMs}ms)\n${safeTruncate(r.body)}`,
      remediation:
        "Enforce authentication + authorization on ALL mutations. Use schema directives (@auth, @hasRole). Never expose create/delete/update mutations without an authenticated resolver.",
    });
  }
  return results;
}

async function testSubscriptions(endpoint: string): Promise<GraphQLTestResult[]> {
  // Best-effort check: send a subscription operation over HTTP. Many servers
  // respond with a specific error like "Subscriptions are not supported over HTTP"
  // or "Must use WebSocket". If the response mentions "subscription" or "websocket",
  // subscriptions ARE configured on the schema (info-only finding).
  const query = "subscription{userCreated{id}}";
  const r = await gql(endpoint, { query });
  const enabled =
    /subscription/i.test(r.body) ||
    /websocket/i.test(r.body) ||
    /protocol/i.test(r.body);

  return [
    {
      name: "Subscription: GraphQL subscription type appears enabled",
      category: "Subscription",
      severity: "info",
      cwe: "CWE-200",
      vulnerable: enabled,
      proofRequest: `POST ${endpoint}\nContent-Type: application/json\n\n${JSON.stringify({ query })}`,
      proofResponse: `HTTP ${r.status} (${r.durationMs}ms)\n${safeTruncate(r.body)}`,
      remediation: enabled
        ? "Confirm whether subscriptions are required. If not, disable the Subscription type. If yes, ensure authentication is enforced on the WebSocket connection (e.g. via connectionParams)."
        : "No subscription evidence detected over HTTP. Verify WebSocket transport separately if subscriptions are intended.",
    },
  ];
}

// ─── Route Handler ──────────────────────────────────────────────────────

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const body = await req.json().catch(() => ({}));
  const raw = typeof body?.graphqlUrl === "string" ? body.graphqlUrl : "";
  if (!raw) {
    return NextResponse.json(
      { error: "graphqlUrl is required (e.g. https://api.example.com/graphql)." },
      { status: 400 }
    );
  }

  const v = validateGraphqlUrl(raw);
  if (!v.ok) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }
  const url = v.url;

  try {
    // ── Create Target + Engagement rows ────────────────────────────────
    const target = await db.target.create({
      data: {
        name: `graphql-test:${url.host}`,
        baseUrl: url.toString(),
        authorized: true, // user explicitly requested the test
      },
    });
    const engagement = await db.engagement.create({
      data: {
        targetId: target.id,
        status: "attacking",
        stageLabel: "GraphQL Security Testing",
      },
    });

    // ── Run all GraphQL tests ──────────────────────────────────────────
    const allResults: GraphQLTestResult[] = [];
    allResults.push(...(await testIntrospection(url.toString())));
    allResults.push(...(await testQueryDepth(url.toString())));
    allResults.push(...(await testBatching(url.toString())));
    allResults.push(...(await testFieldSuggestions(url.toString())));
    allResults.push(...(await testAliasAbuse(url.toString())));
    allResults.push(...(await testMutations(url.toString())));
    allResults.push(...(await testSubscriptions(url.toString())));

    // ── Persist Findings for vulnerable tests ─────────────────────────
    const vulnerableResults = allResults.filter((r) => r.vulnerable);
    const findingsMeta: RawFinding[] = vulnerableResults.map((r) => ({
      title: r.name,
      severity: r.severity,
      category: r.category,
      cwe: r.cwe,
      description: `${r.name} — ${r.cwe}. Server response indicates the vulnerability is present.`,
      proofRequest: r.proofRequest,
      proofResponse: r.proofResponse,
      remediation: r.remediation,
      endpoint: url.toString(),
    }));

    for (const f of findingsMeta) {
      await db.finding.create({
        data: {
          engagementId: engagement.id,
          title: f.title,
          severity: f.severity,
          category: f.category,
          owasp: f.cwe, // store CWE in owasp field (no dedicated cwe column)
          endpoint: f.endpoint,
          method: "POST",
          description: f.description,
          proofRequest: f.proofRequest,
          proofResponse: f.proofResponse,
          remediation: f.remediation,
          confidence: 0.9,
        },
      });
    }

    // ── Update engagement status ──────────────────────────────────────
    await db.engagement.update({
      where: { id: engagement.id },
      data: {
        status: "completed",
        stageLabel: `GraphQL scan complete — ${vulnerableResults.length} finding(s)`,
        completedAt: new Date(),
      },
    });

    const criticalCount = vulnerableResults.filter(
      (r) => r.severity === "critical"
    ).length;

    return NextResponse.json({
      engagementId: engagement.id,
      targetId: target.id,
      testedBy: user.email,
      graphqlUrl: url.toString(),
      testedCount: allResults.length,
      vulnerableCount: vulnerableResults.length,
      criticalCount,
      findings: allResults.map((r) => ({
        name: r.name,
        category: r.category,
        severity: r.severity,
        cwe: r.cwe,
        vulnerable: r.vulnerable,
        proofRequest: r.proofRequest,
        proofResponse: r.proofResponse,
        remediation: r.remediation,
      })),
      _meta: { targetId: target.id, performedAt: new Date().toISOString() },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "GraphQL testing failed.",
      },
      { status: 500 }
    );
  }
}

// GET — lightweight descriptor for the route (no auth needed for OPTIONS-like discovery)
export async function GET() {
  return NextResponse.json({
    route: "/api/vapt/graphql",
    method: "POST",
    description: "GraphQL security VAPT — introspection, depth, batching, field suggestions, alias abuse, mutation auth, subscription.",
    body: { graphqlUrl: "string (e.g. https://api.example.com/graphql)" },
    tests: [
      "Introspection (__schema, __type)",
      "Query Depth (5, 10, 15, 20)",
      "Batching Abuse (100 then 1000)",
      "Field Suggestions (Did you mean ...)",
      "Alias Abuse (100 aliases)",
      "Mutation Testing (createUser, deleteUser without auth)",
      "Subscription Testing (HTTP probe)",
    ],
  });
}
