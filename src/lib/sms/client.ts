import twilio from "twilio";

/**
 * Twilio client singleton.
 *
 * Lazy-loaded so modules that import this file don't fail at startup when
 * Twilio credentials are missing (e.g., in CI or local dev without Twilio).
 * Call `isSmsConfigured()` before calling `getTwilioClient()` to check.
 */

let _client: twilio.Twilio | null = null;

export function isSmsConfigured(): boolean {
  return Boolean(
    import.meta.env.TWILIO_ACCOUNT_SID &&
      import.meta.env.TWILIO_AUTH_TOKEN &&
      (import.meta.env.TWILIO_PHONE_NUMBER ||
        import.meta.env.TWILIO_MESSAGING_SERVICE_SID),
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
