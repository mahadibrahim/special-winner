/**
 * Shared guards for server-side ad-conversion fires (Meta CAPI + GA4 MP).
 *
 * Two independent gates, both applied by the senders:
 *
 * 1. Environment — conversions only leave production. Netlify sets
 *    `CONTEXT=production` on the prod site's runtime; local dev / CI /
 *    deploy previews never carry it. `META_CONVERSIONS_LIVE=yes` is an
 *    explicit override (same pattern as MESSAGING_LIVE), and setting
 *    `META_TEST_EVENT_CODE` enables sending from anywhere because those
 *    events land in Events Manager's Test Events tab, not ad reporting.
 *
 * 2. Tester traffic — purchases made by our own test accounts must never
 *    count as ad conversions (they inflated Purchase ~6x in Jul 2026).
 *    The exclusion is bypassed in Test-Events mode, because verification
 *    runs *are* tester purchases by definition.
 */

const EXCLUDED_EMAILS = new Set([
  "mahad.ibrahim@gmail.com",
  "alexis.santos@icloud.com",
]);

/** Seed/e2e accounts (admin@test.aspiresports.com etc.). */
const EXCLUDED_DOMAINS = new Set(["test.aspiresports.com"]);

export function isExcludedConversionEmail(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (EXCLUDED_EMAILS.has(normalized)) return true;
  const domain = normalized.split("@")[1];
  return domain !== undefined && EXCLUDED_DOMAINS.has(domain);
}

export function metaTestEventCode(): string | undefined {
  return process.env.META_TEST_EVENT_CODE || undefined;
}

/**
 * Whether server-side conversion events may be sent from this environment.
 */
export function conversionsEnabled(): boolean {
  if (metaTestEventCode()) return true;
  if (process.env.META_CONVERSIONS_LIVE === "yes") return true;
  return process.env.CONTEXT === "production";
}

/**
 * Single yes/no for a given customer email: false when the environment is
 * non-production or the email belongs to a tester (outside Test-Events mode).
 */
export function shouldSendConversion(email: string | null | undefined): boolean {
  if (!conversionsEnabled()) return false;
  if (metaTestEventCode()) return true;
  return !isExcludedConversionEmail(email);
}
