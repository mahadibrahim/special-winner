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

  const [[dependent], [self]] = await Promise.all([
    db.select({ id: familyMembers.id }).from(familyMembers).where(eq(familyMembers.parentUserId, userId)).limit(1),
    db.select({ id: familyMembers.id }).from(familyMembers).where(eq(familyMembers.selfUserId, userId)).limit(1),
  ]);

  let hasPlay = !!self;
  if (!hasPlay) {
    const [booking] = await db
      .select({ id: dropInBookings.id })
      .from(dropInBookings)
      .where(eq(dropInBookings.userId, userId))
      .limit(1);
    hasPlay = !!booking;
  }
  if (!hasPlay) {
    const [rental] = await db
      .select({ id: fieldRentals.id })
      .from(fieldRentals)
      .where(eq(fieldRentals.renterUserId, userId))
      .limit(1);
    hasPlay = !!rental;
  }

  return { hasFamily: !!dependent, hasPlay };
}
