import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { z } from "zod";
import {
  createCheckoutForRegistration,
  CheckoutError,
} from "@/lib/payments/create-checkout-for-registration";
import { getPostHogServer } from "@/lib/posthog-server";

/**
 * Parse the GA4 client_id from the `_ga` cookie. Format is `GA1.1.<client>.<timestamp>`
 * where the client_id GA4 expects is `<client>.<timestamp>`. Returns null if absent
 * or malformed.
 */
function parseGaClientId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)_ga=GA\d\.\d\.([^;]+)/);
  return match?.[1] ?? null;
}

function readQueryOrCookie(url: URL, cookieHeader: string | null, name: string): string | null {
  const fromQuery = url.searchParams.get(name);
  if (fromQuery) return fromQuery;
  if (!cookieHeader) return null;
  const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`);
  const m = cookieHeader.match(re);
  return m?.[1] ?? null;
}

const checkoutSchema = z.object({
  registrationId: z.string().uuid("Invalid registration ID"),
  discountCode: z.string().optional(),
});

export const POST: APIRoute = async ({ request, locals, url }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json();
    const validation = checkoutSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const { registrationId, discountCode } = validation.data;
    const db = getDb();

    // Capture GA4 client_id + ad-platform IDs to pass through Stripe session
    // metadata so the webhook (handle-checkout-complete.ts) can fire a
    // server-side GA4 Measurement Protocol purchase event.
    const cookieHeader = request.headers.get("cookie");
    const gaClientId = parseGaClientId(cookieHeader);
    const gclid = readQueryOrCookie(url, cookieHeader, "gclid");
    const fbclid = readQueryOrCookie(url, cookieHeader, "fbclid");

    const extraMetadata: Record<string, string> = {};
    if (gaClientId) extraMetadata.ga_client_id = gaClientId;
    if (gclid) extraMetadata.gclid = gclid;
    if (fbclid) extraMetadata.fbclid = fbclid;

    const result = await createCheckoutForRegistration({
      db,
      registrationId,
      userId: user.id,
      baseUrl: url.origin,
      discountCode,
      extraMetadata,
    });

    const posthog = getPostHogServer();
    const phSessionId = request.headers.get("X-PostHog-Session-Id") || undefined;

    if (result.kind === "paid_zero") {
      posthog.capture({
        distinctId: user.id,
        event: "checkout_zero_amount",
        properties: { $session_id: phSessionId, registration_id: registrationId, discount_code: discountCode },
      });
      return new Response(
        JSON.stringify({
          success: true,
          message: "Registration complete - no payment required after discount",
          discountApplied: true,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // kind === "stripe_session"
    posthog.capture({
      distinctId: user.id,
      event: "checkout_initiated",
      properties: {
        $session_id: phSessionId,
        registration_id: registrationId,
        stripe_session_id: result.sessionId,
        discount_code: discountCode,
      },
    });
    return new Response(
      JSON.stringify({
        clientSecret: result.clientSecret,
        sessionId: result.sessionId,
        publishableKey: import.meta.env.STRIPE_PUBLISHABLE_KEY,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    if (error instanceof CheckoutError) {
      return new Response(
        JSON.stringify({
          error: error.message,
          ...(error.code ? { code: error.code } : {}),
        }),
        { status: error.status, headers: { "Content-Type": "application/json" } },
      );
    }

    console.error("Error creating checkout session:", error);

    const e = error as { type?: string; message?: string };
    const stripeType =
      typeof e?.type === "string" && e.type.startsWith("Stripe") ? e.type : null;

    if (stripeType === "StripeAuthenticationError") {
      return new Response(
        JSON.stringify({
          error:
            "Payment processing is not configured correctly. Please contact support — your registration is saved and you won't be charged twice when payments come back online.",
          code: "stripe_auth_error",
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    if (stripeType) {
      return new Response(
        JSON.stringify({
          error:
            "We couldn't start your payment. Please try again in a moment — your registration is saved.",
          code: "stripe_error",
        }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        error:
          "Something went wrong starting your payment. Your registration is saved; please try again.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
