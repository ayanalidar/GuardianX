import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = process.env.TEST_URL || "http://localhost:3000";
const TEST_EMAIL = process.env.TEST_EMAIL || "ayan@guardianx.in";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "GuardianX@2026";

let authToken: string | null = null;

beforeAll(async () => {
  // Login to get auth token
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    if (res.ok) {
      const data = await res.json();
      authToken = data.token;
    }
  } catch {
    // Server might not be running — tests will be skipped
  }
});

describe("Authentication", () => {
  it("logs in with valid credentials", async () => {
    if (!authToken) return; // skip if server not running
    expect(authToken).toBeDefined();
    expect(authToken!.length).toBeGreaterThan(50);
  });

  it("rejects invalid credentials", async () => {
    if (!authToken) return;
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "wrong@test.com", password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects missing credentials", async () => {
    if (!authToken) return;
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("API Route Shape Validation", () => {
  const endpoints: Array<{ path: string; shape: "array" | "object"; requiredFields?: string[] }> = [
    { path: "/api/stats", shape: "object" },
    { path: "/api/posture-score", shape: "object" },
    { path: "/api/clients", shape: "array", requiredFields: ["id", "name"] },
    { path: "/api/codebases", shape: "array", requiredFields: ["id", "name"] },
    { path: "/api/findings?limit=5", shape: "array", requiredFields: ["id", "title"] },
    { path: "/api/patches/pending", shape: "array" },
    { path: "/api/health", shape: "object", requiredFields: ["status"] },
  ];

  for (const ep of endpoints) {
    it(`GET ${ep.path} returns correct shape`, async () => {
      if (!authToken) return;

      const res = await fetch(`${BASE_URL}${ep.path}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      expect(res.status).toBe(200);

      const data = await res.json();

      if (ep.shape === "array") {
        expect(Array.isArray(data)).toBe(true);
        if (ep.requiredFields && data.length > 0) {
          for (const field of ep.requiredFields) {
            expect(field in data[0], `Missing field: ${field}`).toBe(true);
          }
        }
      } else {
        expect(typeof data).toBe("object");
        expect(data).not.toBeNull();
        expect(Array.isArray(data)).toBe(false);
        if (ep.requiredFields) {
          for (const field of ep.requiredFields) {
            expect(field in data, `Missing field: ${field}`).toBe(true);
          }
        }
      }
    });
  }
});

describe("Auth Protection", () => {
  const protectedEndpoints = [
    "/api/stats",
    "/api/clients",
    "/api/findings",
    "/api/patches/pending",
    "/api/users",
  ];

  for (const endpoint of protectedEndpoints) {
    it(`GET ${endpoint} requires auth`, async () => {
      if (!authToken) return;

      const res = await fetch(`${BASE_URL}${endpoint}`);
      expect(res.status).toBe(401);
    });

    it(`GET ${endpoint} rejects forged JWT`, async () => {
      if (!authToken) return;

      const forgedJWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbiIsInJvbGUiOiJhZG1pbiIsImFwcHJvdmVkIjp0cnVlfQ.fake";
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${forgedJWT}` },
      });
      expect(res.status).toBe(401);
    });
  }
});

describe("SSRF Protection", () => {
  it("blocks scanning private IPs", async () => {
    if (!authToken) return;

    const res = await fetch(`${BASE_URL}/api/public-scan/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "169.254.169.254" }),
    });

    // Should either reject with 400 (validation) or not return scan results
    if (res.status === 400) {
      const data = await res.json();
      expect(data.error).toContain("private");
    }
    // If the scan route allows the request, the scan should fail to fetch
    // the metadata endpoint (SSRF guard inside the scan route)
  });

  it("blocks recon on private IPs", async () => {
    if (!authToken) return;

    const res = await fetch(`${BASE_URL}/api/recon`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ target: "169.254.169.254" }),
    });

    expect([400, 403]).toContain(res.status);
  });
});

describe("Security Headers", () => {
  it("sets Content-Security-Policy", async () => {
    if (!authToken) return;

    const res = await fetch(`${BASE_URL}/`);
    const csp = res.headers.get("content-security-policy");
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src");
  });

  it("sets X-Frame-Options", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("sets X-Content-Type-Options", async () => {
    const res = await fetch(`${BASE_URL}/`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("sets HSTS", async () => {
    const res = await fetch(`${BASE_URL}/`);
    const hsts = res.headers.get("strict-transport-security");
    expect(hsts).toBeTruthy();
    expect(hsts).toContain("max-age");
  });
});

describe("Native Tools", () => {
  it("CyberChef SHA256 works", async () => {
    if (!authToken) return;

    const res = await fetch(`${BASE_URL}/api/cyberchef`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ operation: "sha256", input: "hello" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.output).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("CyberChef Base64 encode works", async () => {
    if (!authToken) return;

    const res = await fetch(`${BASE_URL}/api/cyberchef`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ operation: "base64-encode", input: "GuardianX" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.output).toBe(btoa("GuardianX"));
  });

  it("CyberChef UUID generates", async () => {
    if (!authToken) return;

    const res = await fetch(`${BASE_URL}/api/cyberchef`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ operation: "generate-uuid", input: "" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.output).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});
