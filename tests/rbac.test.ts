// RBAC ownership tests — the most security-critical paths in the app.
//
// These tests verify that:
//   - Viewers CANNOT see admin's (or other viewers') clients.
//   - Admins CAN see all clients.
//   - Viewers get 403 when accessing another user's client by ID.
//   - Viewers CAN create their own client and then see it in the list.
//
// The Supabase client is mocked (tests/mocks/supabase.ts) so no real DB is
// hit. The auth library is real (we need real JWT signing to construct
// valid Authorization headers).

import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  mockSupabase,
  __setTableData,
  __resetMockSupabase,
  __pushRow,
  __getTableData,
} from "./mocks/supabase";
import { clearCache } from "@/lib/cache";

// ── Module mocks ──────────────────────────────────────────────────────────
//
// `vi.mock` factories are hoisted above the imports by vitest. The factory
// references `mockSupabase` (which is allowed because the name starts with
// "mock"), so the lazy `() => mockSupabase` inside `createClient` resolves
// correctly at runtime.

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => mockSupabase,
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
  sendTextEmail: vi.fn().mockResolvedValue(true),
  sendEmailWithConfig: vi.fn().mockResolvedValue({ ok: true }),
  isSmtpConfigured: vi.fn().mockResolvedValue(false),
  invalidateSmtpConfigCache: vi.fn(),
  explainSmtpError: vi.fn((e: unknown) => String(e)),
  buildSmtpConfigFromForm: vi.fn(() => null),
  testSmtpConnection: vi.fn().mockResolvedValue({ ok: true, message: "mock" }),
}));

// Imports below this line use the mocked modules transitively.
import { createToken } from "@/lib/auth";
import {
  buildOwnershipFilter,
  canAccessClient,
  getVisibleClientIds,
  getAuthenticatedUser,
  isAdmin,
} from "@/lib/ownership";
import type { JWTPayload } from "@/lib/auth";

// ── Test fixtures ──────────────────────────────────────────────────────────

const ADMIN_USER: JWTPayload = {
  userId: "admin-001",
  email: "admin@guardianx.test",
  role: "admin",
  name: "Admin",
  approved: true,
  tokenVersion: 0,
};

const VIEWER_USER: JWTPayload = {
  userId: "viewer-001",
  email: "viewer@guardianx.test",
  role: "viewer",
  name: "Viewer",
  approved: true,
  tokenVersion: 0,
};

const OTHER_VIEWER: JWTPayload = {
  userId: "viewer-002",
  email: "other@guardianx.test",
  role: "viewer",
  name: "Other",
  approved: true,
  tokenVersion: 0,
};

const adminToken = createToken(ADMIN_USER);
const viewerToken = createToken(VIEWER_USER);
const otherViewerToken = createToken(OTHER_VIEWER);

const ADMIN_CLIENT = {
  id: "client-admin-1",
  name: "Admin's Client",
  ownerId: "admin-001",
  status: "active",
  createdAt: "2024-01-01T00:00:00.000Z",
};
const OTHER_VIEWER_CLIENT = {
  id: "client-other-1",
  name: "Other Viewer's Client",
  ownerId: "viewer-002",
  status: "active",
  createdAt: "2024-01-02T00:00:00.000Z",
};

function authedReq(token: string, url = "http://localhost/api/clients"): Request {
  return new Request(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

beforeEach(() => {
  __resetMockSupabase();
  clearCache();
  __setTableData("Client", [ADMIN_CLIENT, OTHER_VIEWER_CLIENT]);
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe("RBAC: buildOwnershipFilter", () => {
  test("viewer's filter excludes admin's clients", async () => {
    const req = authedReq(viewerToken);
    const filter = await buildOwnershipFilter(req);
    expect(filter).toEqual({ ownerId: "viewer-001" });

    // Simulate what db.client.findMany does: filter the table by ownerId.
    const allClients = [
      ADMIN_CLIENT,
      OTHER_VIEWER_CLIENT,
      { id: "c-mine", ownerId: "viewer-001", name: "Mine" },
    ];
    const visible = allClients.filter(
      (c) => c.ownerId === (filter.ownerId as string)
    );
    expect(visible).toHaveLength(1);
    expect(visible[0].name).toBe("Mine");
    expect(visible.find((c) => c.id === "client-admin-1")).toBeUndefined();
    expect(visible.find((c) => c.id === "client-other-1")).toBeUndefined();
  });

  test("admin's filter is empty (sees ALL clients)", async () => {
    const req = authedReq(adminToken);
    const filter = await buildOwnershipFilter(req);
    expect(filter).toEqual({});

    // Empty filter = no constraints = all clients visible (admin's AND
    // other viewers').
    const allClients = [ADMIN_CLIENT, OTHER_VIEWER_CLIENT];
    const visible = allClients; // no filtering applied
    expect(visible).toHaveLength(2);
  });

  test("unauthenticated request matches nothing (filter = { id: '__never__' })", async () => {
    const req = new Request("http://localhost/api/clients");
    const filter = await buildOwnershipFilter(req);
    expect(filter).toEqual({ id: "__never__" });
  });

  test("unapproved user matches nothing (treated as unauthenticated)", async () => {
    const unapproved: JWTPayload = { ...VIEWER_USER, approved: false };
    const token = createToken(unapproved);
    const req = authedReq(token);
    const filter = await buildOwnershipFilter(req);
    expect(filter).toEqual({ id: "__never__" });
  });
});

describe("RBAC: canAccessClient (by ID)", () => {
  test("viewer gets 403 when accessing admin's client by ID", async () => {
    const req = authedReq(viewerToken, "http://localhost/api/clients/client-admin-1");
    const result = await canAccessClient(req, "client-admin-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      const body = await result.response.json();
      expect(body.error).toMatch(/access denied|do not own/i);
    }
  });

  test("viewer gets 403 when accessing ANOTHER viewer's client by ID", async () => {
    const req = authedReq(viewerToken, "http://localhost/api/clients/client-other-1");
    const result = await canAccessClient(req, "client-other-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  test("viewer CAN access their OWN client by ID", async () => {
    __pushRow("Client", {
      id: "client-mine",
      ownerId: "viewer-001",
      name: "Mine",
      status: "active",
      createdAt: "2024-01-03T00:00:00.000Z",
    });
    const req = authedReq(viewerToken, "http://localhost/api/clients/client-mine");
    const result = await canAccessClient(req, "client-mine");
    expect(result.ok).toBe(true);
  });

  test("admin CAN access any client (other viewer's)", async () => {
    const req = authedReq(adminToken, "http://localhost/api/clients/client-other-1");
    const result = await canAccessClient(req, "client-other-1");
    expect(result.ok).toBe(true);
  });

  test("admin CAN access admin's own client", async () => {
    const req = authedReq(adminToken, "http://localhost/api/clients/client-admin-1");
    const result = await canAccessClient(req, "client-admin-1");
    expect(result.ok).toBe(true);
  });

  test("unauthenticated request returns 401", async () => {
    const req = new Request("http://localhost/api/clients/client-admin-1");
    const result = await canAccessClient(req, "client-admin-1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  test("supabase error on the Client lookup returns 403 (fail-safe)", async () => {
    // Queue a one-shot error for the next Client query.
    const { __queueErrorOnce } = await import("./mocks/supabase");
    __queueErrorOnce("Client", { message: "simulated outage" });
    const req = authedReq(viewerToken, "http://localhost/api/clients/client-mine");
    const result = await canAccessClient(req, "client-mine");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Errors are treated as "access denied" (fail-safe) — 403, not 500.
      expect(result.response.status).toBe(403);
    }
  });
});

describe("RBAC: viewer can create + see own client (end-to-end via route)", () => {
  test("viewer POSTs a client → ownerId is set to viewer → viewer sees it in GET /api/clients", async () => {
    const { POST, GET } = await import("@/app/api/clients/route");

    // 1. Create the client as the viewer.
    const createReq = new Request("http://localhost/api/clients", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${viewerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "My New Client" }),
    });
    const createRes = await POST(createReq);
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.name).toBe("My New Client");
    expect(createBody.id).toBeTruthy();

    // 2. Verify the mock DB has the new client with ownerId = viewer-001.
    const clients = __getTableData("Client");
    const created = clients.find((c) => c.name === "My New Client");
    expect(created).toBeDefined();
    expect(created?.ownerId).toBe("viewer-001");

    // 3. GET /api/clients with viewer token → the new client is in the list.
    //    (Cache was cleared in beforeEach, so the GET will hit the mock DB.)
    const listReq = authedReq(viewerToken);
    const listRes = await GET(listReq);
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as Array<{ id: string; name: string }>;
    expect(Array.isArray(list)).toBe(true);
    const found = list.find((c) => c.name === "My New Client");
    expect(found).toBeDefined();
    expect(found?.name).toBe("My New Client");
  });

  test("viewer does NOT see admin's clients in GET /api/clients", async () => {
    const { GET } = await import("@/app/api/clients/route");
    const listReq = authedReq(viewerToken);
    const listRes = await GET(listReq);
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as Array<{ id: string }>;
    expect(Array.isArray(list)).toBe(true);
    const adminClientInList = list.find((c) => c.id === "client-admin-1");
    expect(adminClientInList).toBeUndefined();
    const otherViewerClientInList = list.find((c) => c.id === "client-other-1");
    expect(otherViewerClientInList).toBeUndefined();
  });

  test("admin DOES see all clients (admin's + other viewers') in GET /api/clients", async () => {
    const { GET } = await import("@/app/api/clients/route");
    const listReq = authedReq(adminToken);
    const listRes = await GET(listReq);
    expect(listRes.status).toBe(200);
    const list = (await listRes.json()) as Array<{ id: string }>;
    expect(Array.isArray(list)).toBe(true);
    const ids = list.map((c) => c.id);
    expect(ids).toContain("client-admin-1");
    expect(ids).toContain("client-other-1");
  });

  test("viewer cannot access admin's client detail via GET /api/clients/[id] (403)", async () => {
    const { GET } = await import("@/app/api/clients/[id]/route");
    const req = authedReq(
      viewerToken,
      "http://localhost/api/clients/client-admin-1"
    );
    const ctx = { params: Promise.resolve({ id: "client-admin-1" }) };
    const res = await GET(req, ctx as never);
    expect(res.status).toBe(403);
  });
});

describe("RBAC: getVisibleClientIds", () => {
  test("admin returns null (no filter needed — sees all)", async () => {
    const req = authedReq(adminToken);
    const ids = await getVisibleClientIds(req);
    expect(ids).toBeNull();
  });

  test("viewer returns only their own client IDs (excludes admin's + other viewers')", async () => {
    __pushRow("Client", { id: "client-v1", ownerId: "viewer-001" });
    __pushRow("Client", { id: "client-v2", ownerId: "viewer-001" });
    const req = authedReq(viewerToken);
    const ids = await getVisibleClientIds(req);
    expect(Array.isArray(ids)).toBe(true);
    expect(ids).toEqual(expect.arrayContaining(["client-v1", "client-v2"]));
    expect(ids).not.toContain("client-admin-1");
    expect(ids).not.toContain("client-other-1");
  });

  test("unauthenticated returns empty array", async () => {
    const req = new Request("http://localhost/api/clients");
    const ids = await getVisibleClientIds(req);
    expect(ids).toEqual([]);
  });
});

describe("RBAC: isAdmin + getAuthenticatedUser helpers", () => {
  test("isAdmin returns true for admin role", () => {
    expect(isAdmin(ADMIN_USER)).toBe(true);
  });

  test("isAdmin returns false for viewer role", () => {
    expect(isAdmin(VIEWER_USER)).toBe(false);
  });

  test("isAdmin returns false for null", () => {
    expect(isAdmin(null)).toBe(false);
  });

  test("getAuthenticatedUser returns null for unapproved user (fail-safe)", () => {
    const unapproved: JWTPayload = { ...VIEWER_USER, approved: false };
    const token = createToken(unapproved);
    const req = authedReq(token);
    expect(getAuthenticatedUser(req)).toBeNull();
  });

  test("getAuthenticatedUser returns user for approved viewer", () => {
    const req = authedReq(viewerToken);
    const user = getAuthenticatedUser(req);
    expect(user).not.toBeNull();
    expect(user?.userId).toBe("viewer-001");
    expect(user?.role).toBe("viewer");
  });

  test("getAuthenticatedUser returns user for approved admin", () => {
    const req = authedReq(adminToken);
    const user = getAuthenticatedUser(req);
    expect(user).not.toBeNull();
    expect(user?.userId).toBe("admin-001");
    expect(user?.role).toBe("admin");
  });
});
