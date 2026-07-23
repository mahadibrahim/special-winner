import { eq, and, asc, notInArray, sql } from "drizzle-orm";
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
import { ensureCustomerOrgMembership } from "@/lib/organization/ensure-membership";
import { registrationAmountDueCents } from "@/lib/registrations/amount-due";
import {
  captainShareDueCents,
  teamDepositPaid,
} from "@/lib/registrations/captain-credit";

export type RegistrationKind = "created" | "resumed" | "waitlisted";

export interface CreateRegistrationInput {
  db: ReturnType<typeof getDb>;
  user: { id: string; email: string; firstName: string | null };
  /** selfUserId gates the captain deposit credit — the credit only applies
   * when the captain registers THEMSELVES (their self person row), never a
   * dependent or another player registered through the same account. Both
   * real callers pass full family_members rows, so the field is present. */
  familyMember: {
    id: string;
    firstName: string;
    lastName: string;
    selfUserId?: string | null;
  };
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
  /** Owning org of the season, resolved once here — callers should thread
   * this through instead of re-querying it (e.g. for consent recording). */
  organizationId: string | null;
};

export class RegistrationError extends Error {
  /**
   * Optional machine-readable code for callers that need to branch on the
   * error rather than pattern-match `message`. Not every RegistrationError
   * carries one — API routes surfacing this error must preserve their
   * existing `{ error: message }` response shape when `code` is absent, and
   * only add a sibling `code` field (`{ error: message, code }`) when it is
   * present. `error` must always stay the human-readable sentence — it's the
   * field every frontend consumer (`parseApiError`) renders directly to the
   * customer.
   */
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
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
  /**
   * When the caller already resolved the team_registrations row for this
   * token+org (e.g. via `resolveTeamInvitee` just before the insert), pass
   * it here to skip the duplicate lookup. Only pass a definitively-resolved
   * value (including `null` for "confirmed not found") — leave undefined if
   * the caller never attempted the lookup, so this falls back to its own
   * query rather than silently skipping linkage.
   */
  preloadedTeamReg?: typeof teamRegistrations.$inferSelect | null;
}): Promise<void> {
  const { db, teamToken, registrationId, organizationId, user, registrantEmail, preloadedTeamReg } =
    opts;
  try {
    if (!organizationId) return;

    const teamReg =
      preloadedTeamReg !== undefined
        ? preloadedTeamReg
        : (
            await db
              .select()
              .from(teamRegistrations)
              .where(
                and(
                  eq(teamRegistrations.inviteToken, teamToken),
                  eq(teamRegistrations.organizationId, organizationId),
                ),
              )
              .limit(1)
          )[0] ?? null;
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
  /** Full row, so callers (e.g. `linkRegistrationToTeam`) can reuse it
   * instead of re-querying by the same token+org. */
  teamRegistration: typeof teamRegistrations.$inferSelect;
  invitee: typeof teamInvitees.$inferSelect | null;
} | null> {
  const { db, teamToken, organizationId, registrantEmail } = opts;
  try {
    if (!organizationId || !registrantEmail) return null;

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

    return {
      teamRegistrationId: teamReg.id,
      teamRegistration: teamReg,
      invitee: invitee ?? null,
    };
  } catch (err) {
    console.error("Error resolving team invitee:", err);
    return null;
  }
}

/**
 * Team-token pricing for a registrant, shared by the create and resume paths
 * so a resumed pending registration can never quote a different amount than a
 * fresh one (the captain-double-charge bug's second life).
 *
 * - Invitee share: an unpaid invitee row matching the registrant's email
 *   overrides the season price with the captain-assigned share.
 * - Captain deposit credit: on the captain's SELF registration with a
 *   verifiably PAID team deposit, the share is credited by the deposit
 *   (never below zero). Matched by captain_user_id, email fallback only when
 *   user linkage is absent. Recomputed server-side from the team row —
 *   a client can never claim the credit.
 *
 * `amountDueOverride` is null when nothing about the token changes pricing
 * (uninvited open-join, already-paid invitee, unresolved token).
 */
async function resolveTeamPricing(opts: {
  db: ReturnType<typeof getDb>;
  teamToken: string;
  organizationId: string | null;
  user: { id: string; email: string };
  familyMember: { selfUserId?: string | null };
  season: typeof seasons.$inferSelect;
}): Promise<{
  resolvedTeamReg: typeof teamRegistrations.$inferSelect | null | undefined;
  matchedTeamInvitee: typeof teamInvitees.$inferSelect | null;
  amountDueOverride: number | null;
  captainCreditApplied: boolean;
}> {
  const { db, teamToken, organizationId, user, familyMember, season } = opts;
  const resolved = await resolveTeamInvitee({
    db,
    teamToken,
    organizationId,
    registrantEmail: user.email,
  });
  // A null result is ambiguous (token genuinely not found, OR
  // resolveTeamInvitee's internal try/catch swallowed an error) — leave
  // resolvedTeamReg undefined so linkRegistrationToTeam falls back to its
  // own query rather than silently skipping linkage.
  if (!resolved) {
    return {
      resolvedTeamReg: undefined,
      matchedTeamInvitee: null,
      amountDueOverride: null,
      captainCreditApplied: false,
    };
  }

  let matchedTeamInvitee: typeof teamInvitees.$inferSelect | null = null;
  let amountDueOverride: number | null = null;
  if (resolved.invitee && resolved.invitee.status !== "paid") {
    matchedTeamInvitee = resolved.invitee;
    amountDueOverride = resolved.invitee.assignedShareCents;
  }
  // If found-but-already-paid, treat as normal (don't re-charge a share).

  let captainCreditApplied = false;
  if (
    resolved.invitee?.status !== "paid" &&
    familyMember.selfUserId === user.id
  ) {
    const teamReg = resolved.teamRegistration;
    const isCaptain =
      teamReg.captainUserId != null
        ? teamReg.captainUserId === user.id
        : teamReg.captainEmail.toLowerCase() === user.email.toLowerCase();
    if (isCaptain && teamDepositPaid(teamReg)) {
      // Share: the captain-assigned invitee share when one exists, else the
      // season's individual effective price (early-bird aware).
      const shareCents = matchedTeamInvitee
        ? matchedTeamInvitee.assignedShareCents
        : registrationAmountDueCents(season, "full");
      amountDueOverride = captainShareDueCents(
        shareCents,
        teamReg.depositCents ?? 0,
      );
      captainCreditApplied = true;
    }
  }

  return {
    resolvedTeamReg: resolved.teamRegistration,
    matchedTeamInvitee,
    amountDueOverride,
    captainCreditApplied,
  };
}

export async function createRegistration(
  input: CreateRegistrationInput,
): Promise<CreateRegistrationResult> {
  const { db, user, familyMember, seasonId } = input;

  // season and existingReg are independent reads (neither's WHERE depends on
  // the other's result) — fetch them together. If season turns out invalid
  // we throw below and simply discard the existingReg read; it's a plain
  // SELECT with no side effects, so the wasted read on the error path is a
  // fine trade for shaving a full RTT off the common (valid-season) path.
  const [[season], [existingReg]] = await Promise.all([
    db.select().from(seasons).where(eq(seasons.id, seasonId)),
    db
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.seasonId, seasonId),
          eq(registrations.familyMemberId, familyMember.id),
          // Cancelled/refunded rows are invisible to this lookup — mirrors
          // the DB's own registrations_member_season_active_uniq partial
          // index (see schema/registrations.ts), which already excludes
          // both statuses so a member can re-register after cancelling or
          // being refunded. Without this filter, the oldest cancelled row
          // would win the `.limit(1)` and permanently block re-registration
          // via the throw below.
          notInArray(registrations.status, ["cancelled", "refunded"]),
        ),
      )
      .orderBy(asc(registrations.createdAt))
      .limit(1),
  ]);

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

  // Resolve the owning org once — used by the membership grant below and the
  // team-linkage / invitee lookups later.
  const [orgRow] = await db
    .select({ organizationId: locations.organizationId })
    .from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(eq(seasons.id, seasonId));
  const organizationId = orgRow?.organizationId ?? null;

  // Any account that reaches a valid, open season is a customer of this org.
  // Membership drives the admin directory and the role-assignment gate.
  // Best-effort: a grant failure must never break registration.
  if (organizationId) {
    try {
      await ensureCustomerOrgMembership(db, user.id, organizationId);
    } catch (err) {
      console.error("[createRegistration] org membership grant failed:", err);
    }
  }

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

      // A resumed row must re-price under the team token exactly like a fresh
      // one — the stale row may predate the invitee share or the captain's
      // paid deposit (start registration → abandon → pay deposit → return),
      // and returning it untouched re-creates the double-charge.
      if (input.teamToken) {
        const pricing = await resolveTeamPricing({
          db,
          teamToken: input.teamToken,
          organizationId,
          user,
          familyMember,
          season,
        });
        const newDue = pricing.amountDueOverride;
        if (newDue != null && newDue !== resumedReg.amountDueCents) {
          const zeroDue = pricing.captainCreditApplied && newDue === 0;
          const [updated] = await db
            .update(registrations)
            .set({
              amountDueCents: newDue,
              ...(zeroDue
                ? { status: "confirmed" as const, paymentStatus: "paid" as const }
                : {}),
              updatedAt: new Date(),
            })
            .where(eq(registrations.id, resumedReg.id))
            .returning();
          resumedReg = updated;

          // Same side effects as the create path: roster/member linkage and,
          // for the zero-due captain, settling the invitee row as paid so the
          // backstop cron never re-charges the deposit-covered share.
          await linkRegistrationToTeam({
            db,
            teamToken: input.teamToken,
            registrationId: resumedReg.id,
            organizationId,
            user,
            registrantEmail: user.email,
            preloadedTeamReg: pricing.resolvedTeamReg,
          });
          if (pricing.matchedTeamInvitee) {
            try {
              await db
                .update(teamInvitees)
                .set({
                  registrationId: resumedReg.id,
                  ...(zeroDue ? { status: "paid", paidAt: new Date() } : {}),
                })
                .where(eq(teamInvitees.id, pricing.matchedTeamInvitee.id));
            } catch (err) {
              console.error("Error linking team invitee to registration:", err);
            }
          }
        }
      }

      return {
        kind: "resumed",
        registration: resumedReg,
        requiresPayment: resumedReg.amountDueCents > 0,
        amountDueCents: resumedReg.amountDueCents,
        organizationId,
      };
    }
    throw new RegistrationError(
      409,
      "This player is already registered for this season",
      "already_registered",
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
      // Deposits are never early-bird discounted, and are only honored when
      // strictly below the full amount due — see registrationAmountDueCents.
      const amountDue = registrationAmountDueCents(season, input.registrationType);
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
        await linkRegistrationToTeam({
          db,
          teamToken: input.teamToken,
          registrationId: waitlisted.id,
          organizationId,
          user,
          registrantEmail: user.email,
        });
      }

      return {
        kind: "waitlisted",
        registration: waitlisted,
        requiresPayment: false,
        amountDueCents: amountDue,
        organizationId,
      };
    }
  }

  // Normal creation. Deposits are never early-bird discounted, and are only
  // honored when strictly below the full amount due — an invalid (too-large)
  // deposit request falls back to the full amount rather than erroring.
  let amountDue = registrationAmountDueCents(season, input.registrationType);

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
  // Definitively-resolved team_registrations row from resolveTeamInvitee, so
  // the linkRegistrationToTeam call below (same token+org) can reuse it
  // instead of re-querying. Stays `undefined` (→ linkRegistrationToTeam does
  // its own lookup) whenever resolveTeamInvitee didn't reach a conclusive
  // answer — e.g. it threw, or organizationId/email were missing.
  let resolvedTeamReg: typeof teamRegistrations.$inferSelect | null | undefined;
  // True when the registrant is the CAPTAIN of the team and their share was
  // credited by the (verified-paid) team deposit. Drives the zero-due
  // finalize path below — the server recomputes this itself; a client can
  // never claim the credit.
  let captainCreditApplied = false;
  if (input.teamToken) {
    const pricing = await resolveTeamPricing({
      db,
      teamToken: input.teamToken,
      organizationId,
      user,
      familyMember,
      season,
    });
    resolvedTeamReg = pricing.resolvedTeamReg;
    matchedTeamInvitee = pricing.matchedTeamInvitee;
    captainCreditApplied = pricing.captainCreditApplied;
    if (pricing.amountDueOverride != null) amountDue = pricing.amountDueOverride;
  }

  // Zero-due captain-credit finalize: the deposit fully covers the captain's
  // share, so there is nothing to charge and no Stripe intent is ever
  // created. Follows the paid_zero idiom from
  // create-checkout-for-registration.ts (100%-off discounts): status
  // "confirmed" + paymentStatus "paid", amountDue 0, and no payments row —
  // the money trail is the team deposit itself, already on the team row.
  const captainZeroDue = captainCreditApplied && amountDue === 0;

  const [created] = await db
    .insert(registrations)
    .values({
      seasonId,
      familyMemberId: familyMember.id,
      registeredByUserId: user.id,
      status: captainZeroDue ? "confirmed" : "pending",
      paymentStatus: captainZeroDue ? "paid" : "unpaid",
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
      preloadedTeamReg: resolvedTeamReg,
    });

    // Link the invitee row to this registration (status flips to "paid" on
    // payment success — see handle-registration-payment-succeeded.ts). For a
    // zero-due captain-credit registration there is no payment success event,
    // so settle the row here: "paid" keeps the backstop cron
    // (sumUnpaidSharesCents counts everything != 'paid') from re-charging the
    // deposit-covered share to the captain's card at the deadline. The
    // payment tracker won't double-count it — teamCollectedCents caps the
    // captain's row by the deposit. Wrapped so an invitee-link failure never
    // breaks the registration.
    if (matchedTeamInvitee) {
      try {
        await db
          .update(teamInvitees)
          .set({
            registrationId: created.id,
            ...(captainZeroDue ? { status: "paid", paidAt: new Date() } : {}),
          })
          .where(eq(teamInvitees.id, matchedTeamInvitee.id));
      } catch (err) {
        console.error("Error linking team invitee to registration:", err);
      }
    }
  }

  return {
    kind: "created",
    registration: created,
    requiresPayment: amountDue > 0,
    amountDueCents: amountDue,
    organizationId,
  };
}
