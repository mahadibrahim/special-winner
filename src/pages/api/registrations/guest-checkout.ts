import type { APIRoute } from "astro";
import { z } from "zod";
import { eq, and, sql, asc } from "drizzle-orm";
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
import { createSession } from "@/lib/auth";
import { getPostHogServer } from "@/lib/posthog-server";
import { resolvePerson } from "@/lib/registrations/resolve-person";

const guestRegistrantSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isSelf: z.literal(true),
  gender: z.enum(["male", "female", "other"]).optional(),
});

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
  }),
  // New adult self shape
  z.object({
    seasonId: z.string().uuid(),
    registrant: guestRegistrantSchema,
    registrationType: z.enum(["full", "deposit"]),
    waiverSigned: z.boolean(),
    waiverSignedBy: z.string().min(1),
    discountCode: z.string().optional(),
  }),
]);

export const POST: APIRoute = async (context) => {
  const { request, url } = context;
  const posthog = getPostHogServer();
  const phSessionId = request.headers.get("X-PostHog-Session-Id") || undefined;
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
      seasonId: string;
      registrationType: "full" | "deposit";
      waiverSigned: boolean;
      waiverSignedBy: string;
      discountCode?: string;
      wasNewUser: boolean;
      distinctIdForPosthog: string;
    }) {
      const {
        userRow,
        familyMemberRow,
        seasonId,
        registrationType,
        waiverSigned,
        waiverSignedBy,
        discountCode,
        wasNewUser,
        distinctIdForPosthog,
      } = opts;

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
          extraMetadata: { via_guest_checkout: "true" },
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
            checkoutUrl: checkout.checkoutUrl,
            sessionId: checkout.sessionId,
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
        seasonId: data.seasonId,
        registrationType: data.registrationType,
        waiverSigned: data.waiverSigned,
        waiverSignedBy: data.waiverSignedBy,
        discountCode: data.discountCode,
        wasNewUser,
        distinctIdForPosthog: userRow.email,
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
      seasonId: data.seasonId,
      registrationType: data.registrationType,
      waiverSigned: data.waiverSigned,
      waiverSignedBy: data.waiverSignedBy,
      discountCode: data.discountCode,
      wasNewUser,
      distinctIdForPosthog: userRow.email,
    });
  } catch (error) {
    console.error("Error in guest-checkout:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
