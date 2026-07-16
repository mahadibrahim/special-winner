/**
 * Runtime resolver for SMS provider/credential env vars.
 *
 * Why this exists: on the Netlify SSR runtime, `import.meta.env.X` is **inlined
 * at build time** — a secret set (or rotated) in the Netlify dashboard after the
 * last build is `undefined` at runtime until a rebuild. That is exactly what
 * broke the Zernio cutover: `SMS_PROVIDER=zernio` + `ZERNIO_SMS_FROM` were live
 * in Netlify but not visible to `isSmsConfigured()`, so `sendSms()` returned
 * `not_configured` and phone verification failed with "Could not send".
 *
 * `process.env` on the Node function runtime always reflects the *current*
 * Netlify environment, so read it first and fall back to `import.meta.env` only
 * for anything not present at runtime (belt-and-suspenders for local/build
 * contexts). This mirrors the pattern the Zernio webhook already uses
 * (`import.meta.env.X ?? process.env.X`) but puts the runtime source first so a
 * late-set OR rotated secret always wins.
 *
 * Each key is read as an explicit static member access so Vite can still inline
 * where appropriate — do not refactor into a dynamic `env[key]` loop.
 */

export interface ResolvedSmsEnv {
  SMS_PROVIDER?: string;
  ZERNIO_API_KEY?: string;
  ZERNIO_SMS_FROM?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_PHONE_NUMBER?: string;
  TWILIO_MESSAGING_SERVICE_SID?: string;
}

export function resolveSmsEnv(): ResolvedSmsEnv {
  return {
    SMS_PROVIDER: process.env.SMS_PROVIDER ?? import.meta.env.SMS_PROVIDER,
    ZERNIO_API_KEY: process.env.ZERNIO_API_KEY ?? import.meta.env.ZERNIO_API_KEY,
    ZERNIO_SMS_FROM: process.env.ZERNIO_SMS_FROM ?? import.meta.env.ZERNIO_SMS_FROM,
    TWILIO_ACCOUNT_SID:
      process.env.TWILIO_ACCOUNT_SID ?? import.meta.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN:
      process.env.TWILIO_AUTH_TOKEN ?? import.meta.env.TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER:
      process.env.TWILIO_PHONE_NUMBER ?? import.meta.env.TWILIO_PHONE_NUMBER,
    TWILIO_MESSAGING_SERVICE_SID:
      process.env.TWILIO_MESSAGING_SERVICE_SID ??
      import.meta.env.TWILIO_MESSAGING_SERVICE_SID,
  };
}
