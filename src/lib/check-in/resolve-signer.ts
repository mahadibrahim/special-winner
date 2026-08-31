/**
 * Given a (kind, targetId), resolve who should sign the waiver / receive
 * the link. Centralizes the parent-vs-self routing so the send-link
 * endpoint, the self-serve page, and the kiosk all agree.
 *
 * - drop_in_booking / walkin_session: both kinds' `targetId` is a
 *   `drop_in_bookings.id` (walk-in kiosk holds mint `walkin_session`;
 *   regular drop-in bookings mint `drop_in_booking` — see
 *   `walkin/start.ts` and `send-link.ts`).
 *   WALK-INS ARE NOT ADULT-ONLY. The kiosk explicitly supports minors: for
 *   a player under 18, `walkin/start.ts` books under the PARENT
 *   (`drop_in_bookings.user_id` = parent) and puts the player in
 *   `family_members` on the COPPA (`parent_user_id`) path, stamping that row
 *   on `drop_in_bookings.family_member_id`. So the booking's user is the
 *   SIGNER, and the family_member (when present) is the PARTICIPANT:
 *     familyMemberId set + parentUserId set → minor. displayName = child,
 *       signerName = parent. The guardian consent line + the child's own
 *       photo target both hang off this `isMinor`.
 *     no familyMemberId (or a self_user_id row) → adult self walk-in and
 *       every online drop-in booking; signer = participant = booking's user.
 *   Sharing one query means an admin resend for a walk-in hold
 *   (kind `walkin_session`) is tenant-scoped exactly like a regular
 *   drop-in resend — see the send-link endpoint's `walkin_session`
 *   support, added so resend mints/reuses the SAME token kind the
 *   self-serve PayCard actually accepts (payment.ts hard-rejects any
 *   other kind).
 * - field_rental: signer = renterUser if set; else the typed
 *   renterName/email/phone (admin-created with no account). When renterUser
 *   IS set, familyMemberId resolves to the renter's own SELF family_members
 *   row (via resolvePerson) — a renter is an adult signing for themselves,
 *   the same "adults sign too" rule the annual-waiver design applies to the
 *   paid drop-in door. An account-less (guest) renter has no person to
 *   resolve and keeps familyMemberId null.
 * - rental_player: familyMemberId is always null. field_rental_players
 *   carries only a typed playerName + signerEmail — no userId / family_member
 *   column — so an invited player has no verified identity to resolve a
 *   person for (see the LIMITATION comment on createRentalPlayer in
 *   src/lib/rentals/players.ts).
 * - roster_entry: load the registration's family_member. If parentUserId
 *   set → signer is the parent. If selfUserId set → adult self.
 *
 * Every lookup is scoped to `orgId` (the caller's organization). A target
 * that belongs to another org resolves to null — identical to "not found" —
 * so callers can return a 404 without leaking cross-tenant existence. This
 * scoping is the security boundary for the admin send-link / upload-photo /
 * check-in endpoints, which take a client-supplied targetId.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { fieldRentals, fieldRentalPlayers } from "@/lib/db/schema/field-rentals";
import { rosters, teams } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import { locations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import { resolvePerson } from "@/lib/registrations/resolve-person";

export type SelfServiceKind =
  | "drop_in_booking"
  | "field_rental"
  | "roster_entry"
  | "walkin_session"
  | "rental_player";

/** Kinds this signer-resolution flow handles. `email_consent` is deliberately
 *  absent — it is not a signable target; it is a marketing double-opt-in token
 *  owned by /api/consent/confirm and must never be routed through the
 *  waiver/photo/check-in machinery. */
const SELF_SERVICE_KINDS = new Set<string>([
  "drop_in_booking",
  "field_rental",
  "roster_entry",
  "walkin_session",
  "rental_player",
]);

/** Narrow a raw token kind (widened by non-self-serve kinds like
 *  `email_consent`) to a SelfServiceKind, or null if it is not one. */
export function asSelfServiceKind(kind: string): SelfServiceKind | null {
  return SELF_SERVICE_KINDS.has(kind) ? (kind as SelfServiceKind) : null;
}

export interface ResolvedSigner {
  signerName: string;
  displayName: string; // who the page header says "Hi <name>"
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientUserId: string | null;
  /**
   * family_members.id of the PARTICIPANT (roster minors and kiosk walk-in
   * minors). Null for adult paths. This is what the photo target keys off —
   * a minor's photo must never be written to the guardian's user avatar.
   */
  familyMemberId: string | null;
  isMinor: boolean;
}

export async function resolveSigner(
  kind: SelfServiceKind,
  targetId: string,
  orgId: string,
): Promise<ResolvedSigner | null> {
  const db = getDb();

  if (kind === "drop_in_booking" || kind === "walkin_session") {
    // LEFT join the participant: present only for a kiosk walk-in booked for
    // a child (see walkin/start.ts). Absent → the booking's user is the
    // participant, which is every adult walk-in and every online drop-in.
    const [row] = await db
      .select({
        bookingId: dropInBookings.id,
        userId: dropInBookings.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        familyMemberId: familyMembers.id,
        fmFirstName: familyMembers.firstName,
        fmLastName: familyMembers.lastName,
        fmParentUserId: familyMembers.parentUserId,
      })
      .from(dropInBookings)
      .innerJoin(users, eq(users.id, dropInBookings.userId))
      .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
      .leftJoin(
        familyMembers,
        eq(familyMembers.id, dropInBookings.familyMemberId),
      )
      .where(
        and(
          eq(dropInBookings.id, targetId),
          eq(dropInSessions.organizationId, orgId),
        ),
      )
      .limit(1);
    if (!row) return null;
    const bookerName =
      `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.email;

    // A family_members row on the parent_user_id path IS the definition of a
    // minor (the self_user_id path is the adult-self row; the DB CHECK makes
    // it an XOR). Anything we can't resolve falls back to the adult shape —
    // a kiosk that 500s is worse than one that asks an adult to re-sign.
    const isMinor = row.familyMemberId !== null && row.fmParentUserId !== null;
    if (isMinor) {
      const playerName =
        `${row.fmFirstName ?? ""} ${row.fmLastName ?? ""}`.trim() || bookerName;
      return {
        signerName: bookerName, // the parent/guardian signs
        displayName: playerName, // the page names the CHILD who plays
        recipientEmail: row.email,
        recipientPhone: row.phone,
        recipientUserId: row.userId,
        familyMemberId: row.familyMemberId,
        isMinor: true,
      };
    }

    return {
      signerName: bookerName,
      displayName: bookerName,
      recipientEmail: row.email,
      recipientPhone: row.phone,
      recipientUserId: row.userId,
      // An adult-self walk-in may still carry a self_user_id family_members
      // row; it is the same person as the user, so the photo target stays the
      // user avatar (resolvePhotoTarget only diverts when isMinor).
      familyMemberId: null,
      isMinor: false,
    };
  }

  if (kind === "field_rental") {
    const [row] = await db
      .select()
      .from(fieldRentals)
      .where(
        and(
          eq(fieldRentals.id, targetId),
          eq(fieldRentals.organizationId, orgId),
        ),
      )
      .limit(1);
    if (!row) return null;
    if (row.renterUserId) {
      const [u] = await db
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phone: users.phone,
          birthDate: users.birthDate,
        })
        .from(users)
        .where(eq(users.id, row.renterUserId))
        .limit(1);
      const name = u
        ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email
        : row.renterName;

      // Resolve the renter's own SELF family_members row so the annual
      // liability predicate has a person to check. Best-effort: a lookup
      // failure falls back to no person (the pre-existing shape), never
      // blocks resolving the signer entirely.
      let familyMemberId: string | null = null;
      if (u) {
        try {
          const person = await resolvePerson(db, {
            kind: "self",
            user: {
              id: row.renterUserId,
              firstName: u.firstName ?? "",
              lastName: u.lastName ?? "",
              birthDate: u.birthDate,
            },
          });
          familyMemberId = person.id;
        } catch (err) {
          console.error("[resolve-signer] resolvePerson failed for renter", err);
        }
      }

      return {
        signerName: name,
        displayName: name,
        recipientEmail: u?.email ?? row.renterEmail,
        recipientPhone: u?.phone ?? row.renterPhone,
        recipientUserId: row.renterUserId,
        familyMemberId,
        isMinor: false,
      };
    }
    return {
      signerName: row.renterName,
      displayName: row.renterName,
      recipientEmail: row.renterEmail,
      recipientPhone: row.renterPhone,
      recipientUserId: null,
      familyMemberId: null,
      isMinor: false,
    };
  }

  if (kind === "rental_player") {
    const [p] = await db
      .select()
      .from(fieldRentalPlayers)
      .innerJoin(fieldRentals, eq(fieldRentals.id, fieldRentalPlayers.rentalId))
      .where(
        and(
          eq(fieldRentalPlayers.id, targetId),
          eq(fieldRentals.organizationId, orgId),
        ),
      )
      .limit(1);
    if (!p) return null;
    const row = p.field_rental_players;
    return {
      // Adult signs own; a minor's parent signs — but the name is captured at
      // signing time (signerName), so before signing we show the player name.
      signerName: row.signerName ?? row.playerName,
      displayName: row.playerName,
      recipientEmail: row.signerEmail,
      recipientPhone: null,
      recipientUserId: null,
      // No linkage to resolve — field_rental_players carries only a typed
      // playerName + signerEmail, no userId/family_member column. An
      // email-only invitee has no verified person to hang an annual
      // liability consent off; the row's own signed*/status columns remain
      // its audit record (see the LIMITATION comment on createRentalPlayer).
      familyMemberId: null,
      isMinor: row.isMinor,
    };
  }

  if (kind === "roster_entry") {
    const [row] = await db
      .select({
        rosterId: rosters.id,
        familyMemberId: registrations.familyMemberId,
        fmFirstName: familyMembers.firstName,
        fmLastName: familyMembers.lastName,
        parentUserId: familyMembers.parentUserId,
        selfUserId: familyMembers.selfUserId,
      })
      .from(rosters)
      .innerJoin(registrations, eq(registrations.id, rosters.registrationId))
      .innerJoin(
        familyMembers,
        eq(familyMembers.id, registrations.familyMemberId),
      )
      .innerJoin(teams, eq(teams.id, rosters.teamId))
      .innerJoin(seasons, eq(seasons.id, teams.seasonId))
      .innerJoin(programs, eq(programs.id, seasons.programId))
      .innerJoin(locations, eq(locations.id, programs.locationId))
      .where(
        and(
          eq(rosters.id, targetId),
          eq(locations.organizationId, orgId),
        ),
      )
      .limit(1);
    if (!row) return null;
    const playerName = `${row.fmFirstName} ${row.fmLastName}`.trim();
    const signerUserId = row.parentUserId ?? row.selfUserId;
    const isMinor = row.parentUserId !== null;
    if (!signerUserId) {
      // Schema CHECK guarantees one of parentUserId/selfUserId is set; defensive.
      return {
        signerName: playerName,
        displayName: playerName,
        recipientEmail: null,
        recipientPhone: null,
        recipientUserId: null,
        familyMemberId: row.familyMemberId,
        isMinor,
      };
    }
    const [u] = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, signerUserId))
      .limit(1);
    const signerName = u
      ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email
      : playerName;
    return {
      signerName,
      displayName: playerName, // page shows kid's name; signer signs for them
      recipientEmail: u?.email ?? null,
      recipientPhone: u?.phone ?? null,
      recipientUserId: signerUserId,
      familyMemberId: row.familyMemberId,
      isMinor,
    };
  }

  // Every SelfServiceKind is handled by an `if` above — this is a defensive
  // fallback only, kept so the function's return type stays total.
  return null;
}
