// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import netlify from '@astrojs/netlify';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// `site` is required by @astrojs/sitemap to emit absolute URLs. Driven by
// PUBLIC_APP_URL (set per-environment in Netlify build env; defaults to
// localhost for local/CI builds, same as .env.example).
const site = process.env.PUBLIC_APP_URL || 'http://localhost:4321';

// Routes excluded from the sitemap. Sources:
//   • Middleware ROUTE_RULES (auth/role-gated prefixes): /admin, /coach,
//     /dashboard, /account, /messages, /media
//   • Middleware REDIRECT_IF_AUTHED (auth pages): /signin, /signup,
//     /forgot-password
//   • Transactional/flow pages (not middleware-gated but wrong for SEO):
//     /payment (Stripe return callback), /verify-email (email verification
//     token flow), /m (magic-link token handler), /auth (auth utility pages)
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
  "/payment",
  "/verify-email",
  "/m",
  "/auth",
];

// https://astro.build/config
export default defineConfig({
  site,
  integrations: [
    react(),
    sitemap({
      // Exclude private, auth-gated, and transactional routes from the sitemap
      // so search engines only index public marketing and content pages.
      filter: (page) => {
        const path = new URL(page).pathname;
        return !PRIVATE_PREFIXES.some(
          (prefix) => path === prefix || path.startsWith(prefix + "/")
        );
      },
    }),
  ],
  adapter: netlify(),
  output: 'server',

  vite: {
    plugins: [tailwindcss()]
  }
});
