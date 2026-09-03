import { describe, it, expect, expectTypeOf } from "vitest";

describe("Schema Validation (Prisma models)", () => {
  it("schema.prisma has all required models", async () => {
    const schema = await Bun.file("prisma/schema.prisma").text();

    const requiredModels = [
      "User", "Client", "Codebase", "Scan", "Patch", "PipelineEvent",
      "ChatMessage", "Credential", "Target", "Engagement", "Finding",
      "Attestation", "Canary", "IOC", "Incident", "Playbook",
      "WebsiteScan", "DetectionRule", "Subscription", "SupportTicket",
      "MemoryEntry", "FeatureRequest", "CommunityRule",
    ];

    const missing = requiredModels.filter(
      (model) => !schema.includes(`model ${model} {`)
    );

    expect(missing, `Missing models: ${missing.join(", ")}`).toEqual([]);
  });

  it("schema.production.prisma has all required models", async () => {
    const schema = await Bun.file("prisma/schema.production.prisma").text();

    const requiredModels = [
      "User", "Client", "Codebase", "Scan", "Patch", "PipelineEvent",
      "ChatMessage", "Credential", "Target", "Engagement", "Finding",
      "WebsiteScan", "DetectionRule",
    ];

    const missing = requiredModels.filter(
      (model) => !schema.includes(`model ${model} {`)
    );

    expect(missing, `Missing in production schema: ${missing.join(", ")}`).toEqual([]);
  });

  it("WebsiteScan has reportSent and reportPath fields", async () => {
    const schema = await Bun.file("prisma/schema.prisma").text();
    expect(schema).toContain("reportSent");
    expect(schema).toContain("reportPath");
  });

  it("no duplicate model definitions", async () => {
    const schema = await Bun.file("prisma/schema.prisma").text();
    const matches = schema.match(/^model\s+(\w+)\s+\{/gm) || [];
    const names = matches.map(m => m.match(/model\s+(\w+)/)?.[1] || "");
    const duplicates = names.filter((n, i) => names.indexOf(n) !== i);
    expect(duplicates, `Duplicate models: ${duplicates.join(", ")}`).toEqual([]);
  });
});
