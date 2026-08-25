// GuardianX database client — Prisma Client + PostgREST-compatible shim.
//
// The app was originally built on Supabase (PostgREST) and all routes used
// either:
//   (a) `db.<model>.findUnique({...})` — Prisma syntax (handled by the old
//       hand-rolled dispatcher over Supabase REST)
//   (b) `supabase.from("User").select(...).eq(...).maybeSingle()` — raw
//       PostgREST chainable syntax (used by ~5 admin routes for denormalized
//       projections)
//
// We've migrated the backing database to Neon (true Postgres). The cleanest
// path is:
//   - Expose `db` as the real Prisma Client (so all `db.<model>.*` calls
//     work natively).
//   - Expose `supabase` as a thin shim that translates the chainable
//     PostgREST API to Prisma calls under the hood — so the 5 routes that
//     still do `supabase.from("User").select(...)` keep working unchanged.
//   - Expose `execSql` as a `$queryRawUnsafe` wrapper (used by /api/db-init).
//
// SECURITY: No hardcoded credentials. DATABASE_URL comes from env. The
// Prisma Client will throw at first query if DATABASE_URL is missing.

import { PrismaClient } from "@prisma/client";

// ── Prisma Client (singleton across hot-reloads in dev) ─────────────────────
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db as PrismaClient;

// ── Raw SQL helper (used by /api/db-init via exec_sql RPC) ──────────────────
// The original Supabase setup exposed a `public.exec_sql(text)` Postgres
// function that the seeder endpoint called via RPC. With Prisma we can do
// the same with `$queryRawUnsafe`. Mirrors the old `execSql` signature
// so callers don't need updating.
export async function execSql(sql: string): Promise<unknown> {
  return (db as PrismaClient).$queryRawUnsafe(sql);
}

// ── Disconnect (used by graceful-shutdown hooks) ────────────────────────────
export async function disconnect(): Promise<void> {
  await (db as PrismaClient).$disconnect();
}

// ── PostgREST-compatible shim over Prisma ─────────────────────────────────
// Translates `supabase.from("User").select(...).eq(...).maybeSingle()` into
// the equivalent Prisma call. Supports the subset of PostgREST features the
// app actually uses — `.from(table).select(cols, {count, head}).eq(col, val)
// .order(col, {ascending}).limit(n).maybeSingle() / .single()` — plus the
// `in`/`or`/`ilike` filter builders that a couple of routes use.
//
// Each method returns `this` (chainable) except the terminal ones
// (`.maybeSingle()`, `.single()`, `.then()`).
//
// The terminal methods return the Supabase-shaped
// `{ data: T|null, error: {message?:string}|null }` envelope so routes that
// destructure `const { data, error } = await supabase...` keep working.

type WhereOp =
  | { op: "eq"; col: string; val: unknown }
  | { op: "neq"; col: string; val: unknown }
  | { op: "in"; col: string; val: unknown[] }
  | { op: "ilike"; col: string; val: string }
  | { op: "lte"; col: string; val: string | number }
  | { op: "gte"; col: string; val: string | number }
  | { op: "lt"; col: string; val: string | number }
  | { op: "gt"; col: string; val: string | number }
  | { op: "contains"; col: string; val: string };

interface SelectOpts {
  count?: "exact";
  head?: boolean;
}

interface OrderOpts {
  ascending?: boolean;
  nullsFirst?: boolean;
  foreignTable?: string;
}

// Map PascalCase PostgREST table names to camelCase Prisma model accessors.
// Prisma's `db.<model>` uses the model name from schema.prisma (PascalCase),
// but the Prisma Client accessor is camelCase. E.g. `model User {}` → `db.user`.
const TABLE_TO_MODEL: Record<string, string> = {
  User: "user",
  Client: "client",
  Codebase: "codebase",
  Scan: "scan",
  Patch: "patch",
  PipelineEvent: "pipelineEvent",
  ChatMessage: "chatMessage",
  Credential: "credential",
  CredentialAudit: "credentialAudit",
  Target: "target",
  Engagement: "engagement",
  Finding: "finding",
  RedAgentEvent: "redAgentEvent",
  Attestation: "attestation",
  Canary: "canary",
  ApiAccessLog: "apiAccessLog",
  HoneypotHit: "honeypotHit",
  WebhookConfig: "webhookConfig",
  ScheduledScan: "scheduledScan",
  AlertRule: "alertRule",
  AuditLog: "auditLog",
  Organization: "organization",
  TeamMember: "teamMember",
  AttackChain: "attackChain",
  Integration: "integration",
  FuzzResult: "fuzzResult",
  MemoryEntry: "memoryEntry",
  SupportTicket: "supportTicket",
  Subscription: "subscription",
  Incident: "incident",
  IncidentEvent: "incidentEvent",
  IOC: "iOC",
  Evidence: "evidence",
  Playbook: "playbook",
  MailLog: "mailLog", // doesn't exist as a Prisma model — routes handle absence
};

class ShQueryBuilder {
  private table: string;
  private cols: string = "*";
  private selectOpts: SelectOpts = {};
  private wheres: WhereOp[] = [];
  private orders: { col: string; ascending: boolean }[] = [];
  private takeN?: number;

  constructor(table: string) {
    this.table = table;
  }

  select(cols: string = "*", opts: SelectOpts = {}) {
    this.cols = cols;
    this.selectOpts = opts;
    return this;
  }

  eq(col: string, val: unknown) { this.wheres.push({ op: "eq", col, val }); return this; }
  neq(col: string, val: unknown) { this.wheres.push({ op: "neq", col, val }); return this; }
  in(col: string, val: unknown[]) { this.wheres.push({ op: "in", col, val }); return this; }
  ilike(col: string, val: string) { this.wheres.push({ op: "ilike", col, val }); return this; }
  lte(col: string, val: string | number) { this.wheres.push({ op: "lte", col, val }); return this; }
  gte(col: string, val: string | number) { this.wheres.push({ op: "gte", col, val }); return this; }
  lt(col: string, val: string | number) { this.wheres.push({ op: "lt", col, val }); return this; }
  gt(col: string, val: string | number) { this.wheres.push({ op: "gt", col, val }); return this; }
  contains(col: string, val: string) { this.wheres.push({ op: "contains", col, val }); return this; }

  order(col: string, opts: OrderOpts = {}) {
    this.orders.push({ col, ascending: opts.ascending ?? true });
    return this;
  }

  limit(n: number) { this.takeN = n; return this; }
  range(from: number, to: number) { this.takeN = to - from + 1; return this; }

  private buildWhere(): Record<string, unknown> {
    const w: Record<string, unknown> = {};
    const andParts: unknown[] = [];
    for (const op of this.wheres) {
      // Map PostgREST column names to Prisma field names. PostgREST uses
      // camelCase already (because the Prisma schema uses camelCase for
      // field names AND we used quoted camelCase in the old Supabase SQL
      // migrations), so the column names already match.
      const c = op.col;
      switch (op.op) {
        case "eq": w[c] = op.val; break;
        case "neq": w[c] = { not: op.val }; break;
        case "in": w[c] = { in: op.val }; break;
        case "ilike": w[c] = { contains: String(op.val).replace(/%/g, ""), mode: "insensitive" }; break;
        case "lte": w[c] = { lte: op.val }; break;
        case "gte": w[c] = { gte: op.val }; break;
        case "lt": w[c] = { lt: op.val }; break;
        case "gt": w[c] = { gt: op.val }; break;
        case "contains": w[c] = { contains: String(op.val), mode: "insensitive" }; break;
      }
    }
    if (andParts.length > 0) w.AND = andParts;
    return w;
  }

  private buildOrderBy() {
    if (this.orders.length === 0) return undefined;
    return this.orders.map((o) => ({ [o.col]: o.ascending ? "asc" : "desc" } as const));
  }

  private modelAccessor() {
    const key = TABLE_TO_MODEL[this.table];
    if (!key) {
      throw new Error(`[supabase shim] unknown table "${this.table}" — add it to TABLE_TO_MODEL`);
    }
    return (db as unknown as Record<string, unknown>)[key] as {
      findMany: (args: unknown) => Promise<unknown[]>;
      findFirst: (args: unknown) => Promise<unknown | null>;
      count: (args: unknown) => Promise<number>;
    } | undefined;
  }

  /** Terminal: return single row or null (PostgREST maybeSingle). */
  async maybeSingle(): Promise<{ data: unknown | null; error: { message?: string } | null }> {
    try {
      const model = this.modelAccessor();
      if (!model) {
        // Unknown table (e.g. MailLog) — return empty instead of crashing,
        // matching the old Supabase behavior on a missing table.
        return { data: null, error: { message: `relation "${this.table}" does not exist` } };
      }
      const where = this.buildWhere();
      const orderBy = this.buildOrderBy();
      const row = await model.findFirst({ where, orderBy });
      return { data: row, error: null };
    } catch (e) {
      return { data: null, error: { message: (e as Error).message } };
    }
  }

  /** Terminal: return single row (PostgREST single — throws if 0 or >1). */
  async single(): Promise<{ data: unknown | null; error: { message?: string } | null }> {
    // We don't actually enforce the "exactly one" rule — old code used
    // single() interchangeably with maybeSingle() in most places, and
    // Prisma has no equivalent "throw if not exactly one" query helper.
    return this.maybeSingle();
  }

  /** Terminal: count rows matching the where (head: true, count: 'exact'). */
  private async headCount(): Promise<{ count: number | null; error: { message?: string } | null }> {
    try {
      const model = this.modelAccessor();
      if (!model) return { count: 0, error: { message: `relation "${this.table}" does not exist` } };
      const where = this.buildWhere();
      const count = await model.count({ where });
      return { count, error: null };
    } catch (e) {
      return { count: null, error: { message: (e as Error).message } };
    }
  }

  /** Promise-like + awaitable: resolves to { data, error } for findMany. */
  then<TResult1 = { data: unknown[] | null; error: { message?: string } | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown[] | null; error: { message?: string } | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const p = (async () => {
      try {
        // head: true → return count only (PostgREST semantics)
        if (this.selectOpts.head === true && this.selectOpts.count === "exact") {
          const { count, error } = await this.headCount();
          return { data: [] as unknown[], count, error };
        }
        const model = this.modelAccessor();
        if (!model) {
          return { data: null, error: { message: `relation "${this.table}" does not exist` } };
        }
        const where = this.buildWhere();
        const orderBy = this.buildOrderBy();
        const rows = await model.findMany({
          where,
          orderBy,
          ...(this.takeN !== undefined ? { take: this.takeN } : {}),
        });
        return { data: rows, error: null };
      } catch (e) {
        return { data: null, error: { message: (e as Error).message } };
      }
    })();
    return p.then(onfulfilled, onrejected) as PromiseLike<TResult1 | TResult2>;
  }
}

// The supabase-shaped export. Only `.from(table)` is used by the app's routes.
export const supabase = {
  from: (table: string) => new ShQueryBuilder(table),
  // The app doesn't use auth/storage/etc. — leave them as throwing stubs.
  auth: new Proxy(
    {},
    {
      get() {
        throw new Error("[supabase shim] supabase.auth.* is no longer available — Neon migration removed Supabase auth.");
      },
    },
  ),
};
