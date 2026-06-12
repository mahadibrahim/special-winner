import { eq, and, asc } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import {
  registrations,
  seasons,
  programs,
  locations,
} from "@/lib/db/schema";
import { sendRegistrationConfirmationEmail } from "@/lib/email/send";
import type { BrandId } from "@/lib/branding/themes";

export type RegistrationKind = "created" | "resumed" | "waitlisted";

export interface CreateRegistrationInput {
  db: ReturnType<typeof getDb>;
  user: { id: string; email: string; firstName: string | null };
  familyMember: { id: string; firstName: string; lastName: string };
  seasonId: string;
  registrationType: "full" | "deposit";
  waiverSigned: boolean;
  // `waiverSignedBy` is supplied by the caller. For self registrations, the
  // caller passes the registrant's own name; for dependents, the parent's name.
  // The helper does not infer this — it just records what's passed in.
  waiverSignedBy: string;
  notes?: string;
  lookingForTeam?: boolean;
  /** Host-derived brand of the request that created the registration. */
  brand?: BrandId;
}

export type CreateRegistrationResult = {
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
      // If the caller is now flagging themselves as looking for a team, persist it.
      let resumedReg = existingReg;
      if (input.lookingForTeam && !existingReg.lookingForTeam) {
        const [updated] = await db
          .update(registrations)
          .set({ lookingForTeam: true, updatedAt: new Date() })
          .where(eq(registrations.id, existingReg.id))
          .returning();
        resumedReg = updated;
      }
      return {
        kind: "resumed",
        registration: resumedReg,
        requiresPayment: resumedReg.amountDueCents > 0,
        amountDueCents: resumedReg.amountDueCents,
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
          notes: input.notes ?? null,
          lookingForTeam: input.lookingForTeam ?? false,
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
            brand: input.brand,
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
      notes: input.notes ?? null,
      lookingForTeam: input.lookingForTeam ?? false,
    })
    .returning();

  return {
    kind: "created",
    registration: created,
    requiresPayment: true,
    amountDueCents: amountDue,
  };
}
