/**
 * Given a (kind, targetId), resolve who should sign the waiver / receive
 * the link. Centralizes the parent-vs-self routing so the send-link
 * endpoint, the self-serve page, and the kiosk all agree.
 *
 * - drop_in_booking: signer = booking's user. (Drop-in is adult-only
 *   today. If youth drop-in ships, expand this helper.)
 * - field_rental: signer = renterUser if set; else the typed
 *   renterName/email/phone (admin-created with no account).
 * - roster_entry: load the registration's family_member. If parentUserId
 *   set → signer is the parent. If selfUserId set → adult self.
 * - walkin_session: target is a self_service_tokens row whose
 *   recipient_* fields already carry the typed contact info from the
 *   kiosk form. Returns null to signal "the token row carries it" —
 *   the caller (the self-serve context endpoint) should read directly
 *   from selfServiceTokens.recipientEmail/Phone/UserId in that case.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { rosters } from "@/lib/db/schema/teams";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
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
): Promise<ResolvedSigner | null> {
  const db = getDb();

  if (kind === "drop_in_booking") {
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
      .where(eq(dropInBookings.id, targetId))
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
      .where(eq(fieldRentals.id, targetId))
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
      .where(eq(rosters.id, targetId))
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

  // walkin_session — caller resolves from selfServiceTokens.recipient_*
  return null;
}
