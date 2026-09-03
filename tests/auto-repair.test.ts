import { describe, it, expect } from "vitest";
import { autoRepair } from "@/lib/auto-repair";

describe("Auto-Repair Data Layer", () => {
  it("generates missing id field", () => {
    const { data, repaired } = autoRepair([{ title: "test" }], {
      expectedShape: "array",
      requiredFields: ["id", "title"],
    });
    expect(repaired).toBe(true);
    expect((data as Array<{ id: string }>)[0].id).toBeDefined();
    expect((data as Array<{ title: string }>)[0].title).toBe("test");
  });

  it("generates missing title field", () => {
    const { data, repaired } = autoRepair([{ id: "123" }], {
      expectedShape: "array",
      requiredFields: ["id", "title"],
    });
    expect(repaired).toBe(true);
    expect((data as Array<{ title: string }>)[0].title).toBe("Untitled");
  });

  it("generates missing severity field", () => {
    const { data } = autoRepair([{ id: "1", title: "test" }], {
      requiredFields: ["id", "title", "severity"],
    });
    expect((data as Array<{ severity: string }>)[0].severity).toBe("medium");
  });

  it("normalizes snake_case to camelCase", () => {
    const { data, repaired } = autoRepair([{ patch_id: "SP-001", affected_file: "test.js" }], {
      normalizeCase: true,
    });
    expect(repaired).toBe(true);
    expect((data as Array<{ patchId: string }>)[0].patchId).toBe("SP-001");
    expect((data as Array<{ affectedFile: string }>)[0].affectedFile).toBe("test.js");
  });

  it("filters null items from array", () => {
    const { data, repaired } = autoRepair([null, { id: "1" }, null, { id: "2" }], {
      expectedShape: "array",
    });
    expect(repaired).toBe(true);
    expect(data).toHaveLength(2);
  });

  it("wraps single object in array when array expected", () => {
    const { data, repaired } = autoRepair({ id: "1", title: "test" }, {
      expectedShape: "array",
    });
    expect(repaired).toBe(true);
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
  });

  it("returns empty array for null input", () => {
    const { data } = autoRepair(null, { expectedShape: "array" });
    expect(data).toEqual([]);
  });

  it("converts severity from number to string", () => {
    const { data, repaired } = autoRepair([{ id: "1", severity: 4 }]);
    expect(repaired).toBe(true);
    expect((data as Array<{ severity: string }>)[0].severity).toBe("critical");
  });

  it("does not repair already-valid data", () => {
    const { data, repaired } = autoRepair([{ id: "1", title: "test", severity: "high" }], {
      requiredFields: ["id", "title", "severity"],
    });
    expect(repaired).toBe(false);
    expect(data).toEqual([{ id: "1", title: "test", severity: "high" }]);
  });
});
