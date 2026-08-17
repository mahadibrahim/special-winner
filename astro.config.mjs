// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import netlify from '@astrojs/netlify';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// `site` is required by @astrojs/sitemap to emit absolute URLs. Driven by
// PUBLIC_APP_URL (set per-environment in Netlify build env; defaults to
// localhost for local/CI builds, same as .env.example).
// `www.aspiresportsohio.com` 301s to the apex, so a sitemap full of www <loc>s
// is a sitemap full of redirects. The Bitwarden PUBLIC_APP_URL secret currently
// holds the www form, so strip it here rather than trusting the env to be
// right. Mirrors normalizeAspireOrigin in src/lib/seo/canonical.ts — keep the
// two in step. localhost and the staging *.netlify.app host are unaffected.
const site = (process.env.PUBLIC_APP_URL || 'http://localhost:4321')
  .replace(/^(https?:\/\/)www\./i, '$1')
  .replace(/\/$/, '');

// Routes excluded from the sitemap. @astrojs/sitemap discovers every route in
// the build (SSR included), so anything not listed here ships to Google —
// which is how /portal, /staff/**, /referee/** and friends ended up in the
// production sitemap all 302-ing to /signin. Keep this list in sync with
// DISALLOW in src/lib/seo/tenant-seo.ts. Sources:
//   • Middleware ROUTE_RULES (auth/role-gated prefixes): /admin, /coach,
//     /dashboard, /account, /messages, /media, /portal, /staff, /host,
//     /referee, /drop-league/dashboard
//   • Middleware REDIRECT_IF_AUTHED (auth pages): /signin, /signup,
//     /forgot-password
//   • Transactional/flow pages (not middleware-gated but wrong for SEO):
//     /payment (Stripe return callback), /verify-email (email verification
//     token flow), /m (magic-link token handler), /auth (auth utility pages),
//     /register + /team (checkout), /shop/checkout + /shop/order,
//     /consent/confirmed, /feedback/[token], the /dropin + /rentals claim
//     token routes, and /email-link-signin (a bare 301 to /signin)
//   • Cross-brand: /soccerone/** 301s off to gosoccerone.com from Aspire
//     hosts, so listing it here asks Google to crawl a redirect chain into
//     another domain's content.
const PRIVATE_PREFIXES = [
  "/admin",
  "/coach",
  "/dashboard",
  "/account",
  "/messages",
  "/media",
  "/signin",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/payment",
  "/verify-email",
  "/m",
  "/auth",
  "/portal",
  "/staff",
  "/host",
  "/referee",
  "/drop-league/dashboard",
  "/register",
  "/team",
  "/feedback",
  "/consent",
  "/email-link-signin",
  "/shop/checkout",
  "/shop/order",
  "/dropin/claim",
  "/rentals/claim",
  "/soccerone",
];

// Public SSR marketing pages. @astrojs/sitemap only auto-discovers
// prerendered routes (output: "server"), so the SSR-rendered marketing
// surface must be listed explicitly. The list lives in a shared module so
// the runtime dev/CI sitemap (src/pages/sitemap.xml.ts) serves the same set.
import { ASPIRE_SSR_PUBLIC_PAGES as SSR_PUBLIC_PAGES } from './src/lib/seo/aspire-sitemap-pages.mjs';

/**
 * Strip trailing slashes so "/adult/" and "/adult" compare and emit as one URL.
 * @param {string} pathname
 * @returns {string}
 */
const normalizeSitemapPath = (pathname) =>
  pathname === '/' ? '/' : pathname.replace(/\/+$/, '');

/** Per-build dedupe set for the sitemap `serialize` hook below. */
const seenSitemapUrls = new Set();

// https://astro.build/config
export default defineConfig({
  site,
  integrations: [
    react(),
    sitemap({
      // Exclude private, auth-gated, and transactional routes from the sitemap
      // so search engines only index public marketing and content pages.
      filter: (page) => {
        const path = normalizeSitemapPath(new URL(page).pathname);
        return !PRIVATE_PREFIXES.some(
          (prefix) => path === prefix || path.startsWith(prefix + "/")
        );
      },
      customPages: SSR_PUBLIC_PAGES.map((p) => `${site}${p}`),
      // Route discovery emits the trailing-slash form ("/adult/") while
      // customPages supplies the bare form ("/adult"), so every SSR marketing
      // page was listed twice. Both forms serve 200, so the duplicates were
      // real crawl waste. Normalize to the no-trailing-slash form the pages
      // already self-canonicalize to (see resolveCanonicalUrl) and drop the
      // repeat. `seen` is per-build, which is the scope we want.
      serialize: (item) => {
        const url = new URL(item.url);
        url.pathname = normalizeSitemapPath(url.pathname);
        const normalized = url.href;
        if (seenSitemapUrls.has(normalized)) return undefined;
        seenSitemapUrls.add(normalized);
        return { ...item, url: normalized };
      },
    }),
  ],
  adapter: netlify(),
  output: 'server',

  vite: {
    plugins: [tailwindcss()]
  }
});
