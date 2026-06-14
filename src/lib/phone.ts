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
 * Convert a stored phone to E.164 ("+<countrycode><number>") for the WhatsApp /
 * Zernio transport, which requires fully-qualified international numbers.
 *
 * Phones land in the DB as 10 US digits (see normalizePhone), so the common
 * path is `+1` + the 10 digits. Legacy/international rows that normalizePhone
 * rejects are handled by a fallback: strip a "00" IDD prefix, keep 11-15 digit
 * numbers verbatim with a leading "+". Returns null for anything that can't be
 * resolved to a plausible E.164 number.
 *
 * Note: emits the canonical "+"-prefixed E.164 form. If Zernio's group
 * participant API turns out to want the bare wa_id (no "+"), strip it at the
 * call site — this stays the single source of truth for the number itself.
 */
export function toE164(
  raw: string | null | undefined,
  defaultCountryCode = "1",
): string | null {
  const local = normalizePhone(raw);
  if (local) return `+${defaultCountryCode}${local}`;
  if (!raw) return null;
  let digits = raw.replace(/\D+/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 11 && digits.length <= 15 ? `+${digits}` : null;
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
