import { describe, test, expect, beforeAll } from "vitest";
import { hashPassword, verifyPassword, createToken, verifyToken } from "@/lib/auth";

describe("Auth: password hashing", () => {
  test("hashPassword returns a bcrypt hash", async () => {
    const hash = await hashPassword("testPassword123!");
    expect(hash).toMatch(/^\$2[aby]\$/);
  });

  test("verifyPassword accepts correct password", async () => {
    const hash = await hashPassword("mySecretPass!");
    expect(await verifyPassword("mySecretPass!", hash)).toBe(true);
  });

  test("verifyPassword rejects wrong password", async () => {
    const hash = await hashPassword("correctPass!");
    expect(await verifyPassword("wrongPass!", hash)).toBe(false);
  });
});

describe("Auth: JWT tokens", () => {
  test("createToken + verifyToken round-trip", () => {
    const payload = {
      userId: "user-123",
      email: "test@example.com",
      role: "admin",
      name: "Test User",
      approved: true,
    };
    const token = createToken(payload);
    expect(token).toBeTruthy();
    const decoded = verifyToken(token);
    expect(decoded).toBeTruthy();
    expect(decoded?.userId).toBe("user-123");
    expect(decoded?.email).toBe("test@example.com");
    expect(decoded?.role).toBe("admin");
    expect(decoded?.approved).toBe(true);
  });

  test("verifyToken rejects invalid token", () => {
    expect(verifyToken("invalid.token.here")).toBeNull();
  });

  test("verifyToken rejects empty string", () => {
    expect(verifyToken("")).toBeNull();
  });
});
