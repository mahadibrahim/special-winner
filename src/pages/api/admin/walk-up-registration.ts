import type { APIRoute } from "astro";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import {
  familyMembers,
  registrations,
} from "@/lib/db/schema/registrations";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { normalizeUsPhone, sendSms } from "@/lib/sms/send";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { sendRegistrationConfirmationEmail } from "@/lib/email/send";

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

const walkUpSchema = z.object({
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
  notes: z.string().optional(),
});

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

  // Use the caller's org id (which now matches the season's org by construction).
  const organizationId = orgContext.organizationId;
  const normalizedPhone = normalizeUsPhone(input.parent.phone);
  if (!normalizedPhone) {
    return json({ error: "Invalid phone number" }, 400);
  }

  // Create or find the parent user
  const emailNormalized = input.parent.email.toLowerCase().trim();
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, emailNormalized))
    .limit(1);

  let parentUserId: string;

  if (existingUser) {
    parentUserId = existingUser.id;
    // Update phone if missing
    if (!existingUser.phone) {
      await db
        .update(users)
        .set({ phone: normalizedPhone, updatedAt: new Date() })
        .where(eq(users.id, parentUserId));
    }
  } else {
    const [newUser] = await db
      .insert(users)
      .values({
        email: emailNormalized,
        firstName: input.parent.firstName,
        lastName: input.parent.lastName,
        phone: normalizedPhone,
        phoneVerified: false,
        emailVerified: false,
      })
      .returning({ id: users.id });
    parentUserId = newUser.id;
  }

  // Create the family member
  const [familyMember] = await db
    .insert(familyMembers)
    .values({
      parentUserId,
      firstName: input.kid.firstName,
      lastName: input.kid.lastName,
      birthDate: input.kid.birthDate,
      gender: input.kid.gender ?? null,
      medicalNotes: input.kid.medicalNotes ?? null,
    })
    .returning({ id: familyMembers.id });

  // Create the registration
  const registrationStatus: "pending" | "confirmed" =
    input.paymentStatus === "paid" || input.paymentStatus === "comped"
      ? "confirmed"
      : "pending";

  const paymentStatus: "paid" | "unpaid" =
    input.paymentStatus === "paid" ? "paid" : "unpaid";

  const [registration] = await db
    .insert(registrations)
    .values({
      seasonId: input.seasonId,
      familyMemberId: familyMember.id,
      registeredByUserId: adminUser.id,
      status: registrationStatus,
      paymentStatus,
      amountPaidCents: input.amountPaidCents ?? 0,
      amountDueCents: seasonInfo.season.priceCents,
      waiverSigned: input.waiverSigned,
      waiverSignedAt: input.waiverSigned ? new Date() : null,
      waiverSignedBy: input.waiverSigned ? `${input.parent.firstName} ${input.parent.lastName}` : null,
      notes: input.notes ?? null,
    })
    .returning({ id: registrations.id });

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
  const welcomeBody = `Hi ${input.parent.firstName} — ${input.kid.firstName} is registered for ${seasonInfo.program.name} (${seasonInfo.season.name}). Welcome to Aspire Sports!\n\nReply YES to opt in to schedule updates and reminders, STOP to opt out, HELP for info. Msg&data rates may apply.`;

  const smsResult = await sendSms({
    to: normalizedPhone,
    organizationId,
    body: welcomeBody,
    bypassOptInCheck: true,
  });

  // Fire-and-forget registration confirmation email. Walk-up parents may not
  // have an active session, so send directly via the email pipeline rather
  // than the gateway (gateway routing is by-userId).
  sendRegistrationConfirmationEmail({
    userId: parentUserId,
    organizationId,
    registrationId: registration.id,
    parentEmail: emailNormalized,
    parentName: input.parent.firstName,
    childName: `${input.kid.firstName} ${input.kid.lastName}`,
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
    paymentStatus,
    registrationStatus,
  }).catch((err) =>
    console.error("[walk-up-registration] email send failed:", err),
  );

  return json({
    success: true,
    registrationId: registration.id,
    parentUserId,
    familyMemberId: familyMember.id,
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
