// RedAgent pipeline orchestrator.
// Runs: crawl → [1.5 Nmap] → [1.6 FFuF] → plan attacks → [2.5 Nuclei] →
//       craft + execute each attack → analyze response → persist findings →
//       [3.5 SQLmap] → exposure sweep → [4c dedup] → complete.
//
// Stages marked with a decimal (1.5, 1.6, 2.5, 3.5, 4c) are powered by the
// recon-tools Docker service. If that service is unreachable, every recon
// stage no-ops gracefully and the pipeline falls back to AI-only DAST — the
// engagement still completes, just without the tool-enhanced findings.
//
// Emits live events through a callback so the socket.io relay can broadcast them.

import { db } from "@/lib/db";
import {
  planAttacks,
  craftHttpAttack,
  analyzeResponse,
  type CrawlSummary,
  type PlannedAttack,
} from "./redagent-ai";
import {
  crawlTarget,
  executeAttack,
  formatProof,
  fetchUrl,
  type HttpResponse,
} from "./http-attacker";
import { scanResponse, probeKnownPaths } from "./exposure-scanner";
import {
  isReconAvailable,
  nmapScan,
  ffufScan,
  sqlmapScan,
  nucleiScan,
  type NmapResult,
  type FfufResult,
  type SqlmapResult,
  type NucleiResult,
  type NucleiFinding,
} from "./recon-client";

export interface RedAgentEvent {
  engagementId: string;
  stage: string;
  message: string;
  level: "info" | "success" | "warning" | "error";
  meta?: Record<string, unknown> | null;
  ts: string;
}

type Emit = (e: RedAgentEvent) => void;

// ── Recon-enhancement helpers ──────────────────────────────────────────────

/**
 * Aggregate recon context that flows through the engagement so later stages
 * (and the deduplication pass) can enrich findings with the right evidence.
 */
interface ReconContext {
  available: boolean;
  nmap: NmapResult | null;
  ffuf: FfufResult | null;
  nuclei: NucleiResult | null;
  sqlmap: Map<string, SqlmapResult>; // url → result
}

function emptyRecon(): ReconContext {
  return { available: false, nmap: null, ffuf: null, nuclei: null, sqlmap: new Map() };
}

/**
 * Normalise a finding's category into a coarse "vulnerability class" so we
 * can detect duplicates that use different labels (e.g. "SQL Injection" vs
 * "SQLi" vs "Injection" → "injection"). Findings with different classes on
 * the same endpoint are kept and linked, not merged.
 */
function vulnClass(category: string): string {
  const c = (category || "").toLowerCase();
  if (c.includes("sql") || c.includes("injection")) return "injection";
  if (c.includes("xss") || c.includes("cross-site")) return "xss";
  if (c.includes("auth") || c.includes("access") || c.includes("bypass")) return "auth";
  if (c.includes("path") || c.includes("traversal") || c.includes("lfi")) return "traversal";
  if (c.includes("redirect")) return "redirect";
  if (c.includes("ssrf")) return "ssrf";
  if (c.includes("command")) return "cmd";
  if (c.includes("rce")) return "cmd";
  if (c.includes("cve") || c.includes("nuclei")) return "cve";
  if (c.includes("exposure") || c.includes("secret") || c.includes("pii") || c.includes("config")) return "exposure";
  if (c.includes("xxe")) return "xxe";
  if (c.includes("csrf")) return "csrf";
  return c || "other";
}

/**
 * Combined exploitability score in [0,1]: how easy is this to exploit given
 * everything we know (AI confidence, Nuclei CVSS, SQLmap confirmation).
 */
function computeExploitability(input: {
  aiConfidence?: number;
  nuclei?: NucleiFinding;
  sqlmap?: SqlmapResult;
}): number {
  let score = 0;
  if (typeof input.aiConfidence === "number") {
    score = Math.max(score, input.aiConfidence);
  }
  if (input.nuclei) {
    const cvss = typeof input.nuclei.cvss === "number" ? input.nuclei.cvss : 5;
    score = Math.max(score, cvss / 10);
  }
  if (input.sqlmap?.vulnerable) {
    // SQLmap confirmed exploitation — very high confidence.
    score = Math.max(score, 0.97);
  }
  return Math.max(0, Math.min(1, score));
}

/**
 * Build a recon-provenance block to append to a finding's proofResponse.
 * Includes nmap service version, nuclei template id + CVSS, and SQLmap output
 * (whichever are available for this endpoint).
 */
function buildReconProofBlock(input: {
  endpoint: string;
  recon: ReconContext;
  sqlmap?: SqlmapResult | null;
}): string {
  const lines: string[] = [];
  lines.push("--- Recon-tool corroboration ---");

  // Nmap service version for this host (port-agnostic but useful context)
  if (input.recon.nmap && input.recon.nmap.ports.length > 0) {
    const services = input.recon.nmap.ports
      .filter((p) => p.state === "open" && (p.product || p.version))
      .map((p) => `${p.port}/${p.service} ${p.product ?? ""} ${p.version ?? ""}`.trim())
      .slice(0, 8);
    if (services.length > 0) {
      lines.push(`Nmap services:\n  ${services.join("\n  ")}`);
    }
  }

  // Nuclei templates that matched on or near this endpoint
  if (input.recon.nuclei) {
    const matched = input.recon.nuclei.findings.filter((f) => {
      try {
        return new URL(f.matchedAt).pathname === input.endpoint;
      } catch {
        return f.matchedAt.includes(input.endpoint);
      }
    });
    if (matched.length > 0) {
      lines.push(
        `Nuclei matches on this endpoint:\n  ${matched
          .map(
            (m) =>
              `${m.templateId} [${m.severity}] CVSS=${m.cvss ?? "N/A"} — ${m.name}`
          )
          .join("\n  ")}`
      );
    }
  }

  // SQLmap confirmation
  if (input.sqlmap?.vulnerable) {
    lines.push(
      [
        `SQLmap confirmed injection:`,
        `  DBMS: ${input.sqlmap.dbms ?? "unknown"}`,
        input.sqlmap.banner ? `  Banner: ${input.sqlmap.banner}` : "",
        input.sqlmap.databases?.length
          ? `  Databases: ${input.sqlmap.databases.join(", ")}`
          : "",
        input.sqlmap.injectionPoints.length
          ? `  Injections: ${input.sqlmap.injectionPoints
              .map((i) => `${i.param} (${i.type})${i.payload ? ` payload=${i.payload}` : ""}`)
              .join("; ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  return lines.join("\n");
}

/**
 * Find the SQLmap result (if any) that applies to a given endpoint.
 * SQLmap is keyed by full URL, so we match on the URL containing the endpoint
 * path.
 */
function findSqlmapForEndpoint(
  endpoint: string,
  sqlmapByUrl: Map<string, SqlmapResult>
): SqlmapResult | null {
  for (const [url, result] of sqlmapByUrl) {
    if (url.includes(endpoint)) return result;
  }
  return null;
}

/**
 * Build a full URL (with sample query param) for an endpoint + method, so we
 * have something concrete to point SQLmap at.
 */
function buildEndpointUrl(
  baseUrl: string,
  path: string,
  method: string,
  params: string[]
): string {
  const base = baseUrl.replace(/\/$/, "");
  if (method === "GET" && params.length > 0) {
    const q = params.map((p) => `${p}=1`).join("&");
    return `${base}${path}${path.includes("?") ? "&" : "?"}${q}`;
  }
  if (method === "POST" && params.length > 0) {
    // SQLmap will need --data; for the URL itself, just point at the path.
    return `${base}${path}`;
  }
  return `${base}${path}`;
}

// ── Main pipeline ──────────────────────────────────────────────────────────

interface TargetRecord {
  id: string;
  name: string;
  baseUrl: string;
  authHeader: string | null;
  notes: string | null;
  authorized: boolean;
}

export async function runEngagement(
  targetId: string,
  engagementId: string,
  emit: Emit
): Promise<{ engagementId: string; findingCount: number }> {
  const target = (await db.target.findUnique({
    where: { id: targetId },
  })) as unknown as TargetRecord | null;
  if (!target) throw new Error("Target not found");
  if (!target.authorized)
    throw new Error("Target is not authorized for testing.");

  const emitAndStore = async (e: Omit<RedAgentEvent, "ts" | "engagementId">) => {
    const full: RedAgentEvent = {
      ...e,
      engagementId,
      ts: new Date().toISOString(),
    };
    emit(full);
    await db.redAgentEvent.create({
      data: {
        engagementId,
        stage: full.stage,
        message: full.message,
        level: full.level,
        meta: full.meta ? JSON.stringify(full.meta) : null,
      },
    });
  };

  // Probe the recon-tools service once up-front so every stage can just
  // consult `recon.available` without re-pinging.
  const recon: ReconContext = emptyRecon();
  try {
    recon.available = await isReconAvailable();
  } catch {
    recon.available = false;
  }
  if (!recon.available) {
    await emitAndStore({
      stage: "recon",
      message:
        "Recon-tools service unavailable, falling back to AI-only DAST.",
      level: "warning",
      meta: { phase: "recon-fallback" },
    });
  } else {
    await emitAndStore({
      stage: "recon",
      message:
        "Recon-tools service online — enabling hybrid AI + traditional-tools DAST.",
      level: "success",
      meta: { phase: "recon-online" },
    });
  }

  try {
    // ── Stage 1: Crawl ───────────────────────────────────────────────────
    await db.engagement.update({
      where: { id: engagementId },
      data: { status: "crawling", stageLabel: "Crawling target…" },
    });
    await emitAndStore({
      stage: "crawling",
      message: `Reconnaissance: crawling ${target.baseUrl}…`,
      level: "info",
    });

    const crawl: CrawlSummary = await crawlTarget(target.baseUrl, target.authHeader);

    await db.engagement.update({
      where: { id: engagementId },
      data: {
        crawlSummary: JSON.stringify({
          endpointCount: crawl.endpoints.length,
          endpoints: crawl.endpoints.map((e) => `${e.method} ${e.path}`),
          notes: crawl.notes,
        }),
      },
    });

    await emitAndStore({
      stage: "crawling",
      message: `Crawl complete — found ${crawl.endpoints.length} endpoints: ${crawl.endpoints
        .map((e) => `${e.method} ${e.path}`)
        .slice(0, 6)
        .join(", ")}${crawl.endpoints.length > 6 ? "…" : ""}`,
      level: "success",
      meta: { count: crawl.endpoints.length },
    });

    if (crawl.endpoints.length === 0) {
      await emitAndStore({
        stage: "completed",
        message: "No endpoints discovered. Nothing to attack.",
        level: "warning",
      });
      await db.engagement.update({
        where: { id: engagementId },
        data: { status: "completed", stageLabel: "No endpoints found", completedAt: new Date() },
      });
      return { engagementId, findingCount: 0 };
    }

    // ── Stage 1.5: Port & Service Scan (Nmap) ───────────────────────────
    // Discovers open ports + service versions so the AI planner knows what
    // is actually running (SSH on 22, MySQL on 3306, Jenkins on 8080, etc.).
    if (recon.available) {
      await db.engagement.update({
        where: { id: engagementId },
        data: { status: "recon-nmap", stageLabel: "Stage 1.5: Nmap service scan…" },
      });
      await emitAndStore({
        stage: "recon-nmap",
        message: `Stage 1.5: Running Nmap service scan on ${target.baseUrl}…`,
        level: "info",
        meta: { phase: "nmap-start" },
      });
      try {
        const nmapResult = await nmapScan(target.baseUrl, "service");
        if (nmapResult) {
          recon.nmap = nmapResult;
          const openPorts = nmapResult.ports.filter((p) => p.state === "open");
          const portList = openPorts.map((p) => `${p.port}`).join(", ");
          await emitAndStore({
            stage: "recon-nmap",
            message: `Nmap: ${openPorts.length} ports open (${portList || "none"})`,
            level: openPorts.length > 0 ? "success" : "warning",
            meta: {
              phase: "nmap-done",
              ports: openPorts.map((p) => ({
                port: p.port,
                service: p.service,
                product: p.product,
                version: p.version,
              })),
            },
          });
          // Fold the service map into the crawl notes — the AI planner
          // reads `notes` and will reason about exposed services.
          const serviceSummary = openPorts
            .map((p) => `${p.port}/${p.service}${p.version ? ` ${p.version}` : ""}`)
            .join(", ");
          crawl.notes += ` Nmap detected ${openPorts.length} open ports: ${serviceSummary}.`;
          // Persist the augmented crawl summary so the engagement record
          // carries the recon output.
          await db.engagement.update({
            where: { id: engagementId },
            data: {
              crawlSummary: JSON.stringify({
                endpointCount: crawl.endpoints.length,
                endpoints: crawl.endpoints.map((e) => `${e.method} ${e.path}`),
                notes: crawl.notes,
                reconResults: { nmap: nmapResult },
              }),
            },
          });
        } else {
          await emitAndStore({
            stage: "recon-nmap",
            message: `Nmap: no result returned (service may be busy) — continuing with AI-only recon.`,
            level: "warning",
          });
        }
      } catch (err) {
        await emitAndStore({
          stage: "recon-nmap",
          message: `Nmap stage failed: ${err instanceof Error ? err.message : "unknown"} — continuing.`,
          level: "warning",
        });
      }
    }

    // ── Stage 1.6: Directory Discovery (FFuF) ──────────────────────────
    // Discovers hidden paths the crawler missed (admin panels, API docs,
    // backup files, etc.) and merges them into the crawl endpoint list so
    // the AI can plan attacks against them.
    if (recon.available) {
      await db.engagement.update({
        where: { id: engagementId },
        data: { status: "recon-ffuf", stageLabel: "Stage 1.6: FFuF directory discovery…" },
      });
      await emitAndStore({
        stage: "recon-ffuf",
        message: `Stage 1.6: Running FFuF directory discovery…`,
        level: "info",
        meta: { phase: "ffuf-start" },
      });
      try {
        const ffufResult = await ffufScan(target.baseUrl, {
          extensions: ["php", "html", "js", "json", "txt", "bak"],
          matchStatus: [200, 301, 302, 401, 403],
        });
        if (ffufResult) {
          recon.ffuf = ffufResult;
          const allowedStatus = new Set([200, 301, 302, 401, 403]);
          const hits = ffufResult.results.filter((h) => allowedStatus.has(h.status));
          const existingPaths = new Set(crawl.endpoints.map((e) => e.path));
          let hiddenCount = 0;
          // Cap merges so a wildly productive FFuF run doesn't drown the
          // AI planner with hundreds of endpoints.
          for (const hit of hits.slice(0, 40)) {
            if (!existingPaths.has(hit.path)) {
              crawl.endpoints.push({
                method: "GET" as const,
                path: hit.path,
                params: [],
                hasBody: false,
                description: `Discovered by FFuF — HTTP ${hit.status}, ${hit.length} bytes`,
              });
              existingPaths.add(hit.path);
              hiddenCount++;
            }
          }
          await emitAndStore({
            stage: "recon-ffuf",
            message: `FFuF: ${hits.length} paths discovered (${hiddenCount} hidden)`,
            level: hits.length > 0 ? "success" : "info",
            meta: {
              phase: "ffuf-done",
              hits: hits.length,
              hidden: hiddenCount,
              sample: hits.slice(0, 8).map((h) => `${h.path} (${h.status})`),
            },
          });
          crawl.notes += ` FFuF discovered ${hiddenCount} hidden paths beyond the crawl.`;
        } else {
          await emitAndStore({
            stage: "recon-ffuf",
            message: `FFuF: no result returned — continuing.`,
            level: "warning",
          });
        }
      } catch (err) {
        await emitAndStore({
          stage: "recon-ffuf",
          message: `FFuF stage failed: ${err instanceof Error ? err.message : "unknown"} — continuing.`,
          level: "warning",
        });
      }
    }

    // ── Stage 2: Plan attacks ───────────────────────────────────────────
    await db.engagement.update({
      where: { id: engagementId },
      data: { status: "planning", stageLabel: "AI planning attacks…" },
    });
    await emitAndStore({
      stage: "planning",
      message: "RedAgent AI is reasoning about attack vectors for each endpoint…",
      level: "info",
    });

    const plans: PlannedAttack[] = await planAttacks(crawl);

    await emitAndStore({
      stage: "planning",
      message: `Planned ${plans.length} attacks: ${plans
        .map((p) => p.category)
        .slice(0, 6)
        .join(", ")}${plans.length > 6 ? "…" : ""}`,
      level: "info",
      meta: { count: plans.length },
    });

    // ── Stage 2.5: Nuclei Vulnerability Scan ───────────────────────────
    // Runs 5000+ community vulnerability templates against the target. Each
    // match becomes a Finding of category "Known CVE / Nuclei Finding".
    // These complement the AI's custom attacks with known-CVE coverage.
    if (recon.available) {
      await db.engagement.update({
        where: { id: engagementId },
        data: {
          status: "recon-nuclei",
          stageLabel: "Stage 2.5: Nuclei vulnerability scan…",
        },
      });
      await emitAndStore({
        stage: "recon-nuclei",
        message: `Stage 2.5: Running Nuclei vulnerability scan (5000+ templates)…`,
        level: "info",
        meta: { phase: "nuclei-start" },
      });
      try {
        const nucleiResult = await nucleiScan(target.baseUrl, {
          severity: "critical,high,medium,low",
        });
        if (nucleiResult) {
          recon.nuclei = nucleiResult;
          const counts: Record<string, number> = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            info: 0,
          };
          for (const f of nucleiResult.findings) counts[f.severity]++;
          await emitAndStore({
            stage: "recon-nuclei",
            message: `Nuclei: ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low findings`,
            level:
              counts.critical > 0
                ? "warning"
                : counts.high > 0
                  ? "warning"
                  : "success",
            meta: { phase: "nuclei-done", counts, total: nucleiResult.findings.length },
          });

          // Convert Nuclei findings into GuardianX Finding records.
          for (const f of nucleiResult.findings) {
            if (f.severity === "info") continue; // skip noise
            let endpointPath: string;
            try {
              endpointPath = new URL(f.matchedAt).pathname;
            } catch {
              endpointPath = f.matchedAt;
            }
            const proofLines = [
              `Nuclei template: ${f.templateId}`,
              f.name ? `Template name: ${f.name}` : "",
              f.cvss ? `CVSS: ${f.cvss}` : "",
              `Matched at: ${f.matchedAt ?? f.url}`,
              f.matched ? `Matched: ${f.matched}` : "",
              f.description ? `Description: ${f.description}` : "",
              f.extractedResults?.length ? `Extracted data: ${f.extractedResults.join(", ")}` : "",
              f.tags?.length ? `Tags: ${f.tags.join(", ")}` : "",
              f.reference?.length ? `References: ${f.reference.join(" | ")}` : "",
            ].filter(Boolean);
            const exploitability = computeExploitability({ nuclei: f });
            const confidence = Math.max(
              0.85,
              typeof f.cvss === "number" ? f.cvss / 10 : 0.7
            );
            await db.finding.create({
              data: {
                engagementId,
                title: `${f.name || f.templateId} on ${endpointPath}`,
                severity: f.severity,
                category: "Known CVE / Nuclei Finding",
                owasp: f.tags?.[0] || "A05:2021-Security Misconfiguration",
                endpoint: endpointPath,
                method: "GET",
                description: `Nuclei template "${f.templateId}" matched against ${f.matchedAt}. ${f.description ?? ""} CVSS: ${f.cvss ?? "N/A"}. Exploitability score: ${exploitability.toFixed(2)}/1.00.`,
                proofRequest: `GET ${f.matchedAt} HTTP/1.1\nHost: ${
                  (() => {
                    try {
                      return new URL(f.matchedAt).host;
                    } catch {
                      return target.baseUrl;
                    }
                  })()
                }`,
                proofResponse: proofLines.join("\n"),
                payload: null,
                confidence,
                remediation: f.reference?.length
                  ? `Patch or upgrade the affected component. References: ${f.reference.join(" | ")}.`
                  : "Patch or upgrade the affected component. See the Nuclei template reference for the vendor advisory.",
              },
            });
            await emitAndStore({
              stage: "recon-nuclei",
              message: `🔴 FINDING: ${f.severity.toUpperCase()} — ${f.name || f.templateId} on ${endpointPath} (CVSS ${f.cvss ?? "N/A"})`,
              level: "success",
              meta: {
                source: "nuclei",
                templateId: f.templateId,
                severity: f.severity,
                cvss: f.cvss,
                endpoint: endpointPath,
              },
            });
          }
        } else {
          await emitAndStore({
            stage: "recon-nuclei",
            message: `Nuclei: no result returned — continuing.`,
            level: "warning",
          });
        }
      } catch (err) {
        await emitAndStore({
          stage: "recon-nuclei",
          message: `Nuclei stage failed: ${err instanceof Error ? err.message : "unknown"} — continuing.`,
          level: "warning",
        });
      }
    }

    // ── Stage 3+4: Craft + execute each attack, analyze response ────────
    await db.engagement.update({
      where: { id: engagementId },
      data: { status: "attacking", stageLabel: "Executing attacks…" },
    });

    let findingCount = 0;
    // Build a quick lookup of endpoint by path for crafting
    const endpointByPath = new Map(crawl.endpoints.map((e) => [e.path, e]));
    // Track AI-found SQLi endpoints so Stage 3.5 can deep-test them.
    const aiSqliEndpoints = new Set<string>();

    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      const endpoint =
        endpointByPath.get(plan.endpoint) ??
        crawl.endpoints.find((e) => e.path === plan.endpoint) ??
        crawl.endpoints[0];

      await emitAndStore({
        stage: "attacking",
        message: `[${i + 1}/${plans.length}] Crafting ${plan.category} attack on ${plan.method} ${plan.endpoint}…`,
        level: "info",
        meta: { category: plan.category, endpoint: plan.endpoint },
      });

      let attack;
      try {
        attack = await craftHttpAttack(target.baseUrl, plan, endpoint);
      } catch (err) {
        await emitAndStore({
          stage: "attacking",
          message: `[${i + 1}/${plans.length}] Failed to craft attack: ${err instanceof Error ? err.message : "unknown"}`,
          level: "error",
        });
        continue;
      }

      await emitAndStore({
        stage: "attacking",
        message: `[${i + 1}/${plans.length}] Firing ${attack.method} ${new URL(attack.url).pathname} payload="${attack.payload.slice(0, 50)}"…`,
        level: "info",
        meta: { payload: attack.payload.slice(0, 80) },
      });

      let response: HttpResponse;
      try {
        response = await executeAttack(attack, target.authHeader);
      } catch (err) {
        await emitAndStore({
          stage: "attacking",
          message: `[${i + 1}/${plans.length}] Request failed: ${err instanceof Error ? err.message : "unknown"}`,
          level: "error",
        });
        continue;
      }

      await emitAndStore({
        stage: "attacking",
        message: `[${i + 1}/${plans.length}] Response: ${response.status} (${response.durationMs}ms, ${response.body.length} bytes)`,
        level: response.status >= 200 && response.status < 300 ? "info" : response.status >= 400 ? "warning" : "info",
      });

      // Analyze
      await db.engagement.update({
        where: { id: engagementId },
        data: { status: "analyzing", stageLabel: `Analyzing ${plan.category} response…` },
      });

      let analysis;
      try {
        analysis = await analyzeResponse(plan, attack, response);
      } catch (err) {
        await emitAndStore({
          stage: "analyzing",
          message: `[${i + 1}/${plans.length}] Analysis failed: ${err instanceof Error ? err.message : "unknown"}`,
          level: "error",
        });
        continue;
      }

      if (analysis.vulnerable) {
        const proof = formatProof(attack, response);

        // If this is a SQLi finding, queue the URL for Stage 3.5 SQLmap.
        if (vulnClass(plan.category) === "injection") {
          aiSqliEndpoints.add(attack.url);
        }

        // Enhanced proof: append recon-tool corroboration block when available.
        let proofResponse = proof.response;
        const sqlmapForEndpoint = findSqlmapForEndpoint(plan.endpoint, recon.sqlmap);
        if (recon.available) {
          const reconBlock = buildReconProofBlock({
            endpoint: plan.endpoint,
            recon,
            sqlmap: sqlmapForEndpoint,
          });
          if (reconBlock && reconBlock !== "--- Recon-tool corroboration ---") {
            proofResponse = `${proofResponse}\n\n${reconBlock}`;
          }
        }
        const exploitability = computeExploitability({
          aiConfidence: analysis.confidence,
          sqlmap: sqlmapForEndpoint ?? undefined,
        });
        const descriptionWithScore = `${analysis.description} Exploitability score: ${exploitability.toFixed(2)}/1.00.`;

        await db.finding.create({
          data: {
            engagementId,
            title: analysis.title,
            severity: analysis.severity,
            category: plan.category,
            owasp: plan.owasp,
            endpoint: plan.endpoint,
            method: attack.method,
            description: descriptionWithScore,
            proofRequest: proof.request,
            proofResponse,
            payload: attack.payload,
            confidence: sqlmapForEndpoint?.vulnerable
              ? Math.max(analysis.confidence, 1.0)
              : analysis.confidence,
            remediation: analysis.remediation,
          },
        });
        findingCount++;

        await emitAndStore({
          stage: "attacking",
          message: `🔴 FINDING: ${analysis.severity.toUpperCase()} — ${analysis.title} on ${plan.endpoint} (confidence ${(
            (sqlmapForEndpoint?.vulnerable ? 1 : analysis.confidence) * 100
          ).toFixed(0)}%)`,
          level: "success",
          meta: {
            source: "ai",
            severity: analysis.severity,
            category: plan.category,
            endpoint: plan.endpoint,
            confidence: sqlmapForEndpoint?.vulnerable ? 1 : analysis.confidence,
            exploitability,
          },
        });
      } else {
        await emitAndStore({
          stage: "attacking",
          message: `[${i + 1}/${plans.length}] ${plan.category} on ${plan.endpoint}: not exploitable (confidence ${(analysis.confidence * 100).toFixed(0)}%)`,
          level: "info",
          meta: { category: plan.category, endpoint: plan.endpoint },
        });
      }
    }

    // ── Stage 3.5: SQLmap Deep Injection Testing ───────────────────────
    // For each endpoint where AI detected a potential SQL injection OR that
    // has query params, run SQLmap to confirm + extract DBMS info. If
    // SQLmap confirms injection, upgrade the matching AI finding's
    // confidence to 1.0 + attach the proof. If SQLmap finds injection the
    // AI missed, create a new Finding.
    if (recon.available) {
      // Gather candidate URLs:
      //   1. Endpoints where AI flagged a SQLi finding.
      //   2. Endpoints with query params (broader sweep).
      const candidateUrls = new Set<string>(aiSqliEndpoints);
      for (const ep of crawl.endpoints) {
        if (ep.params.length > 0) {
          const url = buildEndpointUrl(target.baseUrl, ep.path, ep.method, ep.params);
          candidateUrls.add(url);
        }
      }
      // Cap concurrent-ish work to keep the engagement tractable.
      const urls = [...candidateUrls].slice(0, 12);

      if (urls.length > 0) {
        await db.engagement.update({
          where: { id: engagementId },
          data: {
            status: "recon-sqlmap",
            stageLabel: `Stage 3.5: SQLmap on ${urls.length} endpoint(s)…`,
          },
        });
        await emitAndStore({
          stage: "recon-sqlmap",
          message: `Stage 3.5: Running SQLmap on ${urls.length} suspicious endpoint(s)…`,
          level: "info",
          meta: { phase: "sqlmap-start", count: urls.length, urls },
        });

        let confirmedCount = 0;
        for (const url of urls) {
          try {
            const sqlmapResult = await sqlmapScan(url, {
              // Pass-through any query params present on the URL so sqlmap
              // tests each one. The recon-tools service derives them from
              // the URL when omitted, but being explicit is safer.
              params: (() => {
                try {
                  return [...new URL(url).searchParams.keys()];
                } catch {
                  return undefined;
                }
              })(),
            });
            if (!sqlmapResult) {
              await emitAndStore({
                stage: "recon-sqlmap",
                message: `SQLmap: no result for ${url} (service busy?) — skipping.`,
                level: "warning",
                meta: { url },
              });
              continue;
            }
            recon.sqlmap.set(url, sqlmapResult);

            if (sqlmapResult.vulnerable) {
              confirmedCount++;
              let endpointPath: string;
              try {
                endpointPath = new URL(url).pathname;
              } catch {
                endpointPath = url;
              }
              await emitAndStore({
                stage: "recon-sqlmap",
                message: `🔴 FINDING: SQLmap confirmed SQLi on ${url} (${sqlmapResult.dbms ?? "unknown DBMS"})`,
                level: "success",
                meta: {
                  source: "sqlmap",
                  url,
                  endpoint: endpointPath,
                  dbms: sqlmapResult.dbms,
                  banner: sqlmapResult.banner,
                  databases: sqlmapResult.databases,
                },
              });

              // Look for an existing AI SQLi finding on this endpoint.
              const existingFindings = await db.finding.findMany({
                where: { engagementId, endpoint: endpointPath },
              });
              const existingSqli = existingFindings.find(
                (f) => vulnClass(String(f.category)) === "injection"
              );

              const sqlmapProof = buildReconProofBlock({
                endpoint: endpointPath,
                recon,
                sqlmap: sqlmapResult,
              });
              const exploitability = computeExploitability({ sqlmap: sqlmapResult });

              if (existingSqli) {
                // Upgrade the AI finding to 100% confidence and append proof.
                const mergedProof = `${String(existingSqli.proofResponse ?? "")}\n\n${sqlmapProof}`;
                const mergedDesc = `${String(existingSqli.description ?? "")} SQLmap confirmed injection (DBMS: ${sqlmapResult.dbms ?? "unknown"}). Exploitability score: ${exploitability.toFixed(2)}/1.00.`;
                await db.finding.update({
                  where: { id: existingSqli.id as string },
                  data: {
                    confidence: 1.0,
                    proofResponse: mergedProof,
                    description: mergedDesc,
                    severity: upgradeSeverity(String(existingSqli.severity), "high"),
                  },
                });
              } else {
                // SQLmap found something the AI missed — create a new finding.
                await db.finding.create({
                  data: {
                    engagementId,
                    title: `SQL Injection (SQLmap-confirmed) on ${endpointPath}`,
                    severity: "critical",
                    category: "SQL Injection",
                    owasp: "A03:2021-Injection",
                    endpoint: endpointPath,
                    method: "GET",
                    description: `SQLmap confirmed exploitable SQL injection against ${url}. DBMS: ${sqlmapResult.dbms ?? "unknown"}. Banner: ${sqlmapResult.banner ?? "N/A"}. Databases enumerated: ${sqlmapResult.databases?.join(", ") || "N/A"}. Injections: ${sqlmapResult.injectionPoints.map((i) => `${i.param} (${i.type})`).join("; ") || "N/A"}. Exploitability score: ${exploitability.toFixed(2)}/1.00.`,
                    proofRequest: `GET ${url} HTTP/1.1\nHost: ${
                      (() => {
                        try {
                          return new URL(url).host;
                        } catch {
                          return target.baseUrl;
                        }
                      })()
                    }`,
                    proofResponse: `SQLmap command: sqlmap -u "${url}" --batch --level=3 --risk=2\n\n${sqlmapProof}`,
                    payload:
                      sqlmapResult.injectionPoints[0]?.payload ??
                      "(SQLmap-generated payload)",
                    confidence: 1.0,
                    remediation:
                      "Use parameterised queries / prepared statements for ALL database access. Validate + sanitise input. Apply least-privilege DB permissions. Consider a WAF rule as defence-in-depth, not a fix.",
                  },
                });
                findingCount++;
              }
            } else {
              await emitAndStore({
                stage: "recon-sqlmap",
                message: `SQLmap: ${url} — no injection confirmed.`,
                level: "info",
                meta: { url },
              });
            }
          } catch (err) {
            await emitAndStore({
              stage: "recon-sqlmap",
              message: `SQLmap: error on ${url}: ${err instanceof Error ? err.message : "unknown"} — skipping.`,
              level: "warning",
              meta: { url },
            });
          }
        }

        await emitAndStore({
          stage: "recon-sqlmap",
          message: `SQLmap: ${confirmedCount}/${urls.length} endpoints confirmed vulnerable.`,
          level: confirmedCount > 0 ? "warning" : "success",
          meta: { phase: "sqlmap-done", confirmed: confirmedCount, total: urls.length },
        });
      } else {
        await emitAndStore({
          stage: "recon-sqlmap",
          message: `Stage 3.5: No candidate endpoints with query params or AI-flagged SQLi — skipping SQLmap.`,
          level: "info",
        });
      }
    }

    // ── Stage 4b: Sensitive Data Exposure Sweep ──────────────────────────
    // Systematically scan all crawled endpoint responses for exposed secrets
    // (AWS keys, Stripe keys, JWTs, private keys, passwords in source, etc.)
    // and PII (SSNs, credit cards, emails), plus probe known exposure paths
    // (.env, .git/, .DS_Store, backups, swagger, etc.).
    // All samples are REDACTED — only first4...last4 is stored, never the
    // full secret value.
    await db.engagement.update({
      where: { id: engagementId },
      data: { status: "attacking", stageLabel: "Sweeping for exposed secrets + PII…" },
    });
    await emitAndStore({
      stage: "attacking",
      message: `🔎 Sensitive data exposure sweep — scanning responses for leaked secrets/PII…`,
      level: "info",
      meta: { phase: "exposure-sweep" },
    });

    let exposureCount = 0;

    // 1. Scan each crawled endpoint's response for secrets/PII
    for (const ep of crawl.endpoints) {
      try {
        const url = new URL(ep.path, target.baseUrl).toString();
        const res = await fetchUrl(url, {
          headers: target.authHeader ? { Authorization: target.authHeader } : {},
          timeoutMs: 8000,
        });
        const hit = scanResponse(url, "GET", res);
        if (hit) {
          for (const h of hit.hits) {
            const proof = `GET ${url}\nHTTP ${res.status}\n\nDetected: ${h.type} (${h.count} match${h.count === 1 ? "" : "es"})\nRedacted sample: ${h.redactedSample}\nContext: ${h.context}`;
            await db.finding.create({
              data: {
                engagementId,
                title: `Exposed ${h.type} on ${ep.path}`,
                severity: h.severity,
                category: h.category === "secret" ? "Sensitive Data Exposure" : "PII Exposure",
                owasp: h.owasp,
                endpoint: ep.path,
                method: "GET",
                description: `The response from ${ep.path} exposes ${h.count} instance(s) of ${h.type.toLowerCase()}. This ${h.category} could be harvested by an attacker. Sample redacted: ${h.redactedSample}.`,
                proofRequest: `GET ${url} HTTP/1.1\nHost: ${new URL(url).host}`,
                proofResponse: proof,
                payload: null,
                confidence: 0.95,
                remediation:
                  h.category === "secret"
                    ? "Remove the secret from the response immediately. Rotate the exposed credential (it must be considered compromised). Never serve source/config files or include secrets in client-visible responses."
                    : "Do not return PII in API responses unless strictly necessary. Apply field-level authorization (return SSN/CC only to authorized roles). Mask sensitive fields (e.g. •••-••-1234).",
              },
            });
            exposureCount++;
            findingCount++;
          }
          await emitAndStore({
            stage: "attacking",
            message: `🔴 EXPOSURE: ${hit.hits.length} sensitive data type(s) found on ${ep.path} (${hit.hits.map((h) => `${h.type}×${h.count}`).join(", ")})`,
            level: "success",
            meta: { phase: "exposure", endpoint: ep.path, types: hit.hits.map((h) => h.type) },
          });
        }
      } catch {
        /* skip unreachable endpoint */
      }
    }

    // 2. Probe known exposure paths
    await emitAndStore({
      stage: "attacking",
      message: `🔎 Probing ${22} known exposure paths (.env, .git/, backups, swagger, etc.)…`,
      level: "info",
      meta: { phase: "exposure-probe" },
    });

    const probes = await probeKnownPaths(target.baseUrl, target.authHeader);
    for (const p of probes) {
      await db.finding.create({
        data: {
          engagementId,
          title: `${p.label} at ${p.path}`,
          severity: p.severity,
          category: "Sensitive Data Exposure",
          owasp: p.owasp,
          endpoint: p.path,
          method: "GET",
          description: `The path ${p.path} is accessible (HTTP ${p.status}) and exposes ${p.label.toLowerCase()}. ${p.bodySize} bytes returned. Redacted preview: ${p.redactedSample || "(binary/non-text)"}.`,
          proofRequest: `GET ${target.baseUrl}${p.path} HTTP/1.1\nHost: ${new URL(target.baseUrl).host}`,
          proofResponse: `HTTP/1.1 ${p.status}\nContent-Length: ${p.bodySize}\n\nRedacted preview: ${p.redactedSample || "(binary content)"}\n\n[Full content redacted — exposure confirmed, value not stored.]`,
          payload: null,
          confidence: 0.9,
          remediation: `Block access to ${p.path} at the web server / reverse proxy level. If the file shouldn't exist in production, remove it from the deployment. Add to the server's deny list.`,
        },
      });
      exposureCount++;
      findingCount++;
      await emitAndStore({
        stage: "attacking",
        message: `🔴 EXPOSURE: ${p.label} at ${p.path} (HTTP ${p.status}, ${p.bodySize} bytes)`,
        level: "success",
        meta: { phase: "exposure-probe", path: p.path, label: p.label },
      });
    }

    if (exposureCount > 0) {
      await emitAndStore({
        stage: "attacking",
        message: `🔎 Exposure sweep complete — ${exposureCount} sensitive data exposure(s) documented (samples redacted).`,
        level: "warning",
        meta: { phase: "exposure-sweep-end", exposureCount },
      });
    } else {
      await emitAndStore({
        stage: "attacking",
        message: `🔎 Exposure sweep complete — no exposed secrets or PII detected.`,
        level: "success",
        meta: { phase: "exposure-sweep-end" },
      });
    }

    // ── Stage 4c: Finding Deduplication ────────────────────────────────
    // Two passes:
    //   (a) same endpoint + same vuln class → merge into the highest-
    //       confidence finding, append the lower's evidence, delete dup.
    //   (b) same endpoint + different vuln class → keep both, link them by
    //       appending a "Linked findings" note to each.
    {
      const allFindings = (await db.finding.findMany({
        where: { engagementId },
      })) as Array<{
        id: string;
        title: string;
        severity: string;
        category: string;
        endpoint: string;
        method: string;
        description: string;
        proofRequest: string;
        proofResponse: string;
        confidence: number;
      }>;

      // (a) Merge same-endpoint + same-class duplicates.
      const byKey = new Map<string, typeof allFindings>();
      for (const f of allFindings) {
        const key = `${f.endpoint}::${vulnClass(f.category)}`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key)!.push(f);
      }
      let mergedCount = 0;
      for (const group of byKey.values()) {
        if (group.length <= 1) continue;
        // Sort by confidence desc — keeper is the most-confident record.
        const sorted = [...group].sort((a, b) => b.confidence - a.confidence);
        const keeper = sorted[0];
        const dupes = sorted.slice(1);
        const appendedEvidence = dupes
          .map(
            (d) =>
              `[merged duplicate: ${d.title} (${d.category}, conf ${(d.confidence * 100).toFixed(0)}%, severity ${d.severity})]\n${String(d.proofResponse ?? "").slice(0, 600)}`
          )
          .join("\n\n");
        const mergedProof = `${String(keeper.proofResponse ?? "")}\n\n--- Merged duplicates ---\n${appendedEvidence}`;
        const mergedConfidence = Math.min(
          1,
          Math.max(keeper.confidence, ...dupes.map((d) => d.confidence)) + 0.05
        );
        await db.finding.update({
          where: { id: keeper.id },
          data: {
            proofResponse: mergedProof,
            confidence: mergedConfidence,
            severity: dupes.reduce(
              (sev, d) => upgradeSeverity(sev, d.severity),
              keeper.severity
            ),
          },
        });
        for (const d of dupes) {
          await db.finding.delete({ where: { id: d.id } });
          findingCount--;
          mergedCount++;
        }
      }

      // (b) Link same-endpoint + different-class findings.
      const byEndpoint = new Map<string, typeof allFindings>();
      // Re-fetch since (a) may have deleted some.
      const afterMerge = (await db.finding.findMany({
        where: { engagementId },
      })) as typeof allFindings;
      for (const f of afterMerge) {
        if (!byEndpoint.has(f.endpoint)) byEndpoint.set(f.endpoint, []);
        byEndpoint.get(f.endpoint)!.push(f);
      }
      let linkedCount = 0;
      for (const group of byEndpoint.values()) {
        if (group.length <= 1) continue;
        const classes = new Set(group.map((g) => vulnClass(g.category)));
        if (classes.size <= 1) continue; // same class — already merged above
        const linkNote =
          "--- Linked findings on this endpoint ---\n" +
          group
            .map(
              (g) =>
                `• ${g.title} [${g.category}] (conf ${(g.confidence * 100).toFixed(0)}%, severity ${g.severity})`
            )
            .join("\n");
        for (const f of group) {
          // Only append the link note once (idempotency guard).
          if (String(f.proofResponse ?? "").includes("--- Linked findings on this endpoint ---")) {
            continue;
          }
          await db.finding.update({
            where: { id: f.id },
            data: {
              proofResponse: `${String(f.proofResponse ?? "")}\n\n${linkNote}`,
            },
          });
          linkedCount++;
        }
      }

      if (mergedCount > 0 || linkedCount > 0) {
        await emitAndStore({
          stage: "dedup",
          message: `Deduplication: merged ${mergedCount} duplicate finding(s), linked ${linkedCount} related finding(s) across endpoints.`,
          level: "info",
          meta: { phase: "dedup", merged: mergedCount, linked: linkedCount },
        });
      }
    }

    // ── Stage 5: Complete ───────────────────────────────────────────────
    await db.engagement.update({
      where: { id: engagementId },
      data: {
        status: "completed",
        stageLabel: `${findingCount} finding(s)${recon.available ? " (hybrid AI + recon-tools)" : ""}`,
        completedAt: new Date(),
      },
    });
    await emitAndStore({
      stage: "completed",
      message: `Engagement complete — ${findingCount} vulnerability(ies) confirmed out of ${plans.length} attacks.${recon.available ? " Hybrid AI + recon-tools DAST." : " AI-only DAST (recon-tools unavailable)."}`,
      level: findingCount > 0 ? "warning" : "success",
      meta: {
        findingCount,
        attackCount: plans.length,
        hybrid: recon.available,
        recon: {
          nmap: recon.nmap ? recon.nmap.ports.length : 0,
          ffuf: recon.ffuf ? recon.ffuf.results.length : 0,
          nuclei: recon.nuclei ? recon.nuclei.findings.length : 0,
          sqlmap: recon.sqlmap.size,
        },
      },
    });

    return { engagementId, findingCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db.engagement.update({
      where: { id: engagementId },
      data: { status: "failed", stageLabel: `Failed: ${msg}`, completedAt: new Date() },
    });
    await emitAndStore({
      stage: "failed",
      message: `Engagement failed: ${msg}`,
      level: "error",
    });
    throw err;
  }
}

/**
 * Pick the higher of two severities (critical > high > medium > low > info).
 * Used when merging duplicate findings: the merged record inherits the most
 * severe classification among its sources.
 */
function upgradeSeverity(a: string, b: string): string {
  const rank: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    info: 0,
  };
  const ra = rank[String(a).toLowerCase()] ?? 0;
  const rb = rank[String(b).toLowerCase()] ?? 0;
  return ra >= rb ? a : b;
}
