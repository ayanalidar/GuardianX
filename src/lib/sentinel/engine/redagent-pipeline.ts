// RedAgent pipeline orchestrator.
// Runs: crawl → plan attacks → craft + execute each attack → analyze response → persist findings.
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
  type HttpResponse,
} from "./http-attacker";

export interface RedAgentEvent {
  engagementId: string;
  stage: string;
  message: string;
  level: "info" | "success" | "warning" | "error";
  meta?: Record<string, unknown> | null;
  ts: string;
}

type Emit = (e: RedAgentEvent) => void;

export async function runEngagement(
  targetId: string,
  engagementId: string,
  emit: Emit
): Promise<{ engagementId: string; findingCount: number }> {
  const target = await db.target.findUnique({ where: { id: targetId } });
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

    // ── Stage 3+4: Craft + execute each attack, analyze response ────────
    await db.engagement.update({
      where: { id: engagementId },
      data: { status: "attacking", stageLabel: "Executing attacks…" },
    });

    let findingCount = 0;
    // Build a quick lookup of endpoint by path for crafting
    const endpointByPath = new Map(crawl.endpoints.map((e) => [e.path, e]));

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
        await db.finding.create({
          data: {
            engagementId,
            title: analysis.title,
            severity: analysis.severity,
            category: plan.category,
            owasp: plan.owasp,
            endpoint: plan.endpoint,
            method: attack.method,
            description: analysis.description,
            proofRequest: proof.request,
            proofResponse: proof.response,
            payload: attack.payload,
            confidence: analysis.confidence,
            remediation: analysis.remediation,
          },
        });
        findingCount++;

        await emitAndStore({
          stage: "attacking",
          message: `🔴 FINDING: ${analysis.severity.toUpperCase()} — ${analysis.title} on ${plan.endpoint} (confidence ${(analysis.confidence * 100).toFixed(0)}%)`,
          level: "success",
          meta: {
            severity: analysis.severity,
            category: plan.category,
            endpoint: plan.endpoint,
            confidence: analysis.confidence,
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

    // ── Stage 5: Complete ───────────────────────────────────────────────
    await db.engagement.update({
      where: { id: engagementId },
      data: {
        status: "completed",
        stageLabel: `${findingCount} finding(s)`,
        completedAt: new Date(),
      },
    });
    await emitAndStore({
      stage: "completed",
      message: `Engagement complete — ${findingCount} vulnerability(ies) confirmed out of ${plans.length} attacks.`,
      level: findingCount > 0 ? "warning" : "success",
      meta: { findingCount, attackCount: plans.length },
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
