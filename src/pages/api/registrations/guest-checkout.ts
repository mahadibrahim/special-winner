import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  users,
  familyMembers as familyMembersTable,
} from "@/lib/db/schema";
import {
  createRegistration,
  RegistrationError,
} from "@/lib/registrations/create-registration";
import {
  createCheckoutForRegistration,
  CheckoutError,
} from "@/lib/payments/create-checkout-for-registration";
import { upsertGuestUser } from "@/lib/registrations/upsert-guest-user";
import { createSession } from "@/lib/auth";
import { getPostHogServer, flushPostHog } from "@/lib/posthog-server";
import { resolvePerson } from "@/lib/registrations/resolve-person";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import {
  recordConsent,
  recordDefaultMediaAuth,
  hasActiveConsent,
} from "@/lib/consents/record";
import { collectAdAttribution, parsePhDistinctId } from "@/lib/analytics/parse-cookies";
import { fireRegistrationCreatedConversion } from "@/lib/analytics/server-conversions";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { recordPhoneOptIn } from "@/lib/sms/opt-in";
import { sendMagicLinkLoginEmail } from "@/lib/email/send";
import { awaitEmailSend } from "@/lib/notifications/await-dispatch";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { recordLiabilityWaiver } from "@/lib/consents/liability";
import { wizardWaiverAssentText } from "@/lib/registrations/waiver-text";

const guestRegistrantSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  // v2 defers DOB to the post-payment completion step (Task 8).
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  isSelf: z.literal(true),
  gender: z.enum(["male", "female", "other"]).optional(),
});

const mediaAuthOptOutsSchema = z
  .array(z.enum(["internal", "promotional", "public"]))
  .optional();

// Parent + child shape — the YOUTH path. The child's DOB stays required (it
// decides age-group eligibility and is collected before payment), but the
// waiver moved to the post-payment completion step for youth too, so
// waiverSignedBy is now conditional: required iff waiverSigned === true.
// Same rule, same superRefine as the adult self shape below.
const legacyGuestCheckoutSchema = z
  .object({
    seasonId: z.string().uuid(),
    parent: z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
    }),
    child: z.object({
      firstName: z.string().min(1),
      lastName: z.string().min(1),
      birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      gender: z.enum(["male", "female", "other"]).optional(),
    }),
    registrationType: z.enum(["full", "deposit"]),
    waiverSigned: z.boolean(),
    waiverSignedBy: z.string().min(1).optional(),
    discountCode: z.string().optional(),
    lookingForTeam: z.boolean().optional(),
    teamToken: z.string().max(64).optional(),
    mediaAuthOptOuts: mediaAuthOptOutsSchema,
    paymentMethodCategory: z.enum(["bank", "card"]).optional(),
    // SMS consent checkbox next to the phone field (unchecked by default).
    // Only meaningful when a phone is provided.
    smsConsent: z.boolean().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.waiverSigned && !d.waiverSignedBy?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["waiverSignedBy"],
        message: "Signature required when signing the waiver",
      });
    }
  });

// New adult self shape (v2: waiver/signature deferred to a post-payment
// completion step — see docs/superpowers/plans/2026-07-22-checkout-redesign-
// wave1-solo.md Task 6/8). waiverSignedBy is only required when the client
// actually claims the waiver was signed at checkout time.
const adultGuestCheckoutSchema = z
  .object({
    seasonId: z.string().uuid(),
    registrant: guestRegistrantSchema,
    registrationType: z.enum(["full", "deposit"]),
    waiverSigned: z.boolean(),
    waiverSignedBy: z.string().min(1).optional(),
    discountCode: z.string().optional(),
    lookingForTeam: z.boolean().optional(),
    teamToken: z.string().max(64).optional(),
    mediaAuthOptOuts: mediaAuthOptOutsSchema,
    paymentMethodCategory: z.enum(["bank", "card"]).optional(),
    smsConsent: z.boolean().optional(),
  })
  .superRefine((d, ctx) => {
    if (d.waiverSigned && !d.waiverSignedBy?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["waiverSignedBy"],
        message: "Signature required when signing the waiver",
      });
    }
  });

export const guestCheckoutSchema = z.union([
  legacyGuestCheckoutSchema,
  adultGuestCheckoutSchema,
]);

export const POST: APIRoute = async (context) => {
  const { request, url, clientAddress } = context;
  const posthog = getPostHogServer();
  const phSessionId = request.headers.get("X-PostHog-Session-Id") || undefined;
  // The browser's anonymous PostHog distinct id. Guests never call identify
  // client-side (the account is created here, after the fact), so events
  // keyed to the DB user id land on a separate person and funnels can't
  // join. Capturing against the browser id — and aliasing it to the user id
  // once one exists — keeps the whole journey on one person.
  const phClientId = parsePhDistinctId(request.headers.get("cookie"));
  const userAgent = request.headers.get("user-agent");

  // Per-IP throttle: this endpoint is unauthenticated and creates Stripe
  // PaymentIntents + upserts users, so it's a card-testing / enumeration
  // surface. 5/min/IP matches the dropin guest-checkout limit and is well
  // above any legitimate human checkout rate. (Limiter is in-memory/per-
  // instance/fail-open — see rate-limit.ts; a durable shared store is the
  // real fix, tracked as a follow-up.)
  const ip = clientAddress || "unknown";
  const ipLimit = rateLimit(`registration-guest:ip:${ip}`, 5, 60_000);
  if (!ipLimit.allowed) {
    return rateLimitedResponse(ipLimit.retryAfter ?? 60);
  }

  try {
    const body = await request.json();
    const parsed = guestCheckoutSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const data = parsed.data;
    const db = getDb();
    // Storefront the charge came through — brands share one org and one
    // Stripe account, so the request host is the only brand signal.
    const brand = brandFromHost(request.headers.get("host") ?? "");

    // Capture GA4 client_id + ad-platform IDs (gclid, fbclid, _fbc, _fbp) to
    // pass through the PaymentIntent metadata so the webhook
    // (handle-registration-payment-succeeded.ts) can fire server-side GA4
    // Measurement Protocol + Meta Conversions API purchase events.
    const analyticsMetadata: Record<string, string> = {
      via_guest_checkout: "true",
      brand,
      ...collectAdAttribution(url, request.headers.get("cookie")),
      // PostHog session id, read back by the webhook so payment_completed
      // carries the same $session_id as the rest of the funnel — the piece
      // that lets a session-aggregated funnel link landing → payment.
      ...(phSessionId ? { ph_session_id: phSessionId } : {}),
    };

    // -------------------------------------------------------------------------
    // Shared helper: run registration + Stripe checkout + session cookie.
    // Mirrors Steps 3-5 from the original handler.
    // -------------------------------------------------------------------------
    async function runCheckout(opts: {
      userRow: typeof users.$inferSelect;
      familyMemberRow: (typeof familyMembersTable.$inferSelect);
      personKind: "self" | "dependent";
      seasonId: string;
      registrationType: "full" | "deposit";
      waiverSigned: boolean;
      waiverSignedBy: string;
      discountCode?: string;
      wasNewUser: boolean;
      distinctIdForPosthog: string;
      lookingForTeam?: boolean;
      teamToken?: string | null;
      mediaAuthOptOuts?: ReadonlyArray<"internal" | "promotional" | "public">;
      extraMetadata: Record<string, string>;
      paymentMethodCategory?: "bank" | "card";
      /** Phone the registrant supplied, if any — gates the SMS opt-in write. */
      phone?: string | null;
      /** SMS consent checkbox state (unchecked by default; see SmsConsentCheckbox). */
      smsConsent: boolean;
    }) {
      const {
        userRow,
        familyMemberRow,
        personKind,
        seasonId,
        registrationType,
        waiverSigned,
        waiverSignedBy,
        discountCode,
        wasNewUser,
        distinctIdForPosthog,
        lookingForTeam,
        teamToken,
        mediaAuthOptOuts,
        extraMetadata,
        paymentMethodCategory,
        phone,
        smsConsent,
      } = opts;
      void distinctIdForPosthog;

      // Step 3: create the registration via shared helper
      let regResult;
      try {
        regResult = await createRegistration({
          db,
          user: {
            id: userRow.id,
            email: userRow.email,
            firstName: userRow.firstName,
          },
          familyMember: familyMemberRow,
          seasonId,
          registrationType,
          waiverSigned,
          waiverSignedBy,
          lookingForTeam: lookingForTeam ?? false,
          teamToken: teamToken ?? null,
          brand,
        });
      } catch (err) {
        if (err instanceof RegistrationError) {
          if (err.code === "already_registered") {
            // Guest already has a live registration for this person+season.
            // Nudge them to their existing account with the same magic-link
            // login email the post-payment webhook sends new guests — the
            // "manage link" from the funnel-friction proposal. This is
            // best-effort and rate-limited per user; it must never change
            // the 409 below (disclosure rule: the response itself never
            // reveals whether an email was sent).
            const manageLinkGate = rateLimit(
              `already-registered-link:${userRow.id}`,
              1,
              10 * 60_000,
            );
            if (manageLinkGate.allowed) {
              try {
                const link = await createMagicLink({
                  userId: userRow.id,
                  purpose: "login",
                  purposeContext: { redirectTo: "/dashboard" },
                  deliveredChannel: "email",
                  deliveredTo: userRow.email,
                });
                // Awaited (not truly un-awaited fire-and-forget): Netlify
                // freezes the function instance once the response is sent,
                // so an un-awaited send here would be abandoned mid-flight
                // (see await-dispatch.ts). Errors are caught below and never
                // surface to the caller.
                await awaitEmailSend("already-registered manage link", () =>
                  sendMagicLinkLoginEmail({
                    userId: userRow.id,
                    parentEmail: userRow.email,
                    parentName: userRow.firstName || userRow.email.split("@")[0],
                    magicLinkUrl: buildMagicLinkUrl(link.token, {
                      origin: url.origin,
                    }),
                    expiresIn: "15 minutes",
                    brand,
                    // This recipient already HAS an account — the welcome
                    // variant's "we created an account for you" read wrong
                    // here (#457).
                    variant: "existing",
                  }),
                );
              } catch (emailErr) {
                console.error(
                  "[guest-checkout] already-registered manage-link failed:",
                  emailErr,
                );
              }
            }
          }
          // Failure telemetry — the guest path had none, which let a checkout-
          // blocking bug (StripeIdempotencyError on resumed retries) lose two
          // real customers invisibly in launch week while the authed path's
          // checkout_create_failed made the same bug visible. Mirrors that
          // event's role; `stage` + `code` say where and why.
          posthog.capture({ distinctId: phClientId || userRow.id, event: "guest_checkout_failed", properties: { $session_id: phSessionId, stage: "registration", code: err.code, status: err.status, message: err.message, season_id: seasonId, brand, user_id: userRow.id } });
          await flushPostHog();
          return new Response(
            JSON.stringify(
              err.code
                ? { error: err.message, code: err.code }
                : { error: err.message },
            ),
            {
              status: err.status,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        throw err;
      }

      // Meta CompleteRegistration — once per new registration row (resumed
      // drafts excluded), event_id = registration id.
      if (regResult.kind !== "resumed") {
        fireRegistrationCreatedConversion({
          request,
          registrationId: regResult.registration.id,
          brand,
          email: userRow.email,
          phone: phone ?? userRow.phone,
          firstName: userRow.firstName,
          lastName: userRow.lastName,
          userId: userRow.id,
          seasonId,
        });
      }

      // Record SMS opt-in state for a supplied phone: opted_in only when the
      // customer checked the consent box, else a pending row (never downgrades
      // an existing opted_in). Reuses the org createRegistration already
      // resolved. Best-effort — a failure here must not block checkout.
      if (phone && regResult.organizationId) {
        try {
          await recordPhoneOptIn({
            db,
            organizationId: regResult.organizationId,
            userId: userRow.id,
            phone,
            consented: smsConsent,
            source: "registration_form",
          });
        } catch (err) {
          console.error("Failed to record phone opt-in:", err);
        }
      }

      if (regResult.kind !== "resumed" && waiverSigned) {
        // organizationId was already resolved inside createRegistration —
        // thread it through instead of re-querying the same season→org join.
        const baseConsent = {
          db,
          familyMemberId: familyMemberRow.id,
          registrationId: regResult.registration.id,
          organizationId: regResult.organizationId,
          signedByUserId: userRow.id,
          signedByName: waiverSignedBy,
          ipAddress: clientAddress ?? null,
          userAgent: userAgent ?? null,
        };
        const personalConsentType =
          personKind === "self" ? "age_confirmation" : "parental";
        const needsPersonalConsent = !(await hasActiveConsent(
          db,
          familyMemberRow.id,
          personalConsentType,
        ));
        // ANNUAL WAIVER, write side. `waiverOnFile` means createRegistration
        // stamped the row from an existing signature, so per its caller
        // contract nothing is appended to the liability log here — that branch
        // is a READ. Only a genuinely fresh signature writes. The org-less
        // season case keeps the legacy `recordConsent` write (the org-scoped
        // helper cannot be called without an org) so the audit row still exists.
        const liabilityWrite = regResult.waiverOnFile
          ? Promise.resolve()
          : regResult.organizationId
            ? recordLiabilityWaiver(
                {
                  familyMemberId: familyMemberRow.id,
                  organizationId: regResult.organizationId,
                  registrationId: regResult.registration.id,
                  signedByUserId: userRow.id,
                  signedByName: waiverSignedBy,
                  consentVariant: personKind === "self" ? "adult" : "guardian",
                  // The exact words waiver-step.tsx put on screen. This is the
                  // GUEST endpoint, and the wizard's `isGuest` drives both the
                  // screen variant and the endpoint choice — so a dependent
                  // here always saw the guest+child checkbox (which names the
                  // child and shows no body paragraph).
                  consentText: wizardWaiverAssentText({
                    variant: personKind === "self" ? "adult" : "guardian",
                    participantName:
                      `${familyMemberRow.firstName} ${familyMemberRow.lastName}`.trim(),
                    isGuestChild: personKind !== "self",
                  }),
                  ipAddress: clientAddress ?? null,
                  userAgent: userAgent ?? null,
                },
                db,
              )
            : recordConsent({ ...baseConsent, type: "liability" });

        // Independent inserts (different consent rows, no shared uniqueness
        // constraint) — run them concurrently.
        await Promise.all([
          needsPersonalConsent
            ? recordConsent({ ...baseConsent, type: personalConsentType })
            : Promise.resolve(),
          liabilityWrite,
          recordDefaultMediaAuth({
            ...baseConsent,
            optOutScopes: mediaAuthOptOuts ?? [],
          }),
        ]);
      }

      // Step 4: if waitlisted (no payment), set session cookie for new users and return
      if (regResult.kind === "waitlisted") {
        if (wasNewUser) {
          await createSession(userRow.id, context);
        }
        return new Response(
          JSON.stringify({
            waitlisted: true,
            registrationId: regResult.registration.id,
            // Whether the participant's ANNUAL waiver already covers this
            // registration. The confirm screen's completion form uses it to
            // drop the waiver text and signature box (the server would
            // discard that signature anyway).
            waiverOnFile: regResult.waiverOnFile,
            wasNewUser,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Step 4b: zero-due registrations (captain deposit credit) are already
      // finalized inside createRegistration — no Stripe session to create.
      // Without this guard, createCheckoutForRegistration would 400 on the
      // already-paid row.
      if (!regResult.requiresPayment) {
        if (wasNewUser) {
          await createSession(userRow.id, context);
        }
        return new Response(
          JSON.stringify({
            paid: true,
            registrationId: regResult.registration.id,
            // Whether the participant's ANNUAL waiver already covers this
            // registration. The confirm screen's completion form uses it to
            // drop the waiver text and signature box (the server would
            // discard that signature anyway).
            waiverOnFile: regResult.waiverOnFile,
            wasNewUser,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Step 5: create Stripe checkout session
      try {
        const checkout = await createCheckoutForRegistration({
          db,
          registrationId: regResult.registration.id,
          userId: userRow.id,
          baseUrl: url.origin,
          discountCode,
          extraMetadata,
          paymentMethodCategory,
        });

        // Account-takeover prevention: only set Lucia session for genuinely new users
        if (wasNewUser) {
          await createSession(userRow.id, context);
        }

        if (phClientId && phClientId !== userRow.id) {
          // Merge the anonymous browser person into the user person so the
          // pre-checkout journey and later server events unify (mirrors
          // capturePaymentCompleted in payment-telemetry.ts).
          posthog.alias({ distinctId: phClientId, alias: userRow.id });
        }
        posthog.identify({ distinctId: userRow.id, properties: { email: userRow.email, firstName: userRow.firstName, lastName: userRow.lastName } });
        posthog.capture({ distinctId: phClientId || userRow.id, event: "payment_form_reached", properties: { $session_id: phSessionId, season_id: seasonId, registration_id: regResult.registration.id, was_new_user: wasNewUser, discount_code: discountCode, paid_zero: checkout.kind === "paid_zero", brand, user_id: userRow.id, audience: personKind === "self" ? "adult" : "youth" } });
        // Deliver before returning — Netlify freezes the instance after the
        // response, which can drop in-flight capture requests.
        await flushPostHog();

        if (checkout.kind === "paid_zero") {
          return new Response(
            JSON.stringify({
              paid: true,
              registrationId: regResult.registration.id,
              // Whether the participant's ANNUAL waiver already covers this
              // registration. The confirm screen's completion form uses it to
              // drop the waiver text and signature box (the server would
              // discard that signature anyway).
              waiverOnFile: regResult.waiverOnFile,
              wasNewUser,
              amountDueCents: regResult.registration.amountDueCents,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            clientSecret: checkout.clientSecret,
            sessionId: checkout.sessionId,
            surchargeCents: checkout.surchargeCents,
            // Guest camp checkout can carry an automatic member discount too
            // (the child's membership, not the payer's) — surface it so the
            // payment step can show the same "member discount applied" line
            // the signed-in flow shows via /api/payments/create-checkout.
            memberDiscountCents: checkout.memberDiscountCents,
            memberDiscountPct: checkout.memberDiscountPct,
            publishableKey: import.meta.env.STRIPE_PUBLISHABLE_KEY,
            wasNewUser,
            // Lets the wizard record the client-confirmed payment signal
            // (webhook-lag bridge) against the right registration.
            registrationId: regResult.registration.id,
            // Whether the participant's ANNUAL waiver already covers this
            // registration. The confirm screen's completion form uses it to
            // drop the waiver text and signature box (the server would
            // discard that signature anyway).
            waiverOnFile: regResult.waiverOnFile,
            amountDueCents: regResult.registration.amountDueCents,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      } catch (err) {
        if (err instanceof CheckoutError) {
          // See the registration-stage capture above — same visibility rule
          // for Stripe-checkout-stage failures (this is the branch the
          // idempotency-drift 500s surfaced through).
          posthog.capture({ distinctId: phClientId || userRow.id, event: "guest_checkout_failed", properties: { $session_id: phSessionId, stage: "stripe_checkout", status: err.status, message: err.message, season_id: seasonId, registration_id: regResult.registration.id, brand, user_id: userRow.id } });
          await flushPostHog();
          return new Response(JSON.stringify({ error: err.message }), {
            status: err.status,
            headers: { "Content-Type": "application/json" },
          });
        }
        throw err;
      }
    }

    // -------------------------------------------------------------------------
    // ADULT SELF PATH
    // -------------------------------------------------------------------------
    if ("registrant" in data) {
      const r = data.registrant;
      // audience: "adult" — this branch is definitionally personKind "self"
      // (it calls runCheckout with personKind:"self" below), so the literal is
      // already the personKind derivation, just written before resolvePerson
      // runs. Deriving it "properly" would mean moving the funnel's first
      // event behind two awaits that can throw, which would lose the event on
      // exactly the failures it exists to make visible. Left as a literal.
      posthog.capture({ distinctId: phClientId || r.email.toLowerCase().trim(), event: "guest_checkout_started", properties: { $session_id: phSessionId, season_id: data.seasonId, registration_type: data.registrationType, brand, email: r.email.toLowerCase().trim(), audience: "adult" } });

      const { userRow, wasNewUser } = await upsertGuestUser(db, {
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
        phone: r.phone,
        birthDate: r.birthDate ?? null,
      });

      // resolve self person (find-or-create the self-row on family_members)
      const familyMemberRow = await resolvePerson(db, {
        kind: "self",
        user: {
          id: userRow.id,
          firstName: userRow.firstName ?? r.firstName,
          lastName: userRow.lastName ?? r.lastName,
          birthDate: userRow.birthDate ?? r.birthDate ?? null,
          gender: r.gender ?? null,
        },
      });

      return runCheckout({
        userRow,
        familyMemberRow,
        personKind: "self",
        seasonId: data.seasonId,
        registrationType: data.registrationType,
        waiverSigned: data.waiverSigned,
        waiverSignedBy: data.waiverSignedBy ?? "",
        discountCode: data.discountCode,
        wasNewUser,
        distinctIdForPosthog: userRow.email,
        lookingForTeam: data.lookingForTeam ?? false,
        teamToken: data.teamToken ?? null,
        mediaAuthOptOuts: data.mediaAuthOptOuts,
        extraMetadata: analyticsMetadata,
        paymentMethodCategory: data.paymentMethodCategory,
        phone: r.phone ?? null,
        smsConsent: data.smsConsent === true,
      });
    }

    // -------------------------------------------------------------------------
    // PARENT + CHILD PATH (youth)
    // -------------------------------------------------------------------------
    // audience: "youth" — the purchaser is the parent, the player is the
    // dependent. Segments youth funnels from adult ones without a
    // season-id lookup table. This branch is definitionally personKind
    // "dependent" (see the runCheckout call below), so the literal already
    // matches the personKind derivation — and it's why the youth wizard must
    // keep posting the parent+child SHAPE even now that its waiver is
    // deferred: the shape is what selects this branch, and this branch is
    // what keeps the funnel's audience segmentation intact.
    posthog.capture({ distinctId: phClientId || data.parent.email.toLowerCase().trim(), event: "guest_checkout_started", properties: { $session_id: phSessionId, season_id: data.seasonId, registration_type: data.registrationType, brand, email: data.parent.email.toLowerCase().trim(), audience: "youth" } });

    const { userRow, wasNewUser } = await upsertGuestUser(db, {
      email: data.parent.email,
      firstName: data.parent.firstName,
      lastName: data.parent.lastName,
      phone: data.parent.phone,
    });

    // Step 2: resolve family member (find-or-create the dependent row,
    // deduped by parent + lower(name) + DOB). Use the shared resolvePerson
    // helper rather than an inline SELECT-then-INSERT so all family_members
    // creation goes through one code path (matches the adult-self branch
    // above and the project convention).
    const familyMemberRow = await resolvePerson(db, {
      kind: "dependent",
      parentUserId: userRow.id,
      firstName: data.child.firstName,
      lastName: data.child.lastName,
      birthDate: data.child.birthDate,
      gender: data.child.gender || null,
    });

    return runCheckout({
      userRow,
      familyMemberRow,
      personKind: "dependent",
      seasonId: data.seasonId,
      registrationType: data.registrationType,
      waiverSigned: data.waiverSigned,
      // Empty when the waiver is deferred (waiverSigned:false) — the consent
      // block below is gated on waiverSigned, so no unsigned row records a
      // signature. Mirrors the adult-self branch above.
      waiverSignedBy: data.waiverSignedBy ?? "",
      discountCode: data.discountCode,
      wasNewUser,
      distinctIdForPosthog: userRow.email,
      teamToken: data.teamToken ?? null,
      mediaAuthOptOuts: data.mediaAuthOptOuts,
      extraMetadata: analyticsMetadata,
      paymentMethodCategory: "paymentMethodCategory" in data ? data.paymentMethodCategory : undefined,
      phone: data.parent.phone ?? null,
      smsConsent: data.smsConsent === true,
    });
  } catch (error) {
    console.error("Error in guest-checkout:", error);
    try {
      // Unhandled-stage failure telemetry (fail-soft; never mask the 500).
      posthog.capture({
        distinctId: phClientId || "guest-checkout-server",
        event: "guest_checkout_failed",
        properties: {
          $session_id: phSessionId,
          stage: "unhandled",
          message: error instanceof Error ? error.message : String(error),
        },
      });
      await flushPostHog();
    } catch {
      // telemetry must never change the response
    }
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
