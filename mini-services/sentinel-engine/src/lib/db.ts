// GuardianX database client — Prisma-compatible dispatcher over Supabase REST API.
//
// This wrapper lets all 155 existing `db.<model>.<method>(...)` call sites
// work unchanged on both Vercel serverless (HTTPS port 443) and Railway.
//
// Supported Prisma operations:
//   findUnique, findFirst, findMany, create, update, delete, count
// Supported query features:
//   where: { field: value, field: { in: [...] }, field: { lte/gte/gt/lt/contains }, OR: [...], AND: [...] }
//   select: { field: true, ... }
//   include: { relation: true, relation: { select: {...} } }  (via separate queries — no FK needed)
//   orderBy: { field: "desc"|"asc" }
//   take: number
//   _count: { relation: true }  (via separate count queries)

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://ekjsieovspkuqdjhxwct.supabase.co";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVranNpZW92c3BrdXFkamh4d2N0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTQ3NDUzNCwiZXhwIjoyMTAxMDUwNTM0fQ.wSRwd24RFJHmQBlszGuVkGUmyA1dUzvEVM-ZMZJFIBA";

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Model name → table name mapping ────────────────────────────────────────
// Prisma model names are PascalCase; Supabase table names are also PascalCase
// (because we created them with quoted identifiers in 0001_init.sql).
const MODEL_TO_TABLE: Record<string, string> = {
  user: "User",
  codebase: "Codebase",
  scan: "Scan",
  patch: "Patch",
  pipelineEvent: "PipelineEvent",
  chatMessage: "ChatMessage",
  credential: "Credential",
  credentialAudit: "CredentialAudit",
  target: "Target",
  engagement: "Engagement",
  finding: "Finding",
  redAgentEvent: "RedAgentEvent",
  attestation: "Attestation",
  canary: "Canary",
  apiAccessLog: "ApiAccessLog",
  honeypotHit: "HoneypotHit",
  webhookConfig: "WebhookConfig",
  scheduledScan: "ScheduledScan",
  alertRule: "AlertRule",
  auditLog: "AuditLog",
  organization: "Organization",
  teamMember: "TeamMember",
  attackChain: "AttackChain",
  integration: "Integration",
  fuzzResult: "FuzzResult",
};

// ── Relation metadata: model → { relationName: { table, foreignKey, isList } } ─
// Used by include/_count to do follow-up queries. Derived from schema.prisma.
const RELATIONS: Record<string, Record<string, { table: string; fk: string; isList: boolean }>> = {
  Codebase: {
    scans: { table: "Scan", fk: "codebaseId", isList: true },
    patches: { table: "Patch", fk: "codebaseId", isList: true },
  },
  Scan: {
    patches: { table: "Patch", fk: "scanId", isList: true },
    events: { table: "PipelineEvent", fk: "scanId", isList: true },
    codebase: { table: "Codebase", fk: "id", isList: false }, // belongsTo (reverse)
  },
  Patch: {
    chatMessages: { table: "ChatMessage", fk: "patchId", isList: true },
    attestations: { table: "Attestation", fk: "patchId", isList: true },
    codebase: { table: "Codebase", fk: "id", isList: false },
    scan: { table: "Scan", fk: "id", isList: false },
  },
  Engagement: {
    findings: { table: "Finding", fk: "engagementId", isList: true },
    events: { table: "RedAgentEvent", fk: "engagementId", isList: true },
    target: { table: "Target", fk: "id", isList: false },
  },
  Credential: {
    audits: { table: "CredentialAudit", fk: "credentialId", isList: true },
  },
  Target: {
    engagements: { table: "Engagement", fk: "targetId", isList: true },
  },
  Organization: {
    members: { table: "TeamMember", fk: "orgId", isList: true },
  },
};

// ── where-clause builder → returns a filter function applied to a query ────
type WhereValue = unknown;
type WhereClause = Record<string, WhereValue>;

function applyWhere(
  q: ReturnType<SupabaseClient["from"]>,
  where: WhereClause | undefined
): ReturnType<SupabaseClient["from"]> {
  if (!where) return q;
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined || value === null) continue;

    if (key === "OR" && Array.isArray(value)) {
      // PostgREST or= syntax: or(field.eq.val,field.eq.val2,...)
      const parts: string[] = [];
      for (const cond of value as WhereClause[]) {
        for (const [k, v] of Object.entries(cond)) {
          if (v !== undefined && v !== null && typeof v !== "object") {
            parts.push(`${k}.eq.${typeof v === "string" ? v : JSON.stringify(v)}`);
          }
        }
      }
      if (parts.length > 0) q = q.or(parts.join(","));
      continue;
    }

    if (key === "AND" && Array.isArray(value)) {
      for (const cond of value as WhereClause[]) {
        q = applyWhere(q, cond);
      }
      continue;
    }

    if (typeof value === "object" && !Array.isArray(value)) {
      const filter = value as Record<string, unknown>;
      if ("in" in filter && Array.isArray(filter.in)) {
        q = q.in(key, filter.in as unknown[]);
      } else if ("lte" in filter) {
        q = q.lte(key, filter.lte as string | number);
      } else if ("gte" in filter) {
        q = q.gte(key, filter.gte as string | number);
      } else if ("lt" in filter) {
        q = q.lt(key, filter.lt as string | number);
      } else if ("gt" in filter) {
        q = q.gt(key, filter.gt as string | number);
      } else if ("contains" in filter) {
        q = q.ilike(key, `%${filter.contains}%`);
      } else if ("not" in filter) {
        q = q.neq(key, filter.not as string | number);
      }
      continue;
    }

    // Direct equality
    q = q.eq(key, value as string);
  }
  return q;
}

// ── select builder → returns a comma-separated select string ──────────────
function buildSelect(select: Record<string, boolean> | undefined): string | null {
  if (!select) return null;
  return Object.keys(select).filter((k) => select[k]).join(",");
}

// ── orderBy builder ─────────────────────────────────────────────────────────
function applyOrderBy(
  q: ReturnType<SupabaseClient["from"]>,
  orderBy: Record<string, "asc" | "desc"> | undefined
): ReturnType<SupabaseClient["from"]> {
  if (!orderBy) return q;
  for (const [field, dir] of Object.entries(orderBy)) {
    q = q.order(field, { ascending: dir === "asc" });
  }
  return q;
}

// ── include resolver: fetches related records via separate queries ────────
async function resolveIncludes(
  modelName: string,
  records: Record<string, unknown>[] | Record<string, unknown> | null,
  include: Record<string, unknown> | undefined
): Promise<void> {
  if (!include || !records) return;
  const rels = RELATIONS[modelName];
  if (!rels) return;

  const recordList = Array.isArray(records) ? records : [records];
  for (const [relName, relOpts] of Object.entries(include)) {
    const rel = rels[relName];
    if (!rel) continue; // unknown relation — skip silently

    const opts = relOpts as { select?: Record<string, boolean> };
    const selectStr = buildSelect(opts.select) || "*";

    for (const record of recordList) {
      if (rel.isList) {
        // hasMany: fetch all related where fk = this record's id
        const { data } = await supabase
          .from(rel.table)
          .select(selectStr)
          .eq(rel.fk, record.id as string);
        (record as Record<string, unknown>)[relName] = data || [];
      } else {
        // belongsTo: fetch the parent where id = this record's fk
        const fkValue = (record as Record<string, unknown>)[rel.fk];
        if (fkValue) {
          const { data } = await supabase
            .from(rel.table)
            .select(selectStr)
            .eq("id", fkValue as string)
            .maybeSingle();
          (record as Record<string, unknown>)[relName] = data;
        }
      }
    }
  }
}

// ── _count resolver: adds _count.{relation} to each record ─────────────────
async function resolveCounts(
  modelName: string,
  records: Record<string, unknown>[] | Record<string, unknown> | null,
  countSpec: Record<string, boolean> | undefined
): Promise<void> {
  if (!countSpec || !records) return;
  const rels = RELATIONS[modelName];
  if (!rels) return;

  const recordList = Array.isArray(records) ? records : [records];
  for (const record of recordList) {
    const counts: Record<string, number> = {};
    for (const [relName, enabled] of Object.entries(countSpec)) {
      if (!enabled) continue;
      const rel = rels[relName];
      if (!rel || !rel.isList) continue;
      const { count } = await supabase
        .from(rel.table)
        .select("*", { count: "exact", head: true })
        .eq(rel.fk, record.id as string);
      counts[relName] = count || 0;
    }
    (record as Record<string, unknown>)._count = counts;
  }
}

// ── Model handler: the object returned by db.<modelName> ──────────────────
interface ModelHandler {
  findUnique(args: {
    where: WhereClause;
    select?: Record<string, boolean>;
    include?: Record<string, unknown>;
  }): Promise<Record<string, unknown> | null>;
  findFirst(args: {
    where?: WhereClause;
    select?: Record<string, boolean>;
    include?: Record<string, unknown>;
    orderBy?: Record<string, "asc" | "desc">;
  }): Promise<Record<string, unknown> | null>;
  findMany(args: {
    where?: WhereClause;
    select?: Record<string, boolean>;
    include?: Record<string, unknown>;
    orderBy?: Record<string, "asc" | "desc">;
    take?: number;
    _count?: Record<string, boolean>;
  }): Promise<Record<string, unknown>[]>;
  create(args: {
    data: Record<string, unknown>;
    select?: Record<string, boolean>;
    include?: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
  update(args: {
    where: WhereClause;
    data: Record<string, unknown>;
    select?: Record<string, boolean>;
    include?: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;
  delete(args: { where: WhereClause }): Promise<Record<string, unknown>>;
  count(args: { where?: WhereClause }): Promise<number>;
}

function createModelHandler(modelKey: string): ModelHandler {
  const table = MODEL_TO_TABLE[modelKey] || modelKey.charAt(0).toUpperCase() + modelKey.slice(1);

  return {
    async findUnique(args: {
      where: WhereClause;
      select?: Record<string, boolean>;
      include?: Record<string, unknown>;
    } = {} as any) {
      const { where, select, include } = args || {};
      let q = supabase.from(table).select(buildSelect(select) || "*");
      q = applyWhere(q, where);
      const { data, error } = await q.limit(1).maybeSingle();
      if (error) throw new Error(`[${table}.findUnique] ${error.message}`);
      if (data && include) await resolveIncludes(table, data, include);
      return data;
    },

    async findFirst(args: {
      where?: WhereClause;
      select?: Record<string, boolean>;
      include?: Record<string, unknown>;
      orderBy?: Record<string, "asc" | "desc">;
    } = {} as any) {
      const { where, select, include, orderBy } = args || {};
      let q = supabase.from(table).select(buildSelect(select) || "*");
      q = applyWhere(q, where);
      q = applyOrderBy(q, orderBy);
      const { data, error } = await q.limit(1).maybeSingle();
      if (error) throw new Error(`[${table}.findFirst] ${error.message}`);
      if (data && include) await resolveIncludes(table, data, include);
      return data;
    },

    async findMany(args: {
      where?: WhereClause;
      select?: Record<string, boolean>;
      include?: Record<string, unknown>;
      orderBy?: Record<string, "asc" | "desc">;
      take?: number;
      _count?: Record<string, boolean>;
    } = {} as any) {
      const { where, select, include, orderBy, take, _count } = args || {};
      let q = supabase.from(table).select(buildSelect(select) || "*");
      q = applyWhere(q, where);
      q = applyOrderBy(q, orderBy);
      if (take) q = q.limit(take);
      const { data, error } = await q;
      if (error) throw new Error(`[${table}.findMany] ${error.message}`);
      const records = data || [];
      if (include && records.length > 0) await resolveIncludes(table, records, include);
      if (_count && records.length > 0) await resolveCounts(table, records, _count);
      return records;
    },

    async create(args: {
      data: Record<string, unknown>;
      select?: Record<string, boolean>;
      include?: Record<string, unknown>;
    } = {} as any) {
      let { data, select, include } = args || {};
      if (!data) throw new Error(`[${table}.create] data is required`);
      // Auto-generate an ID if not provided (Prisma's @default(cuid()) doesn't
      // exist in Supabase — we use crypto.randomUUID() instead).
      if (!(data as Record<string, unknown>).id) {
        data = { ...data, id: randomUUID() };
      }
      const { data: result, error } = await supabase
        .from(table)
        .insert(data)
        .select(buildSelect(select) || "*")
        .single();
      if (error) throw new Error(`[${table}.create] ${error.message}`);
      if (result && include) await resolveIncludes(table, result, include);
      return result;
    },

    async update(args: {
      where: WhereClause;
      data: Record<string, unknown>;
      select?: Record<string, boolean>;
      include?: Record<string, unknown>;
    } = {} as any) {
      const { where, data, select, include } = args || {};
      let q = supabase.from(table).update(data);
      q = applyWhere(q, where);
      const { data: result, error } = await q.select(buildSelect(select) || "*").single();
      if (error) throw new Error(`[${table}.update] ${error.message}`);
      if (result && include) await resolveIncludes(table, result, include);
      return result;
    },

    async delete(args: { where: WhereClause } = {} as any) {
      const { where } = args || {};
      let q = supabase.from(table).delete();
      q = applyWhere(q, where);
      const { data: result, error } = await q.select().single();
      if (error) throw new Error(`[${table}.delete] ${error.message}`);
      return result || { ok: true };
    },

    async count(args?: { where?: WhereClause }) {
      let q = supabase.from(table).select("*", { count: "exact", head: true });
      q = applyWhere(q, args?.where);
      const { count, error } = await q;
      if (error) throw new Error(`[${table}.count] ${error.message}`);
      return count || 0;
    },
  };
}

// ── The db export: a Proxy that returns a ModelHandler for any model name ─
export const db = new Proxy({} as Record<string, ModelHandler>, {
  get(_target, prop: string) {
    return createModelHandler(prop);
  },
});

// ── Raw SQL helper (used by db-init via exec_sql RPC) ──────────────────────
export async function execSql(sql: string): Promise<unknown> {
  const { data, error } = await supabase.rpc("exec_sql", { sql_text: sql });
  if (error) throw error;
  return data;
}

// ── Disconnect (no-op for REST client) ─────────────────────────────────────
export async function disconnect() {
  /* no-op */
}
