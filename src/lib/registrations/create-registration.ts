import { eq, and, asc, sql } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import {
  registrations,
  seasons,
  programs,
  locations,
  teamRegistrations,
  teamRegistrationMembers,
  teamInvitees,
} from "@/lib/db/schema";
import { sendRegistrationConfirmationEmail } from "@/lib/email/send";
import { awaitEmailSend } from "@/lib/notifications/await-dispatch";
import type { BrandId } from "@/lib/branding/themes";
import { isRegistrationClosed } from "@/lib/programs/registration-window";

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
  /**
   * Optional `?team=` invite token. When present and valid (same-org), the
   * new registration is linked into `team_registration_members`. A bad or
   * expired token never blocks registration — linkage is best-effort.
   */
  teamToken?: string | null;
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

/**
 * Best-effort: link a freshly-created registration to its team via the
 * `?team=` invite token. Tenant-scoped (token must belong to the same org as
 * the season). Never throws — a bad/expired token must not break registration.
 */
async function linkRegistrationToTeam(opts: {
  db: ReturnType<typeof getDb>;
  teamToken: string;
  registrationId: string;
  organizationId: string | null;
  user: { id: string };
  registrantEmail: string | null;
}): Promise<void> {
  const { db, teamToken, registrationId, organizationId, user, registrantEmail } =
    opts;
  try {
    if (!organizationId) return;

    const [teamReg] = await db
      .select()
      .from(teamRegistrations)
      .where(
        and(
          eq(teamRegistrations.inviteToken, teamToken),
          eq(teamRegistrations.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!teamReg) return;

    // Dedupe: there's no unique constraint on (teamRegistrationId, registrationId),
    // so guard with an existence check before inserting.
    const [existing] = await db
      .select({ id: teamRegistrationMembers.id })
      .from(teamRegistrationMembers)
      .where(eq(teamRegistrationMembers.registrationId, registrationId))
      .limit(1);
    if (existing) return;

    const isCaptain =
      teamReg.captainUserId === user.id ||
      (registrantEmail != null &&
        teamReg.captainEmail.toLowerCase() === registrantEmail.toLowerCase());

    await db.insert(teamRegistrationMembers).values({
      teamRegistrationId: teamReg.id,
      registrationId,
      role: isCaptain ? "captain" : "member",
    });
  } catch (err) {
    console.error("Error linking registration to team:", err);
  }
}

/**
 * Resolve the team-invitee row (if any) for this registrant, by the `?team=`
 * token + the registrant's (lowercased) email. Tenant-scoped via organizationId.
 * Never throws — invitee linkage is best-effort and must not break registration.
 * Returns the matched team + invitee so the caller can override the amount due
 * to the captain-assigned share BEFORE inserting the registration.
 */
async function resolveTeamInvitee(opts: {
  db: ReturnType<typeof getDb>;
  teamToken: string;
  organizationId: string | null;
  registrantEmail: string | null;
}): Promise<{
  teamRegistrationId: string;
  invitee: typeof teamInvitees.$inferSelect | null;
} | null> {
  const { db, teamToken, organizationId, registrantEmail } = opts;
  try {
    if (!organizationId || !registrantEmail) return null;

    const [teamReg] = await db
      .select({ id: teamRegistrations.id })
      .from(teamRegistrations)
      .where(
        and(
          eq(teamRegistrations.inviteToken, teamToken),
          eq(teamRegistrations.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!teamReg) return null;

    const [invitee] = await db
      .select()
      .from(teamInvitees)
      .where(
        and(
          eq(teamInvitees.teamRegistrationId, teamReg.id),
          // Case-insensitive email match — invitees are stored lowercased, but
          // guard anyway so a mixed-case stored row still matches.
          eq(sql`lower(${teamInvitees.email})`, registrantEmail.toLowerCase()),
        ),
      )
      .limit(1);

    return { teamRegistrationId: teamReg.id, invitee: invitee ?? null };
  } catch (err) {
    console.error("Error resolving team invitee:", err);
    return null;
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

  // "Live until" gate: past registration_closes (or, when unset, past the
  // start day) the season is closed even while its status is still `open` —
  // a stale direct /register link must not accept payment for a season that
  // already started. Admin-side registration (walk-up) does not go through
  // here and stays available to staff.
  if (isRegistrationClosed(season)) {
    throw new RegistrationError(400, "Registration for this season has closed");
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
          brand: input.brand ?? "aspire",
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
          await awaitEmailSend("waitlist confirmation", () => sendRegistrationConfirmationEmail({
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
          }), { registrationId: waitlisted.id });
        }
      } catch (emailError) {
        console.error("Error preparing waitlist email:", emailError);
      }

      if (input.teamToken) {
        const [orgRow] = await db
          .select({ organizationId: locations.organizationId })
          .from(seasons)
          .innerJoin(programs, eq(seasons.programId, programs.id))
          .innerJoin(locations, eq(programs.locationId, locations.id))
          .where(eq(seasons.id, seasonId));
        await linkRegistrationToTeam({
          db,
          teamToken: input.teamToken,
          registrationId: waitlisted.id,
          organizationId: orgRow?.organizationId ?? null,
          user,
          registrantEmail: user.email,
        });
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
  let amountDue =
    input.registrationType === "deposit" && season.depositCents
      ? season.depositCents
      : season.priceCents;

  // Resolve the org once (used for both team-member linkage and invitee lookup).
  let organizationId: string | null = null;
  if (input.teamToken) {
    const [orgRow] = await db
      .select({ organizationId: locations.organizationId })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(eq(seasons.id, seasonId));
    organizationId = orgRow?.organizationId ?? null;
  }

  // Team-invitee share: when joining via a `?team=` token, the captain may have
  // assigned this email a specific share. Resolve it BEFORE the insert so we can
  // override amountDue to the assigned share instead of the season price.
  //
  // Fallback when no invitee row matches (someone used the link without being
  // invited — "open join"): we fall through to the normal season price and do
  // NOT create an invitee row. Member linkage still happens via Phase A's
  // `team_registration_members`, so the player still shows on the roster; they
  // just pay the full season price like any individual registrant. This is the
  // simpler correct behavior — no phantom invitee rows for uninvited joiners.
  let matchedTeamInvitee: typeof teamInvitees.$inferSelect | null = null;
  if (input.teamToken) {
    const resolved = await resolveTeamInvitee({
      db,
      teamToken: input.teamToken,
      organizationId,
      registrantEmail: user.email,
    });
    if (resolved?.invitee && resolved.invitee.status !== "paid") {
      matchedTeamInvitee = resolved.invitee;
      amountDue = resolved.invitee.assignedShareCents;
    }
    // If found-but-already-paid, treat as normal (don't re-charge a share).
  }

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
      brand: input.brand ?? "aspire",
    })
    .returning();

  if (input.teamToken) {
    await linkRegistrationToTeam({
      db,
      teamToken: input.teamToken,
      registrationId: created.id,
      organizationId,
      user,
      registrantEmail: user.email,
    });

    // Link the invitee row to this registration (status flips to "paid" on
    // payment success — see handle-registration-payment-succeeded.ts). Wrapped
    // so an invitee-link failure never breaks the registration.
    if (matchedTeamInvitee) {
      try {
        await db
          .update(teamInvitees)
          .set({ registrationId: created.id })
          .where(eq(teamInvitees.id, matchedTeamInvitee.id));
      } catch (err) {
        console.error("Error linking team invitee to registration:", err);
      }
    }
  }

  return {
    kind: "created",
    registration: created,
    requiresPayment: true,
    amountDueCents: amountDue,
  };
}
