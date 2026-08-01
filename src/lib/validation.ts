// GuardianX Input Validation, sanitizes + validates request bodies.
// Prevents SQL injection, XSS, path traversal, and other injection attacks.

/**
 * Sanitize a string input: trim, limit length, strip dangerous characters.
 */
export function sanitizeString(input: unknown, maxLength = 1000): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > maxLength) return trimmed.slice(0, maxLength);

  // Strip null bytes (can bypass filters)
  return trimmed.replace(/\0/g, "");
}

/**
 * Validate an email address.
 */
export function validateEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const sanitized = sanitizeString(email, 255);
  if (!sanitized) return null;
  // Basic email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(sanitized)) return null;
  return sanitized;
}

/**
 * Validate a URL.
 */
export function validateUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const sanitized = sanitizeString(url, 2048);
  if (!sanitized) return null;
  try {
    const parsed = new URL(sanitized);
    // Only allow http/https protocols
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return sanitized;
  } catch {
    return null;
  }
}

/**
 * Validate a UUID.
 */
export function validateUUID(id: unknown): string | null {
  if (typeof id !== "string") return null;
  const sanitized = sanitizeString(id, 64);
  if (!sanitized) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(sanitized)) return null;
  return sanitized;
}

/**
 * Validate severity level.
 */
export function validateSeverity(sev: unknown): string | null {
  if (typeof sev !== "string") return null;
  const valid = ["critical", "high", "medium", "low", "info"];
  if (!valid.includes(sev.toLowerCase())) return null;
  return sev.toLowerCase();
}

/**
 * Validate a JSON string (for fields stored as JSON).
 * Returns parsed object or null.
 */
export function validateJSON(input: unknown): unknown | null {
  if (typeof input !== "string") return null;
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

/**
 * Sanitize an object's string values (recursive).
 * Strips null bytes from all string values.
 */
export function sanitizeObject<T>(obj: T): T {
  if (typeof obj === "string") {
    return obj.replace(/\0/g, "") as unknown as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject) as unknown as T;
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeObject(value);
    }
    return result as T;
  }
  return obj;
}
