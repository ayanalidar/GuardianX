import { describe, it, expect } from "vitest";
import { toCamelCase, normalizeValue } from "@/lib/safe-api";

describe("Safe API — Key Normalization", () => {
  it("converts snake_case to camelCase", () => {
    expect(toCamelCase("created_at")).toBe("createdAt");
    expect(toCamelCase("patch_id")).toBe("patchId");
    expect(toCamelCase("affected_file")).toBe("affectedFile");
    expect(toCamelCase("ip_address")).toBe("ipAddress");
    expect(toCamelCase("user_agent")).toBe("userAgent");
  });

  it("leaves camelCase untouched", () => {
    expect(toCamelCase("createdAt")).toBe("createdAt");
    expect(toCamelCase("patchId")).toBe("patchId");
  });

  it("leaves simple keys untouched", () => {
    expect(toCamelCase("id")).toBe("id");
    expect(toCamelCase("title")).toBe("title");
    expect(toCamelCase("severity")).toBe("severity");
  });

  it("normalizes nested objects", () => {
    const input = {
      user_id: "123",
      profile: {
        first_name: "John",
        last_name: "Doe",
      },
    };
    const result = normalizeValue(input) as {
      userId: string;
      profile: { firstName: string; lastName: string };
    };
    expect(result.userId).toBe("123");
    expect(result.profile.firstName).toBe("John");
    expect(result.profile.lastName).toBe("Doe");
  });

  it("normalizes arrays of objects", () => {
    const input = [
      { patch_id: "SP-001", affected_file: "test.js" },
      { patch_id: "SP-002", affected_file: "app.js" },
    ];
    const result = normalizeValue(input) as Array<{
      patchId: string;
      affectedFile: string;
    }>;
    expect(result[0].patchId).toBe("SP-001");
    expect(result[0].affectedFile).toBe("test.js");
    expect(result[1].patchId).toBe("SP-002");
  });

  it("handles null and undefined", () => {
    expect(normalizeValue(null)).toBe(null);
    expect(normalizeValue(undefined)).toBe(undefined);
  });

  it("handles primitives", () => {
    expect(normalizeValue("hello")).toBe("hello");
    expect(normalizeValue(42)).toBe(42);
    expect(normalizeValue(true)).toBe(true);
  });
});
