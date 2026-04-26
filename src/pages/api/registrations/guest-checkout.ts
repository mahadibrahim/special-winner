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
    posthog.capture({ distinctId: data.parent.email.toLowerCase().trim(), event: "guest_checkout_started", properties: { $session_id: phSessionId, season_id: data.seasonId, registration_type: data.registrationType } });
    const db = getDb();
    const normalizedEmail = data.parent.email.toLowerCase().trim();

    // Step 1: resolve user (upsert with conflict handling)
    let wasNewUser = false;
    const insertedUsers = await db
      .insert(users)
      .values({
        email: normalizedEmail,
        passwordHash: null,
        firstName: data.parent.firstName,
        lastName: data.parent.lastName,
        phone: data.parent.phone || null,
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
        discountCode: data.discountCode,
        extraMetadata: { via_guest_checkout: "true" },
      });

      // Account-takeover prevention: only set Lucia session for genuinely new users
      if (wasNewUser) {
        await createSession(userRow.id, context);
      }

      posthog.identify({ distinctId: userRow.id, properties: { email: userRow.email, firstName: userRow.firstName, lastName: userRow.lastName } });
      posthog.capture({ distinctId: userRow.id, event: "guest_checkout_completed", properties: { $session_id: phSessionId, season_id: data.seasonId, registration_id: regResult.registration.id, was_new_user: wasNewUser, discount_code: data.discountCode, paid_zero: checkout.kind === "paid_zero" } });

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
  } catch (error) {
    console.error("Error in guest-checkout:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
