import { describe, test, expect } from "vitest";
import { calculatePasswordStrength } from "@/lib/password-strength";

describe("Password strength", () => {
  test("returns very weak for short passwords", () => {
    const result = calculatePasswordStrength("abc");
    expect(result.score).toBeLessThanOrEqual(1);
    expect(result.label).toMatch(/very weak|weak/i);
  });

  test("returns strong for complex passwords", () => {
    const result = calculatePasswordStrength("Str0ng!Pass#2024xyz");
    expect(result.score).toBeGreaterThanOrEqual(3);
    expect(result.label).toMatch(/good|strong/i);
  });

  test("provides feedback for weak passwords", () => {
    const result = calculatePasswordStrength("weakpass");
    expect(result.feedback.length).toBeGreaterThan(0);
  });

  test("reduces score for common patterns", () => {
    const without = calculatePasswordStrength("XmpdkjPlQn1!");
    const withPattern = calculatePasswordStrength("Password123!");
    expect(withPattern.score).toBeLessThanOrEqual(without.score);
  });

  test("handles empty string", () => {
    const result = calculatePasswordStrength("");
    expect(result.score).toBe(0);
  });
});
