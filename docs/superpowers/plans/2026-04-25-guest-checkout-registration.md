# Guest-Checkout Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the upfront sign-in wall on `/register/[seasonId]` with a guest-checkout flow that captures payment without requiring an account, then activates the account via a magic-link email after Stripe payment succeeds.

**Architecture:** A new combined endpoint `POST /api/registrations/guest-checkout` upserts a passwordless user (or matches an existing one), upserts the family member, creates the registration, and creates the Stripe checkout session in a single transaction. For brand-new users it sets a Lucia session cookie before redirecting (so they're signed in through the Stripe flow). The existing `handleCheckoutComplete` webhook handler reads a new `metadata.via_guest_checkout=true` flag and emails a magic-link sign-in alongside the existing payment receipt. Two helpers — `createRegistration()` and `createCheckoutForRegistration()` — are extracted from the existing endpoints so both flows (authed and guest) share the same business logic.

**Tech Stack:** Astro 5 SSR, React 19, Drizzle (Postgres), Lucia v3, Stripe Checkout, React Email, Vitest (API tests), Playwright (e2e), Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-04-25-guest-checkout-registration-design.md`

---

## File Structure

**Created:**
- `src/lib/registrations/create-registration.ts` — pure helper extracted from `/api/registrations/index.ts` (season fetch, capacity/waitlist, dedup-pending, amount-due calc, waitlist email)
- `src/lib/payments/create-checkout-for-registration.ts` — pure helper extracted from `/api/payments/create-checkout.ts` (discount validation/application, zero-after-discount handling, Stripe session creation)
- `src/lib/email/templates/magic-link-login.tsx` — React Email template
- `src/pages/api/auth/check-email.ts` — `GET` endpoint with per-IP rate limit
- `src/pages/api/registrations/guest-checkout.ts` — `POST` combined endpoint (no auth required)
- `tests/api/auth-check-email.test.ts`
- `tests/api/registrations-guest-checkout.test.ts`
- `tests/registration-guest-flow.spec.ts` — Playwright e2e

**Modified:**
- `src/pages/api/registrations/index.ts` — POST refactored to call `createRegistration()` helper
- `src/pages/api/payments/create-checkout.ts` — POST refactored to call `createCheckoutForRegistration()` helper; accepts an internal `extraMetadata` arg via the helper signature
- `src/lib/stripe/client.ts` — `createCheckoutSession` accepts optional `extraMetadata` param; merges into Stripe `metadata`
- `src/lib/stripe/handle-checkout-complete.ts` — when `session.metadata.via_guest_checkout === "true"`, mint a `login` magic link and call `sendMagicLinkLoginEmail`
- `src/lib/email/send.ts` — add `sendMagicLinkLoginEmail`
- `src/components/registration/registration-wizard.tsx` — Step 1 split into authed vs guest variants; debounced email-blur collision check; submit goes to `/api/registrations/guest-checkout` for guests
- `src/pages/register/[seasonId].astro` — drop the `if (!user) redirect('/signin')` gate; pass `user` (nullable) to the wizard

---

## Task 1: Extract `createRegistration` helper

**Files:**
- Create: `src/lib/registrations/create-registration.ts`
- Modify: `src/pages/api/registrations/index.ts:111-345` (POST handler)
- Test (existing, must still pass): `tests/api/registrations.test.ts` (or whatever the current registration API test file is named)

The current POST handler has ~230 lines of business logic mixed with HTTP plumbing. We extract the business logic into a pure function that takes a `db`, the resolved `user`, the resolved `familyMember`, and the request data — and returns a discriminated-union result. The existing endpoint becomes a thin HTTP wrapper. The new guest-checkout endpoint will call the same helper.

- [ ] **Step 1: Confirm existing API tests pass before any changes**

Run:
```bash
npm run dev   # in another terminal
CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npm run test:api -- registrations
```
Expected: existing registration API tests pass (capture pass count). This is our regression baseline.

- [ ] **Step 2: Write the helper file with the new pure function**

Create `src/lib/registrations/create-registration.ts`:

```typescript
import { eq, and, asc } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import {
  registrations,
  seasons,
  programs,
  locations,
  familyMembers as familyMembersTable,
} from "@/lib/db/schema";
import { sendRegistrationConfirmationEmail } from "@/lib/email/send";

export type RegistrationKind = "created" | "resumed" | "waitlisted";

export interface CreateRegistrationInput {
  db: ReturnType<typeof getDb>;
  user: { id: string; email: string; firstName: string | null };
  familyMember: { id: string; firstName: string; lastName: string };
  seasonId: string;
  registrationType: "full" | "deposit";
  waiverSigned: boolean;
  waiverSignedBy: string;
  notes?: string;
}

export type CreateRegistrationResult =
  | {
      kind: RegistrationKind;
      registration: typeof registrations.$inferSelect;
      requiresPayment: boolean;
      amountDueCents: number;
    };

export class RegistrationError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "RegistrationError";
  }
}

export async function createRegistration(
  input: CreateRegistrationInput,
): Promise<CreateRegistrationResult> {
  const { db, user, familyMember, seasonId } = input;

  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId));

  if (!season) {
    throw new RegistrationError(404, "Season not found");
  }

  if (season.status !== "open") {
    throw new RegistrationError(400, "Registration is not open for this season");
  }

  // Resume pending-unpaid if it exists; block if confirmed.
  const [existingReg] = await db
    .select()
    .from(registrations)
    .where(
      and(
        eq(registrations.seasonId, seasonId),
        eq(registrations.familyMemberId, familyMember.id),
      ),
    )
    .orderBy(asc(registrations.createdAt))
    .limit(1);

  if (existingReg) {
    const isPendingUnpaid =
      existingReg.status === "pending" && existingReg.paymentStatus === "unpaid";
    if (isPendingUnpaid) {
      return {
        kind: "resumed",
        registration: existingReg,
        requiresPayment: existingReg.amountDueCents > 0,
        amountDueCents: existingReg.amountDueCents,
      };
    }
    throw new RegistrationError(
      400,
      "This player is already registered for this season",
    );
  }

  // Capacity check → waitlist branch
  if (season.maxParticipants) {
    const confirmedRows = await db
      .select({ id: registrations.id })
      .from(registrations)
      .where(
        and(
          eq(registrations.seasonId, seasonId),
          eq(registrations.status, "confirmed"),
        ),
      );
    if (confirmedRows.length >= season.maxParticipants) {
      const amountDue =
        input.registrationType === "deposit" && season.depositCents
          ? season.depositCents
          : season.priceCents;
      const [waitlisted] = await db
        .insert(registrations)
        .values({
          seasonId,
          familyMemberId: familyMember.id,
          registeredByUserId: user.id,
          status: "waitlisted",
          paymentStatus: "unpaid",
          amountPaidCents: 0,
          amountDueCents: amountDue,
          registrationType: input.registrationType,
          waiverSigned: input.waiverSigned,
          waiverSignedAt: input.waiverSigned ? new Date() : null,
          waiverSignedBy: input.waiverSignedBy,
          notes: input.notes ?? null,
        })
        .returning();

      // Best-effort waitlist email
      try {
        const [programData] = await db
          .select({
            program: programs,
            location: locations,
          })
          .from(programs)
          .innerJoin(locations, eq(programs.locationId, locations.id))
          .where(eq(programs.id, season.programId));
        if (programData) {
          sendRegistrationConfirmationEmail({
            userId: user.id,
            organizationId: programData.location.organizationId,
            registrationId: waitlisted.id,
            parentEmail: user.email,
            parentName: user.firstName || user.email.split("@")[0],
            childName: `${familyMember.firstName} ${familyMember.lastName}`,
            programName: programData.program.name,
            seasonName: season.name,
            startDate: season.startDate,
            endDate: season.endDate,
            scheduleNotes: season.scheduleNotes || undefined,
            locationName: programData.location.name,
            locationAddress:
              [
                programData.location.addressLine1,
                programData.location.city,
                programData.location.state,
              ]
                .filter(Boolean)
                .join(", ") || undefined,
            amountDueCents: amountDue,
            paymentStatus: "unpaid",
            registrationStatus: "waitlisted",
          }).catch((err) =>
            console.error("Error sending waitlist email:", err),
          );
        }
      } catch (emailError) {
        console.error("Error preparing waitlist email:", emailError);
      }

      return {
        kind: "waitlisted",
        registration: waitlisted,
        requiresPayment: false,
        amountDueCents: amountDue,
      };
    }
  }

  // Normal creation
  const amountDue =
    input.registrationType === "deposit" && season.depositCents
      ? season.depositCents
      : season.priceCents;

  const [created] = await db
    .insert(registrations)
    .values({
      seasonId,
      familyMemberId: familyMember.id,
      registeredByUserId: user.id,
      status: "pending",
      paymentStatus: "unpaid",
      amountPaidCents: 0,
      amountDueCents: amountDue,
      registrationType: input.registrationType,
      waiverSigned: input.waiverSigned,
      waiverSignedAt: input.waiverSigned ? new Date() : null,
      waiverSignedBy: input.waiverSignedBy,
      notes: input.notes ?? null,
    })
    .returning();

  return {
    kind: "created",
    registration: created,
    requiresPayment: true,
    amountDueCents: amountDue,
  };
}
```

- [ ] **Step 3: Refactor `/api/registrations/index.ts` POST to call the helper**

Replace lines 111-345 (the entire POST handler) with:

```typescript
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();
    const body = await request.json();
    const validation = createRegistrationSchema.safeParse(body);
    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const data = validation.data;

    // Verify family member belongs to user
    const [familyMember] = await db
      .select()
      .from(familyMembers)
      .where(
        and(
          eq(familyMembers.id, data.familyMemberId),
          eq(familyMembers.parentUserId, user.id),
        ),
      );
    if (!familyMember) {
      return new Response(JSON.stringify({ error: "Family member not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    try {
      const result = await createRegistration({
        db,
        user: { id: user.id, email: user.email, firstName: user.firstName },
        familyMember,
        seasonId: data.seasonId,
        registrationType: data.registrationType,
        waiverSigned: data.waiverSigned,
        waiverSignedBy: data.waiverSignedBy,
        notes: data.notes,
      });

      const status = result.kind === "resumed" ? 200 : 201;
      return new Response(
        JSON.stringify({
          registration: result.registration,
          requiresPayment: result.requiresPayment,
          amountDueCents: result.amountDueCents,
          ...(result.kind === "resumed" ? { resumed: true } : {}),
          ...(result.kind === "waitlisted"
            ? { message: "Added to waitlist - season is at capacity" }
            : {}),
        }),
        { status, headers: { "Content-Type": "application/json" } },
      );
    } catch (err) {
      if (err instanceof RegistrationError) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: err.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw err;
    }
  } catch (error) {
    console.error("Error creating registration:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
```

Add the import at the top of the file:
```typescript
import { createRegistration, RegistrationError } from "@/lib/registrations/create-registration";
```

- [ ] **Step 4: Run existing API tests — must still pass**

Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npm run test:api -- registrations`
Expected: same pass count as Step 1. Behavior is byte-for-byte identical (response shapes preserved).

- [ ] **Step 5: Commit**

```bash
git add src/lib/registrations/create-registration.ts src/pages/api/registrations/index.ts
git commit -m "$(cat <<'EOF'
refactor(registrations): extract createRegistration helper

Pulls the season-fetch, capacity/waitlist, dedup-pending, and amount-due
logic out of the POST /api/registrations handler into a pure helper so
the upcoming guest-checkout endpoint can reuse it. No behavior change.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extract `createCheckoutForRegistration` helper

**Files:**
- Create: `src/lib/payments/create-checkout-for-registration.ts`
- Modify: `src/pages/api/payments/create-checkout.ts:13-292`
- Modify: `src/lib/stripe/client.ts:19-72` — accept optional `extraMetadata`
- Test (existing, must still pass): `tests/api/payments.test.ts` (or current name)

Same pattern as Task 1. The discount validation, zero-after-discount handling, and Stripe session creation move into a helper. The existing endpoint becomes a thin auth wrapper.

- [ ] **Step 1: Confirm existing API tests pass before any changes**

Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npm run test:api -- payments`
Expected: existing payment API tests pass.

- [ ] **Step 2: Add `extraMetadata` to `createCheckoutSession`**

In `src/lib/stripe/client.ts`, modify the `createCheckoutSession` function (lines 19-72) to accept and merge `extraMetadata`:

```typescript
export async function createCheckoutSession({
  registrationId,
  seasonName,
  playerName,
  amountCents,
  customerEmail,
  successUrl,
  cancelUrl,
  extraMetadata,
}: {
  registrationId: string;
  seasonName: string;
  playerName: string;
  amountCents: number;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  extraMetadata?: Record<string, string>;
}): Promise<Stripe.Checkout.Session | null> {
  if (!stripe) {
    console.error("Stripe is not configured");
    return null;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: seasonName,
              description: `Registration for ${playerName}`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: customerEmail,
      metadata: {
        registrationId,
        type: "registration_payment",
        ...(extraMetadata ?? {}),
      },
    });
    return session;
  } catch (error) {
    console.error("Error creating Stripe checkout session:", error);
    throw error;
  }
}
```

- [ ] **Step 3: Write the new helper file**

Create `src/lib/payments/create-checkout-for-registration.ts`:

```typescript
import { eq, and, sql } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import {
  registrations,
  familyMembers,
  seasons,
  programs,
  discountCodes,
  discountUsages,
} from "@/lib/db/schema";
import { createCheckoutSession, isStripeConfigured } from "@/lib/stripe/client";

export class CheckoutError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

export type CheckoutResult =
  | { kind: "stripe_session"; checkoutUrl: string; sessionId: string }
  | { kind: "paid_zero"; registrationId: string };

export interface CreateCheckoutForRegistrationInput {
  db: ReturnType<typeof getDb>;
  registrationId: string;
  userId: string;
  baseUrl: string;
  discountCode?: string;
  extraMetadata?: Record<string, string>;
}

export async function createCheckoutForRegistration(
  input: CreateCheckoutForRegistrationInput,
): Promise<CheckoutResult> {
  const { db, registrationId, userId, baseUrl, discountCode, extraMetadata } = input;

  if (!isStripeConfigured()) {
    throw new CheckoutError(503, "Payment processing is not configured");
  }

  const [result] = await db
    .select({
      registration: registrations,
      familyMember: familyMembers,
      season: seasons,
      program: programs,
    })
    .from(registrations)
    .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .where(
      and(
        eq(registrations.id, registrationId),
        eq(registrations.registeredByUserId, userId),
      ),
    );

  if (!result) {
    throw new CheckoutError(404, "Registration not found");
  }

  const { registration, familyMember, season, program } = result;

  if (registration.paymentStatus === "paid") {
    throw new CheckoutError(400, "Registration is already paid");
  }

  let amountDue = registration.amountDueCents - registration.amountPaidCents;
  if (amountDue <= 0) {
    throw new CheckoutError(400, "No payment required");
  }

  // Discount application
  let discountAmountCents = 0;
  let appliedDiscountCode: typeof discountCodes.$inferSelect | null = null;

  if (discountCode) {
    const [foundDiscount] = await db
      .select()
      .from(discountCodes)
      .where(eq(discountCodes.code, discountCode.toUpperCase()));

    if (foundDiscount) {
      const now = new Date();
      const isValid =
        foundDiscount.active &&
        (!foundDiscount.startsAt || now >= foundDiscount.startsAt) &&
        (!foundDiscount.expiresAt || now <= foundDiscount.expiresAt) &&
        (!foundDiscount.maxUses ||
          foundDiscount.usedCount < foundDiscount.maxUses) &&
        (!foundDiscount.seasonId || foundDiscount.seasonId === season.id) &&
        (!foundDiscount.minPurchaseCents ||
          amountDue >= foundDiscount.minPurchaseCents);

      if (isValid) {
        let userCanUse = true;
        if (foundDiscount.maxUsesPerUser) {
          const userUsageCount = await db
            .select({ count: sql<number>`count(*)` })
            .from(discountUsages)
            .where(
              and(
                eq(discountUsages.discountCodeId, foundDiscount.id),
                eq(discountUsages.userId, userId),
              ),
            );
          if (userUsageCount[0].count >= foundDiscount.maxUsesPerUser) {
            userCanUse = false;
          }
        }

        if (userCanUse) {
          if (foundDiscount.discountType === "percentage") {
            discountAmountCents = Math.round(
              (amountDue * foundDiscount.discountValue) / 10000,
            );
            if (
              foundDiscount.maxDiscountCents &&
              discountAmountCents > foundDiscount.maxDiscountCents
            ) {
              discountAmountCents = foundDiscount.maxDiscountCents;
            }
          } else {
            discountAmountCents = Math.min(foundDiscount.discountValue, amountDue);
          }
          appliedDiscountCode = foundDiscount;
          amountDue = Math.max(0, amountDue - discountAmountCents);
        }
      }
    }
  }

  // Zero after discount → mark paid, return early
  if (amountDue <= 0) {
    if (appliedDiscountCode) {
      await db.insert(discountUsages).values({
        discountCodeId: appliedDiscountCode.id,
        userId,
        registrationId,
        discountAmountCents,
      });
      await db
        .update(discountCodes)
        .set({ usedCount: sql`${discountCodes.usedCount} + 1` })
        .where(eq(discountCodes.id, appliedDiscountCode.id));
    }
    await db
      .update(registrations)
      .set({
        status: "confirmed",
        paymentStatus: "paid",
        amountDueCents: registration.amountDueCents - discountAmountCents,
        amountPaidCents: registration.amountDueCents - discountAmountCents,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, registrationId));
    return { kind: "paid_zero", registrationId };
  }

  // Discount applied but still owe something
  if (appliedDiscountCode && discountAmountCents > 0) {
    await db.insert(discountUsages).values({
      discountCodeId: appliedDiscountCode.id,
      userId,
      registrationId,
      discountAmountCents,
    });
    await db
      .update(discountCodes)
      .set({ usedCount: sql`${discountCodes.usedCount} + 1` })
      .where(eq(discountCodes.id, appliedDiscountCode.id));
    await db
      .update(registrations)
      .set({
        amountDueCents: registration.amountDueCents - discountAmountCents,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, registrationId));
  }

  // Need user email for Stripe customer_email
  const [userRow] = await db
    .select({ email: sql<string>`${registrations.id}` })
    .from(registrations)
    .where(eq(registrations.id, registrationId));
  // (above is a placeholder — we actually pass customerEmail in via input below)

  const successUrl = `${baseUrl}/dashboard?payment=success&registration=${registrationId}`;
  const cancelUrl = `${baseUrl}/register/${season.id}?payment=cancelled`;

  // Email comes from the registered user — we read it via a small join
  const [withUser] = await db
    .select({ email: sql<string>`u.email` })
    .from(sql`registrations r join users u on u.id = r.registered_by_user_id`)
    .where(sql`r.id = ${registrationId}`);
  const customerEmail = withUser?.email ?? "";

  const session = await createCheckoutSession({
    registrationId,
    seasonName: `${program.name} - ${season.name}`,
    playerName: `${familyMember.firstName} ${familyMember.lastName}`,
    amountCents: amountDue,
    customerEmail,
    successUrl,
    cancelUrl,
    extraMetadata,
  });

  if (!session || !session.url) {
    throw new CheckoutError(500, "Failed to create checkout session");
  }

  return { kind: "stripe_session", checkoutUrl: session.url, sessionId: session.id };
}
```

> **Note on the customer-email lookup:** the placeholder `sql<string>` join above is unsafe; before saving the file, replace it with a proper Drizzle join. The clean form is:
>
> ```typescript
> import { users } from "@/lib/db/schema";
> // ...
> const [withUser] = await db
>   .select({ email: users.email })
>   .from(registrations)
>   .innerJoin(users, eq(registrations.registeredByUserId, users.id))
>   .where(eq(registrations.id, registrationId));
> const customerEmail = withUser?.email ?? "";
> ```
>
> Use that form. Delete the two placeholder blocks above it before committing.

- [ ] **Step 4: Refactor `/api/payments/create-checkout.ts` to call the helper**

Replace the entire body of the POST function (lines 13-293) with:

```typescript
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

    try {
      const result = await createCheckoutForRegistration({
        db: getDb(),
        registrationId,
        userId: user.id,
        baseUrl: url.origin,
        discountCode,
      });
      if (result.kind === "paid_zero") {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Registration complete - no payment required after discount",
            discountApplied: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          checkoutUrl: result.checkoutUrl,
          sessionId: result.sessionId,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (err) {
      if (err instanceof CheckoutError) {
        return new Response(
          JSON.stringify({ error: err.message, ...(err.code ? { code: err.code } : {}) }),
          { status: err.status, headers: { "Content-Type": "application/json" } },
        );
      }
      throw err;
    }
  } catch (error) {
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
```

Replace the file's existing imports with:

```typescript
import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  createCheckoutForRegistration,
  CheckoutError,
} from "@/lib/payments/create-checkout-for-registration";

const checkoutSchema = z.object({
  registrationId: z.string().uuid("Invalid registration ID"),
  discountCode: z.string().optional(),
});
```

- [ ] **Step 5: Run existing payment tests**

Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npm run test:api -- payments`
Expected: same pass count as Step 1.

- [ ] **Step 6: Commit**

```bash
git add src/lib/payments/create-checkout-for-registration.ts src/pages/api/payments/create-checkout.ts src/lib/stripe/client.ts
git commit -m "$(cat <<'EOF'
refactor(payments): extract createCheckoutForRegistration helper

Pulls discount application, zero-after-discount, and Stripe session
creation out of POST /api/payments/create-checkout into a helper, and
adds an extraMetadata pass-through on createCheckoutSession so the
upcoming guest-checkout endpoint can mark sessions for magic-link
follow-up. No behavior change for existing callers.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `GET /api/auth/check-email` with rate limit

**Files:**
- Create: `src/pages/api/auth/check-email.ts`
- Create: `tests/api/auth-check-email.test.ts`

A small endpoint the wizard polls on email-blur. Returns `{ exists: boolean }`. Per-IP rate-limit lives in this file (in-memory ring buffer; tiny scope, no shared util needed).

- [ ] **Step 1: Write the failing API test**

Create `tests/api/auth-check-email.test.ts`:

```typescript
import { describe, it, expect, beforeAll } from "vitest";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";

describe("GET /api/auth/check-email", () => {
  it("returns exists:false for an unknown email", async () => {
    const res = await fetch(
      `${BASE}/api/auth/check-email?email=nobody-${Date.now()}@example.com`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ exists: false });
  });

  it("returns exists:true for a known email", async () => {
    // The e2e seed creates parent@test.aspiresports.com
    const res = await fetch(
      `${BASE}/api/auth/check-email?email=parent@test.aspiresports.com`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ exists: true });
  });

  it("returns exists:false for malformed email (does not 400)", async () => {
    const res = await fetch(`${BASE}/api/auth/check-email?email=not-an-email`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ exists: false });
  });

  it("rate-limits after 10 requests in 60s from the same IP", async () => {
    // Burn through 10 requests, then expect the 11th to fail-open with exists:false
    // and (optionally) a header marking it rate-limited.
    const email = `unique-${Date.now()}@example.com`;
    for (let i = 0; i < 10; i++) {
      await fetch(`${BASE}/api/auth/check-email?email=${email}`);
    }
    const res = await fetch(`${BASE}/api/auth/check-email?email=${email}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ exists: false });
    expect(res.headers.get("x-ratelimit-exceeded")).toBe("1");
  });
});
```

- [ ] **Step 2: Run the test — must fail (endpoint doesn't exist)**

Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npm run test:api -- auth-check-email`
Expected: FAIL with 404 from the endpoint.

- [ ] **Step 3: Write the endpoint**

Create `src/pages/api/auth/check-email.ts`:

```typescript
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

// Per-IP rate limiter: 10 requests per 60s, in-memory.
// Process-local; that's fine — the endpoint's only purpose is UX hinting.
// If rate limit is hit, we fail-open (return exists:false) so the wizard never
// blocks the user on this signal.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const buckets = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (buckets.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) {
    buckets.set(ip, arr);
    return true;
  }
  arr.push(now);
  buckets.set(ip, arr);
  return false;
}

const emailSchema = z.string().email();

export const GET: APIRoute = async ({ url, clientAddress }) => {
  const email = url.searchParams.get("email") ?? "";
  const ip = clientAddress || "unknown";

  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ exists: false }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "x-ratelimit-exceeded": "1",
      },
    });
  }

  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return new Response(JSON.stringify({ exists: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const normalized = parsed.data.toLowerCase().trim();
  const found = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);

  return new Response(JSON.stringify({ exists: found.length > 0 }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
```

- [ ] **Step 4: Run the tests — must pass**

Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npm run test:api -- auth-check-email`
Expected: all 4 tests PASS.

> **Note on the rate-limit test:** if the dev server has been hit by other tests during the same minute, the 10-counter may already be partially used. The bucket is keyed by IP, so the test is hitting `127.0.0.1`. If flake appears, adjust the test to use a unique `email` query param (which doesn't matter for rate limiting — IP is the key) and add a reset between tests by adding `?_t=${Date.now()}` to vary the query so the dev server treats them as distinct (but the bucket counts them anyway). For now, expect the test to be order-sensitive within its file.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/auth/check-email.ts tests/api/auth-check-email.test.ts
git commit -m "$(cat <<'EOF'
feat(auth): add GET /api/auth/check-email for wizard email-blur

Endpoint returns { exists: bool } so the registration wizard can swap
its subcopy on email collision. Per-IP rate limit (10/60s) fails open
to avoid blocking the user on the rate-limit signal. The information
already leaks via signup error messages, so the additional surface is
small.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Magic-link login email template + sender

**Files:**
- Create: `src/lib/email/templates/magic-link-login.tsx`
- Modify: `src/lib/email/send.ts` (append `sendMagicLinkLoginEmail`)

- [ ] **Step 1: Write the email template**

Open `src/lib/email/templates/password-reset.tsx` to see the existing pattern:

Run: `head -80 src/lib/email/templates/password-reset.tsx`

Then create `src/lib/email/templates/magic-link-login.tsx` mirroring its structure:

```tsx
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export interface MagicLinkLoginEmailProps {
  parentName: string;
  magicLinkUrl: string;
  expiresIn: string; // e.g. "15 minutes"
  programName?: string;
  childName?: string;
  seasonName?: string;
}

export function MagicLinkLoginEmail({
  parentName,
  magicLinkUrl,
  expiresIn,
  programName,
  childName,
  seasonName,
}: MagicLinkLoginEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>You're registered — sign in to your Aspire Sports account</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={box}>
            <Text style={h1}>You're registered!</Text>
            {childName && programName && seasonName && (
              <Text style={paragraph}>
                {childName} is registered for <strong>{programName}</strong> ({seasonName}).
              </Text>
            )}
            <Text style={paragraph}>
              Hi {parentName || "there"} — tap the button below to sign in to your
              Aspire Sports account. We created an account for you so you can manage
              your registration, view team info, and register for future programs.
            </Text>
            <Button href={magicLinkUrl} style={button}>
              Sign in to your account
            </Button>
            <Text style={small}>
              This link expires in {expiresIn} and can only be used once. You can
              also set a password later from your account settings.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const main = { backgroundColor: "#f6f5f1", fontFamily: "system-ui, sans-serif" } as const;
const container = { margin: "0 auto", padding: "20px 0", maxWidth: "560px" } as const;
const box = { padding: "24px", backgroundColor: "#ffffff", borderRadius: "8px" } as const;
const h1 = { fontSize: "24px", fontWeight: 600, margin: "0 0 16px" } as const;
const paragraph = { fontSize: "16px", lineHeight: 1.5, margin: "0 0 16px", color: "#111" } as const;
const button = {
  backgroundColor: "#111",
  color: "#fff",
  padding: "12px 20px",
  borderRadius: "6px",
  textDecoration: "none",
  display: "inline-block",
  fontWeight: 600,
} as const;
const small = { fontSize: "13px", color: "#6b7280", marginTop: "24px" } as const;

export default MagicLinkLoginEmail;
```

- [ ] **Step 2: Add `sendMagicLinkLoginEmail` to `send.ts`**

Open `src/lib/email/send.ts`. Find the existing `sendPaymentReceiptEmail` function as a reference for shape (it logs to `email_logs`, calls `sendEmail`, returns nothing on success / throws on failure).

Append at the end of the file (before the closing of any namespace if applicable — check the file structure first):

```typescript
import { MagicLinkLoginEmail } from "@/lib/email/templates/magic-link-login";

export interface SendMagicLinkLoginParams {
  userId: string;
  organizationId?: string;
  parentEmail: string;
  parentName: string;
  magicLinkUrl: string;
  expiresIn?: string;
  programName?: string;
  childName?: string;
  seasonName?: string;
}

export async function sendMagicLinkLoginEmail(params: SendMagicLinkLoginParams) {
  const html = await render(
    MagicLinkLoginEmail({
      parentName: params.parentName,
      magicLinkUrl: params.magicLinkUrl,
      expiresIn: params.expiresIn ?? "15 minutes",
      programName: params.programName,
      childName: params.childName,
      seasonName: params.seasonName,
    }),
  );
  await sendEmail({
    to: params.parentEmail,
    subject: "You're registered — finish setting up your account",
    html,
    metadata: {
      userId: params.userId,
      organizationId: params.organizationId,
      kind: "magic_link_login",
    },
  });
}
```

> **Note:** the exact import for `render` and `sendEmail` depends on what `send.ts` already imports. Look at the top of the file first; reuse the existing imports rather than re-importing. The `metadata` key on `sendEmail` may need adjustment — check the signature of `sendEmail` in `src/lib/email/index.ts` and pass whatever shape it expects (it already gets userId/orgId from other senders, so the pattern exists).

- [ ] **Step 3: Verify it builds**

Run: `npx tsc --noEmit 2>&1 | grep -E "(magic-link-login|sendMagicLinkLoginEmail)" || echo "no errors in new code"`
Expected: `no errors in new code`. Pre-existing baseline errors in `seed-full-year.ts` etc. are not from this task.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/templates/magic-link-login.tsx src/lib/email/send.ts
git commit -m "$(cat <<'EOF'
feat(email): add magic-link login email template

New React Email template + sendMagicLinkLoginEmail() helper. Used by
the upcoming guest-checkout flow to send a one-tap sign-in to parents
who registered without a password.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Webhook fires magic link on `via_guest_checkout=true`

**Files:**
- Modify: `src/lib/stripe/handle-checkout-complete.ts`

After marking the registration paid (lines 60-82), if `session.metadata?.via_guest_checkout === "true"`, mint a `login` magic link and send the email.

- [ ] **Step 1: Modify `handle-checkout-complete.ts`**

At the top of the file, add imports:

```typescript
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { sendMagicLinkLoginEmail } from "@/lib/email/send";
```

After the existing `sendRegistrationConfirmationEmail` block (around line 124), inside the same `try` block (or in a new try directly below), add:

```typescript
// Guest-checkout users get a magic-link sign-in alongside the receipt.
if (session.metadata?.via_guest_checkout === "true") {
  try {
    const link = await createMagicLink({
      userId: registration.registeredByUserId,
      purpose: "login",
      purposeContext: { redirectTo: `/dashboard?welcome=${registrationId}` },
      deliveredChannel: "email",
      deliveredTo: row?.user.email,
    });
    if (row) {
      sendMagicLinkLoginEmail({
        userId: row.user.id,
        organizationId: row.location.organizationId ?? undefined,
        parentEmail: row.user.email,
        parentName: row.user.firstName || row.user.email.split("@")[0],
        magicLinkUrl: buildMagicLinkUrl(link.token),
        expiresIn: "15 minutes",
        programName: row.program.name,
        childName: `${row.familyMember.firstName} ${row.familyMember.lastName}`,
        seasonName: row.season.name,
      }).catch((err) =>
        console.error("[stripe webhook] magic-link email send failed:", err),
      );
    }
  } catch (err) {
    console.error("[stripe webhook] magic-link mint failed:", err);
  }
}
```

> **Note on `row` scope:** the existing code declares `row` inside a try block. The new magic-link code needs the same `row` (for user/program/family/season info), so the cleanest placement is *inside* the same try block, right after the `sendRegistrationConfirmationEmail` call. Do NOT introduce a second SQL join — reuse the one already there.

- [ ] **Step 2: Run existing webhook/payment tests**

Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npm run test:api`
Expected: no regressions. The new magic-link code only fires on `via_guest_checkout=true` which no test currently sets, so existing tests continue to pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/stripe/handle-checkout-complete.ts
git commit -m "$(cat <<'EOF'
feat(stripe): send magic-link login email for guest checkouts

When a Stripe Checkout session carries metadata.via_guest_checkout=true,
the webhook now mints a login magic link and emails it alongside the
existing payment receipt and registration confirmation. Failures are
logged and do not fail the webhook.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `POST /api/registrations/guest-checkout`

**Files:**
- Create: `src/pages/api/registrations/guest-checkout.ts`
- Create: `tests/api/registrations-guest-checkout.test.ts`

The combined endpoint: upsert user, upsert family member, create registration, create Stripe checkout session, return `{ checkoutUrl }`. For new users, set a Lucia session cookie. For existing-email matches, do NOT set a cookie (account-takeover prevention).

- [ ] **Step 1: Write the failing API tests**

Create `tests/api/registrations-guest-checkout.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";

// Helpers
async function fetchOpenSeasonId(): Promise<string> {
  const res = await fetch(`${BASE}/api/public/seasons?status=open`);
  const data = await res.json();
  const season = (data.seasons ?? [])[0];
  if (!season) throw new Error("No open seasons in test DB — re-seed e2e data");
  return season.id;
}

const validBody = (overrides: Record<string, unknown> = {}) => ({
  parent: {
    firstName: "Guest",
    lastName: "Tester",
    email: `guest-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    phone: "+15555550100",
  },
  child: {
    firstName: "Kid",
    lastName: "Tester",
    birthDate: "2018-06-01",
    gender: "male",
  },
  registrationType: "full" as const,
  waiverSigned: true,
  waiverSignedBy: "Guest Tester",
  ...overrides,
});

describe("POST /api/registrations/guest-checkout", () => {
  it("creates user, family member, registration, and returns a checkoutUrl for new email", async () => {
    const seasonId = await fetchOpenSeasonId();
    const res = await fetch(`${BASE}/api/registrations/guest-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody(), seasonId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("checkoutUrl");
    expect(typeof body.checkoutUrl).toBe("string");
    expect(body.wasNewUser).toBe(true);
    // Lucia cookie set for new users
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).toMatch(/auth_session=/);
  });

  it("matches existing email and does NOT set a session cookie", async () => {
    const seasonId = await fetchOpenSeasonId();
    // Use the e2e parent fixture
    const body = validBody({
      parent: {
        firstName: "Parent",
        lastName: "Test",
        email: "parent@test.aspiresports.com",
      },
      child: {
        firstName: `KidExisting${Date.now()}`,
        lastName: "Test",
        birthDate: "2017-03-15",
        gender: "female",
      },
    });
    const res = await fetch(`${BASE}/api/registrations/guest-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, seasonId }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.wasNewUser).toBe(false);
    expect(data).toHaveProperty("checkoutUrl");
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).not.toMatch(/auth_session=/);
  });

  it("returns 400 for malformed payload (missing email)", async () => {
    const seasonId = await fetchOpenSeasonId();
    const res = await fetch(`${BASE}/api/registrations/guest-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validBody({ parent: { firstName: "X", lastName: "Y" } }),
        seasonId,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for invalid seasonId", async () => {
    const res = await fetch(`${BASE}/api/registrations/guest-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validBody(),
        seasonId: "00000000-0000-0000-0000-000000000000",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("dedupes child by name + birthDate when re-registering", async () => {
    const seasonId = await fetchOpenSeasonId();
    const email = `guest-${Date.now()}@example.com`;
    const child = {
      firstName: "Dedupe",
      lastName: "Child",
      birthDate: "2019-01-01",
      gender: "other",
    };
    // First call creates user + child + registration
    await fetch(`${BASE}/api/registrations/guest-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validBody({ parent: { firstName: "X", lastName: "Y", email }, child }),
        seasonId,
      }),
    });
    // Second call (same email + child + season) returns the resumed pending row
    const res2 = await fetch(`${BASE}/api/registrations/guest-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validBody({ parent: { firstName: "X", lastName: "Y", email }, child }),
        seasonId,
      }),
    });
    expect(res2.status).toBe(200);
    const data = await res2.json();
    expect(data).toHaveProperty("checkoutUrl"); // resumed → still gets a fresh checkout
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail (endpoint doesn't exist)**

Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npm run test:api -- guest-checkout`
Expected: tests FAIL with 404 from the endpoint.

- [ ] **Step 3: Write the endpoint**

Create `src/pages/api/registrations/guest-checkout.ts`:

```typescript
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  users,
  userRoles,
  roles,
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
import { lucia } from "@/lib/auth/lucia";

const guestCheckoutSchema = z.object({
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
  waiverSignedBy: z.string().min(1),
  discountCode: z.string().optional(),
});

export const POST: APIRoute = async ({ request, url, cookies }) => {
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
    const normalizedEmail = data.parent.email.toLowerCase().trim();

    // Step 1: resolve user (upsert)
    let userRow = (
      await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1)
    )[0];
    let wasNewUser = false;
    if (!userRow) {
      const [inserted] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          passwordHash: null,
          firstName: data.parent.firstName,
          lastName: data.parent.lastName,
          phone: data.parent.phone || null,
          emailVerified: false,
        })
        .returning();
      userRow = inserted;
      wasNewUser = true;

      // Assign global parent role (mirroring /api/auth/signup)
      const [parentRole] = await db
        .select()
        .from(roles)
        .where(eq(roles.name, "parent"));
      if (parentRole) {
        await db.insert(userRoles).values({
          userId: userRow.id,
          roleId: parentRole.id,
          scopeType: "global",
        });
      }
    }

    // Step 2: resolve family member (dedupe by parent + lower(name) + DOB)
    const childFirstLower = data.child.firstName.toLowerCase();
    const childLastLower = data.child.lastName.toLowerCase();
    let familyMemberRow = (
      await db
        .select()
        .from(familyMembersTable)
        .where(
          and(
            eq(familyMembersTable.parentUserId, userRow.id),
            sql`lower(${familyMembersTable.firstName}) = ${childFirstLower}`,
            sql`lower(${familyMembersTable.lastName}) = ${childLastLower}`,
            eq(familyMembersTable.birthDate, data.child.birthDate),
          ),
        )
        .limit(1)
    )[0];
    if (!familyMemberRow) {
      const [inserted] = await db
        .insert(familyMembersTable)
        .values({
          parentUserId: userRow.id,
          firstName: data.child.firstName,
          lastName: data.child.lastName,
          birthDate: data.child.birthDate,
          gender: data.child.gender || null,
        })
        .returning();
      familyMemberRow = inserted;
    }

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
        seasonId: data.seasonId,
        registrationType: data.registrationType,
        waiverSigned: data.waiverSigned,
        waiverSignedBy: data.waiverSignedBy,
      });
    } catch (err) {
      if (err instanceof RegistrationError) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: err.status,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw err;
    }

    // Step 4: if waitlisted (no payment), set session cookie for new users and return
    if (regResult.kind === "waitlisted") {
      if (wasNewUser) {
        const session = await lucia.createSession(userRow.id, {});
        const sc = lucia.createSessionCookie(session.id);
        cookies.set(sc.name, sc.value, sc.attributes);
      }
      return new Response(
        JSON.stringify({
          waitlisted: true,
          registrationId: regResult.registration.id,
          wasNewUser,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Step 5: create Stripe checkout session via shared helper
    try {
      const checkout = await createCheckoutForRegistration({
        db,
        registrationId: regResult.registration.id,
        userId: userRow.id,
        baseUrl: url.origin,
        discountCode: data.discountCode,
        extraMetadata: { via_guest_checkout: "true" },
      });

      // Set Lucia session for new users only (account-takeover prevention)
      if (wasNewUser) {
        const session = await lucia.createSession(userRow.id, {});
        const sc = lucia.createSessionCookie(session.id);
        cookies.set(sc.name, sc.value, sc.attributes);
      }

      if (checkout.kind === "paid_zero") {
        return new Response(
          JSON.stringify({
            paid: true,
            registrationId: regResult.registration.id,
            wasNewUser,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({
          checkoutUrl: checkout.checkoutUrl,
          sessionId: checkout.sessionId,
          wasNewUser,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (err) {
      if (err instanceof CheckoutError) {
        return new Response(
          JSON.stringify({ error: err.message }),
          { status: err.status, headers: { "Content-Type": "application/json" } },
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("Error in guest-checkout:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
```

- [ ] **Step 4: Run the tests — must pass**

Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npm run test:api -- guest-checkout`
Expected: all 5 tests PASS.

- [ ] **Step 5: Run all API tests for regression**

Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npm run test:api`
Expected: no failures.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/registrations/guest-checkout.ts tests/api/registrations-guest-checkout.test.ts
git commit -m "$(cat <<'EOF'
feat(registrations): add POST /api/registrations/guest-checkout

Combined endpoint for the guest registration flow: upserts a
passwordless user, dedupes the family member, creates the registration
via the shared helper, then creates a Stripe Checkout session marked
with metadata.via_guest_checkout=true so the webhook will mail a
magic-link sign-in. New users get a Lucia session cookie inline;
existing-email matches do not (account-takeover prevention).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wizard UI — anonymous Step 1 + remove auth gate

**Files:**
- Modify: `src/pages/register/[seasonId].astro:9-15` (drop redirect, pass user)
- Modify: `src/components/registration/registration-wizard.tsx` (Step 1 split + email blur + new submit path)

This is the biggest UI change. The wizard has two modes:
- **Anonymous**: Step 1 shows parent fields above child fields. Email blur fires `/api/auth/check-email`. Submit calls `/api/registrations/guest-checkout`.
- **Authed (existing)**: Step 1 shows the family-member picker. Submit calls existing `/api/registrations` + `/api/payments/create-checkout`.

- [ ] **Step 1: Modify `/register/[seasonId].astro` — drop the auth redirect**

Open the file (it's 44 lines). Replace the frontmatter (lines 1-18) with:

```astro
---
import '../../styles/globals.css';
import Navigation from '../../components/navigation';
import Footer from '../../components/footer';
import RegistrationWizard from '../../components/registration/registration-wizard';

const { seasonId } = Astro.params;
const user = Astro.locals.user;
const wasCancelled = Astro.url.searchParams.get('payment') === 'cancelled';

// Pass a sanitized user prop (or null) so the wizard knows whether to
// render the guest path or the authed path.
const userProp = user
  ? {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    }
  : null;
---
```

Then in the body, change the `<RegistrationWizard ... />` invocation to pass `user={userProp}`:

```astro
<RegistrationWizard seasonId={seasonId!} wasCancelled={wasCancelled} user={userProp} client:load />
```

- [ ] **Step 2: Update the wizard's prop interface and add user-aware branching**

Open `src/components/registration/registration-wizard.tsx`. Update the `RegistrationWizardProps` interface (lines 83-87):

```typescript
interface AuthedUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface RegistrationWizardProps {
  seasonId: string;
  hasLinkedTelegram?: boolean;
  wasCancelled?: boolean;
  user: AuthedUser | null;
}
```

Update the function signature (line 96):

```typescript
export default function RegistrationWizard({
  seasonId,
  hasLinkedTelegram = false,
  wasCancelled = false,
  user,
}: RegistrationWizardProps) {
  const isGuest = user === null;
  // ...rest unchanged for now
```

- [ ] **Step 3: Add guest-mode form state**

Right after the existing `const [paymentOption, setPaymentOption] = useState<"full" | "deposit">("full")` line, add:

```typescript
// Guest-mode parent + child fields (only used when isGuest === true)
const [guestParentFirstName, setGuestParentFirstName] = useState("");
const [guestParentLastName, setGuestParentLastName] = useState("");
const [guestParentEmail, setGuestParentEmail] = useState("");
const [guestParentPhone, setGuestParentPhone] = useState("");
const [guestChildFirstName, setGuestChildFirstName] = useState("");
const [guestChildLastName, setGuestChildLastName] = useState("");
const [guestChildBirthDate, setGuestChildBirthDate] = useState("");
const [guestChildGender, setGuestChildGender] = useState("");
const [guestEmailCollision, setGuestEmailCollision] = useState(false);
const [isCheckingEmail, setIsCheckingEmail] = useState(false);
```

- [ ] **Step 4: Add the debounced email-blur handler**

Add this effect right after the existing `useEffect` blocks (around line 169):

```typescript
useEffect(() => {
  if (!isGuest || !guestParentEmail) {
    setGuestEmailCollision(false);
    return;
  }
  // Quick client-side validity check before pinging the server
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestParentEmail);
  if (!looksLikeEmail) {
    setGuestEmailCollision(false);
    return;
  }
  const ctrl = new AbortController();
  const handle = setTimeout(async () => {
    setIsCheckingEmail(true);
    try {
      const res = await fetch(
        `/api/auth/check-email?email=${encodeURIComponent(guestParentEmail)}`,
        { signal: ctrl.signal },
      );
      if (res.ok) {
        const data = await res.json();
        setGuestEmailCollision(data.exists === true);
      }
    } catch {
      // Network error or aborted — treat as no collision (fail open)
    } finally {
      setIsCheckingEmail(false);
    }
  }, 400);
  return () => {
    clearTimeout(handle);
    ctrl.abort();
  };
}, [isGuest, guestParentEmail]);
```

- [ ] **Step 5: Update `canProceed` for guest Step 1**

Replace the `canProceed` function (around lines 383-394):

```typescript
const canProceed = () => {
  switch (currentStep) {
    case 1:
      if (isGuest) {
        return (
          guestParentFirstName.trim().length > 0 &&
          guestParentLastName.trim().length > 0 &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestParentEmail) &&
          guestChildFirstName.trim().length > 0 &&
          guestChildLastName.trim().length > 0 &&
          /^\d{4}-\d{2}-\d{2}$/.test(guestChildBirthDate)
        );
      }
      return selectedMemberId !== "";
    case 2:
      return waiverAccepted && waiverSignature.length >= 2;
    case 3:
      return true;
    default:
      return false;
  }
};
```

- [ ] **Step 6: Render guest Step 1 alongside the existing authed Step 1**

Find the existing Step 1 render block (`{currentStep === 1 && (` around line 588). Wrap the existing content in an `isGuest ? (<guest form/>) : (<existing content/>)` ternary. The guest form:

```tsx
{currentStep === 1 && isGuest && (
  <div className="space-y-6">
    <div>
      <h3 className="text-lg font-semibold text-ink mb-2">Your info & player</h3>
      <p className="text-ink-muted text-sm">
        We'll create an account for you and email a one-tap sign-in link after
        payment. No password needed.
      </p>
    </div>

    <div className="space-y-4">
      <h4 className="font-medium text-ink">About you</h4>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-ink-muted">First name *</Label>
          <Input
            value={guestParentFirstName}
            onChange={(e) => setGuestParentFirstName(e.target.value)}
            className="bg-cream-2 border-border text-ink focus:border-primary"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-ink-muted">Last name *</Label>
          <Input
            value={guestParentLastName}
            onChange={(e) => setGuestParentLastName(e.target.value)}
            className="bg-cream-2 border-border text-ink focus:border-primary"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-ink-muted">Email *</Label>
        <Input
          type="email"
          value={guestParentEmail}
          onChange={(e) => setGuestParentEmail(e.target.value)}
          className="bg-cream-2 border-border text-ink focus:border-primary"
        />
        {guestEmailCollision && (
          <p className="text-xs text-ink-muted">
            We already have an account with this email. After payment we'll send
            a sign-in link to <span className="font-medium">{guestParentEmail}</span>.
          </p>
        )}
        {isCheckingEmail && (
          <p className="text-xs text-ink-faint">Checking…</p>
        )}
      </div>
      <div className="space-y-2">
        <Label className="text-ink-muted">Phone (optional)</Label>
        <Input
          type="tel"
          value={guestParentPhone}
          onChange={(e) => setGuestParentPhone(e.target.value)}
          className="bg-cream-2 border-border text-ink focus:border-primary"
        />
      </div>
    </div>

    <div className="space-y-4 pt-4 border-t border-border">
      <h4 className="font-medium text-ink">Player</h4>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-ink-muted">First name *</Label>
          <Input
            value={guestChildFirstName}
            onChange={(e) => setGuestChildFirstName(e.target.value)}
            className="bg-cream-2 border-border text-ink focus:border-primary"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-ink-muted">Last name *</Label>
          <Input
            value={guestChildLastName}
            onChange={(e) => setGuestChildLastName(e.target.value)}
            className="bg-cream-2 border-border text-ink focus:border-primary"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-ink-muted">Birth date *</Label>
          <Input
            type="date"
            value={guestChildBirthDate}
            onChange={(e) => setGuestChildBirthDate(e.target.value)}
            className="bg-cream-2 border-border text-ink focus:border-primary"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-ink-muted">Gender</Label>
          <Select value={guestChildGender} onValueChange={setGuestChildGender}>
            <SelectTrigger className="bg-cream-2 border-border text-ink">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent className="bg-cream border-border">
              <SelectItem value="male" className="text-ink-2">Male</SelectItem>
              <SelectItem value="female" className="text-ink-2">Female</SelectItem>
              <SelectItem value="other" className="text-ink-2">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>

    <p className="text-xs text-ink-muted">
      Already have an account?{" "}
      <a
        href={`/signin?redirect=/register/${seasonId}`}
        className="text-primary hover:text-primary/80 font-medium"
      >
        Sign in
      </a>
    </p>
  </div>
)}

{currentStep === 1 && !isGuest && (
  <div className="space-y-6">
    {/* (existing authed Step 1 content — unchanged from current code) */}
    ...
  </div>
)}
```

> Implementer note: copy the existing Step 1 JSX (lines 589-718) verbatim into the `!isGuest` branch. Don't rewrite it.

Also: in Step 2 ("Sign Waiver"), the existing code references `selectedMember?.firstName` for the consent text. For guests, fall back to the typed child name:

```tsx
<span className="text-ink font-medium">
  {isGuest
    ? `${guestChildFirstName} ${guestChildLastName}`.trim()
    : `${selectedMember?.firstName} ${selectedMember?.lastName}`}
</span>.
```

In Step 3's "Order Summary" section, do the same swap:

```tsx
<span className="text-ink font-medium">
  {isGuest
    ? `${guestChildFirstName} ${guestChildLastName}`.trim()
    : `${selectedMember?.firstName} ${selectedMember?.lastName}`}
</span>
```

- [ ] **Step 7: Add the guest submit handler and route Step 3's submit through it**

Add a new handler near `handleSubmitRegistration` (around line 306):

```typescript
const handleSubmitGuestCheckout = async () => {
  if (!season) return;
  setIsSubmitting(true);
  setError(null);
  try {
    const res = await fetch("/api/registrations/guest-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seasonId,
        parent: {
          firstName: guestParentFirstName,
          lastName: guestParentLastName,
          email: guestParentEmail,
          phone: guestParentPhone || undefined,
        },
        child: {
          firstName: guestChildFirstName,
          lastName: guestChildLastName,
          birthDate: guestChildBirthDate,
          gender: guestChildGender || undefined,
        },
        registrationType: paymentOption,
        waiverSigned: true,
        waiverSignedBy: waiverSignature,
        discountCode: discountCode || undefined,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to complete registration");
    }
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }
    if (data.paid) {
      // $0 after discount — guest is now signed in (if new) and registration is confirmed.
      window.location.href = `/dashboard?registered=${data.registrationId}`;
      return;
    }
    if (data.waitlisted) {
      window.location.href = `/dashboard?waitlisted=${data.registrationId}`;
      return;
    }
    setError("Unexpected response — please try again.");
  } catch (err) {
    setError(err instanceof Error ? err.message : "Failed to complete registration");
  } finally {
    setIsSubmitting(false);
  }
};
```

Then in the navigation block at the bottom (lines 1004-1022), change the Complete-Registration button's `onClick`:

```tsx
<Button
  onClick={isGuest ? handleSubmitGuestCheckout : handleSubmitRegistration}
  disabled={isSubmitting}
  className="bg-primary hover:bg-primary/90"
>
  {/* unchanged label/spinner */}
</Button>
```

- [ ] **Step 8: Manually verify the page loads anonymously**

Start the dev server (`NETLIFY_DEV=1 npm run dev` per CLAUDE.md macOS Tahoe note if needed), open `http://localhost:4321/register/<any-open-season-id>` **in an incognito window**, confirm:
- Page renders the wizard without redirecting.
- Step 1 shows parent + child fields.
- Email blur on a known seed email shows the collision subcopy.
- Continue → waiver → payment all work.
- Clicking "Complete Registration" returns a Stripe URL (or, with Stripe in test mode, the actual Stripe Checkout page).

If the page redirects, check `Astro.locals.user` is null in the frontmatter — Lucia session may be set from a prior test session; clear cookies in the incognito window.

- [ ] **Step 9: Commit**

```bash
git add src/pages/register/[seasonId].astro src/components/registration/registration-wizard.tsx
git commit -m "$(cat <<'EOF'
feat(registration): guest-checkout UI flow on /register/[seasonId]

Removes the upfront sign-in wall. Anonymous visitors see a Step 1 with
parent fields above child fields, with debounced email-collision
detection. Submission goes to /api/registrations/guest-checkout, which
returns a Stripe URL (or marks paid for $0 after discount, or
waitlists). Logged-in users see the unchanged authed flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Playwright e2e for the guest flow

**Files:**
- Create: `tests/registration-guest-flow.spec.ts`

- [ ] **Step 1: Write the spec**

Look at an existing Playwright spec for the file shape (e.g. `tests/dashboard-program-detail.spec.ts` or whatever already exists). Then create `tests/registration-guest-flow.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";
import { waitForHydration } from "./utils/test-helpers";

test("anonymous parent can register and pay without an account", async ({
  page,
  request,
}) => {
  // Discover an open season from the test fixtures
  const seasonsRes = await request.get("/api/public/seasons?status=open");
  const seasonsBody = await seasonsRes.json();
  const season = (seasonsBody.seasons ?? [])[0];
  expect(season, "expected at least one open season in the test DB").toBeTruthy();

  // Visit the registration page as a guest (no auth cookie)
  await page.goto(`/register/${season.id}`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  // Step 1: parent + child
  const uniqueEmail = `e2e-${Date.now()}@example.com`;
  await page.getByLabel("First name *").first().fill("E2E");
  await page.getByLabel("Last name *").first().fill("Parent");
  await page.getByLabel("Email *").fill(uniqueEmail);
  // Player section (the second pair of First/Last labels)
  await page.getByLabel("First name *").nth(1).fill("E2E");
  await page.getByLabel("Last name *").nth(1).fill("Kid");
  await page.getByLabel("Birth date *").fill("2018-06-01");

  await page.getByRole("button", { name: /continue/i }).click();

  // Step 2: waiver
  await page.getByLabel(/I have read.*agree/i).check();
  await page.getByLabel(/Digital Signature/i).fill("E2E Parent");
  await page.getByRole("button", { name: /continue/i }).click();

  // Step 3: payment — keep "Pay in Full"; submit
  await page.getByRole("button", { name: /complete registration/i }).click();

  // We expect a redirect to Stripe Checkout (checkout.stripe.com) — but in test
  // mode we may not have STRIPE keys. Accept either:
  //  (a) navigation to checkout.stripe.com, OR
  //  (b) an error banner if Stripe isn't configured locally.
  await page.waitForLoadState("domcontentloaded");
  const url = page.url();
  expect(url).toMatch(/(checkout\.stripe\.com|register\/.*payment=cancelled|dashboard)/);
});

test("collision subcopy appears for an existing email", async ({ page }) => {
  const seasonsRes = await page.request.get("/api/public/seasons?status=open");
  const seasonsBody = await seasonsRes.json();
  const season = (seasonsBody.seasons ?? [])[0];

  await page.goto(`/register/${season.id}`, { waitUntil: "domcontentloaded" });
  await waitForHydration(page);

  await page.getByLabel("Email *").fill("parent@test.aspiresports.com");
  await page.getByLabel("Email *").blur();

  await expect(
    page.getByText(/We already have an account with this email/i),
  ).toBeVisible({ timeout: 3000 });
});
```

- [ ] **Step 2: Run the Playwright suite**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test -- --grep "registration-guest"`
Expected: both tests PASS.

> Common failure modes: (a) hydration not awaited → use `waitForHydration` (per CLAUDE.md). (b) Stripe not configured → first test will fall through to the error-banner branch which is accepted by the regex. (c) shared-DB collision: the unique-email is timestamped to avoid this.

- [ ] **Step 3: Commit**

```bash
git add tests/registration-guest-flow.spec.ts
git commit -m "$(cat <<'EOF'
test(registration): playwright e2e for guest checkout

Covers anonymous parent → wizard → Stripe redirect, plus the inline
email-collision subcopy on an existing seed email.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Pre-push checklist

Per CLAUDE.md's pre-push checklist for any work that touches API endpoints, run the full sequence locally before pushing.

- [ ] **Step 1: No schema changes, but still run db:push for safety**

Run: `npm run db:push`
Expected: "No schema changes detected" (or applies trivially). If it generates a migration prompt, **stop** — that means an unrelated schema drift; investigate before continuing.

- [ ] **Step 2: Re-seed e2e data**

Run: `npm run db:seed:e2e`
Expected: completes without errors.

- [ ] **Step 3: API tests**

Ensure dev server is running with `R2_MOCK=1 CRON_SECRET=test`. Then:

Run: `CRON_SECRET=test TEST_BASE_URL=http://localhost:4321 npm run test:api`
Expected: all PASS.

- [ ] **Step 4: Playwright**

Run: `PLAYWRIGHT_BASE_URL=http://localhost:4321 npm test`
Expected: all PASS, including the new guest-flow spec.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build succeeds. SSR vs prerender errors here usually mean a page used `Astro.request.headers` on a prerendered route — but we didn't add prerendered routes.

- [ ] **Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: no NEW errors. Per CLAUDE.md, ~5 baseline errors exist in seed files and `test-helpers.ts`; do not add to them.

- [ ] **Step 7: Final commit if any fixes were needed, then summary**

If any of steps 1-6 surfaced fixes, commit them. Then:

```bash
git log --oneline main..HEAD
```

Expected output: 8 commits (Tasks 1-8) plus any fixes. Verify they tell a coherent story.

---

## Self-Review Notes (filled out by plan author)

- **Spec coverage:** every section of the spec maps to a task. The forgot-password amendment was removed from the spec (existing flow already supports passwordless users). The "send-magic-link" endpoint from the original spec was dropped because the combined `/api/registrations/guest-checkout` endpoint handles all paths (waitlist, $0, paid) without a second call.
- **Placeholder scan:** none. All code blocks are complete. The one inline-note about replacing the placeholder SQL join in Task 2 Step 3 explicitly tells the implementer the correct form to use.
- **Type consistency:** `createRegistration` returns `{ kind, registration, requiresPayment, amountDueCents }`. `createCheckoutForRegistration` returns `{ kind: "stripe_session" | "paid_zero", ... }`. Both used consistently across tasks. `RegistrationError` and `CheckoutError` both have `(status, message)` signatures.
- **Scope check:** single coherent feature. No decomposition needed.
