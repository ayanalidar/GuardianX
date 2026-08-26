// Mock Supabase client for unit tests.
//
// Provides a chainable query-builder stub backed by an in-memory table store,
// so tests can exercise RBAC + auth + route-handler code paths WITHOUT hitting
// a real database. The mock supports the subset of the Supabase JS API that
// the GuardianX codebase actually uses (see src/lib/db.ts and the direct
// `supabase.from(...).select(...).eq(...).maybeSingle()` calls in
// src/lib/ownership.ts and src/app/api/auth/login/route.ts).
//
// Test files import this mock and wire it up via:
//
//   vi.mock("@/lib/db", () => ({
//     supabase: mockSupabase,
//   }));
//
// Per-test setup then uses `__setTableData` to seed rows and `__reset` to
// clear between tests.
//
// IMPORTANT: This mock is intentionally simple. It does NOT replicate
// PostgREST semantics for OR/AND filters, range queries, RLS, or RPCs.
// If a test needs those, it should use a hand-written stub instead.

export type MockRow = Record<string, unknown>;

// ── In-memory store ───────────────────────────────────────────────────────
//
// `store[table]` is the array of rows the mock will filter against. Tests
// mutate this via `__setTableData` and `__pushRow` / `__reset`.
const store: Record<string, MockRow[]> = {};

// One-shot error queue: the next query against `table` resolves with this
// error instead of running. Useful for testing the error paths in
// `canAccessClient` (which checks `if (error || !data)`).
const errorQueue: Record<string, unknown[]> = {};

// ── Query builder ────────────────────────────────────────────────────────
//
// Each `supabase.from(table)` call returns a fresh builder. The builder
// records filter/insert/update/delete state and resolves to a
// `{ data, error }` result on `await` or `.maybeSingle()` / `.single()`.

interface QueryState {
  table: string;
  eqs: Array<[string, unknown]>;
  neqs: Array<[string, unknown]>;
  ins: MockRow | null;
  insMany: MockRow[] | null;
  upd: Record<string, unknown> | null;
  isDelete: boolean;
  limitN: number | null;
  orStr: string | null;
  isMaybeSingle: boolean;
  isSingle: boolean;
  selectCount: boolean;
  selectHead: boolean;
}

class MockQueryBuilder {
  private state: QueryState;

  constructor(table: string) {
    this.state = {
      table,
      eqs: [],
      neqs: [],
      ins: null,
      insMany: null,
      upd: null,
      isDelete: false,
      limitN: null,
      orStr: null,
      isMaybeSingle: false,
      isSingle: false,
      selectCount: false,
      selectHead: false,
    };
  }

  // ── Chainable builders ──────────────────────────────────────────────
  // Each returns `this` so the call site can keep chaining. We deliberately
  // ignore the actual `select` column list — the mock always returns the
  // full row. Tests that need column filtering should post-process.

  select(cols?: unknown, opts?: { count?: string; head?: boolean }) {
    if (opts?.count === "exact") this.state.selectCount = true;
    if (opts?.head === true) this.state.selectHead = true;
    void cols; // intentionally ignored
    return this;
  }

  eq(field: string, value: unknown) {
    this.state.eqs.push([field, value]);
    return this;
  }

  neq(field: string, value: unknown) {
    this.state.neqs.push([field, value]);
    return this;
  }

  in(field: string, values: unknown[]) {
    // Encode as a special eq marker so the resolver can apply the `in`
    // filter. Using a sentinel prefix keeps the resolver simple.
    this.state.eqs.push([`__in__${field}`, values]);
    return this;
  }

  ilike(field: string, pattern: string) {
    this.state.eqs.push([`__ilike__${field}`, pattern]);
    return this;
  }

  lte(field: string, value: unknown) {
    this.state.eqs.push([`__lte__${field}`, value]);
    return this;
  }

  gte(field: string, value: unknown) {
    this.state.eqs.push([`__gte__${field}`, value]);
    return this;
  }

  lt(field: string, value: unknown) {
    this.state.eqs.push([`__lt__${field}`, value]);
    return this;
  }

  gt(field: string, value: unknown) {
    this.state.eqs.push([`__gt__${field}`, value]);
    return this;
  }

  or(_orStr: string) {
    // We don't fully parse PostgREST `or=` syntax — just remember it was
    // called so the resolver can decide what to do. For the tests we
    // actually need, the or-clause is always paired with an eq filter that
    // we DO honour, so ignoring `or` here is safe.
    this.state.orStr = _orStr;
    return this;
  }

  insert(data: unknown) {
    if (Array.isArray(data)) {
      this.state.insMany = data as MockRow[];
    } else {
      this.state.ins = data as MockRow;
    }
    return this;
  }

  update(data: unknown) {
    this.state.upd = data as Record<string, unknown>;
    return this;
  }

  delete() {
    this.state.isDelete = true;
    return this;
  }

  limit(n: number) {
    this.state.limitN = n;
    return this;
  }

  order(_field: string, _opts?: { ascending?: boolean }) {
    // We don't sort — tests should not depend on order from the mock.
    return this;
  }

  rpc() {
    return this;
  }

  // ── Terminal methods (return Promises) ──────────────────────────────

  maybeSingle() {
    this.state.isMaybeSingle = true;
    return Promise.resolve(this._resolve());
  }

  single() {
    this.state.isSingle = true;
    return Promise.resolve(this._resolve());
  }

  // ── Thenable (for `await supabase.from(...).select(...).eq(...)`) ──
  //
  // When the call site does NOT chain `.maybeSingle()` / `.single()`, the
  // Supabase JS client returns a PromiseLike that resolves to
  // `{ data: rows[], error }`. We implement `then` so `await builder`
  // works without needing `.single()`.

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onFulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this._resolve()).then(onFulfilled, onRejected);
  }

  // ── Resolver ────────────────────────────────────────────────────────
  //
  // Apply all accumulated state to the in-memory store and produce the
  // `{ data, error }` result.

  private _resolve(): { data: unknown; error: unknown } {
    const s = this.state;

    // Pop a queued error if one exists for this table.
    const errs = errorQueue[s.table];
    if (errs && errs.length > 0) {
      const err = errs.shift();
      return { data: null, error: err };
    }

    // Handle INSERT (single or many).
    if (s.ins) {
      const arr = (store[s.table] = store[s.table] || []);
      const row = withDefaults(s.table, { ...s.ins });
      arr.push(row);
      return { data: hydrateDates({ ...row }) as MockRow, error: null };
    }
    if (s.insMany) {
      const arr = (store[s.table] = store[s.table] || []);
      const inserted = s.insMany.map((r) => withDefaults(s.table, { ...r }));
      arr.push(...inserted);
      return { data: inserted.map((r) => hydrateDates({ ...r }) as MockRow), error: null };
    }

    // Filter rows.
    let rows = [...(store[s.table] || [])];
    for (const [field, value] of s.eqs) {
      if (field.startsWith("__in__")) {
        const f = field.slice(6);
        rows = rows.filter((r) => (value as unknown[]).includes(r[f]));
      } else if (field.startsWith("__ilike__")) {
        const f = field.slice(9);
        // Convert SQL LIKE pattern (% → .*, _ → .) into a regex.
        const pattern = String(value)
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replace(/%/g, ".*")
          .replace(/_/g, ".");
        const re = new RegExp(`^${pattern}$`, "i");
        rows = rows.filter((r) => typeof r[f] === "string" && re.test(r[f] as string));
      } else if (field.startsWith("__lte__")) {
        const f = field.slice(7);
        rows = rows.filter((r) => r[f] !== undefined && r[f] !== null && (r[f] as never) <= (value as never));
      } else if (field.startsWith("__gte__")) {
        const f = field.slice(7);
        rows = rows.filter((r) => r[f] !== undefined && r[f] !== null && (r[f] as never) >= (value as never));
      } else if (field.startsWith("__lt__")) {
        const f = field.slice(6);
        rows = rows.filter((r) => r[f] !== undefined && r[f] !== null && (r[f] as never) < (value as never));
      } else if (field.startsWith("__gt__")) {
        const f = field.slice(6);
        rows = rows.filter((r) => r[f] !== undefined && r[f] !== null && (r[f] as never) > (value as never));
      } else {
        rows = rows.filter((r) => r[field] === value);
      }
    }
    for (const [field, value] of s.neqs) {
      rows = rows.filter((r) => r[field] !== value);
    }

    // Handle UPDATE.
    if (s.upd) {
      for (const row of rows) {
        Object.assign(row, s.upd);
      }
      return { data: rows[0] || null, error: null };
    }

    // Handle DELETE.
    if (s.isDelete) {
      store[s.table] = (store[s.table] || []).filter((r) => !rows.includes(r));
      return { data: rows[0] || null, error: null };
    }

    // Apply limit.
    if (s.limitN !== null) {
      rows = rows.slice(0, s.limitN);
    }

    // Hydrate date columns (mirrors src/lib/db.ts hydrateDates so route
    // handlers can call `.toISOString()` on date fields without crashing).
    rows = rows.map(hydrateDates) as MockRow[];

    // `head: true` means "return no rows, just count".
    if (s.selectHead) {
      return { data: null, error: null, count: rows.length } as unknown as {
        data: unknown;
        error: unknown;
      };
    }

    // `.maybeSingle()` / `.single()` → return one row (or null).
    if (s.isMaybeSingle || s.isSingle) {
      return { data: rows[0] || null, error: null };
    }

    // Default: return the array.
    return { data: rows, error: null };
  }
}

// ── Date hydration ────────────────────────────────────────────────────────
//
// Mirrors src/lib/db.ts: fields whose name ends with a date-like suffix
// ("At", "Date", "Timestamp", "Time", "Run", "Seen") get their ISO string
// values converted to real Date objects on read. This is what the route
// handlers expect (they call `.toISOString()` on these fields).

const DATE_FIELD_SUFFIXES = ["At", "Date", "Timestamp", "Time", "timestamp", "Run", "Seen"];

/**
 * Apply Prisma-style `@default(now())` for `createdAt` / `updatedAt` and
 * similar date columns when the test data doesn't provide them. Without
 * this, route handlers that call `(c.createdAt as Date).toISOString()` on a
 * row inserted via the mock would crash with a TypeError.
 */
function withDefaults(table: string, row: MockRow): MockRow {
  const now = new Date().toISOString();
  const out: MockRow = { ...row };
  // Only set defaults for the well-known timestamp columns; don't pollute
  // rows that intentionally omit them.
  if (!("createdAt" in out) && hasColumn(table, "createdAt")) out.createdAt = now;
  if (!("updatedAt" in out) && hasColumn(table, "updatedAt")) out.updatedAt = now;
  return out;
}

// A small allowlist of tables + their timestamp columns. Mirrors the
// Prisma schema. Tests that need other defaults can set them explicitly
// in the row they pass to `__setTableData` / `__pushRow`.
const TIMESTAMP_COLUMNS: Record<string, string[]> = {
  Client: ["createdAt", "updatedAt"],
  Codebase: ["createdAt", "updatedAt"],
  Target: ["createdAt", "updatedAt"],
  Scan: ["createdAt", "updatedAt"],
  Patch: ["createdAt", "updatedAt"],
  User: ["createdAt", "updatedAt"],
  Engagement: ["createdAt", "updatedAt"],
  Finding: ["createdAt", "updatedAt"],
  AuditLog: ["createdAt"],
  EmailLog: ["timestamp"],
  LoginHistory: ["timestamp"],
  EmailVerification: ["createdAt", "expiresAt"],
};

function hasColumn(table: string, column: string): boolean {
  return (TIMESTAMP_COLUMNS[table] || []).includes(column);
}

function hydrateDates(record: unknown): unknown {
  if (!record || typeof record !== "object") return record;
  if (Array.isArray(record)) return record.map(hydrateDates);
  // Shallow-clone so we don't mutate the row stored in the in-memory
  // table store (tests assert on the stored row's raw shape).
  const obj: Record<string, unknown> = { ...(record as Record<string, unknown>) };
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (typeof val === "string" && DATE_FIELD_SUFFIXES.some((s) => key.endsWith(s))) {
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val) || /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          obj[key] = d;
        }
      }
    } else if (val && typeof val === "object") {
      obj[key] = hydrateDates(val);
    }
  }
  return obj;
}

// ── Public mock object ────────────────────────────────────────────────────
//
// This is what `vi.mock("@/lib/db", ...)` swaps in for the real `supabase`
// export. Tests interact with it via the chainable builder; per-test data is
// controlled through the `__*` helpers below.

export const mockSupabase = {
  from(table: string) {
    return new MockQueryBuilder(table);
  },
  rpc() {
    return Promise.resolve({ data: null, error: null });
  },
  auth: {
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
  },
};

// ── Test helpers (mutate the in-memory store) ────────────────────────────

/**
 * Replace all rows for a table. Tests call this in `beforeEach` to seed
 * deterministic data.
 */
export function __setTableData(table: string, rows: MockRow[]): void {
  store[table] = rows.map((r) => ({ ...r }));
}

/**
 * Append a single row to a table.
 */
export function __pushRow(table: string, row: MockRow): void {
  if (!store[table]) store[table] = [];
  store[table].push({ ...row });
}

/**
 * Read all rows for a table (defensive copy). Useful for asserting that an
 * INSERT actually wrote what the test expected.
 */
export function __getTableData(table: string): MockRow[] {
  return [...(store[table] || [])];
}

/**
 * Queue a one-shot error: the next query against `table` resolves with this
 * error object instead of running. Used to exercise `canAccessClient`'s
 * `if (error || !data)` branch.
 */
export function __queueErrorOnce(table: string, error: unknown): void {
  if (!errorQueue[table]) errorQueue[table] = [];
  errorQueue[table].push(error);
}

/**
 * Clear all data + queued errors. Call in `afterEach` (or `beforeEach`) to
 * prevent tests from leaking state into each other.
 */
export function __resetMockSupabase(): void {
  for (const k of Object.keys(store)) delete store[k];
  for (const k of Object.keys(errorQueue)) delete errorQueue[k];
}
