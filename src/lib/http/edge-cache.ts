// Structural type so the helper accepts both the page `Astro` global
// (AstroGlobal) and an APIContext — both expose `request` + `response`.
type EdgeCacheContext = {
  request: Request;
  response: ResponseInit & { headers: Headers };
};

/**
 * Opt a public, user-invariant marketing page into Netlify edge caching.
 *
 * Call at the END of a page's frontmatter, after all request-time data
 * fetches have succeeded — so a failed render never sets a cache header and
 * we never cache an error response.
 *
 * `Netlify-CDN-Cache-Control` drives Netlify's CDN only; the browser is told
 * to always revalidate, and it revalidates against the edge (instant on a
 * hit). Mirrors the pattern used by src/pages/api/public/* routes. Setting
 * this header also signals BaseLayout to render the nav user-invariant (see
 * resolveNavUser), guaranteeing no per-user data is baked into a cached page.
 */
export function setMarketingEdgeCache(ctx: EdgeCacheContext): void {
  if (ctx.request.method !== "GET") return;
  ctx.response.headers.set(
    "Cache-Control",
    "public, max-age=0, must-revalidate",
  );
  ctx.response.headers.set(
    "Netlify-CDN-Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=86400",
  );
}
