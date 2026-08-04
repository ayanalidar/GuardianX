// Ownership + role-based data access helpers.

import { getUserFromRequest, type JWTPayload } from "@/lib/auth";
import { supabase } from "@/lib/db";

export function getAuthenticatedUser(req: Request): JWTPayload | null {
  const user = getUserFromRequest(req);
  if (!user || user.approved !== true) return null;
  return user;
}

export function isAdmin(user: JWTPayload | null): boolean {
  return !!user && user.role === "admin";
}

export function buildOwnershipFilter(req: Request): Record<string, unknown> {
  const user = getAuthenticatedUser(req);
  if (!user) return { id: "__never__" };
  if (isAdmin(user)) return {};
  return { ownerId: user.userId };
}

export async function getVisibleClientIds(req: Request): Promise<string[] | null> {
  const user = getAuthenticatedUser(req);
  if (!user) return [];
  if (isAdmin(user)) return null;

  const { data, error } = await supabase
    .from("Client")
    .select("id")
    .eq("ownerId", user.userId);

  if (error) {
    console.error("[ownership] getVisibleClientIds failed:", error.message);
    return [];
  }
  return (data || []).map((r) => (r as Record<string, unknown>).id as string);
}

export async function canAccessClient(
  req: Request,
  clientId: string
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const user = getAuthenticatedUser(req);
  if (!user) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Authentication required." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }
  if (isAdmin(user)) return { ok: true };

  const { data, error } = await supabase
    .from("Client")
    .select("id")
    .eq("id", clientId)
    .eq("ownerId", user.userId)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "Access denied. You do not own this client." }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      ),
    };
  }
  return { ok: true };
}
