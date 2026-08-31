"use client";

/**
 * Schema Inference Engine
 * ========================
 * Learns the "real" shape of each API endpoint by observing successful
 * responses, then validates future responses against the learned schema.
 * If the shape changes (drift), logs a warning + reports to the health
 * dashboard.
 *
 * How it works:
 *   1. First 3 successful calls to an endpoint → infers the schema
 *      (keys, types, array vs object)
 *   2. Future calls validate against the learned schema
 *   3. If a field disappears or a type changes → "drift detected" → logged
 *   4. Schemas persist to localStorage so they survive page reloads
 */

type FieldType = "string" | "number" | "boolean" | "object" | "array" | "null" | "date";

interface FieldSchema {
  type: FieldType;
  optional: boolean;
}

interface EndpointSchema {
  /** "array" | "object" — the top-level response shape. */
  rootType: "array" | "object";
  /** If array: schema of each item. If object: schema of the object. */
  fields: Record<string, FieldSchema>;
  /** When the schema was first learned. */
  learnedAt: number;
  /** Number of successful validations since learning. */
  validationCount: number;
  /** Last time drift was detected. */
  lastDriftAt?: number;
  /** Description of the last drift. */
  lastDriftDescription?: string;
}

type SchemaMap = Map<string, EndpointSchema>;

const STORAGE_KEY = "guardianx:schema-cache";
const LEARNING_THRESHOLD = 3; // need 3 successful responses to "learn"

// ── Type inference ─────────────────────────────────────────────────────────

function inferType(value: unknown): FieldType {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") {
    // Detect ISO date strings
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return "date";
    return "string";
  }
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "object";
}

function inferFields(obj: Record<string, unknown>): Record<string, FieldSchema> {
  const fields: Record<string, FieldSchema> = {};
  for (const [key, value] of Object.entries(obj)) {
    const type = inferType(value);
    fields[key] = {
      type,
      optional: value === null || value === undefined,
    };
  }
  return fields;
}

// ── Schema store ───────────────────────────────────────────────────────────

class SchemaInferrer {
  private schemas: SchemaMap = new Map();
  private pendingLearn: Map<string, Array<Record<string, unknown>>> = new Map();
  private driftListeners: Array<(endpoint: string, description: string) => void> = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, EndpointSchema>;
      for (const [endpoint, schema] of Object.entries(parsed)) {
        this.schemas.set(endpoint, schema);
      }
    } catch {
      /* corrupted cache — start fresh */
    }
  }

  private saveToStorage(): void {
    if (typeof window === "undefined") return;
    try {
      const obj: Record<string, EndpointSchema> = {};
      for (const [endpoint, schema] of this.schemas) {
        obj[endpoint] = schema;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      /* quota exceeded — non-critical */
    }
  }

  /**
   * Observe a successful response. If we haven't learned the schema yet,
   * accumulate observations. Once we hit LEARNING_THRESHOLD, learn + persist.
   */
  learn(endpoint: string, data: unknown): void {
    if (data === null || data === undefined) return;

    // Determine root type + extract fields
    let rootType: "array" | "object";
    let sampleObj: Record<string, unknown> | null = null;

    if (Array.isArray(data)) {
      rootType = "array";
      // Use the first non-null item as the sample
      sampleObj = data.find((item) => item !== null && typeof item === "object") as Record<string, unknown> | null;
    } else if (typeof data === "object") {
      rootType = "object";
      sampleObj = data as Record<string, unknown>;
    } else {
      return; // primitive response — no schema to learn
    }

    if (!sampleObj) return;

    // If we already have a schema, validate (don't re-learn)
    const existing = this.schemas.get(endpoint);
    if (existing) {
      this.validate(endpoint, data);
      return;
    }

    // Accumulate observations
    if (!this.pendingLearn.has(endpoint)) {
      this.pendingLearn.set(endpoint, []);
    }
    this.pendingLearn.get(endpoint)!.push(sampleObj);

    // Once we have enough samples, learn the schema
    const samples = this.pendingLearn.get(endpoint)!;
    if (samples.length >= LEARNING_THRESHOLD) {
      this.learnSchema(endpoint, rootType, samples);
    }
  }

  private learnSchema(endpoint: string, rootType: "array" | "object", samples: Array<Record<string, unknown>>): void {
    // Merge fields from all samples — a field is optional if it's missing
    // from any sample, or if any sample has it as null/undefined.
    const allKeys = new Set<string>();
    for (const sample of samples) {
      for (const key of Object.keys(sample)) {
        allKeys.add(key);
      }
    }

    const fields: Record<string, FieldSchema> = {};
    for (const key of allKeys) {
      const types = new Set<FieldType>();
      let isOptional = false;
      for (const sample of samples) {
        if (!(key in sample) || sample[key] === null || sample[key] === undefined) {
          isOptional = true;
        } else {
          types.add(inferType(sample[key]));
        }
      }
      // Use the most common type (or "string" as fallback)
      const type = types.size === 1 ? Array.from(types)[0] : (types.has("string") ? "string" : Array.from(types)[0]);
      fields[key] = { type, optional: isOptional };
    }

    const schema: EndpointSchema = {
      rootType,
      fields,
      learnedAt: Date.now(),
      validationCount: 0,
    };

    this.schemas.set(endpoint, schema);
    this.pendingLearn.delete(endpoint);
    this.saveToStorage();

    console.info(`[schema-inference] Learned schema for ${endpoint}: ${Object.keys(fields).length} fields`);
  }

  /**
   * Validate a response against the learned schema. If drift is detected
   * (missing required field, type change), log + notify listeners.
   */
  validate(endpoint: string, data: unknown): { valid: boolean; drifts: string[] } {
    const schema = this.schemas.get(endpoint);
    if (!schema) return { valid: true, drifts: [] };

    const drifts: string[] = [];

    // Check root type
    if (schema.rootType === "array" && !Array.isArray(data)) {
      drifts.push(`Expected array, got ${inferType(data)}`);
    } else if (schema.rootType === "object" && (Array.isArray(data) || typeof data !== "object")) {
      drifts.push(`Expected object, got ${inferType(data)}`);
    }

    // Get the item to validate (first array item, or the object itself)
    let item: Record<string, unknown> | null = null;
    if (schema.rootType === "array" && Array.isArray(data)) {
      item = data.find((d) => d !== null && typeof d === "object") as Record<string, unknown> | null;
    } else if (schema.rootType === "object" && typeof data === "object" && data !== null) {
      item = data as Record<string, unknown>;
    }

    if (item) {
      for (const [key, fieldSchema] of Object.entries(schema.fields)) {
        const value = item[key];
        // Check required fields
        if (!fieldSchema.optional && !(key in item)) {
          drifts.push(`Missing required field: ${key}`);
        } else if (value !== null && value !== undefined) {
          const actualType = inferType(value);
          if (actualType !== fieldSchema.type) {
            // Allow date ↔ string (dates are strings in JSON)
            if (!(fieldSchema.type === "date" && actualType === "string")) {
              drifts.push(`Field "${key}" type changed: expected ${fieldSchema.type}, got ${actualType}`);
            }
          }
        }
      }
    }

    if (drifts.length > 0) {
      const schemaToUpdate = this.schemas.get(endpoint);
      if (schemaToUpdate) {
        schemaToUpdate.lastDriftAt = Date.now();
        schemaToUpdate.lastDriftDescription = drifts.join("; ");
      }
      console.warn(`[schema-inference] Drift detected on ${endpoint}:`, drifts);
      this.notifyDrift(endpoint, drifts.join("; "));
    } else {
      const schemaToUpdate = this.schemas.get(endpoint);
      if (schemaToUpdate) schemaToUpdate.validationCount++;
    }

    return { valid: drifts.length === 0, drifts };
  }

  /** Get the learned schema for an endpoint (or null if not learned yet). */
  getSchema(endpoint: string): EndpointSchema | null {
    return this.schemas.get(endpoint) ?? null;
  }

  /** Get all learned schemas (for the health dashboard). */
  getAllSchemas(): Array<{ endpoint: string; schema: EndpointSchema }> {
    return Array.from(this.schemas.entries()).map(([endpoint, schema]) => ({ endpoint, schema }));
  }

  /** Subscribe to drift events. Returns an unsubscribe function. */
  onDrift(callback: (endpoint: string, description: string) => void): () => void {
    this.driftListeners.push(callback);
    return () => {
      this.driftListeners = this.driftListeners.filter((l) => l !== callback);
    };
  }

  private notifyDrift(endpoint: string, description: string): void {
    for (const listener of this.driftListeners) {
      try {
        listener(endpoint, description);
      } catch {
        /* listener error — non-critical */
      }
    }
  }

  /** Clear all learned schemas (for testing). */
  reset(): void {
    this.schemas.clear();
    this.pendingLearn.clear();
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
}

// Singleton — one inferrer per browser tab
export const schemaInferrer = new SchemaInferrer();
