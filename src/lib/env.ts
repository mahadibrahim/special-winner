/**
 * Centralized env validation.
 *
 * Why: production silently falls back to `http://localhost:4321` for
 * `PUBLIC_APP_URL` (and similar) when an env var is missing, which corrupts
 * receipt emails, magic links, and webhook URLs. This module validates the
 * required vars on first import and either throws (PROD) or warns (DEV).
 *
 * Import this module from the request entry point (`src/middleware.ts`) so
 * validation runs once on the first request. The validated, typed object is
 * exported as `env` for use elsewhere in the codebase.
 */
import { z } from "zod";

// All env access goes through `import.meta.env` so the values come from
// Astro/Vite's bundled env (which respects `.env`, `process.env`, and
// `astro:env`). Falls back to `process.env` for code paths that don't have
// the bundler context (e.g. scripts).
const source: Record<string, string | undefined> = {
  ...(typeof process !== "undefined" ? (process.env as Record<string, string | undefined>) : {}),
  ...(import.meta.env as unknown as Record<string, string | undefined>),
};

// In Astro+Vite, MODE is "production" for prod builds. PROD is a boolean.
const isProd = (import.meta.env.PROD as boolean | undefined) === true
  || source.NODE_ENV === "production";

// Skip throwing during the build itself. Astro evaluates middleware while
// prerendering static pages — if the local build env doesn't have every
// secret (a smoke `npm run build` without secrets), we don't want
// validation to abort the build. CI deploy environments DO set the real
// secrets via the build step's env block, so the check still catches
// genuine misconfiguration on first request.
const isBuildPhase =
  source.npm_lifecycle_event === "build" ||
  source.SKIP_ENV_VALIDATION === "1";

const envSchema = z.object({
  // Required everywhere
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Required in production
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_CONNECT_WEBHOOK_SECRET: z.string().min(1).optional(),
  PUBLIC_APP_URL: z.string().url().optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().min(1).optional(),
  RESEND_INBOUND_WEBHOOK_SECRET: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(1).optional(),

  // Optional everywhere
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_BOT_USERNAME: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_PHONE_NUMBER: z.string().optional(),
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
  TWILIO_WEBHOOK_AUTH_TOKEN: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_CLASSIFIER_MODEL: z.string().optional(),
  MAGIC_LINK_BASE_URL: z.string().optional(),
  PUBLIC_POSTHOG_PROJECT_TOKEN: z.string().optional(),
  PUBLIC_POSTHOG_HOST: z.string().optional(),
  POSTHOG_PROJECT_TOKEN: z.string().optional(),
  POSTHOG_HOST: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // GA4 Measurement Protocol — server-side purchase event backup.
  // Optional everywhere; missing values disable the server-side fire
  // but don't crash the site.
  GA4_MEASUREMENT_ID: z.string().optional(),
  GA4_API_SECRET: z.string().optional(),
});

// Vars that must be set when running in production.
// Strictly required at boot. Missing any of these throws and 500s every
// SSR request, so only include vars whose absence is genuinely fatal.
const REQUIRED_IN_PROD = [
  "DATABASE_URL",
  "STRIPE_SECRET_KEY",
  "STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PUBLIC_APP_URL",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
] as const;

// Soft-required: warn on missing, don't throw. The endpoints that consume
// these (Stripe Connect webhook, Resend inbound webhook, cron callers)
// fail loudly on their own when invoked without the secret. Keeping them
// out of REQUIRED_IN_PROD lets the rest of the site boot even when those
// optional integrations haven't been configured yet.
const SOFT_REQUIRED_IN_PROD = [
  "STRIPE_CONNECT_WEBHOOK_SECRET",
  "RESEND_INBOUND_WEBHOOK_SECRET",
  "CRON_SECRET",
  "GA4_MEASUREMENT_ID",
  "GA4_API_SECRET",
] as const;

type ValidatedEnv = z.infer<typeof envSchema> & {
  PUBLIC_APP_URL: string;
};

let cached: ValidatedEnv | null = null;

function validate(): ValidatedEnv {
  if (cached) return cached;

  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    if (isProd && !isBuildPhase) {
      throw new Error(`Env validation failed:\n  ${issues.join("\n  ")}`);
    }
    console.warn("[env] validation issues (not throwing):", issues);
  }

  const data = (parsed.success ? parsed.data : (source as ValidatedEnv));

  // Enforce production-required vars (hard fail).
  const missing: string[] = [];
  for (const key of REQUIRED_IN_PROD) {
    if (!data[key]) missing.push(key);
  }

  if (missing.length > 0) {
    const msg = `Missing required env vars: ${missing.join(", ")}`;
    if (isProd && !isBuildPhase) {
      throw new Error(msg);
    }
    // Dev / build-phase: warn but don't throw.
    console.warn(`[env] ${msg} (using fallbacks)`);
  }

  // Soft-required: log warning, never throw. Endpoints that need these
  // will surface the missing-config error themselves when invoked.
  const softMissing: string[] = [];
  for (const key of SOFT_REQUIRED_IN_PROD) {
    if (!data[key]) softMissing.push(key);
  }
  if (softMissing.length > 0) {
    console.warn(
      `[env] missing optional integration secrets (won't 500 the site, ` +
        `but the affected endpoints will fail when invoked): ` +
        softMissing.join(", "),
    );
  }

  // Provide a safe fallback for PUBLIC_APP_URL in dev. In prod we already
  // threw above if it was missing.
  const publicAppUrl = data.PUBLIC_APP_URL || "http://localhost:4321";

  cached = {
    ...data,
    PUBLIC_APP_URL: publicAppUrl,
  } as ValidatedEnv;

  return cached;
}

/**
 * Validated env object. Access env vars through this rather than
 * `import.meta.env` to get type-safety and the prod/dev-aware fallbacks.
 */
export const env: ValidatedEnv = new Proxy({} as ValidatedEnv, {
  get(_t, prop) {
    return validate()[prop as keyof ValidatedEnv];
  },
});

/** Force-validate eagerly. Call from middleware on first request. */
export function ensureEnvValidated(): void {
  validate();
}
