import { getDb } from "@/lib/db";
import { familyMembers } from "@/lib/db/schema/registrations";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { eq } from "drizzle-orm";

export interface DashboardDestinations {
  hasFamily: boolean;
  hasPlay: boolean;
}

/**
 * Derives which dashboard destinations a user has. Persona is never
 * stored — it is computed from family_members rows plus drop-in /
 * rental activity.
 */
export async function getDashboardDestinations(
  userId: string,
): Promise<DashboardDestinations> {
  const db = getDb();

  // All four signals are independent point lookups — run them in one
  // round-trip batch. This runs on every dashboard redirect, so the
  // previous sequential fallback chain (self → booking → rental) added
  // up to two extra serial round trips per login.
  const [[dependent], [self], [booking], [rental]] = await Promise.all([
    db.select({ id: familyMembers.id }).from(familyMembers).where(eq(familyMembers.parentUserId, userId)).limit(1),
    db.select({ id: familyMembers.id }).from(familyMembers).where(eq(familyMembers.selfUserId, userId)).limit(1),
    db.select({ id: dropInBookings.id }).from(dropInBookings).where(eq(dropInBookings.userId, userId)).limit(1),
    db.select({ id: fieldRentals.id }).from(fieldRentals).where(eq(fieldRentals.renterUserId, userId)).limit(1),
  ]);

  return { hasFamily: !!dependent, hasPlay: !!self || !!booking || !!rental };
}
