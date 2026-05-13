import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { z } from "zod";
import {
  createCheckoutForRegistration,
  CheckoutError,
} from "@/lib/payments/create-checkout-for-registration";
import { getPostHogServer } from "@/lib/posthog-server";
import { parseGaClientId, readQueryOrCookie } from "@/lib/analytics/parse-cookies";

const checkoutSchema = z.object({
  registrationId: z.string().uuid("Invalid registration ID"),
  discountCode: z.string().optional(),
  paymentMethodCategory: z.enum(["bank", "card"]).optional(),
});

export const POST: APIRoute = async ({ request, locals, url }) => {
  // Hoisted so the catch block can include them in diagnostic capture.
  let registrationIdForLog: string | undefined;
  let discountCodeForLog: string | undefined;

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

    const { registrationId, discountCode, paymentMethodCategory } = validation.data;
    registrationIdForLog = registrationId;
    discountCodeForLog = discountCode;
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
      paymentMethodCategory,
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
        surchargeCents: result.surchargeCents,
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

    // Diagnostic capture — pull Stripe-error shape so prod failures are
    // pinpointable from logs + PostHog without scraping function logs.
    const e = error as {
      type?: string;
      code?: string;
      message?: string;
      statusCode?: number;
      requestId?: string;
      decline_code?: string;
      param?: string;
      raw?: { code?: string; message?: string };
    };
    const stripeType =
      typeof e?.type === "string" && e.type.startsWith("Stripe") ? e.type : null;

    const diag = {
      stripe_type: stripeType,
      stripe_code: e?.code ?? e?.raw?.code,
      stripe_decline_code: e?.decline_code,
      stripe_param: e?.param,
      stripe_request_id: e?.requestId,
      stripe_status: e?.statusCode,
      message: e?.message ?? e?.raw?.message,
      registration_id: registrationIdForLog,
      discount_code: discountCodeForLog,
      user_id: locals.user?.id,
    };
    console.error("[create-checkout] failed", JSON.stringify(diag));

    try {
      const posthog = getPostHogServer();
      posthog.capture({
        distinctId: locals.user?.id ?? "anonymous",
        event: "checkout_create_failed",
        properties: diag,
      });
    } catch {
      // never let telemetry mask the original error
    }

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
