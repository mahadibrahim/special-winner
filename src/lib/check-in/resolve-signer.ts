/**
 * Given a (kind, targetId), resolve who should sign the waiver / receive
 * the link. Centralizes the parent-vs-self routing so the send-link
 * endpoint, the self-serve page, and the kiosk all agree.
 *
 * - drop_in_booking / walkin_session: both kinds' `targetId` is a
 *   `drop_in_bookings.id` (walk-in kiosk holds mint `walkin_session`;
 *   regular drop-in bookings mint `drop_in_booking` — see
 *   `walkin/start.ts` and `send-link.ts`). Signer = booking's user.
 *   (Drop-in is adult-only today. If youth drop-in ships, expand this
 *   helper.) Sharing one query means an admin resend for a walk-in hold
 *   (kind `walkin_session`) is tenant-scoped exactly like a regular
 *   drop-in resend — see the send-link endpoint's `walkin_session`
 *   support, added so resend mints/reuses the SAME token kind the
 *   self-serve PayCard actually accepts (payment.ts hard-rejects any
 *   other kind).
 * - field_rental: signer = renterUser if set; else the typed
 *   renterName/email/phone (admin-created with no account).
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
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { rosters, teams } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import { locations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";

export type SelfServiceKind =
  | "drop_in_booking"
  | "field_rental"
  | "roster_entry"
  | "walkin_session";

export interface ResolvedSigner {
  signerName: string;
  displayName: string; // who the page header says "Hi <name>"
  recipientEmail: string | null;
  recipientPhone: string | null;
  recipientUserId: string | null;
  /** family_members.id for roster_entry minors. Null for adult paths. */
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
    const [row] = await db
      .select({
        bookingId: dropInBookings.id,
        userId: dropInBookings.userId,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
      })
      .from(dropInBookings)
      .innerJoin(users, eq(users.id, dropInBookings.userId))
      .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
      .where(
        and(
          eq(dropInBookings.id, targetId),
          eq(dropInSessions.organizationId, orgId),
        ),
      )
      .limit(1);
    if (!row) return null;
    const name =
      `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || row.email;
    return {
      signerName: name,
      displayName: name,
      recipientEmail: row.email,
      recipientPhone: row.phone,
      recipientUserId: row.userId,
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
        })
        .from(users)
        .where(eq(users.id, row.renterUserId))
        .limit(1);
      const name = u
        ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email
        : row.renterName;
      return {
        signerName: name,
        displayName: name,
        recipientEmail: u?.email ?? row.renterEmail,
        recipientPhone: u?.phone ?? row.renterPhone,
        recipientUserId: row.renterUserId,
        familyMemberId: null,
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
