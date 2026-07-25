/**
 * Zernio SMS transport client.
 *
 * Thin typed wrapper over Zernio's SMS endpoint (POST /v1/sms/messages). This is
 * a SEPARATE client from `src/lib/zernio/messaging.ts` (which is WhatsApp
 * account-based, keyed on accountId/conversationId); SMS is from/to E.164-based
 * with a different response shape. `fetchImpl` is injectable for unit testing.
 *
 * Transport layer only — opt-in checks and provider selection live in
 * `src/lib/sms/send.ts`, which calls into this.
 */

import { resolveSmsEnv } from "./resolve-env";

const DEFAULT_BASE_URL = "https://zernio.com/api/v1";

export interface ZernioSmsClientConfig {
  apiKey: string;
  from: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface SendZernioSmsInput {
  to: string;
  text: string;
  mediaUrls?: string[];
}

export interface ZernioSmsResult {
  id: string;
  conversationId?: string;
  status?: string;
}

export function createZernioSmsClient(config: ZernioSmsClientConfig) {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const doFetch = config.fetchImpl ?? fetch;

  return {
    /** Send an SMS (or MMS when mediaUrls is set) from the configured number. */
    async send(input: SendZernioSmsInput): Promise<ZernioSmsResult> {
      const body: Record<string, unknown> = {
        from: config.from,
        to: input.to,
        text: input.text,
      };
      if (input.mediaUrls !== undefined) body.mediaUrls = input.mediaUrls;

      const res = await doFetch(`${baseUrl}/sms/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        // Zernio returns JSON error bodies, e.g. {"error":"..."} for 401/404/
        // 409/422/502. Surface the detail so callers log the real cause
        // (404 = no SMS-enabled number matches `from`; 502 = carrier failed).
        let detail = "";
        try {
          const errBody = (await res.json()) as Record<string, unknown>;
          detail = typeof errBody.error === "string" ? errBody.error : JSON.stringify(errBody);
        } catch {
          detail = "(non-JSON error body)";
        }
        throw new Error(`Zernio SMS ${res.status} on /sms/messages: ${detail}`);
      }

      const data = (await res.json()) as Record<string, unknown>;
      return {
        id: String(data.id ?? ""),
        conversationId: data.conversationId as string | undefined,
        status: data.status as string | undefined,
      };
    },
  };
}

export type ZernioSmsClient = ReturnType<typeof createZernioSmsClient>;

interface ZernioSmsEnv {
  ZERNIO_API_KEY?: string;
  ZERNIO_SMS_FROM?: string;
}

/** True when both Zernio SMS credentials are present (SMS via Zernio can be enabled). */
export function isZernioSmsConfigured(
  env: ZernioSmsEnv = resolveSmsEnv(),
): boolean {
  return Boolean(env.ZERNIO_API_KEY && env.ZERNIO_SMS_FROM);
}

/**
 * Build an SMS client from environment credentials. Throws a clear error if
 * unconfigured so callers fail loudly rather than send nowhere.
 */
export function createZernioSmsClientFromEnv(
  env: ZernioSmsEnv = resolveSmsEnv(),
  fetchImpl?: typeof fetch,
): ZernioSmsClient {
  if (!env.ZERNIO_API_KEY) {
    throw new Error("Zernio SMS not configured. Set ZERNIO_API_KEY to enable the Zernio SMS provider.");
  }
  if (!env.ZERNIO_SMS_FROM) {
    throw new Error("Zernio SMS not configured. Set ZERNIO_SMS_FROM (E.164 sender) to enable the Zernio SMS provider.");
  }
  return createZernioSmsClient({
    apiKey: env.ZERNIO_API_KEY,
    from: env.ZERNIO_SMS_FROM,
    fetchImpl,
  });
}
