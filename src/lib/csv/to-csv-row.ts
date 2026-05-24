/**
 * Format a single CSV row per RFC 4180. Returns the row string without a
 * trailing newline — the caller composes the newline-delimited body so it
 * controls the line ending.
 *
 * - null/undefined → empty field
 * - Date → ISO string
 * - number → toString (unquoted)
 * - string → quoted if it contains `,`, `"`, `\n`, or `\r`
 *
 * No external library; the rules are small enough that a dep would be
 * dead weight. If a second CSV endpoint shows up, factor a row-array
 * builder on top of this.
 */
export function toCsvRow(
  fields: ReadonlyArray<string | number | Date | null | undefined>,
): string {
  return fields.map(escapeField).join(",");
}

function escapeField(
  value: string | number | Date | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return String(value);
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
