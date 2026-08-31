"use client";

/**
 * Auto-Repair Data Layer
 * ======================
 * Instead of returning `[]` on failure or when data is malformed, this module
 * attempts to REPAIR the data into a renderable shape:
 *
 *   - Missing `id` field? Generate a UUID.
 *   - `severity` is a number instead of string? Auto-convert.
 *   - `createdAt` is a string? Keep as-is (Date parsing happens in UI).
 *   - null/undefined items in an array? Filter them out.
 *   - snake_case keys? Auto-convert to camelCase (delegates to safe-api's normalizer).
 *   - Expected array but got object? Wrap in array.
 *   - Expected object but got array? Take first item.
 *
 * Every repair is logged so you can see what's being fixed.
 */

// ── snake_case → camelCase (same as safe-api, kept here for independence) ──

function toCamelCase(key: string): string {
  if (!key.includes("_")) return key;
  // Don't convert known acronyms that should stay uppercase
  if (["cve", "owasp", "id", "url", "api", "ip"].includes(key.toLowerCase())) {
    // Only convert if it's like "created_at" → "createdAt"
    if (key === key.toLowerCase() && key.includes("_")) {
      return key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
    }
  }
  return key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
}

function normalizeKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[toCamelCase(k)] = v;
  }
  return result;
}

// ── Repair functions ───────────────────────────────────────────────────────

interface RepairOptions {
  /** Fields that must be present. If missing, auto-generate. */
  requiredFields?: string[];
  /** Expected root shape. */
  expectedShape?: "array" | "object";
  /** Whether to normalize snake_case → camelCase (default true). */
  normalizeCase?: boolean;
  /** Callback for logging repairs (for the health dashboard). */
  onRepair?: (description: string) => void;
}

interface RepairResult<T> {
  data: T;
  repaired: boolean;
  repairs: string[];
}

/** Generate a stable-ish ID for items missing one. */
function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `gen-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Repair a single object: ensure required fields exist, normalize keys, fix types. */
function repairObject(
  obj: Record<string, unknown>,
  options: RepairOptions,
  repairs: string[],
): Record<string, unknown> {
  let repaired = obj;

  // Normalize snake_case → camelCase
  if (options.normalizeCase !== false) {
    const hasSnake = Object.keys(repaired).some((k) => k.includes("_"));
    if (hasSnake) {
      repaired = normalizeKeys(repaired);
      repairs.push("normalized snake_case keys");
    }
  }

  // Ensure required fields exist
  if (options.requiredFields) {
    for (const field of options.requiredFields) {
      if (!(field in repaired) || repaired[field] === null || repaired[field] === undefined) {
        // Auto-generate common fields
        if (field === "id" || field === "internalId") {
          repaired[field] = generateId();
          repairs.push(`generated missing ${field}`);
        } else if (field === "title" || field === "name") {
          repaired[field] = "Untitled";
          repairs.push(`generated missing ${field}`);
        } else if (field === "severity") {
          repaired[field] = "medium";
          repairs.push(`generated missing ${field}`);
        } else if (field === "status") {
          repaired[field] = "unknown";
          repairs.push(`generated missing ${field}`);
        } else {
          repaired[field] = null;
          repairs.push(`added null for missing ${field}`);
        }
      }
    }
  }

  // Fix common type mismatches
  if ("severity" in repaired && typeof repaired.severity === "number") {
    const map: Record<number, string> = { 0: "info", 1: "low", 2: "medium", 3: "high", 4: "critical" };
    repaired.severity = map[repaired.severity as number] || "medium";
    repairs.push("converted severity number → string");
  }

  if ("confidence" in repaired && typeof repaired.confidence === "string") {
    const parsed = parseFloat(repaired.confidence as string);
    if (!isNaN(parsed)) {
      repaired.confidence = parsed;
      repairs.push("converted confidence string → number");
    }
  }

  return repaired;
}

/**
 * Repair a response into the expected shape. Never throws — always returns
 * something renderable.
 */
export function autoRepair<T>(
  data: unknown,
  options: RepairOptions = {},
): RepairResult<T> {
  const repairs: string[] = [];

  // Handle null/undefined → return safe default
  if (data === null || data === undefined) {
    const fallback = (options.expectedShape === "array" ? [] : {}) as unknown as T;
    return { data: fallback, repaired: true, repairs: ["data was null — returned empty default"] };
  }

  // Handle shape mismatch: expected array but got object
  if (options.expectedShape === "array" && !Array.isArray(data)) {
    if (typeof data === "object" && data !== null) {
      // Wrap single object in array
      data = [data];
      repairs.push("wrapped single object in array (expected array)");
    } else {
      data = [];
      repairs.push("expected array but got primitive — returned []");
    }
  }

  // Handle shape mismatch: expected object but got array
  if (options.expectedShape === "object" && Array.isArray(data)) {
    data = data.length > 0 ? data[0] : {};
    repairs.push("took first array item (expected object)");
  }

  // Repair arrays: filter nulls + repair each item
  if (Array.isArray(data)) {
    const originalLength = data.length;
    const filtered = data.filter((item) => item !== null && item !== undefined);

    if (filtered.length !== originalLength) {
      repairs.push(`filtered ${originalLength - filtered.length} null items from array`);
    }

    const repairedItems = filtered.map((item) => {
      if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        return repairObject(item as Record<string, unknown>, options, repairs);
      }
      return item;
    });

    const result = repairedItems as unknown as T;
    const wasRepaired = repairs.length > 0;
    if (wasRepaired) {
      options.onRepair?.(repairs.join("; "));
    }
    return { data: result, repaired: wasRepaired, repairs };
  }

  // Repair single object
  if (typeof data === "object" && data !== null) {
    const repaired = repairObject(data as Record<string, unknown>, options, repairs);
    const wasRepaired = repairs.length > 0;
    if (wasRepaired) {
      options.onRepair?.(repairs.join("; "));
    }
    return { data: repaired as unknown as T, repaired: wasRepaired, repairs };
  }

  // Primitive — return as-is
  return { data: data as T, repaired: false, repairs: [] };
}

// ── Common repair presets ──────────────────────────────────────────────────

/** Repair a list of patches (ensures `id`, `title`, `severity` exist). */
export function repairPatches(data: unknown): RepairResult<unknown[]> {
  return autoRepair(data, {
    expectedShape: "array",
    requiredFields: ["id", "title", "severity"],
    normalizeCase: true,
  });
}

/** Repair a list of findings (ensures `id`, `title`, `severity` exist). */
export function repairFindings(data: unknown): RepairResult<unknown[]> {
  return autoRepair(data, {
    expectedShape: "array",
    requiredFields: ["id", "title", "severity"],
    normalizeCase: true,
  });
}

/** Repair a list of clients (ensures `id`, `name` exist). */
export function repairClients(data: unknown): RepairResult<unknown[]> {
  return autoRepair(data, {
    expectedShape: "array",
    requiredFields: ["id", "name"],
    normalizeCase: true,
  });
}

/** Repair a list of codebases (ensures `id`, `name` exist). */
export function repairCodebases(data: unknown): RepairResult<unknown[]> {
  return autoRepair(data, {
    expectedShape: "array",
    requiredFields: ["id", "name"],
    normalizeCase: true,
  });
}
