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
 * Parse the browser's PostHog distinct id from the `ph_<token>_posthog`
 * cookie (posthog-js persistence). This is the id the whole anonymous
 * pre-payment journey is keyed to — webhooks that capture server-side
 * revenue events need it to join funnels, because guest checkouts never
 * call identify (the account is created after payment).
 */
export function parsePhDistinctId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const token =
    process.env.PUBLIC_POSTHOG_PROJECT_TOKEN ||
    import.meta.env.PUBLIC_POSTHOG_PROJECT_TOKEN;
  if (!token) return null;
  const re = new RegExp(`(?:^|;\\s*)ph_${token}_posthog=([^;]+)`);
  const m = cookieHeader.match(re);
  if (!m) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(m[1]));
    const id = parsed?.distinct_id;
    return typeof id === "string" && id.length > 0 && id.length <= 200
      ? id
      : null;
  } catch {
    return null;
  }
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
 * click id), `_fbc` / `_fbp` (Meta cookies — best CAPI match quality),
 * `ph_distinct_id` (browser PostHog id — joins server revenue events to the
 * anonymous funnel).
 */
export function collectAdAttribution(
  url: URL,
  cookieHeader: string | null,
): Record<string, string> {
  const out: Record<string, string> = {};
  const gaClientId = parseGaClientId(cookieHeader);
  if (gaClientId) out.ga_client_id = gaClientId;
  const phDistinctId = parsePhDistinctId(cookieHeader);
  if (phDistinctId) out.ph_distinct_id = phDistinctId;
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
