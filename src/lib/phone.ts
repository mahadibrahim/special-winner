/**
 * Pure phone-number helpers. No I/O. Used at every write site
 * (normalize-on-write) and every display site (format-on-display) so phones
 * land in the DB as 10 digits and render as (NNN) NNN-NNNN.
 */

/**
 * Strip every non-digit, drop a leading "1" country code, return the
 * 10-digit form. Returns "" for anything that can't be normalized to
 * exactly 10 digits.
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = raw.replace(/\D+/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return digits.length === 10 ? digits : "";
}

/**
 * Format a phone for display as "(NNN) NNN-NNNN". Falls back to the
 * original input if it can't normalize to 10 digits, so existing rows
 * with international or otherwise non-conforming numbers render unchanged.
 */
export function formatPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = normalizePhone(raw);
  if (digits.length !== 10) return raw;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
