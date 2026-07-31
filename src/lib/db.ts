// GuardianX database client — uses Supabase REST API (HTTPS port 443).
// This works on Vercel serverless (which blocks PostgreSQL port 5432).
// All database operations go through Supabase's PostgREST API.

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "https://ekjsieovspkuqdjhxwct.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVranNpZW92c3BrdXFkamh4d2N0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTQ3NDUzNCwiZXhwIjoyMTAxMDUwNTM0fQ.wSRwd24RFJHmQBlszGuVkGUmyA1dUzvEVM-ZMZJFIBA";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Helper: execute raw SQL via Supabase RPC (for table creation, etc.)
export async function execSql(sql: string): Promise<unknown> {
  const { data, error } = await supabase.rpc("exec_sql", { sql_text: sql }).catch(() => ({ data: null, error: { message: "rpc not available" } }));
  if (error) throw error;
  return data;
}

// Db-compatible wrapper that mimics Prisma's interface for common operations.
// This allows existing API routes to work with minimal changes.
export const db = {
  // Generic table operations
  async create(table: string, data: Record<string, unknown>) {
    const { data: result, error } = await supabase.from(table).insert(data).select().single();
    if (error) throw new Error(error.message);
    return result;
  },

  async findFirst(table: string, query: { where?: Record<string, unknown>; select?: string[] } = {}) {
    let q = supabase.from(table).select(query.select ? query.select.join(",") : "*");
    if (query.where) {
      for (const [key, value] of Object.entries(query.where)) {
        if (value !== undefined && value !== null) {
          q = q.eq(key, value as string);
        }
      }
    }
    const { data, error } = await q.limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  },

  async findMany(table: string, query: { where?: Record<string, unknown>; select?: string[]; orderBy?: string; take?: number } = {}) {
    let q = supabase.from(table).select(query.select ? query.select.join(",") : "*");
    if (query.where) {
      for (const [key, value] of Object.entries(query.where)) {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value) && value[0] === "in") {
            q = q.in(key, value[1] as unknown[]);
          } else {
            q = q.eq(key, value as string);
          }
        }
      }
    }
    if (query.take) q = q.limit(query.take);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data || [];
  },

  async update(table: string, query: { where: Record<string, unknown> }, data: Record<string, unknown>) {
    let q = supabase.from(table).update(data);
    for (const [key, value] of Object.entries(query.where)) {
      q = q.eq(key, value as string);
    }
    const { data: result, error } = await q.select().single();
    if (error) throw new Error(error.message);
    return result;
  },

  async delete(table: string, query: { where: Record<string, unknown> }) {
    let q = supabase.from(table).delete();
    for (const [key, value] of Object.entries(query.where)) {
      q = q.eq(key, value as string);
    }
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  async count(table: string, query: { where?: Record<string, unknown> } = {}) {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (query.where) {
      for (const [key, value] of Object.entries(query.where)) {
        if (value !== undefined && value !== null) {
          q = q.eq(key, value as string);
        }
      }
    }
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count || 0;
  },

  // Raw SQL execution (for db-init)
  async $executeRawUnsafe(sql: string) {
    // Supabase doesn't support raw SQL via REST, but we can use the SQL endpoint
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ sql_text: sql }),
    });
    if (!response.ok) {
      throw new Error(`SQL execution failed: ${response.statusText}`);
    }
    return 0;
  },

  async $disconnect() {
    // No-op for Supabase REST client
  },
};
