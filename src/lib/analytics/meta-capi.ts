/**
 * Server-side Meta Conversions API (CAPI) client.
 *
 * Fires `Purchase` events to Meta directly from the Stripe webhook,
 * recovering conversions lost to ad blockers / iOS Intelligent Tracking
 * Prevention. This is the server-side twin of the browser pixel fire that
 * GTM emits off the client-side `purchase` dataLayer event — both carry the
 * same `eventId` so Meta dedupes them (the browser fire wins when present,
 * this one fills the gap when the pixel is blocked).
 *
 * Mirrors ga4-measurement-protocol.ts in spirit: brand-aware, soft-fails on
 * every path, never blocks webhook ack. Missing pixel id / token disables the
 * fire without crashing.
 *
 * Brand attribution: Aspire + SoccerOne share one Stripe account but may run
 * separate pixels. FB_PIXEL_ID_SOCCERONE / FB_CAPI_TOKEN_SOCCERONE override
 * the shared default when the charge's brand is `soccerone`; when unset, both
 * brands report to the default pixel (still tagged by `content_category`).
 */
import { createHash } from "node:crypto";

const GRAPH_VERSION = "v21.0";

export interface MetaPurchaseInput {
  /**
   * Shared with the client-side pixel fire for dedup — use the Stripe
   * PaymentIntent id (registration) or Checkout Session id (drop-in /
   * rental / membership). Must match whatever the success page passes to the
   * dataLayer `purchase` event as `transaction_id`.
   */
  eventId: string;
  valueCents: number;
  currency: "USD";
  brand: "aspire" | "soccerone";
  /** Raw `_fbc` cookie captured at checkout, or null. */
  fbc?: string | null;
  /** `fbclid` query/cookie captured at checkout — used to synthesize fbc when the cookie is absent. */
  fbclid?: string | null;
  /** Raw `_fbp` cookie captured at checkout, or null. */
  fbp?: string | null;
  /** Customer email — SHA-256 hashed before send per Meta CAPI spec. */
  email?: string | null;
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

export async function sendMetaPurchaseEvent(
  input: MetaPurchaseInput,
): Promise<void> {
  const { pixelId, token } = pixelConfigForBrand(input.brand);
  if (!pixelId || !token) {
    return;
  }

  // Meta requires at least one user-identity signal to attribute the event.
  // With none of fbc / fbp / email we can't match it to a click — skip rather
  // than send an unattributable (and rejected) event.
  const eventTime = Math.floor(Date.now() / 1000);
  const fbc =
    input.fbc ||
    (input.fbclid ? `fb.1.${eventTime}.${input.fbclid}` : undefined);
  const userData: Record<string, unknown> = {};
  if (input.email) userData.em = [sha256Lower(input.email)];
  if (fbc) userData.fbc = fbc;
  if (input.fbp) userData.fbp = input.fbp;

  if (Object.keys(userData).length === 0) {
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: eventTime,
        event_id: input.eventId,
        action_source: "website",
        user_data: userData,
        custom_data: {
          currency: input.currency,
          value: input.valueCents / 100,
          ...(input.contentIds && input.contentIds.length
            ? { content_ids: input.contentIds, content_type: "product" }
            : {}),
          ...(input.contentName ? { content_name: input.contentName } : {}),
          ...(input.contentCategory
            ? { content_category: input.contentCategory }
            : {}),
        },
      },
    ],
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
