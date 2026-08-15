/**
 * Server-side Meta Conversions API (CAPI) client.
 *
 * Fires conversion events (`Purchase`, `CompleteRegistration`) to Meta
 * directly from server code — the Stripe webhook for purchases, the
 * registration-create endpoints for sign-ups. Server events are the source
 * of truth for conversion counts: they survive ad blockers / iOS ITP and
 * cover payment paths the browser pixel never sees (e.g. ACH). The browser
 * pixel fire that GTM emits off the client-side `purchase` dataLayer event
 * carries the same `eventId`, so Meta dedupes the pair instead of double
 * counting.
 *
 * Mirrors ga4-measurement-protocol.ts in spirit: brand-aware, soft-fails on
 * every path, never blocks the calling flow. Missing pixel id / token
 * disables the fire without crashing. Environment + tester-email gating
 * lives in conversion-exclusions.ts and is applied here so no call site can
 * bypass it.
 *
 * Brand attribution: Aspire + SoccerOne share one Stripe account but may run
 * separate pixels. FB_PIXEL_ID_SOCCERONE / FB_CAPI_TOKEN_SOCCERONE override
 * the shared default when the charge's brand is `soccerone`; when unset, both
 * brands report to the default pixel (still tagged by `content_category`).
 */
import { createHash } from "node:crypto";
import { originForBrand } from "@/lib/organization/soccerone-routing";
import {
  isExcludedConversionEmail,
  conversionsEnabled,
  metaTestEventCode,
} from "./conversion-exclusions";

const GRAPH_VERSION = "v21.0";

export type MetaEventName = "Purchase" | "CompleteRegistration";

export interface MetaConversionInput {
  eventName: MetaEventName;
  /**
   * Dedup key shared with the client-side pixel fire — the Stripe
   * PaymentIntent id (registration purchase), Checkout Session id (drop-in /
   * rental / membership), or our registration id (CompleteRegistration).
   * Must match whatever the browser event passes as its eventID.
   */
  eventId: string;
  /** Required for Purchase; optional context on CompleteRegistration. */
  valueCents?: number;
  currency?: "USD";
  brand: "aspire" | "soccerone";
  /** Page URL the conversion is attributed to; brand origin when omitted. */
  eventSourceUrl?: string | null;
  /** Raw `_fbc` cookie captured at checkout, or null. */
  fbc?: string | null;
  /** `fbclid` query/cookie captured at checkout — used to synthesize fbc when the cookie is absent. */
  fbclid?: string | null;
  /** Raw `_fbp` cookie captured at checkout, or null. */
  fbp?: string | null;
  /** Customer identity — each SHA-256 hashed before send per Meta CAPI spec. */
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Our user id — hashed, improves match quality across sessions. */
  externalId?: string | null;
  /** Product ids for content matching (seasonId, sessionId, rentalId, tierId). */
  contentIds?: string[];
  /** Human-readable product name. */
  contentName?: string;
  /** High-level grouping shown in Events Manager, e.g. "registration". */
  contentCategory?: string;
}

function sha256Lower(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/**
 * Meta wants phones as digits only, with country code, no `+` or formatting.
 * US 10-digit numbers get a leading `1`. Returns null when there's nothing
 * plausibly hashable (fewer than 10 digits).
 */
export function normalizePhoneForMeta(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.length === 10 ? `1${digits}` : digits;
}

function pixelConfigForBrand(brand: "aspire" | "soccerone"): {
  pixelId?: string;
  token?: string;
} {
  if (brand === "soccerone") {
    return {
      pixelId: process.env.FB_PIXEL_ID_SOCCERONE || process.env.FB_PIXEL_ID,
      token: process.env.FB_CAPI_TOKEN_SOCCERONE || process.env.FB_CAPI_TOKEN,
    };
  }
  return { pixelId: process.env.FB_PIXEL_ID, token: process.env.FB_CAPI_TOKEN };
}

function defaultSourceUrl(brand: "aspire" | "soccerone"): string | undefined {
  const brandOrigin = originForBrand(brand);
  if (brandOrigin) return `${brandOrigin}/`;
  const appUrl = process.env.PUBLIC_APP_URL;
  return appUrl ? `${appUrl.replace(/\/$/, "")}/` : undefined;
}

/**
 * Pure payload builder, exported for unit tests. Returns null when the event
 * carries no user-identity signal at all — Meta can't attribute such events
 * and rejects them, so sending is pointless.
 */
export function buildMetaEventPayload(
  input: MetaConversionInput,
  eventTime: number,
): Record<string, unknown> | null {
  const fbc =
    input.fbc ||
    (input.fbclid ? `fb.1.${eventTime}.${input.fbclid}` : undefined);
  const userData: Record<string, unknown> = {};
  if (input.email) userData.em = [sha256Lower(input.email)];
  if (input.phone) {
    const normalized = normalizePhoneForMeta(input.phone);
    if (normalized) userData.ph = [sha256Lower(normalized)];
  }
  if (input.firstName) userData.fn = [sha256Lower(input.firstName)];
  if (input.lastName) userData.ln = [sha256Lower(input.lastName)];
  if (input.externalId) userData.external_id = [sha256Lower(input.externalId)];
  if (fbc) userData.fbc = fbc;
  if (input.fbp) userData.fbp = input.fbp;

  if (Object.keys(userData).length === 0) {
    return null;
  }

  const customData: Record<string, unknown> = {
    ...(typeof input.valueCents === "number"
      ? { currency: input.currency ?? "USD", value: input.valueCents / 100 }
      : {}),
    ...(input.contentIds && input.contentIds.length
      ? { content_ids: input.contentIds, content_type: "product" }
      : {}),
    ...(input.contentName ? { content_name: input.contentName } : {}),
    ...(input.contentCategory
      ? { content_category: input.contentCategory }
      : {}),
  };

  const sourceUrl = input.eventSourceUrl ?? defaultSourceUrl(input.brand);
  return {
    event_name: input.eventName,
    event_time: eventTime,
    event_id: input.eventId,
    action_source: "website",
    ...(sourceUrl ? { event_source_url: sourceUrl } : {}),
    user_data: userData,
    ...(Object.keys(customData).length ? { custom_data: customData } : {}),
  };
}

export async function sendMetaConversionEvent(
  input: MetaConversionInput,
): Promise<void> {
  const { pixelId, token } = pixelConfigForBrand(input.brand);
  if (!pixelId || !token) {
    return;
  }
  if (!conversionsEnabled()) {
    console.log(
      `[meta-capi] skipped ${input.eventName} ${input.eventId}: conversions disabled in this environment`,
    );
    return;
  }
  const testEventCode = metaTestEventCode();
  if (!testEventCode && isExcludedConversionEmail(input.email)) {
    console.log(
      `[meta-capi] skipped ${input.eventName} ${input.eventId}: tester email excluded`,
    );
    return;
  }

  const eventTime = Math.floor(Date.now() / 1000);
  const event = buildMetaEventPayload(input, eventTime);
  if (!event) {
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
  const body = {
    data: [event],
    ...(testEventCode ? { test_event_code: testEventCode } : {}),
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(
        `[meta-capi] non-2xx response: ${res.status} for event ${input.eventId}`,
      );
    }
  } catch (err) {
    console.error("[meta-capi] send failed:", err);
  }
}

/** Back-compat Purchase wrapper (input shape unchanged for existing callers). */
export type MetaPurchaseInput = Omit<MetaConversionInput, "eventName">;

export async function sendMetaPurchaseEvent(
  input: MetaPurchaseInput,
): Promise<void> {
  return sendMetaConversionEvent({ ...input, eventName: "Purchase" });
}
