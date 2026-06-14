/**
 * Parse the GA4 client_id from the `_ga` cookie. Format is `GA1.1.<client>.<timestamp>`
 * where the client_id GA4 expects is `<client>.<timestamp>`. Returns null if absent
 * or malformed.
 */
export function parseGaClientId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)_ga=GA\d\.\d\.([^;]+)/);
  return match?.[1] ?? null;
}

/**
 * Read an analytics param (e.g. gclid, fbclid) from query string first, then cookie.
 * Returns null if not found in either location.
 */
export function readQueryOrCookie(url: URL, cookieHeader: string | null, name: string): string | null {
  const fromQuery = url.searchParams.get(name);
  if (fromQuery) return fromQuery;
  if (!cookieHeader) return null;
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`);
  const m = cookieHeader.match(re);
  return m?.[1] ?? null;
}

/**
 * Collect the full set of ad-attribution identifiers from a request, ready to
 * spread into Stripe Checkout/PaymentIntent metadata. The webhook handlers
 * read these back to fire server-side GA4 Measurement Protocol + Meta
 * Conversions API purchase events that survive ad blockers / iOS ATP.
 *
 * Returns only the keys that are present, so callers can spread it directly
 * (Stripe metadata values must be strings; empty keys are omitted, not "").
 *
 * Keys: `ga_client_id` (GA4 client_id), `gclid` (Google Ads), `fbclid` (Meta
 * click id), `_fbc` / `_fbp` (Meta cookies — best CAPI match quality).
 */
export function collectAdAttribution(
  url: URL,
  cookieHeader: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  const gaClientId = parseGaClientId(cookieHeader);
  if (gaClientId) out.ga_client_id = gaClientId;
  const gclid = readQueryOrCookie(url, cookieHeader, "gclid");
  if (gclid) out.gclid = gclid;
  const fbclid = readQueryOrCookie(url, cookieHeader, "fbclid");
  if (fbclid) out.fbclid = fbclid;
  // Meta cookies are cookie-only (the pixel writes them); never in the query.
  const fbc = readQueryOrCookie(url, cookieHeader, "_fbc");
  if (fbc) out._fbc = fbc;
  const fbp = readQueryOrCookie(url, cookieHeader, "_fbp");
  if (fbp) out._fbp = fbp;
  return out;
}
