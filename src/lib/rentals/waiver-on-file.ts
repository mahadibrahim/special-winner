/**
 * "Is this signed-in renter already covered by the org's annual liability
 * waiver?" — the DISPLAY-side probe behind the rentals booking forms
 * (`RentalBooking.tsx` on Aspire, `FieldCalendar.tsx` on SoccerOne).
 *
 * `POST /api/rentals/bookings` already answers this question authoritatively
 * (see its `waiverOnFile` block) and stamps a covered rental with the shared
 * on-file attribution when no signature arrives. Without this probe the forms
 * still RENDER the checkbox + typed-signature field and make a covered renter
 * sign a release they are already covered by — which the endpoint then dutifully
 * records (a real signature is never discarded; see clause 4 of
 * `recordLiabilityWaiver`'s caller contract), leaving the log fatter and the
 * renter no better off. This is the read that lets the form skip the ask; the
 * endpoint remains the authority, exactly like `ChildPicker`'s `waiverOnFile`
 * flag on the classes doors.
 *
 * READ-ONLY on purpose. It deliberately does NOT call `resolvePerson`
 * (find-or-CREATE): this runs during page render, `family_members.self_user_id`
 * has no unique index, and two concurrent renders would race duplicate self
 * rows — the same hazard that made `resolve-signer.ts`'s `field_rental` branch
 * a plain select. A covered renter necessarily already HAS a self row (nothing
 * can grant coverage without one), so the read narrows identically for every
 * case that matters. An uncovered renter with no row yet simply gets `false`
 * and is asked to sign, which is correct — and the booking POST is what calls
 * `resolvePerson` when a real signature arrives.
 *
 * FAILS TOWARD ASKING. Any error — missing org, lookup failure — returns
 * false, which shows the waiver. A covered renter seeing one extra checkbox is
 * a nuisance; an uncovered renter never being asked is a missing release.
 */
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { familyMembers } from "@/lib/db/schema/registrations";
import { hasValidLiabilityWaiver } from "@/lib/consents/liability";

type DbClient = ReturnType<typeof getDb>;

export async function renterWaiverOnFile(
  userId: string | null | undefined,
  organizationId: string | null | undefined,
  dbOrTx?: DbClient,
): Promise<boolean> {
  if (!userId || !organizationId) return false;
  const db = dbOrTx ?? getDb();
  try {
    // Oldest-first mirrors `resolvePerson`'s own self-path ordering, so this
    // read and any later create/lookup agree on which row is canonical.
    const [person] = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(eq(familyMembers.selfUserId, userId))
      .orderBy(asc(familyMembers.createdAt))
      .limit(1);
    if (!person) return false;
    return await hasValidLiabilityWaiver(person.id, organizationId, db);
  } catch (err) {
    console.error("[rentals] renter waiver-on-file probe failed", err);
    return false;
  }
}
