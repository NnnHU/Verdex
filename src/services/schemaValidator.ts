/**
 * Verdex — extract-schema validation (Stage 3, Route 1: lightweight).
 *
 * Validates that the judge's parsed JSON object is structurally acceptable:
 * it must be a plain object and contain all declared `requiredKeys`. This is
 * intentionally lenient — it does not check nested types. The interface is
 * designed so Route 2 (formal JSON Schema via ajv) can swap in here later
 * without changing call sites.
 */

export interface ValidationResult {
  ok: boolean;
  /** Human-readable error list (empty when ok). */
  errors: string[];
}

/**
 * Validate an extract-mode judge output.
 *
 * @param data         The parsed JSON value (unknown — caller may pass anything).
 * @param requiredKeys Top-level keys that must be present. Undefined/empty
 *                     means "any object passes" (no key requirements).
 */
export function validateExtract(
  data: unknown,
  requiredKeys?: string[]
): ValidationResult {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: ["output is not a JSON object"] };
  }
  const obj = data as Record<string, unknown>;
  const keys = requiredKeys?.filter((k) => k && k.trim()) ?? [];
  if (keys.length === 0) return { ok: true, errors: [] };
  const missing = keys.filter((k) => !(k in obj));
  if (missing.length > 0) {
    return { ok: false, errors: [`missing required keys: ${missing.join(", ")}`] };
  }
  return { ok: true, errors: [] };
}
