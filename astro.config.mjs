// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import netlify from '@astrojs/netlify';
import sentry from '@sentry/astro';
import tailwindcss from '@tailwindcss/vite';

// Only enable Sentry when DSN is configured. Dev runs without DSN — adding
// the integration unconditionally would emit "[Sentry] No DSN provided"
// warnings on every dev server start.
const sentryDsn = process.env.SENTRY_DSN;
const integrations = [react()];
if (sentryDsn) {
  integrations.push(
    sentry({
      dsn: sentryDsn,
      tracesSampleRate: 0.1,
      environment: process.env.NODE_ENV ?? 'development',
      sourceMapsUploadOptions: {
        // Set SENTRY_AUTH_TOKEN to enable source map uploads in CI.
        // Without it, sentry-vite-plugin no-ops gracefully.
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
      },
    }),
  );
}

// https://astro.build/config
export default defineConfig({
  integrations,
  adapter: netlify(),
  output: 'server',

  vite: {
    plugins: [tailwindcss()]
  }
});