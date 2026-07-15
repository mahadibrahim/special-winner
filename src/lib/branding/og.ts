/**
 * Absolute-URL resolution for Open Graph / Twitter link-preview tags.
 *
 * iMessage, WhatsApp, and Twitter all require an *absolute* og:image URL — a
 * relative "/og/x.jpg" is silently dropped. These pure helpers turn the
 * brand's share-card path and the current page path into absolute URLs, and
 * are unit-tested in tests/unit/og.test.ts.
 */

/**
 * Pick the origin to build absolute preview URLs against.
 *
 * SSR pages carry the real request host in `requestOrigin` — correct for both
 * aspiresportsohio.com and gosoccerone.com. Prerendered pages have no request
 * (Astro.url.origin is the build-time localhost, since `site:` is unset) and
 * are always the Aspire brand, so they fall back to the Aspire canonical
 * origin (PUBLIC_APP_URL in prod).
 */
export function resolveOgOrigin(
  isPrerendered: boolean,
  requestOrigin: string,
  prerenderFallbackOrigin: string,
): string {
  return isPrerendered ? prerenderFallbackOrigin : requestOrigin;
}

/**
 * Resolve a path or already-absolute URL to an absolute URL against `origin`.
 * An absolute `pathOrUrl` (a page-supplied ogImage on a CDN, say) is returned
 * unchanged; a relative path is joined to the origin.
 */
export function toAbsoluteUrl(pathOrUrl: string, origin: string): string {
  return new URL(pathOrUrl, origin).href;
}
