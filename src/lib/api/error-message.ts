/**
 * Parses a JSON error body returned by an API endpoint into a human-readable
 * single string.
 *
 * Background: most of the app's API endpoints validate request bodies with
 * Zod and return errors in this shape on 4xx:
 *
 *     {
 *       "error": "Validation failed",
 *       "details": { "fieldName": ["message1", "message2"] }
 *     }
 *
 * Frontends that read `data.error` only end up showing the customer
 * "Validation failed" with no hint of which field is broken — which is how
 * the registration wizard's parental-consent bug hid for so long.
 *
 * `parseApiError` returns:
 *   - just `error` if there are no `details`
 *   - `error\n  field: message` lines when details are present
 *   - the `fallback` string when the body isn't recognizable
 */
export interface ApiErrorBody {
  error?: unknown;
  details?: unknown;
}

export function parseApiError(
  data: ApiErrorBody | null | undefined,
  fallback: string,
): string {
  if (!data || typeof data !== "object") return fallback;

  const top = typeof data.error === "string" ? data.error : null;
  const detailLines: string[] = [];

  if (data.details && typeof data.details === "object") {
    for (const [field, value] of Object.entries(
      data.details as Record<string, unknown>,
    )) {
      const messages = Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string")
        : typeof value === "string"
          ? [value]
          : [];
      for (const msg of messages) {
        detailLines.push(`  ${field}: ${msg}`);
      }
    }
  }

  if (top && detailLines.length > 0) {
    return `${top}\n${detailLines.join("\n")}`;
  }
  if (top) return top;
  if (detailLines.length > 0) return detailLines.join("\n").trim();
  return fallback;
}
