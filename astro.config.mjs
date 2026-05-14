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

// https://astro.build/config
export default defineConfig({
  site,
  integrations: [react(), sitemap()],
  adapter: netlify(),
  output: 'server',

  vite: {
    plugins: [tailwindcss()]
  }
});
