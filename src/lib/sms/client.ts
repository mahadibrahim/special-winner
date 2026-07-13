import twilio from "twilio";
import { isZernioSmsConfigured } from "./zernio-sms";

/**
 * Twilio client singleton.
 *
 * Lazy-loaded so modules that import this file don't fail at startup when
 * Twilio credentials are missing (e.g., in CI or local dev without Twilio).
 * Call `isSmsConfigured()` before calling `getTwilioClient()` to check.
 */

let _client: twilio.Twilio | null = null;

export type SmsProvider = "twilio" | "zernio";

interface SmsEnv {
  SMS_PROVIDER?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_PHONE_NUMBER?: string;
  TWILIO_MESSAGING_SERVICE_SID?: string;
  ZERNIO_API_KEY?: string;
  ZERNIO_SMS_FROM?: string;
}

/** Active outbound SMS vendor. Unset (or any non-"zernio" value) ⇒ twilio. */
export function getSmsProvider(
  env: SmsEnv = import.meta.env as unknown as SmsEnv,
): SmsProvider {
  return env.SMS_PROVIDER === "zernio" ? "zernio" : "twilio";
}

export function isSmsConfigured(
  env: SmsEnv = import.meta.env as unknown as SmsEnv,
): boolean {
  // MESSAGING_MOCK=1 (see src/lib/messaging/mock.ts) reports "configured"
  // without real Twilio/Zernio credentials, so channel-selection and
  // opt-in logic in sendSms() runs for real while the actual network call
  // is swapped for an in-memory record. Mirrors R2_MOCK's bypass of R2
  // credential requirements.
  if (process.env.MESSAGING_MOCK === "1") return true;
  if (getSmsProvider(env) === "zernio") {
    return isZernioSmsConfigured(env);
  }
  return Boolean(
    env.TWILIO_ACCOUNT_SID &&
      env.TWILIO_AUTH_TOKEN &&
      (env.TWILIO_PHONE_NUMBER || env.TWILIO_MESSAGING_SERVICE_SID),
  );
}

export function getTwilioClient(): twilio.Twilio {
  if (_client) return _client;

  const accountSid = import.meta.env.TWILIO_ACCOUNT_SID;
  const authToken = import.meta.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error(
      "Twilio not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.",
    );
  }

  _client = twilio(accountSid, authToken);
  return _client;
}

export function getSmsFrom(): { from?: string; messagingServiceSid?: string } {
  const messagingServiceSid = import.meta.env.TWILIO_MESSAGING_SERVICE_SID;
  if (messagingServiceSid) {
    return { messagingServiceSid };
  }

  const from = import.meta.env.TWILIO_PHONE_NUMBER;
  if (!from) {
    throw new Error(
      "Twilio sender not configured. Set TWILIO_MESSAGING_SERVICE_SID or TWILIO_PHONE_NUMBER.",
    );
  }
  return { from };
}
