import type { APIRoute } from "astro";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { registrations } from "@/lib/db/schema/registrations";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { normalizeUsPhone, sendSms } from "@/lib/sms/send";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { sendRegistrationConfirmationEmail } from "@/lib/email/send";
import { resolvePerson } from "@/lib/registrations/resolve-person";
import {
  recordConsent,
  recordDefaultMediaAuth,
  hasActiveConsent,
} from "@/lib/consents/record";

/**
 * POST /api/admin/walk-up-registration
 *
 * Registration Path 3 — admin-added walk-up. The admin enters a parent's
 * info and their kid's info at the front desk (or over the phone). We:
 *   1. Create or find the parent user record (keyed by email; no password)
 *   2. Create the family member (kid) and link to the parent
 *   3. Create the registration in 'pending' or 'confirmed' status
 *   4. Insert a phone_opt_ins row with status = 'pending'
 *   5. Send an opt-in welcome SMS asking the parent to reply YES
 *
 * When the parent replies YES, the inbound SMS webhook flips the opt-in
 * to 'opted_in' and the messaging layer starts sending them updates.
 *
 * Body:
 *   - parent: { firstName, lastName, email, phone }
 *   - kid: { firstName, lastName, birthDate, gender?, medicalNotes? }
 *   - seasonId: string
 *   - paymentStatus: 'paid' | 'unpaid' | 'comped' — how payment was handled in-person
 *   - amountPaidCents?: number — for partial/full cash/check/terminal payments
 *   - waiverSigned: boolean
 *   - notes?: string
 */

const adultRegistrantSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.enum(["male", "female", "other"]).optional(),
});

const walkUpSchema = z.union([
  // Existing parent + child shape (preserved byte-for-byte)
  z.object({
    parent: z.object({
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      email: z.string().email(),
      phone: z.string().min(7).max(20),
    }),
    kid: z.object({
      firstName: z.string().min(1).max(100),
      lastName: z.string().min(1).max(100),
      birthDate: z.string(),
      gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
      medicalNotes: z.string().optional(),
    }),
    seasonId: z.string().uuid(),
    paymentStatus: z.enum(["paid", "unpaid", "comped"]),
    amountPaidCents: z.number().int().nonnegative().optional(),
    waiverSigned: z.boolean(),
    // Optional in this transitional phase. When the admin form is updated
    // to capture the parent's typed signature explicitly (Phase 3), this
    // becomes required. For now we fall back to the parent's full name.
    waiverSignedBy: z.string().min(1).optional(),
    notes: z.string().optional(),
  }),
  // New adult self-registration mode
  z.object({
    adultMode: z.literal(true),
    registrant: adultRegistrantSchema,
    seasonId: z.string().uuid(),
    registrationType: z.enum(["full", "deposit"]),
    paymentStatus: z.enum(["paid", "unpaid", "comped"]),
    amountPaidCents: z.number().int().nonnegative().optional(),
    waiverSigned: z.boolean(),
    waiverSignedBy: z.string().min(1),
    notes: z.string().optional(),
    lookingForTeam: z.boolean().optional(),
  }),
]);

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const adminUser = auth.user;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = walkUpSchema.safeParse(payload);
  if (!parsed.success) {
    return json(
      {
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      },
      400,
    );
  }

  const input = parsed.data;
  const db = getDb();

  // Look up the season — and require it belongs to caller's organization,
  // so an admin from Org-A can't register people into Org-B's season.
  const [seasonInfo] = await db
    .select({
      season: seasons,
      program: programs,
      location: locations,
    })
    .from(seasons)
    .innerJoin(programs, eq(programs.id, seasons.programId))
    .innerJoin(locations, eq(locations.id, programs.locationId))
    .where(
      and(
        eq(seasons.id, input.seasonId),
        eq(locations.organizationId, orgContext.organizationId),
      ),
    )
    .limit(1);

  if (!seasonInfo) {
    return json({ error: "Season not found" }, 404);
  }

  const organizationId = orgContext.organizationId;
  const clientAddress = context.clientAddress;
  const userAgent = context.request.headers.get("user-agent");

  // -------------------------------------------------------------------------
  // ADULT SELF-REGISTRATION PATH
  // -------------------------------------------------------------------------
  if ("adultMode" in input && input.adultMode === true) {
    const r = input.registrant;
    const emailNormalized = r.email.toLowerCase().trim();

    // Upsert user by email, storing birthDate
    const [existingAdultUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, emailNormalized))
      .limit(1);

    let adultUserId: string;

    if (existingAdultUser) {
      adultUserId = existingAdultUser.id;
      // Update birthDate if missing
      if (!existingAdultUser.birthDate) {
        await db
          .update(users)
          .set({ birthDate: r.birthDate, updatedAt: new Date() })
          .where(eq(users.id, adultUserId));
      }
    } else {
      const [newAdultUser] = await db
        .insert(users)
        .values({
          email: emailNormalized,
          firstName: r.firstName,
          lastName: r.lastName,
          phone: r.phone ? normalizeUsPhone(r.phone) : null,
          birthDate: r.birthDate,
          phoneVerified: false,
          emailVerified: false,
        })
        .returning({ id: users.id });
      adultUserId = newAdultUser.id;
    }

    // Resolve self person via shared helper
    const selfMember = await resolvePerson(db, {
      kind: "self",
      user: {
        id: adultUserId,
        firstName: r.firstName,
        lastName: r.lastName,
        birthDate: r.birthDate,
        gender: r.gender ?? null,
      },
    });

    // Create the registration
    const adultRegistrationStatus: "pending" | "confirmed" =
      input.paymentStatus === "paid" || input.paymentStatus === "comped"
        ? "confirmed"
        : "pending";

    const adultPaymentStatus: "paid" | "unpaid" =
      input.paymentStatus === "paid" ? "paid" : "unpaid";

    const [adultRegistration] = await db
      .insert(registrations)
      .values({
        seasonId: input.seasonId,
        familyMemberId: selfMember.id,
        registeredByUserId: adminUser.id,
        status: adultRegistrationStatus,
        paymentStatus: adultPaymentStatus,
        amountPaidCents: input.amountPaidCents ?? 0,
        amountDueCents: seasonInfo.season.priceCents,
        waiverSigned: input.waiverSigned,
        notes: input.notes ?? null,
        lookingForTeam: input.lookingForTeam ?? false,
      })
      .returning({ id: registrations.id });

    if (input.waiverSigned) {
      const baseConsent = {
        db,
        familyMemberId: selfMember.id,
        registrationId: adultRegistration.id,
        organizationId,
        signedByUserId: adultUserId,
        signedByName: input.waiverSignedBy,
        ipAddress: clientAddress ?? null,
        userAgent: userAgent ?? null,
        notes: `walk-up: admin=${adminUser.id}`,
      };
      if (!(await hasActiveConsent(db, selfMember.id, "age_confirmation"))) {
        await recordConsent({ ...baseConsent, type: "age_confirmation" });
      }
      await recordConsent({ ...baseConsent, type: "liability" });
      await recordDefaultMediaAuth(baseConsent);
    }

    // Opt-in SMS if phone was provided
    const adultNormalizedPhone = r.phone ? normalizeUsPhone(r.phone) : null;
    let adultSmsStatus = "skipped";

    if (adultNormalizedPhone) {
      const existingOptIn = await db
        .select({ id: phoneOptIns.id })
        .from(phoneOptIns)
        .where(
          and(
            eq(phoneOptIns.organizationId, organizationId),
            eq(phoneOptIns.phone, adultNormalizedPhone),
          ),
        )
        .limit(1);

      if (existingOptIn.length === 0) {
        await db.insert(phoneOptIns).values({
          organizationId,
          userId: adultUserId,
          phone: adultNormalizedPhone,
          status: "pending",
          optInSource: "admin_added",
        });
      } else {
        await db
          .update(phoneOptIns)
          .set({ userId: adultUserId, status: "pending", updatedAt: new Date() })
          .where(eq(phoneOptIns.id, existingOptIn[0].id));
      }

      const adultWelcomeBody = `Hi ${r.firstName} — you're registered for ${seasonInfo.program.name} (${seasonInfo.season.name}). Welcome to Aspire Sports!\n\nReply YES to opt in to schedule updates and reminders, STOP to opt out, HELP for info. Msg&data rates may apply.`;
      const adultSmsResult = await sendSms({
        to: adultNormalizedPhone,
        organizationId,
        body: adultWelcomeBody,
        bypassOptInCheck: true,
      });
      adultSmsStatus = adultSmsResult.ok ? "sent" : "failed";
    }

    // Fire-and-forget confirmation email
    sendRegistrationConfirmationEmail({
      userId: adultUserId,
      organizationId,
      registrationId: adultRegistration.id,
      parentEmail: emailNormalized,
      parentName: r.firstName,
      childName: `${r.firstName} ${r.lastName}`,
      programName: seasonInfo.program.name,
      seasonName: seasonInfo.season.name,
      startDate: seasonInfo.season.startDate,
      endDate: seasonInfo.season.endDate,
      scheduleNotes: seasonInfo.season.scheduleNotes ?? undefined,
      locationName: seasonInfo.location.name,
      locationAddress:
        [
          seasonInfo.location.addressLine1,
          seasonInfo.location.city,
          seasonInfo.location.state,
        ]
          .filter(Boolean)
          .join(", ") || undefined,
      amountDueCents: seasonInfo.season.priceCents - (input.amountPaidCents ?? 0),
      paymentStatus: adultPaymentStatus,
      registrationStatus: adultRegistrationStatus,
    }).catch((err) =>
      console.error("[walk-up-registration] adult email send failed:", err),
    );

    return json({
      success: true,
      registrationId: adultRegistration.id,
      userId: adultUserId,
      familyMemberId: selfMember.id,
      smsStatus: adultSmsStatus,
    });
  }

  // -------------------------------------------------------------------------
  // PARENT + CHILD PATH (original behavior — preserved unchanged)
  // -------------------------------------------------------------------------
  // TypeScript can't narrow the union across the early return above, so we
  // assert here — the adultMode branch always returns before reaching this point.
  const childInput = input as Extract<typeof input, { parent: object }>;
  const normalizedPhone = normalizeUsPhone(childInput.parent.phone);
  if (!normalizedPhone) {
    return json({ error: "Invalid phone number" }, 400);
  }

  const emailNormalized = childInput.parent.email.toLowerCase().trim();

  // Derive pure values before opening the transaction.
  const registrationStatus: "pending" | "confirmed" =
    childInput.paymentStatus === "paid" || childInput.paymentStatus === "comped"
      ? "confirmed"
      : "pending";

  const paymentStatus: "paid" | "unpaid" =
    childInput.paymentStatus === "paid" ? "paid" : "unpaid";

  const childWaiverSignedBy =
    childInput.waiverSignedBy ??
    `${childInput.parent.firstName} ${childInput.parent.lastName}`.trim();

  // The parent-user upsert, family-member resolve, and registration insert
  // must land together — a partial write leaves an orphaned user or a
  // family member with no registration. Wrap the chain in one transaction.
  const { parentUserId, familyMemberId, registrationId } = await db.transaction(
    async (tx) => {
      // Create or find the parent user
      const [existingUser] = await tx
        .select()
        .from(users)
        .where(eq(users.email, emailNormalized))
        .limit(1);

      let parentUserId: string;

      if (existingUser) {
        parentUserId = existingUser.id;
        // Update phone if missing
        if (!existingUser.phone) {
          await tx
            .update(users)
            .set({ phone: normalizedPhone, updatedAt: new Date() })
            .where(eq(users.id, parentUserId));
        }
      } else {
        const [newUser] = await tx
          .insert(users)
          .values({
            email: emailNormalized,
            firstName: childInput.parent.firstName,
            lastName: childInput.parent.lastName,
            phone: normalizedPhone,
            phoneVerified: false,
            emailVerified: false,
          })
          .returning({ id: users.id });
        parentUserId = newUser.id;
      }

      // Find-or-create the family member (kid) via the shared helper, which
      // dedupes on (parentUserId, name, birthDate) per the people model.
      const familyMember = await resolvePerson(tx, {
        kind: "dependent",
        parentUserId,
        firstName: childInput.kid.firstName,
        lastName: childInput.kid.lastName,
        birthDate: childInput.kid.birthDate,
        gender: childInput.kid.gender ?? null,
        medicalNotes: childInput.kid.medicalNotes ?? null,
      });

      const [registration] = await tx
        .insert(registrations)
        .values({
          seasonId: childInput.seasonId,
          familyMemberId: familyMember.id,
          registeredByUserId: adminUser.id,
          status: registrationStatus,
          paymentStatus,
          amountPaidCents: childInput.amountPaidCents ?? 0,
          amountDueCents: seasonInfo.season.priceCents,
          waiverSigned: childInput.waiverSigned,
          notes: childInput.notes ?? null,
        })
        .returning({ id: registrations.id });

      return {
        parentUserId,
        familyMemberId: familyMember.id,
        registrationId: registration.id,
      };
    },
  );

  if (childInput.waiverSigned) {
    const baseConsent = {
      db,
      familyMemberId,
      registrationId,
      organizationId,
      signedByUserId: parentUserId,
      signedByName: childWaiverSignedBy,
      ipAddress: clientAddress ?? null,
      userAgent: userAgent ?? null,
      notes: `walk-up: admin=${adminUser.id}`,
    };
    if (!(await hasActiveConsent(db, familyMemberId, "parental"))) {
      await recordConsent({ ...baseConsent, type: "parental" });
    }
    await recordConsent({ ...baseConsent, type: "liability" });
    await recordDefaultMediaAuth(baseConsent);
  }

  // Upsert phone opt-in as pending
  const existingOptIn = await db
    .select({ id: phoneOptIns.id })
    .from(phoneOptIns)
    .where(
      and(
        eq(phoneOptIns.organizationId, organizationId),
        eq(phoneOptIns.phone, normalizedPhone),
      ),
    )
    .limit(1);

  if (existingOptIn.length === 0) {
    await db.insert(phoneOptIns).values({
      organizationId,
      userId: parentUserId,
      phone: normalizedPhone,
      status: "pending",
      optInSource: "admin_added",
    });
  } else {
    await db
      .update(phoneOptIns)
      .set({
        userId: parentUserId,
        status: "pending",
        updatedAt: new Date(),
      })
      .where(eq(phoneOptIns.id, existingOptIn[0].id));
  }

  // Send opt-in welcome SMS. Use bypassOptInCheck because this IS the opt-in.
  const welcomeBody = `Hi ${childInput.parent.firstName} — ${childInput.kid.firstName} is registered for ${seasonInfo.program.name} (${seasonInfo.season.name}). Welcome to Aspire Sports!\n\nReply YES to opt in to schedule updates and reminders, STOP to opt out, HELP for info. Msg&data rates may apply.`;

  const smsResult = await sendSms({
    to: normalizedPhone,
    organizationId,
    body: welcomeBody,
    bypassOptInCheck: true,
  });

  // Fire-and-forget registration confirmation email. Transactional email
  // always sends the email directly; SMS (if any) is a separate additive nudge.
  sendRegistrationConfirmationEmail({
    userId: parentUserId,
    organizationId,
    registrationId,
    parentEmail: emailNormalized,
    parentName: childInput.parent.firstName,
    childName: `${childInput.kid.firstName} ${childInput.kid.lastName}`,
    programName: seasonInfo.program.name,
    seasonName: seasonInfo.season.name,
    startDate: seasonInfo.season.startDate,
    endDate: seasonInfo.season.endDate,
    scheduleNotes: seasonInfo.season.scheduleNotes ?? undefined,
    locationName: seasonInfo.location.name,
    locationAddress:
      [
        seasonInfo.location.addressLine1,
        seasonInfo.location.city,
        seasonInfo.location.state,
      ]
        .filter(Boolean)
        .join(", ") || undefined,
    amountDueCents: seasonInfo.season.priceCents - (childInput.amountPaidCents ?? 0),
    paymentStatus,
    registrationStatus,
  }).catch((err) =>
    console.error("[walk-up-registration] email send failed:", err),
  );

  return json({
    success: true,
    registrationId,
    parentUserId,
    familyMemberId,
    smsStatus: smsResult.ok ? "sent" : "failed",
    smsReason: smsResult.ok ? undefined : smsResult.reason,
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
