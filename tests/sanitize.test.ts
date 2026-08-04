import { describe, test, expect } from "vitest";
import { sanitizeText, sanitizeEmail, sanitizeHtml } from "@/lib/sanitize";

describe("Sanitize: sanitizeText", () => {
  test("trims whitespace", () => {
    expect(sanitizeText("  hello  ")).toBe("hello");
  });

  test("removes null bytes", () => {
    expect(sanitizeText("hello\x00world")).toBe("helloworld");
  });

  test("removes control characters", () => {
    expect(sanitizeText("hello\x07\x08world")).toBe("helloworld");
  });

  test("preserves newlines and tabs", () => {
    expect(sanitizeText("hello\nworld\t!")).toBe("hello\nworld\t!");
  });

  test("truncates to max length", () => {
    const long = "a".repeat(100);
    expect(sanitizeText(long, 10)).toHaveLength(10);
  });

  test("returns empty string for non-string input", () => {
    expect(sanitizeText(null as unknown as string)).toBe("");
  });
});

describe("Sanitize: sanitizeEmail", () => {
  test("trims and lowercases", () => {
    expect(sanitizeEmail("  Test@Example.COM  ")).toBe("test@example.com");
  });

  test("returns empty for invalid email", () => {
    expect(sanitizeEmail("not-an-email")).toBe("");
    expect(sanitizeEmail("missing@domain")).toBe("");
    expect(sanitizeEmail("@domain.com")).toBe("");
  });

  test("accepts valid email", () => {
    expect(sanitizeEmail("user@example.com")).toBe("user@example.com");
  });
});

describe("Sanitize: sanitizeHtml", () => {
  test("removes script tags", () => {
    const result = sanitizeHtml("<script>alert(1)</script>hello");
    expect(result).not.toContain("<script");
    expect(result).toContain("hello");
  });

  test("removes on* event handlers", () => {
    const result = sanitizeHtml('<div onclick="alert(1)">text</div>');
    expect(result).not.toContain("onclick");
  });

  test("removes javascript: URLs", () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">link</a>');
    expect(result).not.toContain("javascript:");
  });

  test("removes iframe tags", () => {
    const result = sanitizeHtml('<iframe src="evil.com"></iframe>safe');
    expect(result).not.toContain("<iframe");
    expect(result).toContain("safe");
  });
});
