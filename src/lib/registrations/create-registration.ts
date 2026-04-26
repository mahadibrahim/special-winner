import { eq, and, asc } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import {
  registrations,
  seasons,
  programs,
  locations,
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
