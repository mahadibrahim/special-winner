import type { APIRoute } from "astro";
import { z } from "zod";
import { eq, and, sql, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  users,
  userRoles,
  roles,
  familyMembers as familyMembersTable,
  seasons,
  programs,
  locations,
} from "@/lib/db/schema";
import {
  createRegistration,
  RegistrationError,
} from "@/lib/registrations/create-registration";
import {
  createCheckoutForRegistration,
  CheckoutError,
} from "@/lib/payments/create-checkout-for-registration";
import { createSession } from "@/lib/auth";
import { getPostHogServer } from "@/lib/posthog-server";
import { resolvePerson } from "@/lib/registrations/resolve-person";
import {
  recordConsent,
  recordDefaultMediaAuth,
  hasActiveConsent,
} from "@/lib/consents/record";
import { parseGaClientId, readQueryOrCookie } from "@/lib/analytics/parse-cookies";

const guestRegistrantSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isSelf: z.literal(true),
  gender: z.enum(["male", "female", "other"]).optional(),
});

const mediaAuthOptOutsSchema = z
  .array(z.enum(["internal", "promotional", "public"]))
  .optional();

const guestCheckoutSchema = z.union([
  // Legacy parent + child shape (preserved unchanged)
  z.object({
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
    lookingForTeam: z.boolean().optional(),
    mediaAuthOptOuts: mediaAuthOptOutsSchema,
    paymentMethodCategory: z.enum(["bank", "card"]).optional(),
  }),
  // New adult self shape
  z.object({
    seasonId: z.string().uuid(),
    registrant: guestRegistrantSchema,
    registrationType: z.enum(["full", "deposit"]),
    waiverSigned: z.boolean(),
    waiverSignedBy: z.string().min(1),
    discountCode: z.string().optional(),
    lookingForTeam: z.boolean().optional(),
    mediaAuthOptOuts: mediaAuthOptOutsSchema,
    paymentMethodCategory: z.enum(["bank", "card"]).optional(),
  }),
]);

export const POST: APIRoute = async (context) => {
  const { request, url, clientAddress } = context;
  const posthog = getPostHogServer();
  const phSessionId = request.headers.get("X-PostHog-Session-Id") || undefined;
  const userAgent = request.headers.get("user-agent");
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

    // Capture GA4 client_id + ad-platform IDs to pass through Stripe session
    // metadata so the webhook (handle-checkout-complete.ts) can fire a
    // server-side GA4 Measurement Protocol purchase event.
    const cookieHeader = request.headers.get("cookie");
    const gaClientId = parseGaClientId(cookieHeader);
    const gclid = readQueryOrCookie(url, cookieHeader, "gclid");
    const fbclid = readQueryOrCookie(url, cookieHeader, "fbclid");

    const analyticsMetadata: Record<string, string> = { via_guest_checkout: "true" };
    if (gaClientId) analyticsMetadata.ga_client_id = gaClientId;
    if (gclid) analyticsMetadata.gclid = gclid;
    if (fbclid) analyticsMetadata.fbclid = fbclid;

    // -------------------------------------------------------------------------
    // Shared helper: upsert user by email, assign parent role if new.
    // Returns { userRow, wasNewUser }.
    // -------------------------------------------------------------------------
    async function upsertGuestUser(opts: {
      email: string;
      firstName: string;
      lastName: string;
      phone?: string | null;
      birthDate?: string | null;
    }) {
      const normalizedEmail = opts.email.toLowerCase().trim();
      let wasNewUser = false;

      const insertedUsers = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          passwordHash: null,
          firstName: opts.firstName,
          lastName: opts.lastName,
          phone: opts.phone ?? null,
          birthDate: opts.birthDate ?? null,
          emailVerified: false,
        })
        .onConflictDoNothing({ target: users.email })
        .returning();

      let userRow: typeof users.$inferSelect;
      if (insertedUsers.length > 0) {
        userRow = insertedUsers[0];
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
      } else {
        // Either the email already existed or a concurrent insert won the race.
        // Either way, re-fetch the row that's now in the table.
        const [existing] = await db
          .select()
          .from(users)
          .where(eq(users.email, normalizedEmail));
        if (!existing) {
          // Should be impossible — log and 500
          throw new Error("User row vanished after upsert race");
        }
        userRow = existing;
      }

      return { userRow, wasNewUser, normalizedEmail };
    }

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
      mediaAuthOptOuts?: ReadonlyArray<"internal" | "promotional" | "public">;
      extraMetadata: Record<string, string>;
      paymentMethodCategory?: "bank" | "card";
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
        mediaAuthOptOuts,
        extraMetadata,
        paymentMethodCategory,
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

      if (regResult.kind !== "resumed" && waiverSigned) {
        const [orgRow] = await db
          .select({ organizationId: locations.organizationId })
          .from(seasons)
          .innerJoin(programs, eq(seasons.programId, programs.id))
          .innerJoin(locations, eq(programs.locationId, locations.id))
          .where(eq(seasons.id, seasonId));
        const organizationId = orgRow?.organizationId ?? null;
        const baseConsent = {
          db,
          familyMemberId: familyMemberRow.id,
          registrationId: regResult.registration.id,
          organizationId,
          signedByUserId: userRow.id,
          signedByName: waiverSignedBy,
          ipAddress: clientAddress ?? null,
          userAgent: userAgent ?? null,
        };
        const personalConsentType =
          personKind === "self" ? "age_confirmation" : "parental";
        if (!(await hasActiveConsent(db, familyMemberRow.id, personalConsentType))) {
          await recordConsent({ ...baseConsent, type: personalConsentType });
        }
        await recordConsent({ ...baseConsent, type: "liability" });
        await recordDefaultMediaAuth({
          ...baseConsent,
          optOutScopes: mediaAuthOptOuts ?? [],
        });
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

        posthog.identify({ distinctId: userRow.id, properties: { email: userRow.email, firstName: userRow.firstName, lastName: userRow.lastName } });
        posthog.capture({ distinctId: userRow.id, event: "guest_checkout_completed", properties: { $session_id: phSessionId, season_id: seasonId, registration_id: regResult.registration.id, was_new_user: wasNewUser, discount_code: discountCode, paid_zero: checkout.kind === "paid_zero" } });

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
            clientSecret: checkout.clientSecret,
            sessionId: checkout.sessionId,
            surchargeCents: checkout.surchargeCents,
            publishableKey: import.meta.env.STRIPE_PUBLISHABLE_KEY,
            wasNewUser,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      } catch (err) {
        if (err instanceof CheckoutError) {
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
      posthog.capture({ distinctId: r.email.toLowerCase().trim(), event: "guest_checkout_started", properties: { $session_id: phSessionId, season_id: data.seasonId, registration_type: data.registrationType } });

      const { userRow, wasNewUser } = await upsertGuestUser({
        email: r.email,
        firstName: r.firstName,
        lastName: r.lastName,
        phone: r.phone,
        birthDate: r.birthDate,
      });

      // resolve self person (find-or-create the self-row on family_members)
      const familyMemberRow = await resolvePerson(db, {
        kind: "self",
        user: {
          id: userRow.id,
          firstName: userRow.firstName ?? r.firstName,
          lastName: userRow.lastName ?? r.lastName,
          birthDate: userRow.birthDate ?? r.birthDate,
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
        waiverSignedBy: data.waiverSignedBy,
        discountCode: data.discountCode,
        wasNewUser,
        distinctIdForPosthog: userRow.email,
        lookingForTeam: data.lookingForTeam ?? false,
        mediaAuthOptOuts: data.mediaAuthOptOuts,
        extraMetadata: analyticsMetadata,
        paymentMethodCategory: data.paymentMethodCategory,
      });
    }

    // -------------------------------------------------------------------------
    // PARENT + CHILD PATH (original behavior — preserved unchanged)
    // -------------------------------------------------------------------------
    posthog.capture({ distinctId: data.parent.email.toLowerCase().trim(), event: "guest_checkout_started", properties: { $session_id: phSessionId, season_id: data.seasonId, registration_type: data.registrationType } });

    const { userRow, wasNewUser } = await upsertGuestUser({
      email: data.parent.email,
      firstName: data.parent.firstName,
      lastName: data.parent.lastName,
      phone: data.parent.phone,
    });

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
        .orderBy(asc(familyMembersTable.createdAt))
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

    return runCheckout({
      userRow,
      familyMemberRow,
      personKind: "dependent",
      seasonId: data.seasonId,
      registrationType: data.registrationType,
      waiverSigned: data.waiverSigned,
      waiverSignedBy: data.waiverSignedBy,
      discountCode: data.discountCode,
      wasNewUser,
      distinctIdForPosthog: userRow.email,
      mediaAuthOptOuts: data.mediaAuthOptOuts,
      extraMetadata: analyticsMetadata,
      paymentMethodCategory: "paymentMethodCategory" in data ? data.paymentMethodCategory : undefined,
    });
  } catch (error) {
    console.error("Error in guest-checkout:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
