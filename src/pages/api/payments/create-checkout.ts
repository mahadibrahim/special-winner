import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { z } from "zod";
import {
  createCheckoutForRegistration,
  CheckoutError,
} from "@/lib/payments/create-checkout-for-registration";
import { getPostHogServer } from "@/lib/posthog-server";
import { collectAdAttribution } from "@/lib/analytics/parse-cookies";
import { brandFromHost } from "@/lib/organization/soccerone-routing";

const checkoutSchema = z.object({
  registrationId: z.string().uuid("Invalid registration ID"),
  discountCode: z.string().optional(),
  paymentMethodCategory: z.enum(["bank", "card"]).optional(),
  /** Apply the user's account credit balance to this checkout. The server
   *  computes min(balance, amountDue) — no amount is ever accepted from
   *  the client. */
  applyAccountCredit: z.boolean().optional(),
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

    const { registrationId, discountCode, paymentMethodCategory, applyAccountCredit } =
      validation.data;
    registrationIdForLog = registrationId;
    discountCodeForLog = discountCode;
    const db = getDb();

    // Capture GA4 client_id + ad-platform IDs (gclid, fbclid, _fbc, _fbp) to
    // pass through the PaymentIntent metadata so the webhook
    // (handle-registration-payment-succeeded.ts) can fire server-side GA4
    // Measurement Protocol + Meta Conversions API purchase events.
    //
    // Storefront the charge came through — the brands share one org and
    // one Stripe account, so the request host is the only brand signal.
    const phSessionId = request.headers.get("X-PostHog-Session-Id") || undefined;
    const extraMetadata: Record<string, string> = {
      brand: brandFromHost(request.headers.get("host") ?? ""),
      ...collectAdAttribution(url, request.headers.get("cookie")),
      // PostHog session id, read back by the webhook so payment_completed
      // carries the same $session_id as the client-side funnel events.
      ...(phSessionId ? { ph_session_id: phSessionId } : {}),
    };

    const result = await createCheckoutForRegistration({
      db,
      registrationId,
      userId: user.id,
      baseUrl: url.origin,
      discountCode,
      extraMetadata,
      paymentMethodCategory,
      applyAccountCredit,
    });

    const posthog = getPostHogServer();

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
          creditAppliedCents: result.creditAppliedCents,
          memberDiscountCents: result.memberDiscountCents,
          // Pct rides along with the cents so a zero-due confirmation can say
          // "your 10% member discount" without a second lookup — matches the
          // stripe_session response below.
          memberDiscountPct: result.memberDiscountPct,
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
        creditAppliedCents: result.creditAppliedCents,
        memberDiscountCents: result.memberDiscountCents,
        memberDiscountPct: result.memberDiscountPct,
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
