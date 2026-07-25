import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveSmsEnv } from "@/lib/sms/resolve-env";
import { getSmsProvider, isSmsConfigured } from "@/lib/sms/client";

/**
 * Regression guard for the prod incident where switching SMS_PROVIDER=zernio +
 * ZERNIO_SMS_FROM in Netlify did NOT take effect: the SMS client read config via
 * `import.meta.env` (build-time inlined) with no runtime fallback, so a secret
 * set after the last build was `undefined` at runtime → sendSms() returned
 * `not_configured` → "Could not send verification code."
 *
 * The fix routes all default SMS env reads through resolveSmsEnv(), which reads
 * process.env (the runtime source Netlify secrets live in) first.
 */

const KEYS = [
  "SMS_PROVIDER",
  "ZERNIO_API_KEY",
  "ZERNIO_SMS_FROM",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "TWILIO_MESSAGING_SERVICE_SID",
  "MESSAGING_MOCK",
] as const;

function snapshot(): Record<string, string | undefined> {
  const s: Record<string, string | undefined> = {};
  for (const k of KEYS) s[k] = process.env[k];
  return s;
}
function restore(s: Record<string, string | undefined>): void {
  for (const k of KEYS) {
    if (s[k] === undefined) delete process.env[k];
    else process.env[k] = s[k];
  }
}

describe("resolveSmsEnv reads runtime process.env", () => {
  let snap: Record<string, string | undefined>;
  beforeEach(() => {
    snap = snapshot();
    for (const k of KEYS) delete process.env[k];
  });
  afterEach(() => restore(snap));

  it("returns values from process.env (where Netlify runtime secrets live)", () => {
    process.env.SMS_PROVIDER = "zernio";
    process.env.ZERNIO_API_KEY = "k";
    process.env.ZERNIO_SMS_FROM = "+16026544211";

    const env = resolveSmsEnv();

    expect(env.SMS_PROVIDER).toBe("zernio");
    expect(env.ZERNIO_API_KEY).toBe("k");
    expect(env.ZERNIO_SMS_FROM).toBe("+16026544211");
  });

  it("lets getSmsProvider()/isSmsConfigured() honor process.env with no explicit env arg", () => {
    // This is the exact prod condition: provider + creds set at runtime only.
    process.env.SMS_PROVIDER = "zernio";
    process.env.ZERNIO_API_KEY = "k";
    process.env.ZERNIO_SMS_FROM = "+16026544211";

    expect(getSmsProvider()).toBe("zernio");
    expect(isSmsConfigured()).toBe(true);
  });
});
