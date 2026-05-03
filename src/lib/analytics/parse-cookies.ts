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
